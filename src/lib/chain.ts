import { createPublicClient, createWalletClient, http, parseAbi, parseUnits, decodeEventLog, type Hex, type Address, getAddress } from "viem";
import { base, baseSepolia, sepolia } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";

export type Net = "base-sepolia" | "base" | "sepolia";
const NETS = {
  "base-sepolia": { chain: baseSepolia, usdc: "0x036CbD53842c5426634e7929541eC2318f3dCF7e", usdcName: "USDC", explorer: "https://sepolia.basescan.org", rpc: "https://sepolia.base.org" },
  base: { chain: base, usdc: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", usdcName: "USD Coin", explorer: "https://basescan.org", rpc: "https://mainnet.base.org" },
  sepolia: { chain: sepolia, usdc: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238", usdcName: "USDC", explorer: "https://sepolia.etherscan.io", rpc: "https://ethereum-sepolia-rpc.publicnode.com" },
} as const;
export const NETWORK = (process.env.SETTLE_NETWORK || "base-sepolia") as Net;
const N = NETS[NETWORK] ?? NETS["base-sepolia"];
export const chain = N.chain;
export const USDC: Address = N.usdc;
export const USDC_EIP712_NAME = N.usdcName;
export const EXPLORER = N.explorer;
const rpcUrl = process.env.RPC_URL || N.rpc;
/** x402 fee payments use their own network (the public facilitator does not support Ethereum Sepolia). */
export const X402_NETWORK = (process.env.X402_NETWORK || (NETWORK === "sepolia" ? "base-sepolia" : NETWORK)) as Net;
export const X402_USDC: Address = (NETS[X402_NETWORK] ?? NETS["base-sepolia"]).usdc;
export const X402_USDC_NAME = (NETS[X402_NETWORK] ?? NETS["base-sepolia"]).usdcName;
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
