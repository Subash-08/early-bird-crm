import { actor } from "@/server/auth";
import { collection } from "@/server/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const person = await actor(request.headers);
    if (person.role === "operations") throw new Error("403: Payment evidence is private.");
    const { id } = await context.params;
    const evidence = await (await collection("paymentEvidence")).findOne({ _id: id, org: person.org });
    if (!evidence) throw new Error("404: Evidence not found.");
    const booking = await (await collection("bookings")).findOne({ _id: evidence.bookingId, org: person.org });
    if (!booking || (person.role !== "owner" && booking.salesAssigneeId !== person.id))
      throw new Error("403: Evidence is not assigned to you.");
    return new Response(evidence.bytes.buffer, {
      headers: {
        "Content-Type": evidence.mimeType,
        "Content-Disposition": `inline; filename="${String(evidence.name).replace(/["\\/\r\n]/g, "-")}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Request failed";
    const status = Number(message.match(/^(401|403|404):/)?.[1] || 400);
    return Response.json({ error: message }, { status });
  }
}
