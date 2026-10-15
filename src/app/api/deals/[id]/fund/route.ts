import { fundDeal } from "@/lib/deals";
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try { const { tx, signed_tx } = await req.json(); return Response.json(await fundDeal((await params).id, tx, signed_tx)); }
  catch (e) { return Response.json({ error: (e as Error).message }, { status: 400 }); }
}
