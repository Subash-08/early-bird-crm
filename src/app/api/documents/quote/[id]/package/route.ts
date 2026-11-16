import { actor } from "@/server/auth";
import { quoteAccess } from "@/server/quotes";
import { brandedQuoteSnapshot, buildQuotePdf } from "@/server/quote-pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
  try {
    const user = await actor(request.headers);
    const { id } = await params;
    const quote = await quoteAccess(user, id);
    if (!quote.snapshot || !quote.pdfDocumentId || quote.pdfStatus !== "Ready")
      return Response.json({ error: "The approved quotation PDF must be ready first." }, { status: 404, headers });
    const bytes = await buildQuotePdf(await brandedQuoteSnapshot(quote.snapshot, user.org), "package");
    const filename = String(`${quote.quoteNumber}-v${quote.quoteVersion}-package.pdf`).replace(/[^A-Za-z0-9._-]/g, "-");
    return new Response(Buffer.from(bytes), { headers: { ...headers, "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${filename}"` } });
  } catch (error) {
    const status = error instanceof Error ? Number(error.message.match(/^(401|403|404):/)?.[1] || 500) : 500;
    return Response.json({ error: status === 500 ? "Could not generate the package. Try again." : "Package not available." }, { status, headers });
  }
}
