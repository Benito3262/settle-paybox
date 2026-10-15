import { db, type Deal } from "./db";
import { evaluate } from "./conditions";
import { payout } from "./chain";

export const FEE_BPS = 50; // 0.5%

/** Run one tick for a deal: release if condition met, refund if past deadline. Idempotent via status guard. */
export async function tick(id: string, source = "check"): Promise<Deal | null> {
  const d = await db.get(id);
  if (!d || d.status !== "funded") return d;
  const res = await evaluate(d);
  if (res.met) {
    await db.update(id, { status: "releasing" });
    await db.event(id, "condition_met", `${res.detail} (via ${source})`);
    try {
      const fee = Math.floor(d.amount * FEE_BPS) / 10000;
      const tx = await payout(d.payee, +(d.amount - fee).toFixed(6));
      let feeTx: string | null = null;
      if (process.env.FEE_WALLET && fee > 0) feeTx = await payout(process.env.FEE_WALLET, fee).catch(() => null);
      await db.update(id, { status: "released", release_tx: tx, fee_tx: feeTx });
      await db.event(id, "released", `${(d.amount - fee).toFixed(2)} USDC → ${d.payee} (fee ${fee.toFixed(4)}) tx ${tx}`);
    } catch (e) {
      await db.update(id, { status: "funded" });
      await db.event(id, "error", `release failed: ${(e as Error).message.slice(0, 200)}`);
    }
  } else if (Date.now() > Date.parse(d.deadline)) {
    if (!d.payer) { await db.event(id, "error", "deadline passed but payer unknown"); return db.get(id); }
    await db.update(id, { status: "refunding" });
    await db.event(id, "deadline_passed", res.detail);
    try {
      const tx = await payout(d.payer, d.amount);
      await db.update(id, { status: "refunded", refund_tx: tx });
      await db.event(id, "refunded", `${d.amount} USDC → ${d.payer} tx ${tx}`);
    } catch (e) {
      await db.update(id, { status: "funded" });
      await db.event(id, "error", `refund failed: ${(e as Error).message.slice(0, 200)}`);
    }
  }
  return db.get(id);
}

export async function expireUnfunded(d: Deal) {
  if (d.status === "awaiting_funding" && Date.now() > Date.parse(d.deadline)) {
    await db.update(d.id, { status: "expired" });
    await db.event(d.id, "expired", "never funded before deadline");
  }
}
