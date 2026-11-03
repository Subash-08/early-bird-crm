import { actor } from "@/server/auth";
import { collection } from "@/server/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const person = await actor(request.headers);
    const { id } = await context.params;
    const document = await (
      await collection("operationsDocuments")
    ).findOne({ _id: id, org: person.org });
    if (!document) throw new Error("404: Document not found.");
    const booking = await (
      await collection("bookings")
    ).findOne({ _id: document.bookingId, org: person.org });
    if (!booking) throw new Error("404: Booking not found.");
    const allowed =
      person.role === "owner" ||
      (person.role === "sales" && booking.salesAssigneeId === person.id) ||
      (person.role === "operations" &&
        document.kind === "Driver trip sheet" &&
        document.driverId === person.id &&
        booking.operationsAssigneeIds?.includes(person.id));
    if (!allowed) throw new Error("403: Document is not assigned to you.");
    return new Response(document.bytes.buffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${String(
          `${booking.bookingNumber}-${document.kind}`,
        ).replace(/[^a-zA-Z0-9_-]/g, "-")}.pdf"`,
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
