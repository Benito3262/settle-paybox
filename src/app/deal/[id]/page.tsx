"use client";
import { use, useEffect, useState } from "react";
import { Badge } from "../../ui";
type Ev = { id: number; at: string; kind: string; detail: string };
type D = { id: string; title: string; amount: number; status: string; payer: string | null; payee: string; deadline: string; network: string; condition: Record<string, string>; fund_tx: string | null; release_tx: string | null; refund_tx: string | null; payer_confirmed: boolean; payee_confirmed: boolean; events: Ev[] };
const ICON: Record<string, string> = { created: "✦", funded: "🔒", webhook: "⚡", condition_met: "✓", released: "💸", deadline_passed: "⏰", refunded: "↩", confirmed: "🤝", error: "⚠", expired: "✕" };
export default function Deal({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [d, setD] = useState<D | null>(null); const [st, setSt] = useState<{ explorer: string; escrow: { address: string } } | null>(null);
  const [tx, setTx] = useState(""); const [msg, setMsg] = useState(""); const [tok, setTok] = useState<{ payer?: string; payee?: string }>({});
  const load = () => fetch(`/api/deals/${id}`).then((r) => r.json()).then(setD);
  useEffect(() => {
    load(); fetch("/api/status").then((r) => r.json()).then(setSt); setTok(JSON.parse(localStorage.getItem("tok_" + id) || "{}"));
    const a = setInterval(load, 4000);
    const b = setInterval(() => fetch(`/api/deals/${id}/check`, { method: "POST" }), 20000);
    return () => { clearInterval(a); clearInterval(b); };
  }, [id]);
  if (!d) return <p className="text-slate-500">Loading…</p>;
  const ex = (h: string | null) => h && st ? <a className="text-violet-300 underline" href={`${st.explorer}/tx/${h}`} target="_blank">{h.slice(0, 10)}…</a> : "—";
  const post = async (path: string, body: object) => { const r = await fetch(`/api/deals/${id}/${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); const j = await r.json(); setMsg(j.error || `ok: ${j.status}`); load(); };
  const c = d.condition;
  return (<div className="grid md:grid-cols-5 gap-5 pt-4">
    <div className="md:col-span-3 space-y-4">
      <div className="card p-5"><div className="flex justify-between items-start"><h1 className="text-2xl font-bold">{d.title}</h1><Badge s={d.status} /></div>
        <div className="text-4xl font-bold mt-3">{Number(d.amount)} <span className="text-lg text-slate-400">USDC</span></div>
        <dl className="grid grid-cols-3 gap-y-2 text-sm mt-4">
          <dt className="text-slate-500">Condition</dt><dd className="col-span-2">{c.type === "github_pr_merged" ? <>PR merged closing <a className="underline" href={`https://github.com/${c.repo}/issues/${c.issue}`} target="_blank">{c.repo}#{c.issue}</a></> : c.type === "url_contains" ? `${c.url} shows "${c.text}"` : `Both confirm (payer ${d.payer_confirmed ? "✓" : "…"}, payee ${d.payee_confirmed ? "✓" : "…"})`}</dd>
          <dt className="text-slate-500">Payee</dt><dd className="col-span-2 break-all">{d.payee}</dd>
          <dt className="text-slate-500">Payer</dt><dd className="col-span-2 break-all">{d.payer || "set by funding tx"}</dd>
          <dt className="text-slate-500">Deadline</dt><dd className="col-span-2">{new Date(d.deadline).toLocaleString()}</dd>
          <dt className="text-slate-500">Network</dt><dd className="col-span-2">{d.network}</dd>
          <dt className="text-slate-500">Lock tx</dt><dd className="col-span-2">{ex(d.fund_tx)}</dd>
          <dt className="text-slate-500">Release tx</dt><dd className="col-span-2">{ex(d.release_tx)}</dd>
          <dt className="text-slate-500">Refund tx</dt><dd className="col-span-2">{ex(d.refund_tx)}</dd>
        </dl></div>
      {d.status === "awaiting_funding" && <div className="card p-5 space-y-3"><h2 className="font-semibold">Lock the funds</h2>
        <p className="text-sm text-slate-400">Send exactly <b>{Number(d.amount)} USDC</b> on <b>{d.network}</b> to the escrow wallet — in PayBox, the agent calls send_payment and you approve with your passkey.</p>
        <code className="block text-xs bg-black/40 p-2 rounded break-all">{st?.escrow?.address}</code>
        <div className="flex gap-2"><input className="inp" placeholder="Paste the payment tx hash 0x…" value={tx} onChange={(e) => setTx(e.target.value)} /><button className="btn" onClick={() => post("fund", { tx })}>Verify</button></div></div>}
      {d.status === "funded" && c.type === "both_confirm" && <div className="card p-5 flex gap-2 flex-wrap">
        {tok.payer && <button className="btn" onClick={() => post("confirm", { token: tok.payer })}>Confirm as payer</button>}
        {tok.payee && <button className="btn" onClick={() => post("confirm", { token: tok.payee })}>Confirm as payee</button>}
        {!tok.payer && <span className="text-sm text-slate-400">Confirm links are held by the payer &amp; payee agents.</span>}</div>}
      <div className="flex gap-3 items-center"><button className="text-sm underline text-slate-400" onClick={() => post("check", {})}>Check condition now</button><span className="text-sm text-slate-300">{msg}</span></div>
    </div>
    <div className="md:col-span-2 card p-5"><h2 className="font-semibold mb-3">Live timeline</h2><ol className="space-y-3">
      {d.events.map((e) => (<li key={e.id} className="flex gap-3"><span className="w-6 text-center">{ICON[e.kind] || "•"}</span><div><div className="text-sm font-medium">{e.kind.replace("_", " ")} <span className="text-xs text-slate-500">{new Date(e.at).toLocaleTimeString()}</span></div><div className="text-xs text-slate-400 break-all">{e.detail}</div></div></li>))}
    </ol></div>
  </div>);
}
