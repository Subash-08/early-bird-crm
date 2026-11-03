import { actor, activate, limit, requestAccess } from "@/server/auth";
import {
  snapshot,
  saveCustomer,
  saveEnquiry,
  saveTask,
  staffAction,
  acknowledge,
  settings,
  searchCustomers,
} from "@/server/crm";
import { readUpload, preview, commit } from "@/server/imports";
import { collection } from "@/server/db";
import { submitSettlement, decideSettlement, submitBookingChange, decideBookingChange, confirmBookingChange, closeSettlement } from "@/server/settlements";
import {
  requestQuote,
  saveQuote,
  returnQuote,
  resubmitQuote,
  approveQuote,
  reviseQuote,
  retryQuotePdf,
  shareQuote,
  decideQuote,
  saveTemplate,
  applyTemplate,
} from "@/server/quotes";
import {
  amendAdvance,
  convertAcceptedQuote,
  decidePayment,
  issueInvoice,
  releaseOperations,
  reversePayment,
  saveBookingDetails,
  submitPayment,
  voidInvoice,
} from "@/server/bookings";
import {
  completeTrip,
  decideOperationsRequest,
  decideCashHandover,
  generateOperationsDocument,
  initializeOperations,
  recordCashHandover,
  reportCollection,
  reportIncident,
  resolveIncident,
  saveArrangement,
  saveSupplier,
  saveTripSegment,
  saveTravelDocument,
  saveVehicle,
  submitOperationsRequest,
  updateReadiness,
  updateTripProgress,
} from "@/server/operations";
import { createInvoicePrintCopies, saveInvoiceDraft, saveInvoiceTemplate } from "@/server/invoices";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
function failure(e: unknown) {
  const message = e instanceof Error ? e.message : "Request failed";
  const status = Number(message.match(/^(401|403|404|409|429):/)?.[1] || 400);
  if (message.includes("E11000"))
    return Response.json(
      { error: "Duplicate record. Refresh and review existing data." },
      { status: 409 },
    );
  if (
    message.includes("ECONN") ||
    message.includes("Server selection") ||
    message.includes("server selection") ||
    message.includes("ETIMEDOUT") ||
    message.includes("querySrv") ||
    message.includes("authentication failed")
  )
    return Response.json(
      { error: "Database unavailable. Check your server configuration." },
      { status: 503 },
    );
  return Response.json({ error: message }, { status });
}
export async function GET(req: Request) {
  try {
    const a = await actor(req.headers);
    const url = new URL(req.url);
    if (url.searchParams.get("resource") === "customer-search") {
      return Response.json(
        {
          results: await searchCustomers(a, {
            query: url.searchParams.get("q") || "",
            limit: Number(url.searchParams.get("limit") || 20),
          }),
        },
        { headers: { "Cache-Control": "private, no-store" } },
      );
    }
    return Response.json(await snapshot(a), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(req: Request) {
  try {
    if (
      req.headers.get("origin") !==
      new URL(process.env.BETTER_AUTH_URL || req.url).origin
    )
      throw new Error("403: Invalid request origin.");
    if (Number(req.headers.get("content-length") || 0) > 3 * 1024 * 1024)
      throw new Error("File/request too large.");
    if (req.headers.get("content-type")?.includes("multipart/form-data")) {
      const a = await actor(req.headers);
      const f = (await req.formData()).get("file");
      if (!(f instanceof File)) throw new Error("Choose a file.");
      return Response.json(await readUpload(a, f));
    }
    const body = await req.json();
    if (body.action === "activate") {
      await limit("activate:" + String(body.token).slice(0, 12));
      await activate(String(body.token), String(body.password));
      return Response.json({ ok: true });
    }
    if (body.action === "request-access") {
      const requestKey =
        req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
        req.headers.get("x-real-ip") ||
        "local";
      return Response.json(await requestAccess(body.data, requestKey));
    }
    const a = await actor(req.headers);
    let result: unknown;
    switch (body.action) {
      case "settlement-submit": result = await submitSettlement(a, body.data); break;
      case "settlement-decide": result = await decideSettlement(a, body.data); break;
      case "change-submit": result = await submitBookingChange(a, body.data); break;
      case "change-decide": result = await decideBookingChange(a, body.data); break;
      case "change-confirm": result = await confirmBookingChange(a, body.data); break;
      case "settlement-close": result = await closeSettlement(a, body.data); break;
      case "customer":
        result = await saveCustomer(a, body.data, body.id, body.version);
        break;
      case "enquiry":
        result = await saveEnquiry(a, body.data, body.id, body.version);
        break;
      case "task":
        result = await saveTask(a, body.data, body.id, body.version);
        break;
      case "acknowledge":
        result = await acknowledge(a, String(body.id), Number(body.version));
        break;
      case "staff":
        result = await staffAction(a, body.data);
        break;
      case "settings":
        await settings(a, body.data);
        break;
      case "preview":
        result = await preview(a, body.data);
        break;
      case "commit":
        result = await commit(a, body.data);
        break;
      case "quote-request":
        result = await requestQuote(a, body.data);
        break;
      case "quote-save":
        result = await saveQuote(
          a,
          body.data,
          String(body.id),
          Number(body.version),
        );
        break;
      case "quote-return":
        result = await returnQuote(a, body.data);
        break;
      case "quote-resubmit":
        result = await resubmitQuote(a, body.data);
        break;
      case "quote-approve":
        result = await approveQuote(a, body.data);
        break;
      case "quote-revise":
        result = await reviseQuote(a, body.data);
        break;
      case "quote-pdf-retry":
        result = await retryQuotePdf(a, body.data);
        break;
      case "quote-share":
        result = await shareQuote(a, body.data);
        break;
      case "quote-decision":
        result = await decideQuote(a, body.data);
        break;
      case "quote-template":
        result = await saveTemplate(a, body.data);
        break;
      case "quote-template-apply":
        result = await applyTemplate(a, body.data);
        break;
      case "booking-create":
        result = await convertAcceptedQuote(a, body.data);
        break;
      case "booking-save":
        result = await saveBookingDetails(a, body.data);
        break;
      case "invoice-issue":
        result = await issueInvoice(a, body.data);
        break;
      case "invoice-draft-save":
        result = await saveInvoiceDraft(a, body.data);
        break;
      case "invoice-template-save":
        result = await saveInvoiceTemplate(a, body.data);
        break;
      case "invoice-print-copies":
        result = await createInvoicePrintCopies(a, body.data);
        break;
      case "invoice-void":
        result = await voidInvoice(a, body.data);
        break;
      case "payment-submit":
        result = await submitPayment(a, body.data);
        break;
      case "payment-decision":
        result = await decidePayment(a, body.data);
        break;
      case "payment-reverse":
        result = await reversePayment(a, body.data);
        break;
      case "booking-release":
        result = await releaseOperations(a, body.data);
        break;
      case "booking-advance-amend":
        result = await amendAdvance(a, body.data);
        break;
      case "operations-initialize":
        result = await initializeOperations(a, body.data);
        break;
      case "supplier-save":
        result = await saveSupplier(a, body.data);
        break;
      case "vehicle-save":
        result = await saveVehicle(a, body.data);
        break;
      case "arrangement-save":
        result = await saveArrangement(a, body.data);
        break;
      case "trip-save":
        result = await saveTripSegment(a, body.data);
        break;
      case "trip-progress":
        result = await updateTripProgress(a, body.data);
        break;
      case "readiness-update":
        result = await updateReadiness(a, body.data);
        break;
      case "incident-report":
        result = await reportIncident(a, body.data);
        break;
      case "incident-resolve":
        result = await resolveIncident(a, body.data);
        break;
      case "operations-request":
        result = await submitOperationsRequest(a, body.data);
        break;
      case "operations-request-decision":
        result = await decideOperationsRequest(a, body.data);
        break;
      case "collection-report":
        result = await reportCollection(a, body.data);
        break;
      case "cash-handover":
        result = await recordCashHandover(a, body.data);
        break;
      case "cash-handover-decision":
        result = await decideCashHandover(a, body.data);
        break;
      case "operations-document":
        result = await generateOperationsDocument(a, body.data);
        break;
      case "travel-document-save":
        result = await saveTravelDocument(a, body.data);
        break;
      case "trip-complete":
        result = await completeTrip(a, body.data);
        break;
      case "read":
        await (
          await collection("notifications")
        ).updateOne(
          { _id: String(body.id), org: a.org, recipient: a.id },
          { $set: { read: true } },
        );
        break;
      default:
        throw new Error("Unknown action.");
    }
    return Response.json({ ok: true, result });
  } catch (e) {
    return failure(e);
  }
}
