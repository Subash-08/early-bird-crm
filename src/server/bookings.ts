import { Binary, type ClientSession } from "mongodb";
import { z } from "zod";
import type { Actor } from "@/lib/domain";
import { canAccess } from "@/lib/domain";
import {
  bookingDetailsSchema,
  paymentSubmissionSchema,
  paymentTotals,
  publicBookingForRole,
  releaseSchema,
} from "@/lib/booking-domain";
import { minor } from "@/lib/quote-domain";
import { effectiveEntries } from "@/lib/settlement-domain";
import { calculateInvoice, defaultInvoiceTemplate } from "@/lib/invoice-domain";
import { collection, type Row } from "./db";
import { audit, notify, owner, transact } from "./crm";
import { buildFinancialPdf } from "./financial-pdf";
import { getActiveInvoiceTemplate, nextInvoiceNumber } from "./invoices";

const now = () => new Date().toISOString();
const id = () => crypto.randomUUID();

async function nextNumber(prefix: string, a: Actor, s: ClientSession) {
  const year = new Date().getFullYear();
  const counter = await (
    await collection("counters")
  ).findOneAndUpdate(
    { _id: `${prefix}:${a.org}:${year}` },
    { $setOnInsert: { org: a.org, version: 1 }, $inc: { value: 1 } },
    { upsert: true, returnDocument: "after", session: s },
  );
  return `EB-${prefix.toUpperCase()}-${year}-${String(counter?.value || 1).padStart(4, "0")}`;
}

async function bookingAccess(a: Actor, bookingId: string, s?: ClientSession) {
  const booking = await (
    await collection("bookings")
  ).findOne({ _id: bookingId, org: a.org }, { session: s });
  if (!booking) throw new Error("404: Booking not found.");
  const allowed =
    a.role === "owner" ||
    (a.role === "sales" && booking.salesAssigneeId === a.id) ||
    (a.role === "operations" &&
      booking.operationsReleased &&
      booking.operationsAssigneeIds?.includes(a.id));
  if (!allowed) throw new Error("403: Booking is not assigned to you.");
  if (s && booking.financialClosed) throw new Error("Financial settlement is closed. Ask the Owner to reopen it first.");
  if (s) await (await collection("bookings")).updateOne({ _id: booking._id, org: a.org }, { $inc: { financialRevision: 1 } }, { session: s });
  return booking;
}

async function upsertTask(
  a: Actor,
  key: string,
  title: string,
  assigneeId: string,
  dueAt: string,
  bookingId: string,
  s: ClientSession,
  status = "To do",
) {
  await (
    await collection("tasks")
  ).updateOne(
    { _id: key },
    {
      $set: {
        org: a.org,
        title,
        assigneeId,
        dueAt,
        bookingId,
        status,
        updatedAt: now(),
      },
      $setOnInsert: { createdAt: now() },
      $inc: { version: 1 },
    },
    { upsert: true, session: s },
  );
}

function acceptedOption(quote: Row) {
  const option = quote.acceptedSnapshot?.content?.options?.find(
    (candidate: Row) => candidate.id === quote.selectedOptionId,
  );
  if (!option) throw new Error("Accepted quotation option is missing.");
  return option;
}

