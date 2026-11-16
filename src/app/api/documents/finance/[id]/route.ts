import { actor } from "@/server/auth";
import { collection } from "@/server/db";
import { buildFinancialPdf, invoicePrintSnapshot } from "@/server/financial-pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const person = await actor(request.headers);
    if (person.role === "operations") throw new Error("403: Financial documents are not available to Operations.");
    const { id } = await context.params;
    const document = await (await collection("financeDocuments")).findOne({ _id: id, org: person.org });
    if (!document) throw new Error("404: Document not found.");
    const booking = await (await collection("bookings")).findOne({ _id: document.bookingId, org: person.org });
    if (!booking || (person.role !== "owner" && booking.salesAssigneeId !== person.id))
      throw new Error("403: Document is not assigned to you.");
    const query = new URL(request.url).searchParams;
    let bytes = Buffer.from(document.bytes.buffer);
    if (document.kind === "Invoice" && document.layoutVersion !== 3 && query.get("original") !== "1") {
      const invoice = await (await collection("invoices")).findOne(
        { org: person.org, bookingId: booking._id, documentId: id, status: "Issued" },
        { projection: { snapshot: 1 } },
      );
      if (invoice?.snapshot?.template && invoice.snapshot.totals && Array.isArray(invoice.snapshot.lines)) {
        try { bytes = Buffer.from(await buildFinancialPdf(invoicePrintSnapshot(invoice.snapshot, booking.agreementSnapshot))); }
        catch { /* Keep the stored issued copy available if the historical snapshot cannot be re-rendered. */ }
      }
    }
    const disposition = document.kind === "Invoice" || document.kind === "Invoice print copy" || query.get("download") === "1" ? "attachment" : "inline";
    return new Response(bytes, {
      headers: {
        "Content-Type": document.mimeType || "application/pdf",
        "Content-Disposition": `${disposition}; filename="${String(document.number || document.kind).replace(/[^a-zA-Z0-9_-]/g, "-")}.pdf"`,
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
