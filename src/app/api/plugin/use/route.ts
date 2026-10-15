import { gate } from "@/lib/x402";
import { createDeal, fundDeal, confirmDeal } from "@/lib/deals";
import { db, publicDeal } from "@/lib/db";
import { tick } from "@/lib/engine";
export const maxDuration = 60;
export async function POST(req: Request) {
  const { tool_id, input = {} } = await req.clone().json().catch(() => ({}));
  try {
    switch (tool_id) {
      case "create_deal": { const g = await gate(req); if (g instanceof Response) return g; return Response.json({ status: "success", output: await createDeal(input) }); }
      case "fund_deal": return Response.json({ status: "success", output: await fundDeal(input.deal_id, input.tx) });
      case "confirm_deal": return Response.json({ status: "success", output: await confirmDeal(input.deal_id, input.token) });
      case "get_deal": { const d = await db.get(input.deal_id); if (!d) throw new Error("not found"); return Response.json({ status: "success", output: publicDeal(d) }); }
      case "check_deal": { const d = await tick(input.deal_id, "plugin"); if (!d) throw new Error("not found"); return Response.json({ status: "success", output: publicDeal(d) }); }
      default: return Response.json({ status: "error", message: "unknown tool_id" }, { status: 400 });
    }
  } catch (e) { return Response.json({ status: "error", message: (e as Error).message }, { status: 400 }); }
}