export async function convertAcceptedQuote(a: Actor, input: unknown) {
  if (a.role === "operations") throw new Error("403: Not permitted.");
  const p = z
    .object({ quoteId: z.string().min(1) })
    .strict()
    .parse(input);
  return transact(async (s) => {
    const quote = await (
      await collection("quotes")
    ).findOne({ _id: p.quoteId, org: a.org }, { session: s });
    if (!quote || quote.status !== "Accepted")
      throw new Error("Only an accepted quotation can become a booking.");
    if (!canAccess(a, quote.assigneeId))
      throw new Error("403: Quotation is not assigned to you.");
    const existing = await (
      await collection("bookings")
    ).findOne({ org: a.org, quoteId: quote._id }, { session: s });
    if (existing) return existing._id;
    const customer = await (
      await collection("customers")
    ).findOne({ _id: quote.customerId, org: a.org }, { session: s });
    if (!customer) throw new Error("Customer record is missing.");
    const selected = acceptedOption(quote);
    const bookingId = id();
    const bookingNumber = await nextNumber("BK", a, s);
    const totalMinor = Number(selected.totalMinor || 0);
    const requiredAdvanceMinor = Number(
      quote.acceptedSnapshot.content.advanceAmountMinor || 0,
    );
    const agreementSnapshot = {
      quoteNumber: quote.quoteNumber,
      quoteVersion: quote.quoteVersion,
      approvedAt: quote.acceptedSnapshot.approvedAt,
      acceptedAt: quote.decisionAt,
      selectedOptionId: quote.selectedOptionId,
      selectedOption: structuredClone(selected),
      content: structuredClone(quote.acceptedSnapshot.content),
    };
    const travellerId = id();
    await (
      await collection("bookings")
    ).insertOne(
      {
        _id: bookingId,
        org: a.org,
        version: 1,
        bookingNumber,
        quoteId: quote._id,
        quoteGroupId: quote.groupId,
        quoteVersion: quote.quoteVersion,
        enquiryId: quote.enquiryId,
        customerId: quote.customerId,
        salesAssigneeId: quote.assigneeId,
        ownerId: quote.approvedById,
        status: "Awaiting advance",
        currency: quote.acceptedSnapshot.content.currency,
        totalMinor,
        requiredAdvanceMinor,
        verifiedPaidMinor: 0,
        outstandingMinor: totalMinor,
        unappliedCreditMinor: 0,
        paymentStatus: "Unpaid",
        advanceDueAt: "",
        balanceDueAt: "",
        serviceStart: quote.acceptedSnapshot.content.startDate || "",
        serviceEnd: quote.acceptedSnapshot.content.endDate || "",
        destination: quote.acceptedSnapshot.content.destinations,
        payer: {
          name: customer.name,
          phone: customer.phone || "",
          email: customer.email || "",
          billingAddress: customer.address || "",
          deliveryAddress: customer.address || "",
          taxId: "",
          placeOfSupply: "",
          stateCode: "",
        },
        travellers: [
          {
            id: travellerId,
            name: customer.name,
            type: "Adult",
            lead: true,
            dateOfBirth: "",
            nationality: "",
            phone: customer.phone || "",
            notes: "",
          },
        ],
        expectedTravellers: {
          adults: quote.acceptedSnapshot.content.adults,
          childrenAges: quote.acceptedSnapshot.content.childrenAges,
          infants: quote.acceptedSnapshot.content.infants,
        },
        coordinatorNotes: "",
        paymentNote: "",
        agreementSnapshot,
        operationsReleased: false,
        operationsAssigneeIds: [],
        operationsChecklist: [],
        advanceAmendments: [],
        financialException: false,
        createdAt: now(),
        updatedAt: now(),
      },
      { session: s },
    );
    await (
      await collection("invoices")
    ).insertOne(
      {
        _id: `invoice:${bookingId}:1`,
        org: a.org,
        version: 1,
        bookingId,
        status: "Draft",
        invoiceVersion: 1,
        currency: quote.acceptedSnapshot.content.currency,
        lines: [
          {
            id: id(),
            kind: "Charge",
            hsnCode: "998552",
            description: `${selected.name} - ${quote.acceptedSnapshot.content.title}`,
            quantity: 1,
            unitPrice: totalMinor / 100,
            unitPriceMinor: totalMinor,
            taxableMinor: totalMinor,
            gstRate: 0,
            gstMinor: 0,
          },
        ],
        taxMode: "No GST",
        placeOfSupply: "",
        buyerStateCode: "",
        dueDate: "",
        tcsRate: 0,
        copyLabels: defaultInvoiceTemplate.copyLabels,
        totals: {
          taxableMinor: totalMinor,
          cgstMinor: 0,
          sgstMinor: 0,
          igstMinor: 0,
          totalGstMinor: 0,
          tcsMinor: 0,
          grandTotalMinor: totalMinor,
        },
        totalMinor,
        createdAt: now(),
        updatedAt: now(),
      },
      { session: s },
    );
    const owners = await (
      await collection("staff")
    )
      .find({ org: a.org, role: "owner", status: "active" }, { session: s })
      .toArray();
    for (const person of owners) {
      await upsertTask(
        a,
        `booking:review:${bookingId}:${person._id}`,
        "Review new booking and issue invoice",
        person._id,
        new Date(Date.now() + 24 * 3600000).toISOString(),
        bookingId,
        s,
      );
      await notify(
        a,
        person._id,
        `booking:new:${bookingId}:${person._id}`,
        "Accepted quote is ready for booking review",
        bookingId,
        s,
      );
    }
    await audit(
      a,
      bookingId,
      `Booking ${bookingNumber} created from accepted ${quote.quoteNumber} v${quote.quoteVersion}`,
      s,
    );
    return bookingId;
  });
}

export async function saveBookingDetails(a: Actor, input: unknown) {
  if (a.role === "operations") throw new Error("403: Not permitted.");
  const raw = z
    .object({
      bookingId: z.string(),
      version: z.number(),
      details: z.unknown(),
    })
    .strict()
    .parse(input);
  const details = bookingDetailsSchema.parse(raw.details);
  return transact(async (s) => {
    const booking = await bookingAccess(a, raw.bookingId, s);
    const result = await (
      await collection("bookings")
    ).updateOne(
      { _id: booking._id, version: raw.version },
      {
        $set: {
          payer: {
            name: details.payerName,
            phone: details.payerPhone,
            email: details.payerEmail,
            billingAddress: details.billingAddress,
            deliveryAddress: details.deliveryAddress,
            taxId: details.taxId,
            placeOfSupply: details.placeOfSupply,
            stateCode: details.buyerStateCode,
          },
          travellers: details.travellers,
          advanceDueAt: details.advanceDueAt,
          balanceDueAt: details.balanceDueAt,
          coordinatorNotes: details.coordinatorNotes,
          paymentNote: details.paymentNote,
          updatedAt: now(),
        },
        $inc: { version: 1 },
      },
      { session: s },
    );
    if (!result.matchedCount)
      throw new Error("409: Booking changed. Refresh before saving.");
    await audit(
      a,
      booking._id,
      "Booking payer, travellers and deadlines updated",
      s,
    );
    return booking._id;
  });
}

