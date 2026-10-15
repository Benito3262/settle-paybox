import { createPublicClient, createWalletClient, http, parseAbi, parseUnits, decodeEventLog, type Hex, type Address, getAddress } from "viem";
import { base, baseSepolia, sepolia } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";

export type Net = "base-sepolia" | "base" | "sepolia";
const NETS = {
  "base-sepolia": { chain: baseSepolia, usdc: "0x036CbD53842c5426634e7929541eC2318f3dCF7e", usdcName: "USDC", explorer: "https://sepolia.basescan.org", rpc: "https://sepolia.base.org" },
  base: { chain: base, usdc: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", usdcName: "USD Coin", explorer: "https://basescan.org", rpc: "https://mainnet.base.org" },
  sepolia: { chain: sepolia, usdc: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238", usdcName: "USDC", explorer: "https://sepolia.etherscan.io", rpc: "https://ethereum-sepolia-rpc.publicnode.com" },
} as const;
export const CHAIN_IDS: Record<Net, number> = { "base-sepolia": 84532, base: 8453, sepolia: 11155111 };
export const netConfig = (n: Net) => NETS[n] ?? NETS["base-sepolia"];
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

const pubs: Partial<Record<Net, ReturnType<typeof createPublicClient>>> = {};
export function pubFor(net: Net = NETWORK) {
  const c = netConfig(net);
  return (pubs[net] ??= createPublicClient({ chain: c.chain, transport: http(net === NETWORK ? rpcUrl : (process.env[`RPC_URL_${net.replace("-", "_").toUpperCase()}`] || c.rpc)) }) as ReturnType<typeof createPublicClient>);
}
export const pub = pubFor(NETWORK);
/** Networks deals may use (SETTLE_NETWORKS="sepolia,base"); first = default. */
export const NETWORKS: Net[] = (process.env.SETTLE_NETWORKS || NETWORK).split(",").map((x) => x.trim() as Net).filter((x) => x in NETS);
function account() {
  const k = process.env.ESCROW_PRIVATE_KEY as Hex | undefined;
  if (!k) throw new Error("ESCROW_PRIVATE_KEY not set");
  return privateKeyToAccount(k);
}
export function escrowAddress(): Address | null { try { return account().address; } catch { return null; } }
export const toUnits = (usd: number) => parseUnits(usd.toFixed(6), 6);

export async function balances(net: Net = NETWORK) {
  const a = escrowAddress(); if (!a) return null;
  const p = pubFor(net), c = netConfig(net);
  const [usdc, eth] = await Promise.all([p.readContract({ address: c.usdc, abi, functionName: "balanceOf", args: [a] }), p.getBalance({ address: a })]);
  return { network: net, address: a, usdc: Number(usdc) / 1e6, eth: Number(eth) / 1e18 };
}

/** Verify a funding tx: USDC Transfer to escrow of >= amount. Returns the sender. */
export async function verifyFunding(tx: Hex, amount: number, net: Net = NETWORK): Promise<{ ok: boolean; from?: Address; reason?: string }> {
  const esc = escrowAddress(); if (!esc) return { ok: false, reason: "escrow wallet not configured" };
  const usdc = netConfig(net).usdc;
  const rc = await pubFor(net).getTransactionReceipt({ hash: tx }).catch(() => null);
  if (!rc) return { ok: false, reason: "tx not found / not confirmed yet" };
  if (rc.status !== "success") return { ok: false, reason: "tx reverted" };
  for (const log of rc.logs) {
    if (getAddress(log.address) !== getAddress(usdc)) continue;
    try {
      const ev = decodeEventLog({ abi, data: log.data, topics: log.topics });
      if (ev.eventName === "Transfer" && getAddress(ev.args.to) === esc && ev.args.value >= toUnits(amount)) return { ok: true, from: ev.args.from };
    } catch {}
  }
  return { ok: false, reason: "no USDC transfer to escrow of the full amount in this tx" };
}

/** Broadcast a payer-signed raw tx (e.g. from PayBox request_wallet_sign op:transaction). */
export async function broadcast(raw: Hex, net: Net = NETWORK): Promise<Hex> {
  const p = pubFor(net);
  const hash = await p.sendRawTransaction({ serializedTransaction: raw });
  await p.waitForTransactionReceipt({ hash, timeout: 60_000 });
  return hash;
}

export async function payout(to: string, usd: number, net: Net = NETWORK): Promise<Hex> {
  const c = netConfig(net);
  const w = createWalletClient({ account: account(), chain: c.chain, transport: http(net === NETWORK ? rpcUrl : c.rpc) });
  const hash = await w.writeContract({ address: c.usdc, abi, functionName: "transfer", args: [getAddress(to), toUnits(usd)] });
  await pubFor(net).waitForTransactionReceipt({ hash, timeout: 45_000 });
  return hash;
}
export const explorerFor = (net: Net) => netConfig(net).explorer;
