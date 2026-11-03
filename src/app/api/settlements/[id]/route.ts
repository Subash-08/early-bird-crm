import { actor } from "@/server/auth";
import { settlementView } from "@/server/settlements";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    return Response.json(await settlementView(await actor(req.headers), (await ctx.params).id), { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unable to load settlement.";
    return Response.json({ error: message }, { status: Number(message.match(/^(401|403|404):/)?.[1] || 400) });
  }
}