export async function issueInvoice(a: Actor, input: unknown) {
  owner(a);
  const p = z
    .object({ bookingId: z.string(), bookingVersion: z.number() })
    .strict()
    .parse(input);
  const prepared = await transact(async (s) => {
    const booking = await bookingAccess(a, p.bookingId, s);
    if (!booking.payer?.name)
      throw new Error("Add billing details before issuing the invoice.");
    const invoice = await (
      await collection("invoices")
    ).findOne(
      { bookingId: booking._id, org: a.org, status: "Draft" },
      { session: s },
    );
    if (!invoice) {
      const current = await (
        await collection("invoices")
      ).findOne(
        { bookingId: booking._id, org: a.org, status: "Issued" },
        { session: s },
      );
      if (current) return { existing: current._id };
      throw new Error("Invoice draft is missing.");
    }
    const template = await getActiveInvoiceTemplate(a, s);
    const legacyLines = (invoice.lines || []).map((line: Row) =>
      line.kind
        ? line
        : {
            id: id(),
            kind: "Charge",
            hsnCode: "998552",
            description: line.description || "Travel services",
            quantity: 1,
            unitPrice: Number(line.totalMinor || booking.totalMinor) / 100,
            gstRate: 0,
          },
    );
    const totals = calculateInvoice(
      legacyLines,
      invoice.taxMode || "No GST",
      Number(invoice.tcsRate || 0),
      template.roundTaxToRupee,
    );
    if (totals.grandTotalMinor !== Number(booking.totalMinor))
      throw new Error("Invoice total must match the accepted booking value before issue.");
    if ((invoice.taxMode || "No GST") !== "No GST" && !(invoice.placeOfSupply || booking.payer?.placeOfSupply))
      throw new Error("Add the place of supply before issuing a GST invoice.");
    if (
      (invoice.taxMode || "No GST") !== "No GST" &&
      (!/^\d{2}[A-Z0-9]{13}$/i.test(template.gstin) || !template.stateName || !/^\d{2}$/.test(template.stateCode))
    )
      throw new Error("Add a valid 15-character seller GSTIN, state and two-digit state code in Invoice template before issuing a GST invoice.");
    const invoiceNumber = await nextInvoiceNumber(a, template, s);
    const snapshot = {
      kind: "Invoice",
      number: invoiceNumber,
      status: "Issued",
      bookingNumber: booking.bookingNumber,
      payer: booking.payer,
      lines: totals.lines,
      totals,
      totalMinor: totals.grandTotalMinor,
      requiredAdvanceMinor: booking.requiredAdvanceMinor,
      advanceDueAt: booking.advanceDueAt,
      verifiedPaidMinor: booking.verifiedPaidMinor,
      outstandingMinor: booking.outstandingMinor,
      currency: booking.currency,
      balanceTerms: booking.agreementSnapshot.content.balanceTerms,
      paymentNote: booking.paymentNote || "",
      dueDate: invoice.dueDate || booking.balanceDueAt || "",
      taxMode: invoice.taxMode || "No GST",
      tcsRate: Number(invoice.tcsRate || 0),
      placeOfSupply: invoice.placeOfSupply || booking.payer?.placeOfSupply || "",
      buyerStateCode: invoice.buyerStateCode || booking.payer?.stateCode || "",
      template: structuredClone(template),
      templateId: template._id,
      templateVersion: template.versionNumber || 0,
      copyLabels: invoice.copyLabels || template.copyLabels,
      travelSummary: template.includeTravelSummary
        ? {
            destination: booking.destination,
            serviceStart: booking.serviceStart,
            serviceEnd: booking.serviceEnd,
            travellers: (booking.travellers || []).map((person: Row) => ({ name: person.name, type: person.type, lead: person.lead })),
            selectedOptionName: booking.agreementSnapshot?.selectedOption?.name || "Approved package",
            services: Array.isArray(booking.agreementSnapshot?.content?.services) ? booking.agreementSnapshot.content.services.map(String) : [],
            inclusions: Array.isArray(booking.agreementSnapshot?.content?.inclusions) ? booking.agreementSnapshot.content.inclusions.map(String) : [],
            exclusions: Array.isArray(booking.agreementSnapshot?.content?.exclusions) ? booking.agreementSnapshot.content.exclusions.map(String) : [],
          }
        : null,
      issuedAt: now(),
    };
    const documentId = id();
    const bytes = await buildFinancialPdf(snapshot);
    await (
      await collection("financeDocuments")
    ).insertOne(
      {
        _id: documentId,
        org: a.org,
        version: 1,
        bookingId: booking._id,
        kind: "Invoice",
        number: invoiceNumber,
        mimeType: "application/pdf",
        bytes: new Binary(Buffer.from(bytes)),
        createdAt: now(),
      },
      { session: s },
    );
    await (
      await collection("invoices")
    ).updateOne(
      { _id: invoice._id, version: invoice.version, status: "Draft" },
      {
        $set: {
          status: "Issued",
          invoiceNumber,
          issuedAt: now(),
          issuedById: a.id,
          snapshot,
          lines: totals.lines,
          totals,
          totalMinor: totals.grandTotalMinor,
          templateId: template._id,
          templateVersion: template.versionNumber || 0,
          documentId,
          updatedAt: now(),
        },
        $inc: { version: 1 },
      },
      { session: s },
    );
    const bookingUpdate = await (
      await collection("bookings")
    ).updateOne(
      { _id: booking._id, version: p.bookingVersion },
      {
        $set: {
          invoiceStatus: "Issued",
          invoiceId: invoice._id,
          updatedAt: now(),
        },
        $inc: { version: 1 },
      },
      { session: s },
    );
    if (!bookingUpdate.matchedCount)
      throw new Error(
        "409: Booking changed. Refresh before issuing the invoice.",
      );
    await audit(a, booking._id, `Invoice ${invoiceNumber} issued`, s);
    await notify(
      a,
      booking.salesAssigneeId,
      `invoice:issued:${invoice._id}`,
      "Booking invoice is ready",
      booking._id,
      s,
    );
    return { invoiceId: invoice._id, documentId };
  });
  return prepared;
}

