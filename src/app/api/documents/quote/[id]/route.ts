import { actor } from "@/server/auth";
import { collection } from "@/server/db";
import { brandedQuoteSnapshot, buildQuotePdf } from "@/server/quote-pdf";
import { quoteAccess } from "@/server/quotes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
  try {
    const user = await actor(request.headers);
    const { id } = await params;
    const quote = await quoteAccess(user, id);
    if (!quote.snapshot || !quote.pdfDocumentId || quote.pdfStatus !== "Ready")
      return Response.json({ error: "Quotation PDF not available." }, { status: 404, headers });
    const document = await (await collection("documents")).findOne({ _id: quote.pdfDocumentId, org: user.org, quoteId: quote._id });
    if (!document) return Response.json({ error: "Quotation PDF not available." }, { status: 404, headers });
    const bytes = document.layoutVersion === 2 && document.data
      ? new Uint8Array(document.data.buffer)
      : await buildQuotePdf(await brandedQuoteSnapshot(quote.snapshot, user.org));
    const filename = `${quote.quoteNumber}-v${quote.quoteVersion}.pdf`.replace(/[^A-Za-z0-9._-]/g, "-");
    return new Response(Buffer.from(bytes), { headers: { ...headers, "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${filename}"` } });
  } catch (error) {
    const status = error instanceof Error ? Number(error.message.match(/^(401|403|404):/)?.[1] || 500) : 500;
    return Response.json({ error: status === 500 ? "Could not generate the quotation. Try again." : "Quotation not available." }, { status, headers });
  }
}

