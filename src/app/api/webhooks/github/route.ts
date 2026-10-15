import { createHmac, timingSafeEqual } from "crypto";
import { db } from "@/lib/db";
import { tick } from "@/lib/engine";
export const maxDuration = 60;
export async function POST(req: Request) {
  const raw = await req.text();
  const sig = req.headers.get("x-hub-signature-256") || "";
  const want = "sha256=" + createHmac("sha256", process.env.GITHUB_WEBHOOK_SECRET || "").update(raw).digest("hex");
  if (sig.length !== want.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(want))) return new Response("bad signature", { status: 401 });
  const ev = req.headers.get("x-github-event"); const p = JSON.parse(raw);
  if (ev === "ping") return Response.json({ ok: true, pong: true });
  const relevant = (ev === "pull_request" && p.action === "closed" && p.pull_request?.merged) || (ev === "issues" && p.action === "closed");
  if (!relevant) return Response.json({ ignored: ev });
  const repo = String(p.repository?.full_name || "").toLowerCase();
  const deals = (await db.list(true)).filter((d) => d.status === "funded" && d.condition.type === "github_pr_merged" && d.condition.repo.toLowerCase() === repo);
  const what = ev === "pull_request" ? `PR #${p.pull_request.number} merged` : `issue #${p.issue.number} closed`;
  const results: Record<string, string | undefined> = {};
  for (const d of deals) { await db.event(d.id, "webhook", `GitHub: ${what} in ${repo}; verifying via API`); for (let i = 0; i < 5; i++) { results[d.id] = (await tick(d.id, "github webhook"))?.status; if (results[d.id] !== "funded") break; await new Promise((r) => setTimeout(r, 6000)); } }
  return Response.json({ ok: true, results });
}