export async function submitPayment(a: Actor, input: unknown) {
  if (a.role === "operations") throw new Error("403: Not permitted.");
  const p = paymentSubmissionSchema.parse(input);
  return transact(async (s) => {
    const booking = await bookingAccess(a, p.bookingId, s);
    const evidence = p.evidenceBase64
      ? Buffer.from(p.evidenceBase64, "base64")
      : null;
    if (evidence && evidence.length > 1_500_000)
      throw new Error("Evidence file must be 1.5 MB or smaller.");
    if (
      evidence &&
      !["image/jpeg", "image/png", "application/pdf"].includes(p.evidenceType)
    )
      throw new Error("Evidence must be a JPG, PNG or PDF file.");
    if (p.reference) {
      const duplicate = await (
        await collection("payments")
      ).findOne(
        {
          org: a.org,
          referenceKey: p.reference.toLowerCase(),
          status: { $ne: "Rejected" },
        },
        { session: s },
      );
      if (duplicate)
        throw new Error(
          "409: This transaction reference is already recorded. Review the existing payment.",
        );
    }
    const paymentId = id();
    let evidenceId = "";
    if (evidence) {
      evidenceId = id();
      await (
        await collection("paymentEvidence")
      ).insertOne(
        {
          _id: evidenceId,
          org: a.org,
          version: 1,
          bookingId: booking._id,
          paymentId,
          submittedById: a.id,
          name: p.evidenceName,
          mimeType: p.evidenceType,
          bytes: new Binary(evidence),
          createdAt: now(),
        },
        { session: s },
      );
    }
    await (
      await collection("payments")
    ).insertOne(
      {
        _id: paymentId,
        org: a.org,
        version: 1,
        bookingId: booking._id,
        invoiceId: booking.invoiceId || "",
        amountMinor: p.amountMinor,
        currency: p.currency,
        receivedAt: p.receivedAt,
        method: p.method,
        reference: p.reference,
        ...(p.reference ? { referenceKey: p.reference.toLowerCase() } : {}),
        payerName: p.payerName,
        note: p.note,
        evidenceId,
        evidenceName: p.evidenceName,
        status: "Pending verification",
        submittedById: a.id,
        submittedByName: a.name,
        createdAt: now(),
        updatedAt: now(),
      },
      { session: s },
    );
    const owners = await (
      await collection("staff")
    )
      .find({ org: a.org, role: "owner", status: "active" }, { session: s })
      .toArray();
    for (const person of owners) {
      await upsertTask(
        a,
        `payment:verify:${paymentId}:${person._id}`,
        `Verify payment for ${booking.bookingNumber}`,
        person._id,
        new Date(Date.now() + 4 * 3600000).toISOString(),
        booking._id,
        s,
      );
      await notify(
        a,
        person._id,
        `payment:new:${paymentId}:${person._id}`,
        "Payment evidence needs verification",
        booking._id,
        s,
      );
    }
    await (
      await collection("bookings")
    ).updateOne(
      { _id: booking._id },
      {
        $set: { paymentStatus: "Pending verification", updatedAt: now() },
        $inc: { version: 1 },
      },
      { session: s },
    );
    await audit(
      a,
      booking._id,
      `Payment submitted for verification (${p.currency} ${(p.amountMinor / 100).toFixed(2)})`,
      s,
    );
    return paymentId;
  });
}

