import { X402_NETWORK as NETWORK, X402_USDC as USDC, X402_USDC_NAME as USDC_EIP712_NAME, escrowAddress } from "./chain";

export const CREATE_PRICE_USD = Number(process.env.CREATE_PRICE_USD || "0.05");
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
export async function gate(req: Request): Promise<{ paid: true; receipt?: string } | Response> {
  if (process.env.X402_ENABLED !== "true") return { paid: true };
  const admin = req.headers.get("x-settle-admin");
  if (admin && admin === process.env.SETTLE_ADMIN_KEY) return { paid: true };
  const reqs = requirements(new URL(req.url).toString());
  const header = req.headers.get("x-payment");
  const deny = (error: string) => Response.json({ x402Version: 1, error, accepts: [reqs] }, { status: 402 });
  if (!header) return deny("X-PAYMENT header is required");
  let payload: unknown;
  try { payload = JSON.parse(Buffer.from(header, "base64").toString()); } catch { return deny("bad X-PAYMENT"); }
  const body = JSON.stringify({ x402Version: 1, paymentPayload: payload, paymentRequirements: reqs });
  const v = await fetch(`${FACILITATOR}/verify`, { method: "POST", headers: { "Content-Type": "application/json" }, body }).then((r) => r.json()).catch(() => null);
  if (!v?.isValid) return deny(v?.invalidReason || "payment invalid");
  const s = await fetch(`${FACILITATOR}/settle`, { method: "POST", headers: { "Content-Type": "application/json" }, body }).then((r) => r.json()).catch(() => null);
  if (!s?.success) return deny(s?.errorReason || "settlement failed");
  return { paid: true, receipt: Buffer.from(JSON.stringify(s)).toString("base64") };
}
