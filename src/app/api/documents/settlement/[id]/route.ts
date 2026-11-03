import { actor } from "@/server/auth";
import { collection } from "@/server/db";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const a = await actor(req.headers);
    if (a.role === "operations") throw new Error("403: Finance access required.");
    const e = await (await collection("settlementEntries")).findOne({ _id: (await ctx.params).id, org: a.org });
    if (!e?.evidenceBytes) throw new Error("404: Evidence not found.");
    const b = await (await collection("bookings")).findOne({ _id: e.bookingId, org: a.org });
    if (!b || (a.role !== "owner" && b.salesAssigneeId !== a.id)) throw new Error("403: Booking is not assigned to you.");
    return new Response(e.evidenceBytes.buffer, { headers: { "Content-Type": e.evidenceType, "Content-Disposition": `attachment; filename="${String(e.evidenceName).replace(/["\\/\r\n]/g, "-")}"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unable to open evidence.";
    return Response.json({ error: message }, { status: Number(message.match(/^(401|403|404):/)?.[1] || 400) });
  }
}
