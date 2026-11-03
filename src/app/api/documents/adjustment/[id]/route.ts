import { actor } from "@/server/auth";
import { collection } from "@/server/db";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const esc = (v: unknown) => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const a = await actor(req.headers);
    if (a.role === "operations") throw new Error("403: Finance access required.");
    const c = await (await collection("bookingChanges")).findOne({ _id: (await ctx.params).id, org: a.org, status: "Applied" });
    if (!c) throw new Error("404: Applied adjustment not found.");
    const b = await (await collection("bookings")).findOne({ _id: c.bookingId, org: a.org });
    if (!b || (a.role !== "owner" && b.salesAssigneeId !== a.id)) throw new Error("403: Booking is not assigned to you.");
    const money = (v: number) => esc(new Intl.NumberFormat("en-IN", { style: "currency", currency: b.currency }).format(v / 100));
    const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Booking adjustment ${esc(b.bookingNumber)}</title><style>body{font:16px system-ui;color:#173047;max-width:760px;margin:40px auto;padding:24px}header{border-bottom:3px solid #1677a7;padding-bottom:24px}dt{color:#596773;margin-top:20px}dd{margin:8px 0;font-weight:600;white-space:pre-wrap}footer{margin-top:36px;font-size:13px;color:#596773}@media print{body{margin:0}}</style><header><p>EARLYBIRD</p><h1>Booking adjustment</h1><p>${esc(b.bookingNumber)} · ${esc(c.kind)}</p><small>Record ${esc(c._id)}</small></header><dl><dt>Customer-agreed change</dt><dd>${esc(c.description)}</dd><dt>Effective date</dt><dd>${esc(c.effectiveDate)}</dd><dt>Previous agreed total</dt><dd>${money(c.previousTotalMinor)}</dd><dt>Revised agreed total</dt><dd>${money(c.newTotalMinor)}</dd><dt>Difference</dt><dd>${money(c.newTotalMinor - c.previousTotalMinor)}</dd><dt>Customer confirmation</dt><dd>${esc(c.customerReference)} · ${esc(c.customerConfirmedAt)}</dd></dl><footer>This adjustment records the approved customer agreement change. Original invoices remain in the booking history. Refund payments are recorded separately. Use your browser Print command to save a PDF.</footer></html>`;
    return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, no-store", "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'", "X-Content-Type-Options": "nosniff" } });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unable to open adjustment.";
    return Response.json({ error: message }, { status: Number(message.match(/^(401|403|404):/)?.[1] || 400) });
  }
}
