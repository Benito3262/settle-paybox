import { db } from "@/lib/db";
import { tick, expireUnfunded } from "@/lib/engine";
export const dynamic = "force-dynamic"; export const maxDuration = 60;
export async function GET(req: Request) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) return new Response("unauthorized", { status: 401 });
  const open = await db.list(true); const out: Record<string, string | undefined> = {};
  for (const d of open) { await expireUnfunded(d); out[d.id] = (await tick(d.id, "cron"))?.status; }
  return Response.json({ checked: open.length, out });
}
