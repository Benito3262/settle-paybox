import { verifyExact, settleExact, type ExactPayload } from "./facilitator";
import { X402_NETWORK, netConfig, escrowAddress, type Net } from "./chain";

export const CAIP: Record<string, string> = { "base-sepolia": "eip155:84532", base: "eip155:8453", sepolia: "eip155:11155111" };
const FROM_CAIP = Object.fromEntries(Object.entries(CAIP).map(([k, v]) => [v, k])) as Record<string, Net>;
export const CREATE_PRICE_USD = Number(process.env.CREATE_PRICE_USD || "0.05");
/** Networks a payer may pay x402 on (X402_NETWORKS="sepolia,base"). */
export const X402_NETWORKS: Net[] = (process.env.X402_NETWORKS || X402_NETWORK).split(",").map((x) => x.trim() as Net).filter((n) => CAIP[n]);
const SELF = process.env.X402_FACILITATOR === "self" || (!process.env.X402_FACILITATOR && X402_NETWORK === "sepolia");
const FACILITATOR = process.env.X402_FACILITATOR_URL || "https://x402.org/facilitator";

type Opts = { usd?: number; description?: string; networks?: Net[]; payTo?: string; noAdminBypass?: boolean };

function reqFor(net: Net, resource: string, o: Opts) {
  const c = netConfig(net);
  return {
    scheme: "exact", network: net, maxAmountRequired: String(Math.round((o.usd ?? CREATE_PRICE_USD) * 1e6)),
    resource, description: o.description || "Settle: create a conditional escrow deal", mimeType: "application/json",
    payTo: o.payTo || process.env.FEE_WALLET || escrowAddress(), maxTimeoutSeconds: 300, asset: c.usdc,
    extra: { name: c.usdcName, version: "2" },
  };
}

export type Paid = { paid: true; receipt?: string; tx?: string; payer?: string; network?: Net; admin?: boolean };

/** x402 gate. Returns Paid, or a 402 Response listing every accepted network. */
export async function gate(req: Request, o: Opts = {}): Promise<Paid | Response> {
  if (process.env.X402_ENABLED !== "true") return { paid: true };
  const admin = req.headers.get("x-settle-admin");
  if (!o.noAdminBypass && admin && admin === process.env.SETTLE_ADMIN_KEY) return { paid: true, admin: true };
  const url = new URL(req.url).toString();
  const nets = o.networks?.length ? o.networks : X402_NETWORKS;
  const v1 = nets.map((n) => reqFor(n, url, o));
  const v2acc = v1.map((r) => ({ scheme: "exact", network: CAIP[r.network], amount: r.maxAmountRequired, asset: r.asset, payTo: r.payTo, maxTimeoutSeconds: r.maxTimeoutSeconds, extra: r.extra }));
  const v2 = { x402Version: 2, resource: { url, description: v1[0].description, mimeType: "application/json" }, accepts: v2acc };
  const deny = (error: string) => Response.json({ x402Version: 1, error, accepts: v1 }, { status: 402, headers: { "PAYMENT-REQUIRED": Buffer.from(JSON.stringify({ ...v2, error })).toString("base64") } });
  const header = req.headers.get("payment-signature") || req.headers.get("x-payment");
  if (!header) return deny("X-PAYMENT header is required");
  let payload: ExactPayload & { x402Version?: number };
  try { payload = JSON.parse(Buffer.from(header, "base64").toString()); } catch { return deny("bad X-PAYMENT"); }
  const rawNet = payload.accepted?.network ?? payload.network ?? v1[0].network;
  const net = (FROM_CAIP[rawNet] || rawNet) as Net;
  const idx = nets.indexOf(net);
  if (idx < 0) return deny(`unsupported network ${rawNet}`);
  const r1 = v1[idx], r2 = v2acc[idx];
  if (SELF) {
    const v = await verifyExact(payload, { network: net, payTo: r1.payTo as string, amount: BigInt(r1.maxAmountRequired), asset: r1.asset }).catch((e) => ({ ok: false as const, reason: String(e).slice(0, 120) }));
    if (!v.ok) return deny(v.reason);
    try {
      const tx = await settleExact(net, r1.asset, v.msg, v.sig);
      return { paid: true, tx, payer: v.msg.from, network: net, receipt: Buffer.from(JSON.stringify({ success: true, transaction: tx, network: CAIP[net], payer: v.msg.from })).toString("base64") };
    } catch (e) { return deny("settlement_failed: " + (e as Error).message.slice(0, 120)); }
  }
  const ver = payload.x402Version === 2 ? 2 : 1;
  const body = JSON.stringify({ x402Version: ver, paymentPayload: payload, paymentRequirements: ver === 2 ? r2 : r1 });
  const v = await fetch(`${FACILITATOR}/verify`, { method: "POST", headers: { "Content-Type": "application/json" }, body }).then((r) => r.json()).catch(() => null);
  if (!v?.isValid) return deny(v?.invalidReason || "payment invalid");
  const s = await fetch(`${FACILITATOR}/settle`, { method: "POST", headers: { "Content-Type": "application/json" }, body }).then((r) => r.json()).catch(() => null);
  if (!s?.success) return deny(s?.errorReason || "settlement failed");
  return { paid: true, network: net, tx: s.transaction, payer: s.payer, receipt: Buffer.from(JSON.stringify(s)).toString("base64") };
}
