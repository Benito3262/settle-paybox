import { randomBytes, createHash } from "crypto";
import { db, type Condition } from "./db";
import { NETWORK, escrowAddress, verifyFunding } from "./chain";
import { describe } from "./conditions";
import { tick } from "./engine";
import { isAddress, type Hex } from "viem";

const h = (s: string) => createHash("sha256").update(s).digest("hex");

export async function createDeal(input: Record<string, unknown>) {
  const amount = Number(input.amount);
  if (!(amount > 0 && amount <= 100000)) throw new Error("amount must be a positive USDC number");
  if (!isAddress(String(input.payee))) throw new Error("payee must be a 0x wallet address");
  if (input.payer && !isAddress(String(input.payer))) throw new Error("payer must be a 0x wallet address");
  const deadline = input.deadline ? new Date(String(input.deadline)) : new Date(Date.now() + Number(input.deadline_hours || 72) * 3600e3);
  if (isNaN(+deadline) || +deadline < Date.now()) throw new Error("deadline must be in the future");
  const c = input.condition as Condition;
  if (!c || !["github_pr_merged", "both_confirm", "url_contains"].includes(c.type)) throw new Error("condition.type must be github_pr_merged | both_confirm | url_contains");
  if (c.type === "github_pr_merged" && !(/^[\w.-]+\/[\w.-]+$/.test(c.repo) && Number(c.issue) > 0)) throw new Error("github condition needs repo 'owner/name' and issue number");
  if (c.type === "url_contains" && !(/^https?:\/\//.test(c.url) && c.text)) throw new Error("url condition needs url and text");
  const payerToken = randomBytes(12).toString("hex"), payeeToken = randomBytes(12).toString("hex");
  const id = "dl_" + randomBytes(5).toString("hex");
  const deal = await db.insert({
    id, title: String(input.title || describe(c)).slice(0, 200), payer: (input.payer as string) || null, payee: String(input.payee),
    amount, network: NETWORK, deadline: deadline.toISOString(), condition: c.type === "github_pr_merged" ? { ...c, issue: Number(c.issue) } : c,
    status: "awaiting_funding", payer_confirmed: false, payee_confirmed: false,
    secret: JSON.stringify({ payer: h(payerToken), payee: h(payeeToken) }),
  });
  await db.event(id, "created", `${amount} USDC → ${deal.payee} when ${describe(deal.condition)}; deadline ${deal.deadline}`);
  return {
    deal_id: id, status: deal.status, network: NETWORK,
    fund: { send_usdc: amount, to: escrowAddress(), chain: NETWORK, then: `POST /api/deals/${id}/fund {"tx":"0x..."}` },
    payer_token: payerToken, payee_token: payeeToken,
    dashboard: `/deal/${id}`,
  };
}

export async function fundDeal(id: string, tx: string) {
  const d = await db.get(id); if (!d) throw new Error("deal not found");
  if (d.status !== "awaiting_funding") return { status: d.status };
  if (!/^0x[0-9a-fA-F]{64}$/.test(tx)) throw new Error("tx must be a transaction hash");
  if (await db.txUsed(tx)) throw new Error("tx already used for another deal");
  const v = await verifyFunding(tx as Hex, Number(d.amount));
  if (!v.ok) throw new Error(v.reason);
  if (d.payer && d.payer.toLowerCase() !== v.from!.toLowerCase()) throw new Error("funding tx not sent from the deal's payer");
  if (!(await db.transition(id, "awaiting_funding", "funded"))) return { status: (await db.get(id))?.status };
  await db.update(id, { fund_tx: tx, payer: d.payer || v.from! });
  await db.event(id, "funded", `${d.amount} USDC locked from ${v.from} tx ${tx}`);
  return { status: (await tick(id, "funding"))?.status };
}

export async function confirmDeal(id: string, token: string) {
  const d = await db.get(id); if (!d) throw new Error("deal not found");
  const s = JSON.parse(d.secret); const t = h(String(token || ""));
  const party = t === s.payer ? "payer" : t === s.payee ? "payee" : null;
  if (!party) throw new Error("invalid token");
  await db.update(id, party === "payer" ? { payer_confirmed: true } : { payee_confirmed: true });
  await db.event(id, "confirmed", `${party} confirmed`);
  return { status: (await tick(id, `${party} confirm`))?.status };
}
