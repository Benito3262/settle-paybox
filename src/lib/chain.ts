import { createPublicClient, createWalletClient, http, parseAbi, parseUnits, decodeEventLog, type Hex, type Address, getAddress } from "viem";
import { base, baseSepolia } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";

export const NETWORK = (process.env.SETTLE_NETWORK || "base-sepolia") as "base-sepolia" | "base";
const IS_MAIN = NETWORK === "base";
export const chain = IS_MAIN ? base : baseSepolia;
export const USDC: Address = IS_MAIN ? "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" : "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
export const USDC_EIP712_NAME = IS_MAIN ? "USD Coin" : "USDC";
export const EXPLORER = IS_MAIN ? "https://basescan.org" : "https://sepolia.basescan.org";
const rpcUrl = process.env.RPC_URL || (IS_MAIN ? "https://mainnet.base.org" : "https://sepolia.base.org");
const abi = parseAbi(["function transfer(address to, uint256 amount) returns (bool)", "function balanceOf(address) view returns (uint256)", "event Transfer(address indexed from, address indexed to, uint256 value)"]);

export const pub = createPublicClient({ chain, transport: http(rpcUrl) });
function account() {
  const k = process.env.ESCROW_PRIVATE_KEY as Hex | undefined;
  if (!k) throw new Error("ESCROW_PRIVATE_KEY not set");
  return privateKeyToAccount(k);
}
export function escrowAddress(): Address | null { try { return account().address; } catch { return null; } }
export const toUnits = (usd: number) => parseUnits(usd.toFixed(6), 6);

export async function balances() {
  const a = escrowAddress(); if (!a) return null;
  const [usdc, eth] = await Promise.all([pub.readContract({ address: USDC, abi, functionName: "balanceOf", args: [a] }), pub.getBalance({ address: a })]);
  return { address: a, usdc: Number(usdc) / 1e6, eth: Number(eth) / 1e18 };
}

/** Verify a funding tx: USDC Transfer to escrow of >= amount. Returns the sender. */
export async function verifyFunding(tx: Hex, amount: number): Promise<{ ok: boolean; from?: Address; reason?: string }> {
  const esc = escrowAddress(); if (!esc) return { ok: false, reason: "escrow wallet not configured" };
  const rc = await pub.getTransactionReceipt({ hash: tx }).catch(() => null);
  if (!rc) return { ok: false, reason: "tx not found / not confirmed yet" };
  if (rc.status !== "success") return { ok: false, reason: "tx reverted" };
  for (const log of rc.logs) {
    if (getAddress(log.address) !== getAddress(USDC)) continue;
    try {
      const ev = decodeEventLog({ abi, data: log.data, topics: log.topics });
      if (ev.eventName === "Transfer" && getAddress(ev.args.to) === esc && ev.args.value >= toUnits(amount)) return { ok: true, from: ev.args.from };
    } catch {}
  }
  return { ok: false, reason: "no USDC transfer to escrow of the full amount in this tx" };
}

export async function payout(to: string, usd: number): Promise<Hex> {
  const w = createWalletClient({ account: account(), chain, transport: http(rpcUrl) });
  const hash = await w.writeContract({ address: USDC, abi, functionName: "transfer", args: [getAddress(to), toUnits(usd)] });
  await pub.waitForTransactionReceipt({ hash, timeout: 45_000 });
  return hash;
}
