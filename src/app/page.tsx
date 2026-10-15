"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Badge } from "./ui";
type D = { id: string; title: string; amount: number; status: string; payee: string; deadline: string; created_at: string };
export default function Home() {
  const [deals, setDeals] = useState<D[]>([]); const [st, setSt] = useState<{ network: string; escrow: { address: string; usdc: number; eth: number } } | null>(null);
  const [f, setF] = useState({ title: "Pay @dev $50 when issue #12 is fixed", payee: "", payer: "", amount: "50", type: "github_pr_merged", repo: "", issue: "12", url: "", text: "", hours: "48", admin: "" });
  const [out, setOut] = useState<string>(""); const [busy, setBusy] = useState(false);
  const load = () => { fetch("/api/deals").then((r) => r.json()).then(setDeals); fetch("/api/status").then((r) => r.json()).then(setSt); };
  useEffect(() => { load(); setF((x) => ({ ...x, admin: localStorage.getItem("settle_admin") || "" })); const t = setInterval(load, 8000); return () => clearInterval(t); }, []);
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  async function create() {
    setBusy(true); localStorage.setItem("settle_admin", f.admin);
    const condition = f.type === "github_pr_merged" ? { type: f.type, repo: f.repo, issue: Number(f.issue) } : f.type === "url_contains" ? { type: f.type, url: f.url, text: f.text } : { type: f.type };
    const r = await fetch("/api/deals", { method: "POST", headers: { "Content-Type": "application/json", "x-settle-admin": f.admin }, body: JSON.stringify({ title: f.title, payee: f.payee, payer: f.payer || undefined, amount: Number(f.amount), deadline_hours: Number(f.hours), condition }) });
    const j = await r.json(); setBusy(false);
    if (j.deal_id) { localStorage.setItem("tok_" + j.deal_id, JSON.stringify({ payer: j.payer_token, payee: j.payee_token })); location.href = `/deal/${j.deal_id}`; }
    else setOut(r.status === 402 ? "This endpoint is x402-paid ($0.05). Agents pay automatically; on the dashboard enter the admin key." : j.error || JSON.stringify(j));
  }
  return (<div className="space-y-8">
    <section className="pt-6"><h1 className="text-4xl font-bold">Escrow that settles itself.</h1>
      <p className="text-slate-400 mt-2 max-w-2xl">Your agent locks USDC. Settle releases it the moment the work is verifiably done — a GitHub PR merged, both sides confirm, or a site goes live — and refunds you automatically if the deadline passes.</p>
      {st && <p className="text-xs text-slate-500 mt-3">Network: <b>{st.network}</b> · Escrow {st.escrow?.address} · {st.escrow?.usdc?.toFixed(2)} USDC · {st.escrow?.eth?.toFixed(5)} ETH gas</p>}
    </section>
    <section className="card p-5 grid md:grid-cols-2 gap-3">
      <h2 className="md:col-span-2 font-semibold">New deal</h2>
      <input className="inp md:col-span-2" value={f.title} onChange={set("title")} placeholder="What is this deal for?" />
      <input className="inp" value={f.payee} onChange={set("payee")} placeholder="Payee wallet 0x… (who gets paid)" />
      <input className="inp" value={f.payer} onChange={set("payer")} placeholder="Payer wallet 0x… (refunds; optional)" />
      <input className="inp" value={f.amount} onChange={set("amount")} placeholder="Amount USDC" />
      <input className="inp" value={f.hours} onChange={set("hours")} placeholder="Deadline (hours from now)" />
      <select className="inp md:col-span-2" value={f.type} onChange={set("type")}><option value="github_pr_merged">GitHub PR merged that closes an issue</option><option value="both_confirm">Both parties confirm</option><option value="url_contains">URL is live and contains text</option></select>
      {f.type === "github_pr_merged" && <><input className="inp" value={f.repo} onChange={set("repo")} placeholder="owner/repo" /><input className="inp" value={f.issue} onChange={set("issue")} placeholder="Issue #" /></>}
      {f.type === "url_contains" && <><input className="inp" value={f.url} onChange={set("url")} placeholder="https://…" /><input className="inp" value={f.text} onChange={set("text")} placeholder="Text that must appear" /></>}
      <input className="inp md:col-span-2" value={f.admin} onChange={set("admin")} placeholder="Dashboard admin key (agents pay $0.05 via x402 instead)" type="password" />
      <div className="md:col-span-2 flex items-center gap-3"><button className="btn" disabled={busy} onClick={create}>{busy ? "Creating…" : "Create deal"}</button><span className="text-sm text-rose-300">{out}</span></div>
    </section>
    <section><h2 className="font-semibold mb-3">Deals</h2><div className="space-y-2">
      {deals.length === 0 && <p className="text-slate-500 text-sm">No deals yet.</p>}
      {deals.map((d) => (<Link key={d.id} href={`/deal/${d.id}`} className="card p-4 flex items-center justify-between hover:border-violet-500/50">
        <div><div className="font-medium">{d.title}</div><div className="text-xs text-slate-500">{d.id} · due {new Date(d.deadline).toLocaleString()}</div></div>
        <div className="flex items-center gap-3"><span className="font-semibold">{Number(d.amount)} USDC</span><Badge s={d.status} /></div></Link>))}
    </div></section>
  </div>);
}
