import { gate } from "@/lib/x402";
import { createDeal } from "@/lib/deals";
import { db, publicDeal } from "@/lib/db";
export const dynamic = "force-dynamic";
export async function GET() { return Response.json((await db.list()).map(publicDeal)); }
export async function POST(req: Request) {
  const g = await gate(req); if (g instanceof Response) return g;
  try {
    const out = await createDeal(await req.json());
    return Response.json(out, { headers: g.receipt ? { "X-PAYMENT-RESPONSE": g.receipt, "PAYMENT-RESPONSE": g.receipt } : {} });
  } catch (e) { return Response.json({ error: (e as Error).message }, { status: 400 }); }
}
