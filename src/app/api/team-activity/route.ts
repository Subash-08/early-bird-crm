import { actor } from "@/server/auth";
import { teamActivity } from "@/server/team-activity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const headers = { "Cache-Control": "private, no-store" };
  try {
    const a = await actor(request.headers);
    const q = new URL(request.url).searchParams;
    return Response.json(await teamActivity(a, { from: q.get("from"), to: q.get("to"), staffId: q.get("staffId") }), { headers });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const status = Number(message.match(/^(401|403|404):/)?.[1] || 400);
    const safe = status !== 400 || /^(Choose |End date)/.test(message);
    return Response.json({ error: safe ? message.replace(/^\d{3}:\s*/, "") : "Could not load activity. Try again." }, { status: safe ? status : 503, headers });
  }
}