export async function decidePayment(a: Actor, input: unknown) {
  owner(a);
  const p = z
    .object({
      paymentId: z.string(),
      version: z.number(),
      decision: z.enum(["Verified", "Rejected"]),
      reason: z.string().trim().max(2000).default(""),
    })
    .strict()
    .parse(input);
  if (p.decision === "Rejected" && !p.reason)
    throw new Error("Add a rejection reason.");
  return transact(async (s) => {
    const payment = await (
      await collection("payments")
    ).findOne({ _id: p.paymentId, org: a.org }, { session: s });
    if (!payment) throw new Error("404: Payment not found.");
    if (payment.status !== "Pending verification")
      throw new Error("Payment is no longer pending verification.");
    const booking = await bookingAccess(a, payment.bookingId, s);
    if (p.decision === "Verified" && payment.currency !== booking.currency)
      throw new Error(
        "Currency does not match the booking. Reject and record the correct currency payment.",
      );
    const updated = await (
      await collection("payments")
    ).updateOne(
      { _id: payment._id, version: p.version, status: "Pending verification" },
      {
        $set: {
          status: p.decision,
          verificationReason: p.reason,
          verifiedById: a.id,
          verifiedByName: a.name,
          verifiedAt: now(),
          updatedAt: now(),
        },
        ...(p.decision === "Rejected" ? { $unset: { referenceKey: "" } } : {}),
        $inc: { version: 1 },
      },
      { session: s },
    );
    if (!updated.matchedCount)
      throw new Error("409: Payment changed. Refresh before verifying.");
    await (
      await collection("tasks")
    ).updateMany(
      {
        org: a.org,
        _id: { $regex: `^payment:verify:${payment._id}:` },
        status: { $nin: ["Done", "Cancelled"] },
      },
      {
        $set: { status: "Done", note: p.decision, updatedAt: now() },
        $inc: { version: 1 },
      },
      { session: s },
    );
    if (p.decision === "Verified") {
      await (
        await collection("ledgerEvents")
      ).insertOne(
        {
          _id: `payment:${payment._id}`,
          org: a.org,
          version: 1,
          bookingId: booking._id,
          paymentId: payment._id,
          type: "Customer payment",
          amountMinor: payment.amountMinor,
          currency: payment.currency,
          occurredAt: payment.receivedAt,
          verifiedAt: now(),
          createdAt: now(),
        },
        { session: s },
      );
    }
    const payments = await (
      await collection("payments")
    )
      .find({ bookingId: booking._id, org: a.org }, { session: s })
      .toArray();
    const adjusted = payments.map((item) =>
      item._id === payment._id ? { ...item, status: p.decision } : item,
    );
    const totals = paymentTotals(adjusted, booking.totalMinor + Number(booking.refundedMinor || 0));
    const advanceMet = totals.verifiedPaidMinor >= booking.requiredAdvanceMinor;
    let receiptDocumentId = "";
    if (p.decision === "Verified") {
      const receiptNumber = await nextNumber("RCT", a, s);
      const snapshot = {
        kind: "Receipt",
        number: receiptNumber,
        bookingNumber: booking.bookingNumber,
        payer: booking.payer,
        amountMinor: payment.amountMinor,
        currency: payment.currency,
        receivedAt: payment.receivedAt,
        method: payment.method,
        reference: payment.reference,
        payerName: payment.payerName,
        allocationLabel: `Applied to booking ${booking.bookingNumber}`,
        outstandingMinor: totals.outstandingMinor,
      };
      const bytes = await buildFinancialPdf(snapshot);
      receiptDocumentId = id();
      await (
        await collection("financeDocuments")
      ).insertOne(
        {
          _id: receiptDocumentId,
          org: a.org,
          version: 1,
          bookingId: booking._id,
          paymentId: payment._id,
          kind: "Receipt",
          number: receiptNumber,
          mimeType: "application/pdf",
          bytes: new Binary(Buffer.from(bytes)),
          createdAt: now(),
        },
        { session: s },
      );
      await (
        await collection("payments")
      ).updateOne(
        { _id: payment._id },
        {
          $set: {
            receiptNumber,
            receiptDocumentId,
            allocatedMinor: Math.min(
              payment.amountMinor,
              Math.max(
                0,
                booking.totalMinor -
                  (totals.verifiedPaidMinor - payment.amountMinor),
              ),
            ),
            unappliedMinor: Math.max(
              0,
              totals.verifiedPaidMinor - booking.totalMinor,
            ),
          },
        },
        { session: s },
      );
    }
    if (payment.collectionReportId) {
      await (
        await collection("collectionReports")
      ).updateOne(
        { _id: payment.collectionReportId, org: a.org },
        {
          $set: {
            status: p.decision,
            paymentDecisionReason: p.reason,
            paymentVerifiedById: a.id,
            paymentVerifiedAt: now(),
            updatedAt: now(),
          },
          $inc: { version: 1 },
        },
        { session: s },
      );
    }
    await (
      await collection("bookings")
    ).updateOne(
      { _id: booking._id },
      {
        $set: {
          ...totals,
          paymentStatus:
            p.decision === "Rejected" && !totals.verifiedPaidMinor
              ? "Unpaid"
              : advanceMet
                ? "Advance met"
                : totals.verifiedPaidMinor
                  ? "Partially paid"
                  : "Unpaid",
          status: booking.operationsReleased
            ? booking.status
            : advanceMet
              ? "Ready for operations release"
              : "Awaiting advance",
          updatedAt: now(),
        },
        $inc: { version: 1 },
      },
      { session: s },
    );
    if (advanceMet && !booking.operationsReleased) {
      const owners = await (
        await collection("staff")
      )
        .find({ org: a.org, role: "owner", status: "active" }, { session: s })
        .toArray();
      for (const person of owners) {
        await upsertTask(
          a,
          `booking:release:${booking._id}:${person._id}`,
          `Assign operations for ${booking.bookingNumber}`,
          person._id,
          new Date(Date.now() + 4 * 3600000).toISOString(),
          booking._id,
          s,
        );
        await notify(
          a,
          person._id,
          `booking:advance:${booking._id}:${person._id}`,
          "Advance verified - assign operations",
          booking._id,
          s,
        );
      }
    }
    await notify(
      a,
      booking.salesAssigneeId,
      `payment:decision:${payment._id}`,
      `Payment ${p.decision.toLowerCase()}`,
      booking._id,
      s,
    );
    await audit(
      a,
      booking._id,
      `Payment ${p.decision.toLowerCase()}${p.reason ? ` - ${p.reason}` : ""}`,
      s,
    );
    return { bookingId: booking._id, receiptDocumentId };
  });
}

