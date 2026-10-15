import { balances, NETWORK, NETWORKS, EXPLORER } from "@/lib/chain";
import { X402_NETWORKS } from "@/lib/x402";
export const dynamic = "force-dynamic";
export async function GET() {
  const all = await Promise.all(NETWORKS.map((n) => balances(n).catch((e) => ({ network: n, error: String(e).slice(0, 100) }))));
  return Response.json({ network: NETWORK, networks: NETWORKS, explorer: EXPLORER, escrow: all[0], escrows: all, x402: process.env.X402_ENABLED === "true", x402_networks: X402_NETWORKS });
}
