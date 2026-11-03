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
    const operationsRequest = await (
      await collection("operationsRequests")
    ).findOne({ _id: id, org: person.org });
    if (!operationsRequest) throw new Error("404: Request not found.");
    if (!operationsRequest.evidenceBytes)
      throw new Error("404: This request has no evidence attachment.");

    const booking = await (
      await collection("bookings")
    ).findOne({ _id: operationsRequest.bookingId, org: person.org });
    const canOpen =
      person.role === "owner" ||
      (person.role === "sales" && booking?.salesAssigneeId === person.id) ||
      (person.role === "operations" &&
        operationsRequest.submittedById === person.id);
    if (!booking || !canOpen)
      throw new Error("403: Evidence is not assigned to you.");

    return new Response(operationsRequest.evidenceBytes.buffer, {
      headers: {
        "Content-Type": operationsRequest.evidenceType,
        "Content-Disposition": `inline; filename="${String(operationsRequest.evidenceName).replace(/["\\/\r\n]/g, "-")}"`,
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
