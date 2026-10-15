// Built-in x402 facilitator for the "exact" EVM scheme (EIP-3009 transferWithAuthorization).
import { createPublicClient, createWalletClient, http, parseAbi, getAddress, parseSignature, type Hex, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { netConfig, type Net } from "./chain";

const abi = parseAbi([
  "function name() view returns (string)", "function version() view returns (string)",
  "function authorizationState(address authorizer, bytes32 nonce) view returns (bool)",
  "function balanceOf(address) view returns (uint256)",
  "function transferWithAuthorization(address from, address to, uint256 value, uint256 validAfter, uint256 validBefore, bytes32 nonce, uint8 v, bytes32 r, bytes32 s)",
]);
const TYPES = { TransferWithAuthorization: [
  { name: "from", type: "address" }, { name: "to", type: "address" }, { name: "value", type: "uint256" },
  { name: "validAfter", type: "uint256" }, { name: "validBefore", type: "uint256" }, { name: "nonce", type: "bytes32" },
] } as const;

type Auth = { from: string; to: string; value: string; validAfter: string; validBefore: string; nonce: Hex };
export type ExactPayload = { x402Version?: number; scheme?: string; network?: string; accepted?: { scheme?: string; network?: string }; payload?: { signature: Hex; authorization: Auth } };

const domainCache: Record<string, { name: string; version: string }> = {};
function clients(net: Net) {
  const c = netConfig(net);
  return { c, pub: createPublicClient({ chain: c.chain, transport: http(process.env.X402_RPC_URL || c.rpc) }) };
}

export async function verifyExact(p: ExactPayload, req: { network: Net; payTo: string; amount: bigint; asset: Address }) {
  const scheme = p.accepted?.scheme ?? p.scheme;
  if (scheme !== "exact") return { ok: false as const, reason: "unsupported_scheme" };
  const a = p.payload?.authorization, sig = p.payload?.signature;
  if (!a || !sig) return { ok: false as const, reason: "invalid_payload" };
  const { c, pub } = clients(req.network);
  const key = `${req.network}:${req.asset}`;
  domainCache[key] ??= {
    name: await pub.readContract({ address: req.asset, abi, functionName: "name" }),
    version: await pub.readContract({ address: req.asset, abi, functionName: "version" }),
  };
  const domain = { ...domainCache[key], chainId: c.chain.id, verifyingContract: req.asset };
  const msg = { from: getAddress(a.from), to: getAddress(a.to), value: BigInt(a.value), validAfter: BigInt(a.validAfter), validBefore: BigInt(a.validBefore), nonce: a.nonce };
  const good = await pub.verifyTypedData({ address: msg.from, domain, types: TYPES, primaryType: "TransferWithAuthorization", message: msg, signature: sig }).catch(() => false);
  if (!good) return { ok: false as const, reason: "invalid_signature" };
  if (msg.to !== getAddress(req.payTo)) return { ok: false as const, reason: "wrong_payTo" };
  if (msg.value < req.amount) return { ok: false as const, reason: "insufficient_amount" };
  const now = BigInt(Math.floor(Date.now() / 1000));
  if (msg.validAfter > now || msg.validBefore <= now + 6n) return { ok: false as const, reason: "outside_validity_window" };
  if (await pub.readContract({ address: req.asset, abi, functionName: "authorizationState", args: [msg.from, msg.nonce] })) return { ok: false as const, reason: "nonce_already_used" };
  if ((await pub.readContract({ address: req.asset, abi, functionName: "balanceOf", args: [msg.from] })) < msg.value) return { ok: false as const, reason: "insufficient_funds" };
  return { ok: true as const, msg, sig };
}

export async function settleExact(net: Net, asset: Address, msg: { from: Address; to: Address; value: bigint; validAfter: bigint; validBefore: bigint; nonce: Hex }, sig: Hex) {
  const { c, pub } = clients(net);
  const account = privateKeyToAccount(process.env.ESCROW_PRIVATE_KEY as Hex);
  const w = createWalletClient({ account, chain: c.chain, transport: http(process.env.X402_RPC_URL || c.rpc) });
  const { v, r, s, yParity } = parseSignature(sig);
  const hash = await w.writeContract({ address: asset, abi, functionName: "transferWithAuthorization", args: [msg.from, msg.to, msg.value, msg.validAfter, msg.validBefore, msg.nonce, Number(v ?? BigInt(yParity + 27)), r, s] });
  const rc = await pub.waitForTransactionReceipt({ hash, timeout: 60_000 });
  if (rc.status !== "success") throw new Error("settlement_reverted");
  return hash;
}
