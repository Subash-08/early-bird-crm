import { Binary, type ClientSession } from "mongodb";
import type { Actor } from "@/lib/domain";
import {
  calculateInvoice,
  defaultInvoiceTemplate,
  financialYear,
  invoiceDraftSchema,
  invoiceTemplateSchema,
  type InvoiceTemplate,
} from "@/lib/invoice-domain";
import { collection } from "./db";
import { audit, owner, transact } from "./crm";
import { buildFinancialPdf } from "./financial-pdf";

const now = () => new Date().toISOString();

function checkAsset(value: string, label: string) {
  if (!value) return;
  const raw = value.split(",")[1] || "";
  if (Buffer.from(raw, "base64").length > 500_000)
    throw new Error(`${label} must be 500 KB or smaller.`);
}

export async function getActiveInvoiceTemplate(
  a: Actor,
  session?: ClientSession,
): Promise<InvoiceTemplate & { _id: string; version: number; versionNumber: number; active: boolean }> {
  const saved = await (
    await collection("invoiceTemplates")
  ).findOne({ org: a.org, active: true }, { session });
  return saved
    ? { ...defaultInvoiceTemplate, ...saved, _id: String(saved._id), version: Number(saved.version || 1), versionNumber: Number(saved.versionNumber || 1), active: true } as InvoiceTemplate & { _id: string; version: number; versionNumber: number; active: boolean }
    : { ...defaultInvoiceTemplate, _id: "default", version: 0, versionNumber: 0, active: true };
}

export async function invoiceTemplateForSnapshot(a: Actor) {
  if (a.role !== "owner") return null;
  return getActiveInvoiceTemplate(a);
}

export async function saveInvoiceTemplate(a: Actor, input: unknown) {
  owner(a);
  const parsed = invoiceTemplateSchema.parse(input);
  checkAsset(parsed.logoDataUrl, "Logo");
  checkAsset(parsed.signatureDataUrl, "Signature");
  return transact(async (session) => {
    const previous = await (
      await collection("invoiceTemplates")
    ).findOne({ org: a.org, active: true }, { session });
    const versionNumber = Number(previous?.versionNumber || 0) + 1;
    const templateId = crypto.randomUUID();
    await (
      await collection("invoiceTemplates")
    ).updateMany(
      { org: a.org, active: true },
      { $set: { active: false, retiredAt: now(), updatedAt: now() } },
      { session },
    );
    await (
      await collection("invoiceTemplates")
    ).insertOne(
      {
        _id: templateId,
        org: a.org,
        version: 1,
        versionNumber,
        active: true,
        ...parsed,
        createdById: a.id,
        createdAt: now(),
        updatedAt: now(),
      },
      { session },
    );
    await audit(a, templateId, `Invoice template v${versionNumber} saved`, session);
    return templateId;
  });
}

export async function saveInvoiceDraft(a: Actor, input: unknown) {
  owner(a);
  const draft = invoiceDraftSchema.parse(input);
  return transact(async (session) => {
    const booking = await (
      await collection("bookings")
    ).findOne({ _id: draft.bookingId, org: a.org }, { session });
    if (!booking) throw new Error("404: Booking not found.");
    if (booking.financialClosed)
      throw new Error("Financial settlement is closed. Reopen it before editing the invoice.");
    const invoice = await (
      await collection("invoices")
    ).findOne({ _id: draft.invoiceId, bookingId: booking._id, org: a.org }, { session });
    if (!invoice) throw new Error("404: Invoice draft not found.");
    if (invoice.status !== "Draft") throw new Error("Only a draft invoice can be edited.");
    const template = (await getActiveInvoiceTemplate(a, session)) as InvoiceTemplate;
    const totals = calculateInvoice(
      draft.lines,
      draft.taxMode,
      draft.tcsRate,
      template.roundTaxToRupee,
    );
    if (totals.grandTotalMinor !== Number(booking.totalMinor))
      throw new Error(
        `Invoice total must match the accepted booking value. Current difference is ${Math.abs(totals.grandTotalMinor - Number(booking.totalMinor)) / 100}.`,
      );
    if (draft.taxMode !== "No GST" && !draft.placeOfSupply)
      throw new Error("Add the place of supply for a GST invoice.");
    const result = await (
      await collection("invoices")
    ).updateOne(
      { _id: invoice._id, version: draft.version, status: "Draft" },
      {
        $set: {
          taxMode: draft.taxMode,
          placeOfSupply: draft.placeOfSupply,
          buyerStateCode: draft.buyerStateCode,
          dueDate: draft.dueDate,
          tcsRate: draft.tcsRate,
          copyLabels: draft.copyLabels,
          lines: totals.lines,
          totals,
          totalMinor: totals.grandTotalMinor,
          updatedAt: now(),
        },
        $inc: { version: 1 },
      },
      { session },
    );
    if (!result.matchedCount)
      throw new Error("409: Invoice changed. Refresh before saving again.");
    await audit(a, booking._id, "Invoice draft and print-copy labels updated", session);
    return invoice._id;
  });
}

export async function nextInvoiceNumber(
  a: Actor,
  template: InvoiceTemplate,
  session: ClientSession,
) {
  const period = financialYear();
  const key = `invoice:${a.org}:${template.prefix}:${period}`;
  const counter = await (
    await collection("counters")
  ).findOneAndUpdate(
    { _id: key },
    { $setOnInsert: { org: a.org, version: 1 }, $inc: { value: 1 } },
    { upsert: true, returnDocument: "after", session },
  );
  return `${template.prefix}-${period}-${String(counter?.value || 1).padStart(template.sequenceDigits, "0")}`;
}

export async function createInvoicePrintCopies(a: Actor, input: unknown) {
  owner(a);
  const parsed = invoiceDraftSchema
    .pick({ invoiceId: true, copyLabels: true })
    .parse(input);
  const invoice = await (
    await collection("invoices")
  ).findOne({ _id: parsed.invoiceId, org: a.org, status: "Issued" });
  if (!invoice?.snapshot) throw new Error("404: Issued invoice snapshot not found.");
  if (
    !invoice.snapshot.template ||
    !invoice.snapshot.totals ||
    !(invoice.snapshot.lines || []).every((line: Record<string, unknown>) => line.kind && line.id)
  )
    throw new Error("This older invoice can only be printed from its original PDF. Renamed copies are available for invoices issued with the new template.");
  const bytes = await buildFinancialPdf({ ...invoice.snapshot, copyLabels: parsed.copyLabels });
  const documentId = crypto.randomUUID();
  await (
    await collection("financeDocuments")
  ).insertOne({
    _id: documentId,
    org: a.org,
    version: 1,
    bookingId: invoice.bookingId,
    invoiceId: invoice._id,
    kind: "Invoice print copy",
    number: invoice.invoiceNumber,
    copyLabels: parsed.copyLabels,
    mimeType: "application/pdf",
    bytes: new Binary(Buffer.from(bytes)),
    createdById: a.id,
    createdAt: now(),
  });
  await audit(
    a,
    invoice.bookingId,
    `Printable invoice copies created: ${parsed.copyLabels.join(", ")}`,
  );
  return { documentId };
}
