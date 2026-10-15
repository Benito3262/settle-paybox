import { tick, expireUnfunded } from "@/lib/engine";
import { db, publicDeal } from "@/lib/db";
export const maxDuration = 60;
export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = (await params).id; const d0 = await db.get(id);
  if (!d0) return Response.json({ error: "not found" }, { status: 404 });
  await expireUnfunded(d0);
  const d = await tick(id, "check");
  return Response.json(d ? publicDeal(d) : null);
}
