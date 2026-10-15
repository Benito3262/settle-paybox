import { balances, NETWORK, EXPLORER } from "@/lib/chain";
export const dynamic = "force-dynamic";
export async function GET() { return Response.json({ network: NETWORK, explorer: EXPLORER, escrow: await balances().catch((e) => ({ error: String(e) })), x402: process.env.X402_ENABLED === "true" }); }
