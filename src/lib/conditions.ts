import type { Condition, Deal } from "./db";

const gh = (path: string) => fetch(`https://api.github.com${path}`, {
  cache: "no-store",
  headers: { Accept: "application/vnd.github+json", "User-Agent": "settle-paybox", ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}) },
});

/** Independently verify against the GitHub API: issue closed AND a merged PR in the same repo references it. */
export async function checkGithub(repo: string, issue: number): Promise<{ met: boolean; detail: string }> {
  const ir = await gh(`/repos/${repo}/issues/${issue}`);
  if (!ir.ok) return { met: false, detail: `GitHub issue lookup failed (${ir.status})` };
  const iss = await ir.json();
  if (iss.state !== "closed") return { met: false, detail: `issue #${issue} still open` };
  const tr = await gh(`/repos/${repo}/issues/${issue}/timeline?per_page=100`);
  const tl = tr.ok ? await tr.json() : [];
  for (const e of tl) {
    const src = e?.source?.issue;
    if (e.event === "cross-referenced" && src?.pull_request && src.repository?.full_name?.toLowerCase() === repo.toLowerCase()) {
      const pr = await gh(`/repos/${repo}/pulls/${src.number}`).then((r) => r.json());
      if (pr.merged) return { met: true, detail: `PR #${pr.number} merged by ${pr.merged_by?.login ?? "?"} and issue #${issue} closed` };
    }
    if (e.event === "closed" && e.commit_id) return { met: true, detail: `issue #${issue} closed by merged commit ${String(e.commit_id).slice(0, 7)}` };
  }
  return { met: false, detail: `issue #${issue} closed, but no merged PR found` };
}

export async function checkUrl(url: string, text: string) {
  try {
    const r = await fetch(url, { cache: "no-store", redirect: "follow", signal: AbortSignal.timeout(10_000) });
    const body = await r.text();
    return r.ok && body.includes(text) ? { met: true, detail: `${url} is live and contains "${text}"` } : { met: false, detail: `${url} → ${r.status}${r.ok ? ", text not found" : ""}` };
  } catch (e) { return { met: false, detail: `${url} unreachable: ${(e as Error).message}` }; }
}

export async function evaluate(d: Deal): Promise<{ met: boolean; detail: string }> {
  const c = d.condition as Condition;
  if (c.type === "github_pr_merged") return checkGithub(c.repo, c.issue);
  if (c.type === "url_contains") return checkUrl(c.url, c.text);
  return d.payer_confirmed && d.payee_confirmed ? { met: true, detail: "both parties confirmed" } : { met: false, detail: `waiting on ${[!d.payer_confirmed && "payer", !d.payee_confirmed && "payee"].filter(Boolean).join(" + ")}` };
}

export function describe(c: Condition) {
  if (c.type === "github_pr_merged") return `PR merged that closes ${c.repo}#${c.issue}`;
  if (c.type === "url_contains") return `${c.url} is live and shows "${c.text}"`;
  return "payer and payee both confirm";
}