function serviceChecklist(booking: Row) {
  const content = booking.agreementSnapshot.content;
  const selectedId = booking.agreementSnapshot.selectedOptionId;
  const items = new Set<string>();
  for (const service of content.services || []) items.add(String(service));
  if (
    (content.stays || []).some(
      (stay: Row) => !stay.optionId || stay.optionId === selectedId,
    )
  )
    items.add("Accommodation");
  for (const leg of content.transport || []) {
    if (
      (!leg.optionId || leg.optionId === selectedId) &&
      leg.responsibility === "Agency arranged"
    )
      items.add(`${leg.mode} arrangement`);
  }
  return [...items].map((label) => ({
    id: id(),
    label,
    status: "Pending",
    confirmationReference: "",
  }));
}

export async function releaseOperations(a: Actor, input: unknown) {
  owner(a);
  const p = releaseSchema.parse(input);
  return transact(async (s) => {
    const booking = await bookingAccess(a, p.bookingId, s);
    if (booking.operationsReleased) return booking._id;
    if (booking.status === "Cancelled") throw new Error("A cancelled booking cannot be released to Operations.");
    const invoice = await (
      await collection("invoices")
    ).findOne(
      { bookingId: booking._id, org: a.org, status: "Issued" },
      { session: s },
    );
    if (!invoice)
      throw new Error(
        "Issue the customer invoice before releasing operations.",
      );
    const advanceMet =
      booking.verifiedPaidMinor >= booking.requiredAdvanceMinor;
    if (
      (!advanceMet || booking.requiredAdvanceMinor === 0) &&
      !p.overrideReason
    )
      throw new Error(
        "Add the Owner's release reason when advance is insufficient or zero.",
      );
    const uniqueAssignees = [...new Set(p.operationsAssigneeIds)];
    const people = await (
      await collection("staff")
    )
      .find(
        {
          _id: { $in: uniqueAssignees },
          org: a.org,
          role: "operations",
          status: "active",
        },
        { session: s },
      )
      .toArray();
    if (people.length !== uniqueAssignees.length)
      throw new Error("Choose only active Operations staff.");
    const checklist = serviceChecklist(booking);
    if (!checklist.length)
      throw new Error(
        "The accepted quotation has no agency service to release.",
      );
    const result = await (
      await collection("bookings")
    ).updateOne(
      { _id: booking._id, version: p.version, operationsReleased: false },
      {
        $set: {
          operationsReleased: true,
          operationsReleasedAt: now(),
          operationsReleasedById: a.id,
          operationsReleaseReason: p.overrideReason,
          operationsAssigneeIds: uniqueAssignees,
          operationsChecklist: checklist,
          status: "Pending confirmation",
          updatedAt: now(),
        },
        $inc: { version: 1 },
      },
      { session: s },
    );
    if (!result.matchedCount)
      throw new Error("409: Booking changed. Refresh before release.");
    for (let index = 0; index < checklist.length; index++) {
      const person = people[index % people.length];
      const item = checklist[index];
      await upsertTask(
        a,
        `booking:ops:${booking._id}:${item.id}`,
        `${booking.bookingNumber}: ${item.label}`,
        person._id,
        booking.serviceStart
          ? new Date(`${booking.serviceStart}T09:00:00+05:30`).toISOString()
          : new Date(Date.now() + 24 * 3600000).toISOString(),
        booking._id,
        s,
      );
      await notify(
        a,
        person._id,
        `booking:ops:${booking._id}:${item.id}`,
        `New booking service assigned: ${item.label}`,
        booking._id,
        s,
      );
    }
    await (
      await collection("tasks")
    ).updateMany(
      {
        org: a.org,
        _id: { $regex: `^booking:release:${booking._id}:` },
        status: { $nin: ["Done", "Cancelled"] },
      },
      {
        $set: { status: "Done", note: "Operations assigned", updatedAt: now() },
        $inc: { version: 1 },
      },
      { session: s },
    );
    await notify(
      a,
      booking.salesAssigneeId,
      `booking:released:${booking._id}`,
      "Booking released to Operations",
      booking._id,
      s,
    );
    await audit(
      a,
      booking._id,
      `Operations released to ${people.map((person) => person.name).join(", ")}${p.overrideReason ? ` - Owner reason: ${p.overrideReason}` : ""}`,
      s,
    );
    return booking._id;
  });
}

