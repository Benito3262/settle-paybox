import { db, publicDeal } from "@/lib/db";
export const dynamic = "force-dynamic";
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const d = await db.get((await params).id);
  return d ? Response.json(publicDeal(d)) : Response.json({ error: "not found" }, { status: 404 });
}
