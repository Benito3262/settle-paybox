# ◆ Settle — pay when it's done

**PayBox Hackathon Ch.1 (MoonPay) · Merchant tools track**

PayBox lets agents pay instantly. Settle adds the missing primitive: **conditional payment**.
Your agent locks USDC in escrow; Settle releases it automatically the moment the work is *verifiably* done
— and refunds you automatically if the deadline passes. No trust, no chasing invoices, no arguing.

> "Hey agent, pay @dev $50 when he fixes issue #12 in my repo."

## Release conditions (MVP)
| Condition | How Settle knows |
|---|---|
| `github_pr_merged` | GitHub webhook fires on merge → Settle re-checks via the GitHub API that the issue is closed **and** a merged PR in that repo references it. A webhook alone never moves money. |
| `both_confirm` | Payer and payee each confirm with their private token. |
| `url_contains` | URL returns 200 and contains the agreed text. |
| deadline | Not met by deadline → full refund to payer. |

## Pricing (x402)
- `create_deal`: **$0.05 USDC** via x402 (HTTP 402 pay-per-request, verified & settled through the x402 facilitator).
- **0.5% fee** taken on release (sent to `FEE_WALLET` if set). Refunds are free.

## Architecture
```
Agent (PayBox) ──discover_plugins/get_contract──▶ /plugin.json   (tool contract)
      │ use_plugin(create_deal)  ──x402 $0.05──▶ /api/plugin/use ─▶ Supabase (deals + timeline)
      │ PayBox send_payment (passkey) ──USDC──▶ Escrow wallet (Base Sepolia / Base)
      │ use_plugin(fund_deal, tx)   ──▶ Settle verifies the USDC Transfer on-chain → status "funded"
GitHub ──webhook (HMAC)──▶ /api/webhooks/github ─▶ GitHub API double-check ─▶ release USDC to payee
Dashboard polling + daily Vercel cron ─▶ /api/cron ─▶ release / refund at deadline
```
- Next.js 16 on Vercel, Supabase Postgres (key-guarded RPC functions, RLS on), viem for Base.
- `SETTLE_NETWORK=base-sepolia` (testnet) or `base` (mainnet). One env var flips USDC address, RPC, explorer.
- Escrow is a server-held wallet for the hackathon (key only in Vercel env). Next step: an on-chain escrow contract with an arbiter-signed release.

## API
| Method | Path | |
|---|---|---|
| GET | `/plugin.json` | Plugin contract (tools + schemas + pricing) |
| POST | `/api/plugin/use` | `{tool_id, input}` — create_deal (x402), fund_deal, get_deal, confirm_deal, check_deal |
| POST | `/api/deals` | create (x402) |
| GET | `/api/deals`, `/api/deals/:id` | list / detail with timeline |
| POST | `/api/deals/:id/fund` `{tx}` · `/confirm` `{token}` · `/check` | |
| POST | `/api/webhooks/github` | GitHub webhook (pull_request + issues) |
| GET | `/api/cron` | deadline sweep (Bearer CRON_SECRET) |
| GET | `/api/status` | network + escrow balances |

## Env vars (Vercel)
`SUPABASE_URL, SUPABASE_ANON_KEY, SETTLE_DB_KEY, SETTLE_NETWORK, ESCROW_PRIVATE_KEY, GITHUB_WEBHOOK_SECRET, CRON_SECRET, SETTLE_ADMIN_KEY, X402_ENABLED` · optional `FEE_WALLET, GITHUB_TOKEN, RPC_URL, X402_FACILITATOR_URL, CREATE_PRICE_USD`.
Mainnet note: the public x402.org facilitator is testnet-only; for Base mainnet set `X402_FACILITATOR_URL` to a mainnet facilitator (e.g. Coinbase CDP).

## Simple setup for the demo repo
1. Make a public GitHub repo (e.g. `settle-demo`) and open issue #12 "Fix checkout button".
2. Repo → Settings → Webhooks → Add: Payload URL `https://<app>/api/webhooks/github`, content type `application/json`, secret = `GITHUB_WEBHOOK_SECRET`, events: *Pull requests* + *Issues*.
3. Fund the escrow wallet with a little Base Sepolia ETH (gas) — USDC comes from deals.

## 60-second demo script
- **0–8s** Chat: *"Pay @dev $50 when he fixes issue #12 in my repo, deadline Sunday."* Agent calls `discover_plugins` → Settle → `create_deal` (pays $0.05 via x402).
- **8–20s** PayBox passkey prompt → approve → USDC sent to escrow. Agent calls `fund_deal`; dashboard flips to 🔒 **funded** with the Basescan link.
- **20–38s** Split screen: dev opens PR "Fixes #12" and merges it.
- **38–52s** Dashboard timeline lights up live: ⚡ webhook → ✓ condition met (verified via GitHub API) → 💸 **released** 49.75 USDC to the dev, tx link. Show dev's balance.
- **52–60s** Cut to a second deal whose deadline passed: ⏰ → ↩ **refunded**. Tagline: *"Settle. Pay when it's done."*