export async function voidInvoice(a: Actor, input: unknown) {
  owner(a);
  const p = z
    .object({
      invoiceId: z.string(),
      version: z.number(),
      reason: z.string().trim().min(3).max(2000),
    })
    .strict()
    .parse(input);
  return transact(async (s) => {
    const invoice = await (
      await collection("invoices")
    ).findOne({ _id: p.invoiceId, org: a.org }, { session: s });
    if (!invoice) throw new Error("404: Invoice not found.");
    if (invoice.status !== "Issued")
      throw new Error("Only an issued invoice can be voided.");
    const booking = await bookingAccess(a, invoice.bookingId, s);
    const verified = await (
      await collection("payments")
    ).countDocuments(
      { bookingId: booking._id, org: a.org, status: "Verified" },
      { session: s },
    );
    if (verified)
      throw new Error(
        "An invoice with verified payment cannot be voided. Use the later adjustment workflow.",
      );
    if (booking.latestChangeId || booking.operationsReleased) throw new Error("Use the adjustment workflow for changed or released bookings.");
    const changed = await (
      await collection("invoices")
    ).updateOne(
      { _id: invoice._id, version: p.version, status: "Issued" },
      {
        $set: {
          status: "Void",
          voidReason: p.reason,
          voidedAt: now(),
          voidedById: a.id,
          updatedAt: now(),
        },
        $inc: { version: 1 },
      },
      { session: s },
    );
    if (!changed.matchedCount)
      throw new Error("409: Invoice changed. Refresh before voiding.");
    const nextVersion = Number(invoice.invoiceVersion || 1) + 1;
    const draftId = `invoice:${booking._id}:${nextVersion}`;
    await (
      await collection("invoices")
    ).insertOne(
      {
        _id: draftId,
        org: a.org,
        version: 1,
        bookingId: booking._id,
        status: "Draft",
        invoiceVersion: nextVersion,
        currency: invoice.currency,
        lines: invoice.lines,
        taxMode: invoice.taxMode || "No GST",
        placeOfSupply: invoice.placeOfSupply || "",
        buyerStateCode: invoice.buyerStateCode || "",
        dueDate: invoice.dueDate || "",
        tcsRate: Number(invoice.tcsRate || 0),
        copyLabels: invoice.copyLabels || defaultInvoiceTemplate.copyLabels,
        totals: invoice.totals,
        totalMinor: invoice.totalMinor,
        correctionOfId: invoice._id,
        correctionReason: p.reason,
        createdAt: now(),
        updatedAt: now(),
      },
      { session: s },
    );
    await (
      await collection("bookings")
    ).updateOne(
      { _id: booking._id },
      {
        $set: { invoiceStatus: "Draft", invoiceId: draftId, updatedAt: now() },
        $inc: { version: 1 },
      },
      { session: s },
    );
    await audit(
      a,
      booking._id,
      `Invoice ${invoice.invoiceNumber} voided and correction draft created - ${p.reason}`,
      s,
    );
    return draftId;
  });
}

export async function amendAdvance(a: Actor, input: unknown) {
  owner(a);
  const p = z
    .object({
      bookingId: z.string(),
      version: z.number(),
      amount: z.union([z.string(), z.number()]),
      reason: z.string().trim().min(3).max(2000),
    })
    .strict()
    .transform((value) => ({
      ...value,
      amountMinor: minor(String(value.amount)),
    }))
    .parse(input);
  return transact(async (s) => {
    const booking = await bookingAccess(a, p.bookingId, s);
    const amendment = {
      id: id(),
      previousMinor: booking.requiredAdvanceMinor,
      newMinor: p.amountMinor,
      reason: p.reason,
      changedById: a.id,
      changedAt: now(),
    };
    const advanceMet = booking.verifiedPaidMinor >= p.amountMinor;
    const result = await (
      await collection("bookings")
    ).updateOne(
      { _id: booking._id, version: p.version },
      {
        $set: {
          requiredAdvanceMinor: p.amountMinor,
          paymentStatus: advanceMet
            ? "Advance met"
            : booking.verifiedPaidMinor
              ? "Partially paid"
              : "Unpaid",
          status: booking.operationsReleased
            ? booking.status
            : advanceMet
              ? "Ready for operations release"
              : "Awaiting advance",
          advanceAmendments: [...(booking.advanceAmendments || []), amendment],
          updatedAt: now(),
        },
        $inc: { version: 1 },
      },
      { session: s },
    );
    if (!result.matchedCount)
      throw new Error("409: Booking changed. Refresh before amending.");
    await audit(
      a,
      booking._id,
      `Required advance amended from ${booking.requiredAdvanceMinor} to ${p.amountMinor} minor units - ${p.reason}`,
      s,
    );
    return booking._id;
  });
}

