import { contract } from "@/lib/plugin";
export function GET(req: Request) { return Response.json(contract(new URL(req.url).origin)); }
