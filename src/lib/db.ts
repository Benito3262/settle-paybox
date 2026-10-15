export type Condition =
  | { type: "github_pr_merged"; repo: string; issue: number }
  | { type: "both_confirm" }
  | { type: "url_contains"; url: string; text: string };

export type Deal = {
  id: string; created_at: string; title: string; payer: string | null; payee: string;
  amount: number; network: string; deadline: string; condition: Condition; status: string;
  payer_confirmed: boolean; payee_confirmed: boolean; fund_tx: string | null; release_tx: string | null;
  refund_tx: string | null; fee_tx: string | null; secret: string;
  events?: { id: number; at: string; kind: string; detail: string | null }[];
};

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const url = process.env.SUPABASE_URL!, key = process.env.SUPABASE_ANON_KEY!;
  const r = await fetch(`${url}/rest/v1/rpc/${fn}`, {
    method: "POST", cache: "no-store",
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ k: process.env.SETTLE_DB_KEY, ...args }),
  });
  if (!r.ok) throw new Error(`db ${fn}: ${r.status} ${await r.text()}`);
  const t = await r.text(); return (t ? JSON.parse(t) : null) as T;
}

export const db = {
  insert: (d: Partial<Deal>) => rpc<Deal>("settle_insert_deal", { d }),
  update: (id: string, patch: Partial<Deal>) => rpc<Deal>("settle_update_deal", { deal_id: id, patch }),
  event: (id: string, kind: string, detail = "") => rpc<null>("settle_add_event", { deal_id: id, kind, detail }),
  get: (id: string) => rpc<Deal | null>("settle_get_deal", { deal_id: id }),
  list: (onlyOpen = false) => rpc<Deal[]>("settle_list", { only_open: onlyOpen }),
  /** atomic compare-and-set on status; returns null if another caller won */
  transition: (id: string, from: string, to: string) => rpc<Deal | null>("settle_transition", { deal_id: id, from_status: from, to_status: to }),
  txUsed: (tx: string) => rpc<boolean>("settle_tx_used", { tx }),
};

/** strip secrets before returning to clients */
export function publicDeal(d: Deal) {
  const { secret: _s, ...rest } = d; void _s; return rest;
}