export async function reversePayment(a: Actor, input: unknown) {
  owner(a);
  const p = z
    .object({
      paymentId: z.string(),
      version: z.number(),
      reason: z.string().trim().min(3).max(2000),
    })
    .strict()
    .parse(input);
  return transact(async (s) => {
    const payment = await (
      await collection("payments")
    ).findOne({ _id: p.paymentId, org: a.org }, { session: s });
    if (!payment) throw new Error("404: Payment not found.");
    if (payment.status !== "Verified")
      throw new Error("Only a verified payment can be reversed.");
    const booking = await bookingAccess(a, payment.bookingId, s);
    const result = await (
      await collection("payments")
    ).updateOne(
      { _id: payment._id, version: p.version, status: "Verified" },
      {
        $set: {
          status: "Reversed",
          reversalReason: p.reason,
          reversedAt: now(),
          reversedById: a.id,
          updatedAt: now(),
        },
        $inc: { version: 1 },
      },
      { session: s },
    );
    if (!result.matchedCount)
      throw new Error("409: Payment changed. Refresh before reversing.");
    await (
      await collection("ledgerEvents")
    ).insertOne(
      {
        _id: `reversal:${payment._id}`,
        org: a.org,
        version: 1,
        bookingId: booking._id,
        paymentId: payment._id,
        type: "Customer payment reversal",
        amountMinor: -payment.amountMinor,
        currency: payment.currency,
        reason: p.reason,
        occurredAt: now(),
        createdAt: now(),
      },
      { session: s },
    );
    const payments = await (
      await collection("payments")
    )
      .find({ bookingId: booking._id, org: a.org }, { session: s })
      .toArray();
    const totals = paymentTotals(
      payments.map((item) =>
        item._id === payment._id ? { ...item, status: "Reversed" } : item,
      ),
      booking.totalMinor + Number(booking.refundedMinor || 0),
    );
    const settled = effectiveEntries(await (await collection("settlementEntries")).find({ org: a.org, bookingId: booking._id }, { session: s }).toArray());
    const refundCommitted = settled.filter(e => e.kind === "Refund approved").reduce((n, e) => n + e.amountMinor, 0);
    if (refundCommitted > Math.max(0, totals.verifiedPaidMinor - booking.totalMinor)) throw new Error("Resolve approved refunds before reversing the customer payment.");
    const advanceMet = totals.verifiedPaidMinor >= booking.requiredAdvanceMinor;
    await (
      await collection("bookings")
    ).updateOne(
      { _id: booking._id },
      {
        $set: {
          ...totals,
          paymentStatus: advanceMet
            ? "Advance met"
            : totals.verifiedPaidMinor
              ? "Partially paid"
              : "Unpaid",
          financialException: booking.operationsReleased,
          status: booking.operationsReleased
            ? booking.status
            : advanceMet
              ? "Ready for operations release"
              : "Awaiting advance",
          updatedAt: now(),
        },
        $inc: { version: 1 },
      },
      { session: s },
    );
    if (booking.operationsReleased) {
      await upsertTask(
        a,
        `booking:payment-exception:${booking._id}:${payment._id}`,
        `Resolve payment reversal after operations release`,
        a.id,
        new Date(Date.now() + 4 * 3600000).toISOString(),
        booking._id,
        s,
      );
      await notify(
        a,
        a.id,
        `booking:payment-exception:${payment._id}`,
        "Payment reversed after operations release",
        booking._id,
        s,
      );
    }
    await audit(a, booking._id, `Verified payment reversed - ${p.reason}`, s);
    return booking._id;
  });
}

export async function phase3Snapshot(a: Actor) {
  const bookingFilter =
    a.role === "owner"
      ? { org: a.org }
      : a.role === "sales"
        ? { org: a.org, salesAssigneeId: a.id }
        : { org: a.org, operationsReleased: true, operationsAssigneeIds: a.id };
  const bookings = (
    await (
      await collection("bookings")
    )
      .find(bookingFilter)
      .sort({ updatedAt: -1 })
      .limit(1000)
      .toArray()
  ).map((booking) => publicBookingForRole(booking, a.role));
  const ids = bookings.map((booking) => booking._id);
  if (a.role === "operations") return { bookings, payments: [], invoices: [] };
  const payments = await (
    await collection("payments")
  )
    .find(
      { org: a.org, bookingId: { $in: ids } },
      { projection: { referenceKey: 0 } },
    )
    .sort({ createdAt: -1 })
    .toArray();
  const invoices = await (
    await collection("invoices")
  )
    .find({ org: a.org, bookingId: { $in: ids } })
    .sort({ createdAt: -1 })
    .toArray();
  const safeInvoices = invoices.map((invoice) => {
    if (a.role === "owner") return invoice;
    const safe = structuredClone(invoice);
    if (safe.snapshot?.travelSummary?.agreement)
      delete safe.snapshot.travelSummary.agreement;
    return safe;
  });
  return { bookings, payments, invoices: safeInvoices };
}

export async function bookingReminders() {
  const due = await (
    await collection("bookings")
  )
    .find({
      financialClosed: { $ne: true },
      status: { $ne: "Cancelled" },
      outstandingMinor: { $gt: 0 },
      $or: [
        { advanceDueAt: { $ne: "", $lte: now() } },
        { balanceDueAt: { $ne: "", $lte: now() } },
      ],
    })
    .limit(500)
    .toArray();
  let count = 0;
  for (const booking of due) {
    const system: Actor = {
      id: "system",
      authId: "system",
      org: booking.org,
      name: "System",
      role: "owner",
    };
    await transact(async (s) => {
      const title =
        booking.verifiedPaidMinor < booking.requiredAdvanceMinor
          ? `Advance overdue for ${booking.bookingNumber}`
          : `Balance due for ${booking.bookingNumber}`;
      await upsertTask(
        system,
        `booking:money-due:${booking._id}`,
        title,
        booking.salesAssigneeId,
        now(),
        booking._id,
        s,
      );
      await notify(
        system,
        booking.salesAssigneeId,
        `booking:money-due:${booking._id}`,
        title,
        booking._id,
        s,
      );
      count++;
    });
  }
  return count;
}
