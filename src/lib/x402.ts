import { verifyExact, settleExact, type ExactPayload } from "./facilitator";
import { X402_NETWORK as NETWORK, X402_USDC as USDC, X402_USDC_NAME as USDC_EIP712_NAME, escrowAddress } from "./chain";

const CAIP: Record<string, string> = { "base-sepolia": "eip155:84532", base: "eip155:8453", sepolia: "eip155:11155111" };
export const CREATE_PRICE_USD = Number(process.env.CREATE_PRICE_USD || "0.05");
const SELF = process.env.X402_FACILITATOR === "self" || (!process.env.X402_FACILITATOR && NETWORK === "sepolia");
const FACILITATOR = process.env.X402_FACILITATOR_URL || "https://x402.org/facilitator";

export function requirements(resource: string) {
  return {
    scheme: "exact", network: NETWORK, maxAmountRequired: String(Math.round(CREATE_PRICE_USD * 1e6)),
    resource, description: "Settle: create a conditional escrow deal", mimeType: "application/json",
    payTo: process.env.FEE_WALLET || escrowAddress(), maxTimeoutSeconds: 120, asset: USDC,
    extra: { name: USDC_EIP712_NAME, version: "2" },
  };
}

/** x402 gate. Returns null if paid/bypassed (plus settle receipt), or a 402 Response. */
export async function gate(req: Request): Promise<{ paid: true; receipt?: string; tx?: string; payer?: string } | Response> {
  if (process.env.X402_ENABLED !== "true") return { paid: true };
  const admin = req.headers.get("x-settle-admin");
  if (admin && admin === process.env.SETTLE_ADMIN_KEY) return { paid: true };
  const reqs = requirements(new URL(req.url).toString());
  const header = req.headers.get("payment-signature") || req.headers.get("x-payment");
  const v2req = { scheme: "exact", network: CAIP[NETWORK] || NETWORK, amount: reqs.maxAmountRequired, asset: reqs.asset, payTo: reqs.payTo, maxTimeoutSeconds: reqs.maxTimeoutSeconds, extra: reqs.extra };
  const v2 = { x402Version: 2, resource: { url: reqs.resource, description: reqs.description, mimeType: reqs.mimeType }, accepts: [v2req] };
  const deny = (error: string) => Response.json({ x402Version: 1, error, accepts: [reqs] }, { status: 402, headers: { "PAYMENT-REQUIRED": Buffer.from(JSON.stringify({ ...v2, error })).toString("base64") } });
  if (!header) return deny("X-PAYMENT header is required");
  let payload: unknown;
  try { payload = JSON.parse(Buffer.from(header, "base64").toString()); } catch { return deny("bad X-PAYMENT"); }
  if (SELF) {
    const amount = BigInt(reqs.maxAmountRequired);
    const v = await verifyExact(payload as ExactPayload, { network: NETWORK, payTo: reqs.payTo as string, amount, asset: USDC }).catch((e) => ({ ok: false as const, reason: String(e).slice(0, 120) }));
    if (!v.ok) return deny(v.reason);
    try {
      const tx = await settleExact(NETWORK, USDC, v.msg, v.sig);
      return { paid: true, receipt: Buffer.from(JSON.stringify({ success: true, transaction: tx, network: CAIP[NETWORK] || NETWORK, payer: v.msg.from })).toString("base64"), tx, payer: v.msg.from };
    } catch (e) { return deny("settlement_failed: " + (e as Error).message.slice(0, 120)); }
  }
  const ver = (payload as { x402Version?: number })?.x402Version === 2 ? 2 : 1;
  const body = JSON.stringify({ x402Version: ver, paymentPayload: payload, paymentRequirements: ver === 2 ? v2req : reqs });
  const v = await fetch(`${FACILITATOR}/verify`, { method: "POST", headers: { "Content-Type": "application/json" }, body }).then((r) => r.json()).catch(() => null);
  if (!v?.isValid) return deny(v?.invalidReason || "payment invalid");
  const s = await fetch(`${FACILITATOR}/settle`, { method: "POST", headers: { "Content-Type": "application/json" }, body }).then((r) => r.json()).catch(() => null);
  if (!s?.success) return deny(s?.errorReason || "settlement failed");
  return { paid: true, receipt: Buffer.from(JSON.stringify(s)).toString("base64") };
}
