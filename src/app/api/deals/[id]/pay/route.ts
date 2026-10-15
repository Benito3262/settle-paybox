import { gate } from "@/lib/x402";
import { db } from "@/lib/db";
import { fundDealX402 } from "@/lib/deals";
import { escrowAddress, type Net } from "@/lib/chain";
export const maxDuration = 60;
/** Fund a deal with x402: the 402 asks for exactly the deal amount, paid to escrow, on the deal's network. */
async function handle(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = (await params).id; const d = await db.get(id);
  if (!d) return Response.json({ error: "deal not found" }, { status: 404 });
  if (d.status !== "awaiting_funding") return Response.json({ deal_id: id, status: d.status });
  const g = await gate(req, { usd: Number(d.amount), networks: [d.network as Net], payTo: escrowAddress()!, description: `Settle: lock ${d.amount} USDC in escrow for deal ${id}`, noAdminBypass: true });
  if (g instanceof Response) return g;
  const out = await fundDealX402(id, g);
  return Response.json({ deal_id: id, ...out }, { headers: g.receipt ? { "X-PAYMENT-RESPONSE": g.receipt, "PAYMENT-RESPONSE": g.receipt } : {} });
}
export { handle as GET, handle as POST };
