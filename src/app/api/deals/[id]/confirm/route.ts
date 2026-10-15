import { confirmDeal } from "@/lib/deals";
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try { const { token } = await req.json(); return Response.json(await confirmDeal((await params).id, token)); }
  catch (e) { return Response.json({ error: (e as Error).message }, { status: 400 }); }
}
