import { z } from "zod";
import type { ClientSession } from "mongodb";
import { type Actor, canAccess, canWorkEnquiry } from "@/lib/domain";
import {
  assertApproverReady,
  minor,
  optionAmounts,
  quoteContentSchema,
  quoteRequestSchema,
  templateSchema,
  type QuoteContent,
  publicQuoteForRole,
} from "@/lib/quote-domain";
import { collection, type Row } from "./db";
import { audit, notify, owner, syncFollowUp, transact } from "./crm";
import { indiaInput } from "@/lib/workspace-time";
import { activeQuoteStatuses, quoteRequestBlock } from "@/lib/quote-request-state";
import { processQuotePdfJob } from "./quote-pdf";
import { getActiveInvoiceTemplate } from "./invoices";

const now = () => new Date().toISOString();
const id = () => crypto.randomUUID();
function stripInternal(content: any) {
  return publicQuoteForRole({ content }, "sales").content;
}
export async function quoteAccess(a: Actor, quoteId: string, s?: ClientSession, includeTeam = false) {
  if (a.role === "operations")
    throw new Error("403: Quotations are not available to Operations.");
  const q = await (
    await collection("quotes")
  ).findOne({ _id: quoteId, org: a.org }, { session: s });
  if (!q) throw new Error("404: Quotation not found.");
  if (!canAccess(a, q.assigneeId)) {
    const enquiry = includeTeam ? await (await collection("enquiries")).findOne({ _id: q.enquiryId, org: a.org }, { session: s }) : null;
    if (!enquiry || !canWorkEnquiry(a, enquiry)) throw new Error("403: Quotation is not assigned to you.");
  }
  return q;
}
async function enquiryAccess(a: Actor, enquiryId: string, s?: ClientSession) {
  if (a.role === "operations") throw new Error("403: Not permitted.");
  const e = await (
    await collection("enquiries")
  ).findOne({ _id: enquiryId, org: a.org }, { session: s });
  if (!e) throw new Error("404: Enquiry not found.");
  if (!canWorkEnquiry(a, e))
    throw new Error("403: Enquiry is not assigned to you.");
  if (e.reviewNeeded)
    throw new Error(
      "Review and activate this imported enquiry before requesting a quotation.",
    );
  return e;
}
async function task(
  a: Actor,
  key: string,
  title: string,
  assigneeId: string,
  dueAt: string,
  quoteId: string,
  enquiryId: string,
  status = "To do",
  s?: ClientSession,
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
        status,
        quoteId,
        enquiryId,
        updatedAt: now(),
      },
      $setOnInsert: { createdAt: now() },
      $inc: { version: 1 },
    },
    { upsert: true, session: s },
  );
}
async function activeOwners(a: Actor, s?: ClientSession) {
  return (await collection("staff"))
    .find({ org: a.org, role: "owner", status: "active" }, { session: s })
    .toArray();
}
async function nextQuoteNumber(a: Actor, s: ClientSession) {
  const year = new Date().getFullYear();
  const counter = await (
    await collection("counters")
  ).findOneAndUpdate(
    { _id: `quote:${a.org}:${year}` },
    { $setOnInsert: { org: a.org, version: 1 }, $inc: { value: 1 } },
    { upsert: true, returnDocument: "after", session: s },
  );
  return `EB-Q-${year}-${String(counter?.value || 1).padStart(4, "0")}`;
}
export function requestGaps(e: Row) {
  const gaps: string[] = [];
  if (!e.destination) gaps.push("destination");
  if (e.dateMode !== "Exact" && !e.travelPreference)
    gaps.push("travel date or flexible range");
  if (e.adults === null && !e.childrenAges && !e.infants)
    gaps.push("traveller count");
  if (!e.services) gaps.push("services required");
  const services = String(e.services).toLowerCase();
  if (
    /hotel|stay|accommodation|houseboat/.test(services) &&
    !e.hotelPreference &&
    !e.rooms
  )
    gaps.push("hotel nights/rooms or preference");
  if (/car|transfer|transport/.test(services) && (!e.pickup || !e.dropoff))
    gaps.push("pickup and drop-off");
  return gaps;
}

export async function enquiryQuoteWorkspace(a: Actor, quoteId: string) {
  const q = await quoteAccess(a, quoteId, undefined, true);
  const [enquiry, customer, quoteTemplates, booking] = await Promise.all([
    (await collection("enquiries")).findOne({ _id: q.enquiryId, org: a.org }, { projection: { destination: 1 } }),
    (await collection("customers")).findOne({ _id: q.customerId, org: a.org }, { projection: { name: 1 } }),
    ["Requested", "Needs information", "Draft"].includes(q.status)
      ? (await collection("quoteTemplates")).find({ org: a.org, active: true }, { projection: { name: 1, active: 1 } }).sort({ name: 1 }).limit(100).toArray()
      : [],
    q.status === "Accepted" ? (await collection("bookings")).findOne({ quoteId: q._id, org: a.org }, { projection: { bookingNumber: 1, status: 1 } }) : null,
  ]);
  const invoice = booking && (a.role === "owner" || q.assigneeId === a.id)
    ? await (await collection("invoices")).findOne({ org: a.org, bookingId: booking._id, status: "Issued" }, { projection: { documentId: 1, invoiceNumber: 1 } })
    : null;
  return { quote: publicQuoteForRole(q, a.role), enquiry, customer, quoteTemplates, booking: booking && { ...booking, invoice } };
}

function reusablePackage(content: QuoteContent): QuoteContent {
  return {
    ...content, startDate: "", endDate: "", dateLabel: "", dateScope: "Indicative", validUntil: "",
    adults: 0, childrenAges: "", infants: 0, internalNotes: "", customerNotes: "",
    advanceAmount: "0", advanceDue: "", balanceTerms: "",
    itinerary: content.itinerary.map((day) => ({ ...day, date: "" })),
    stays: content.stays.map((stay) => ({ ...stay, checkIn: "", checkOut: "" })),
    transport: content.transport.map((leg) => ({ ...leg, date: "", reference: "", passengers: "" })),
  };
}

export async function requestQuote(a: Actor, input: unknown) {
  const p = quoteRequestSchema.parse(input);
  return transact(async (s) => {
    const e = await enquiryAccess(a, p.enquiryId, s);
    const blocked = quoteRequestBlock({ stage: e.stage, reviewNeeded: e.reviewNeeded });
    if (blocked) throw new Error(blocked);
    const gaps = requestGaps(e);
    if (gaps.length)
      throw new Error(
        `Complete the enquiry before requesting a quote: ${gaps.join(", ")}.`,
      );
    const existing = await (
      await collection("quotes")
    ).findOne(
      {
        org: a.org,
        enquiryId: e._id,
        status: {
          $in: [...activeQuoteStatuses],
        },
      },
      { session: s },
    );
    if (existing)
      throw new Error(
        "409: This enquiry already has an active quotation. Open it instead of creating a duplicate.",
      );
    const qid = id(),
      quoteNumber = await nextQuoteNumber(a, s),
      owners = await activeOwners(a, s);
    if (!owners.length)
      throw new Error("No active owner is available to prepare the quotation.");
    const content: QuoteContent = {
      title: `${e.destination || "Travel"} package`,
      summary: "",
      destinations: e.destination || e.travelPreference,
      dateScope: e.dateMode === "Exact" ? "Exact" : "Indicative",
      startDate: e.dateMode === "Exact" ? e.departure : "",
      endDate: e.dateMode === "Exact" ? e.returnDate : "",
      dateLabel: e.dateMode === "Exact" ? "" : e.travelPreference,
      adults: e.adults || 0,
      childrenAges: e.childrenAges || "",
      infants: e.infants || 0,
      services: [],
      itinerary: [],
      stays: [],
      transport: [],
      options: [],
      optionalExtras: [],
      inclusions: [],
      exclusions: [],
      currency: "INR",
      advanceAmount: "0",
      advanceDue: "",
      balanceTerms: "",
      validUntil: "",
      cancellationTerms: "",
      customerNotes: "",
      internalNotes: p.requestNote,
    };
    const q = {
      _id: qid,
      org: a.org,
      version: 1,
      groupId: qid,
      quoteNumber,
      quoteVersion: 1,
      enquiryId: e._id,
      customerId: e.customerId,
      assigneeId: e.assigneeId,
      requesterId: a.id,
      requestNote: p.requestNote,
      requestedDueAt: p.requestedDueAt,
      status: "Requested",
      pdfStatus: "Not started",
      content,
      createdAt: now(),
      updatedAt: now(),
    };
    await (await collection("quotes")).insertOne(q, { session: s });
    const moved = await (
      await collection("enquiries")
    ).updateOne(
      { _id: e._id, version: e.version },
      {
        $set: { stage: "Quote requested", updatedAt: now() },
        $inc: { version: 1 },
      },
      { session: s },
    );
    if (!moved.matchedCount)
      throw new Error(
        "409: Enquiry changed. Refresh before requesting the quotation.",
      );
    for (const o of owners) {
      await task(
        a,
        `quote:prepare:${qid}:${o._id}`,
        "Prepare quotation",
        o._id,
        p.requestedDueAt,
        qid,
        e._id,
        "To do",
        s,
      );
      await notify(
        a,
        o._id,
        `quote-request:${qid}:${o._id}`,
        "Quotation requested",
        qid,
        s,
      );
    }
    await audit(a, qid, "Quotation requested", s);
    await audit(a, e._id, `Quotation ${quoteNumber} requested`, s);
    return qid;
  });
}

export async function saveQuote(
  a: Actor,
  input: unknown,
  quoteId: string,
  version: number,
) {
  const content = quoteContentSchema.parse(input);
  return transact(async (s) => {
    const q = await quoteAccess(a, quoteId, s, true);
    if (!["Requested", "Needs information", "Draft"].includes(q.status))
      throw new Error(
        "Approved, sent and decided quotations are immutable. Create a new version.",
      );
    if (a.role !== "owner") {
      const oldOptions = (q.content?.options || []) as { id: string; internalCost?: string }[];
      const costs = new Map(oldOptions.map((item) => [item.id, item.internalCost || "0"]));
      if (new Set(content.options.map((item) => item.id)).size !== content.options.length)
        throw new Error("Each price option must have a unique ID.");
      if (oldOptions.some((item) => minor(item.internalCost || "0") > 0 && !content.options.some((next) => next.id === item.id)))
        throw new Error("Ask the Owner to remove a price option that has an internal cost.");
      content.internalNotes = String(q.content?.internalNotes || "");
      content.options = content.options.map((item) => ({ ...item, internalCost: costs.get(item.id) || "0" }));
    }
    const r = await (
      await collection("quotes")
    ).updateOne(
      { _id: q._id, org: a.org, version },
      {
        $set: { content, status: "Draft", updatedAt: now() },
        $inc: { version: 1 },
      },
      { session: s },
    );
    if (!r.matchedCount)
      throw new Error("409: Quotation changed. Refresh before saving.");
    await audit(a, q._id, "Quotation draft saved", s);
    await audit(a, q.enquiryId, `Quotation ${q.quoteNumber} draft saved`, s);
    return q._id;
  });
}

export async function returnQuote(a: Actor, input: unknown) {
  owner(a);
  const p = z
    .object({
      quoteId: z.string(),
      version: z.number(),
      reason: z.string().trim().min(3).max(3000),
      dueAt: z.iso.datetime(),
    })
    .strict()
    .parse(input);
  return transact(async (s) => {
    const q = await quoteAccess(a, p.quoteId, s);
    if (!["Requested", "Draft"].includes(q.status))
      throw new Error("Only a pending request or draft can be returned.");
    const r = await (
      await collection("quotes")
    ).updateOne(
      { _id: q._id, version: p.version },
      {
        $set: {
          status: "Needs information",
          missingInformation: p.reason,
          updatedAt: now(),
        },
        $inc: { version: 1 },
      },
      { session: s },
    );
    if (!r.matchedCount)
      throw new Error("409: Refresh before returning this quotation.");
    await task(
      a,
      `quote:info:${q._id}`,
      "Complete quotation information",
      q.assigneeId,
      p.dueAt,
      q._id,
      q.enquiryId,
      "To do",
      s,
    );
    await notify(
      a,
      q.assigneeId,
      `quote-info:${q._id}:${p.version}`,
      "Quotation needs more information",
      q._id,
      s,
    );
    await audit(
      a,
      q._id,
      `Quotation returned for information - ${p.reason}`,
      s,
    );
  });
}

export async function resubmitQuote(a: Actor, input: unknown) {
  const p = z
    .object({
      quoteId: z.string(),
      version: z.number(),
      note: z.string().trim().min(2).max(3000),
      dueAt: z.iso.datetime(),
    })
    .strict()
    .parse(input);
  return transact(async (s) => {
    const q = await quoteAccess(a, p.quoteId, s);
    if (q.status !== "Needs information")
      throw new Error("This quotation is not waiting for information.");
    const e = await enquiryAccess(a, q.enquiryId, s),
      gaps = requestGaps(e);
    if (gaps.length) throw new Error(`Still missing: ${gaps.join(", ")}.`);
    const r = await (
      await collection("quotes")
    ).updateOne(
      { _id: q._id, version: p.version },
      {
        $set: {
          status: "Requested",
          requestNote: p.note,
          requestedDueAt: p.dueAt,
          missingInformation: "",
          updatedAt: now(),
        },
        $inc: { version: 1 },
      },
      { session: s },
    );
    if (!r.matchedCount) throw new Error("409: Refresh before resubmitting.");
    await task(
      a,
      `quote:info:${q._id}`,
      "Complete quotation information",
      q.assigneeId,
      p.dueAt,
      q._id,
      q.enquiryId,
      "Done",
      s,
    );
    for (const o of await activeOwners(a, s)) {
      await task(
        a,
        `quote:prepare:${q._id}:${o._id}`,
        "Prepare quotation",
        o._id,
        p.dueAt,
        q._id,
        q.enquiryId,
        "To do",
        s,
      );
      await notify(
        a,
        o._id,
        `quote-resubmit:${q._id}:${p.version}:${o._id}`,
        "Quotation information updated",
        q._id,
        s,
      );
    }
    await audit(a, q._id, "Quotation request resubmitted", s);
  });
}

export async function approveQuote(a: Actor, input: unknown) {
  owner(a);
  const p = z
    .object({ quoteId: z.string(), version: z.number() })
    .strict()
    .parse(input);
  let jobId = "";
  await transact(async (s) => {
    const q = await quoteAccess(a, p.quoteId, s);
    if (q.status !== "Draft")
      throw new Error("Save the quotation as a draft before approval.");
    const content = quoteContentSchema.parse(q.content);
    assertApproverReady(content);
    const options = content.options.map((o) => ({ ...o, ...optionAmounts(o) }));
    const optionalExtras = content.optionalExtras.map((x) => ({
      ...x,
      priceMinor: minor(x.price),
    }));
    const contentWithAmounts = {
      ...content,
      options,
      optionalExtras,
      advanceAmount: "0",
      advanceAmountMinor: 0,
      advanceDue: "",
      balanceTerms: "",
    };
    const customer = await (
      await collection("customers")
    ).findOne({ _id: q.customerId, org: a.org }, { session: s });
    if (!customer) throw new Error("Customer no longer exists.");
    const publicContent = stripInternal(contentWithAmounts);
    const company = await getActiveInvoiceTemplate(a, s);
    const snapshot = {
      quoteNumber: q.quoteNumber,
      quoteVersion: q.quoteVersion,
      customer: {
        name: customer.name,
        phone: customer.phone,
        email: customer.email,
      },
      content: publicContent,
      paymentHandledInBooking: true,
      company: {
        legalName: company.legalName,
        address: company._id === "default" ? "" : company.address,
        phone: company.phone,
        email: company.email,
        gstin: company.gstin,
        logoTemplateId: company.logoDataUrl ? company._id : "",
      },
      approvedAt: now(),
      approvedBy: a.name,
    };
    const totals = options.reduce(
      (x, o) => ({
        cost: x.cost + o.internalCostMinor,
        margin: x.margin + o.estimatedMarginMinor,
      }),
      { cost: 0, margin: 0 },
    );
    jobId = `quote-pdf:${q._id}:v${q.quoteVersion}`;
    const r = await (
      await collection("quotes")
    ).updateOne(
      { _id: q._id, version: p.version },
      {
        $set: {
          content: contentWithAmounts,
          snapshot,
          status: "Approved",
          pdfStatus: "Queued",
          approvedAt: now(),
          approvedById: a.id,
          internalCostTotalMinor: totals.cost,
          estimatedMarginTotalMinor: totals.margin,
          updatedAt: now(),
        },
        $inc: { version: 1 },
      },
      { session: s },
    );
    if (!r.matchedCount)
      throw new Error("409: Quotation changed. Refresh before approving.");
    await (
      await collection("documentJobs")
    ).updateOne(
      { _id: jobId },
      {
        $setOnInsert: {
          org: a.org,
          version: 1,
          type: "quote-pdf",
          quoteId: q._id,
          quoteVersion: q.quoteVersion,
          status: "Queued",
          attempts: 0,
          createdAt: now(),
        },
        $set: { updatedAt: now() },
      },
      { upsert: true, session: s },
    );
    await (
      await collection("tasks")
    ).updateMany(
      {
        org: a.org,
        quoteId: q._id,
        title: "Prepare quotation",
        status: { $nin: ["Done", "Cancelled"] },
      },
      {
        $set: { status: "Done", note: "Approved", updatedAt: now() },
        $inc: { version: 1 },
      },
      { session: s },
    );
    await audit(
      a,
      q._id,
      `Quotation ${q.quoteNumber} v${q.quoteVersion} approved and frozen`,
      s,
    );
  });
  try {
    await processQuotePdfJob(jobId);
  } catch {
    /* durable job remains visible for retry */
  }
  return jobId;
}

export async function reviseQuote(a: Actor, input: unknown) {
  owner(a);
  const p = z
    .object({ quoteId: z.string(), reason: z.string().trim().min(3).max(3000) })
    .strict()
    .parse(input);
  return transact(async (s) => {
    const q = await quoteAccess(a, p.quoteId, s);
    if (
      ![
        "Approved",
        "Sent",
        "Accepted",
        "Rejected",
        "Changes requested",
        "Expired",
        "Superseded",
      ].includes(q.status)
    )
      throw new Error(
        "Finish the current draft instead of creating a duplicate version.",
      );
    const existing = await (
      await collection("quotes")
    ).findOne(
      {
        org: a.org,
        groupId: q.groupId,
        status: { $in: ["Requested", "Needs information", "Draft"] },
      },
      { session: s },
    );
    if (existing) throw new Error("409: An editable version already exists.");
    const latest = await (
      await collection("quotes")
    )
      .find({ org: a.org, groupId: q.groupId }, { session: s })
      .sort({ quoteVersion: -1 })
      .limit(1)
      .next();
    const next = id(),
      quoteVersion = (latest?.quoteVersion || q.quoteVersion) + 1,
      raw = structuredClone(q.content || q.snapshot?.content);
    delete raw.advanceAmountMinor;
    raw.options = (raw.options || []).map((o: any) => {
      const {
        unitPriceMinor,
        discountMinor,
        taxAmountMinor,
        internalCostMinor,
        subtotalMinor,
        totalMinor,
        estimatedMarginMinor,
        ...clean
      } = o;
      void unitPriceMinor;
      void discountMinor;
      void taxAmountMinor;
      void internalCostMinor;
      void subtotalMinor;
      void totalMinor;
      void estimatedMarginMinor;
      return clean;
    });
    raw.optionalExtras = (raw.optionalExtras || []).map((x: any) => {
      const { priceMinor, ...clean } = x;
      void priceMinor;
      return clean;
    });
    const content = quoteContentSchema.parse(raw);
    await (
      await collection("quotes")
    ).insertOne(
      {
        _id: next,
        org: a.org,
        version: 1,
        groupId: q.groupId,
        quoteNumber: q.quoteNumber,
        quoteVersion,
        enquiryId: q.enquiryId,
        customerId: q.customerId,
        assigneeId: q.assigneeId,
        requesterId: a.id,
        status: "Draft",
        pdfStatus: "Not started",
        content,
        revisionReason: p.reason,
        createdFromId: q._id,
        createdAt: now(),
        updatedAt: now(),
      },
      { session: s },
    );
    if (q.status !== "Accepted")
      await (
        await collection("quotes")
      ).updateOne(
        { _id: q._id },
        {
          $set: { status: "Superseded", supersededBy: next, updatedAt: now() },
          $inc: { version: 1 },
        },
        { session: s },
      );
    else
      await (
        await collection("quotes")
      ).updateOne(
        { _id: q._id },
        {
          $set: { amendmentRequested: true, updatedAt: now() },
          $inc: { version: 1 },
        },
        { session: s },
      );
    await audit(
      a,
      next,
      `Quotation revision v${quoteVersion} created - ${p.reason}`,
      s,
    );
    return next;
  });
}

export async function retryQuotePdf(a: Actor, input: unknown) {
  owner(a);
  const p = z.object({ quoteId: z.string() }).strict().parse(input);
  const q = await quoteAccess(a, p.quoteId);
  if (q.status !== "Approved" && q.status !== "Sent")
    throw new Error("Only an approved quotation PDF can be retried.");
  const jobId = `quote-pdf:${q._id}:v${q.quoteVersion}`,
    job = await (
      await collection("documentJobs")
    ).findOne({ _id: jobId, org: a.org });
  if (job && job.attempts >= 2)
    throw new Error(
      "PDF retry limit reached. Check the stored error and server configuration before creating a new quotation version.",
    );
  await (
    await collection("documentJobs")
  ).updateOne(
    { _id: jobId, org: a.org },
    {
      $set: { status: "Queued", lastError: "", updatedAt: now() },
      $inc: { version: 1 },
    },
    { upsert: true },
  );
  try {
    await processQuotePdfJob(jobId);
  } catch {}
  return jobId;
}

export async function shareQuote(a: Actor, input: unknown) {
  const p = z
    .object({
      quoteId: z.string(),
      version: z.number(),
      channel: z.enum(["WhatsApp", "Email", "Printed", "Other"]),
      sharedAt: z.iso.datetime(),
      reference: z.string().trim().max(500).default(""),
      followUpAt: z.union([z.literal(""), z.iso.datetime()]),
      note: z.string().trim().max(3000).default(""),
    })
    .strict()
    .parse(input);
  return transact(async (s) => {
    const q = await quoteAccess(a, p.quoteId, s);
    if (!["Approved", "Sent"].includes(q.status) || q.pdfStatus !== "Ready")
      throw new Error(
        "Only a generated, approved PDF can be marked as shared.",
      );
    const shareId = id(),
      share = {
        id: shareId,
        channel: p.channel,
        sharedAt: p.sharedAt,
        reference: p.reference,
        note: p.note,
        byId: a.id,
        byName: a.name,
      };
    const r = await (
      await collection("quotes")
    ).updateOne(
      { _id: q._id, version: p.version },
      {
        $set: {
          status: "Sent",
          lastSharedAt: p.sharedAt,
          shares: [...(q.shares || []), share],
          updatedAt: now(),
        },
        $inc: { version: 1 },
      },
      { session: s },
    );
    if (!r.matchedCount)
      throw new Error(
        "409: Quotation changed. Refresh before recording sharing.",
      );
    if (p.followUpAt)
      await task(
        a,
        `quote:follow:${q._id}`,
        "Follow up on quotation",
        q.assigneeId,
        p.followUpAt,
        q._id,
        q.enquiryId,
        "To do",
        s,
      );
    await (
      await collection("enquiries")
    ).updateOne(
      { _id: q.enquiryId },
      {
        $set: {
          stage: "Quote sent",
          nextAction: p.followUpAt ? "Follow up on quotation" : "",
          nextFollowUp: p.followUpAt,
          updatedAt: now(),
        },
        $inc: { version: 1 },
      },
      { session: s },
    );
    await audit(
      a,
      q._id,
      `Approved PDF manually shared via ${p.channel}; delivery not verified`,
      s,
    );
    return shareId;
  });
}

export async function decideQuote(a: Actor, input: unknown) {
  const p = z
    .object({
      quoteId: z.string(),
      version: z.number(),
      decision: z.enum(["Accepted", "Rejected", "Changes requested"]),
      selectedOptionId: z.string().default(""),
      decidedAt: z.iso.datetime(),
      channel: z.enum(["WhatsApp", "Phone", "Email", "In person", "Other"]),
      reference: z.string().trim().max(1000).default(""),
      reason: z.string().trim().max(3000).default(""),
    })
    .strict()
    .parse(input);
  return transact(async (s) => {
    const q = await quoteAccess(a, p.quoteId, s);
    if (q.status !== "Sent")
      throw new Error(
        "Record the approved PDF as shared before the customer decision.",
      );
    const options = q.snapshot?.content?.options || [];
    const selectedOptionId = p.selectedOptionId || (options.length === 1 ? options[0].id : "");
    if (p.decision === "Accepted") {
      if (q.snapshot?.content?.validUntil && indiaInput(p.decidedAt).slice(0, 10) > q.snapshot.content.validUntil)
        throw new Error("The quote had expired by the acceptance date. Create and share a new version.");
      if (
        !selectedOptionId ||
        !options.some(
          (x: Row) => x.id === selectedOptionId,
        )
      )
        throw new Error("Choose the package the customer accepted.");
      if (!p.reference && !p.reason)
        throw new Error("Record the acceptance reference or evidence note.");
      const other = await (
        await collection("quotes")
      ).findOne(
        {
          org: a.org,
          groupId: q.groupId,
          status: "Accepted",
          _id: { $ne: q._id },
        },
        { session: s },
      );
      if (other)
        throw new Error(
          "409: Another version is already accepted. Owner must resolve it deliberately.",
        );
    }
    if (p.decision !== "Accepted" && !p.reason)
      throw new Error("Add the customer reason or requested changes.");
    const accepted =
      p.decision === "Accepted"
        ? { selectedOptionId, acceptedSnapshot: q.snapshot }
        : {};
    const r = await (
      await collection("quotes")
    ).updateOne(
      { _id: q._id, version: p.version },
      {
        $set: {
          status: p.decision,
          customerDecision: p.decision,
          decisionAt: p.decidedAt,
          decisionChannel: p.channel,
          decisionReference: p.reference,
          decisionReason: p.reason,
          decisionById: a.id,
          ...accepted,
          updatedAt: now(),
        },
        $inc: { version: 1 },
      },
      { session: s },
    );
    if (!r.matchedCount)
      throw new Error(
        "409: Quotation changed. Refresh before saving the decision.",
      );
    await (
      await collection("tasks")
    ).updateMany(
      { org: a.org, quoteId: q._id, status: { $nin: ["Done", "Cancelled"] } },
      {
        $set: {
          status: "Done",
          note: `Customer: ${p.decision}`,
          updatedAt: now(),
        },
        $inc: { version: 1 },
      },
      { session: s },
    );
    if (p.decision === "Accepted" || p.decision === "Rejected") {
      const enquiry = await (
        await collection("enquiries")
      ).findOneAndUpdate(
        { _id: q.enquiryId, org: a.org },
        {
          $set: {
            ...(p.decision === "Accepted"
              ? { stage: "Won", nextAction: "Create booking" }
              : { stage: "Lost", reason: p.reason, nextAction: "" }),
            nextFollowUp: "",
            updatedAt: now(),
          },
          $inc: { version: 1 },
        },
        { session: s, returnDocument: "after" },
      );
      if (enquiry) {
        await syncFollowUp(a, enquiry, s);
        await audit(a, enquiry._id, `Customer decision: ${p.decision} (${q.quoteNumber} v${q.quoteVersion})`, s);
      }
      if (p.decision === "Accepted") {
        const recipients = new Set([q.assigneeId, ...(await activeOwners(a, s)).map((person) => person._id)]);
        recipients.delete(a.id);
        for (const recipient of recipients)
          await notify(a, recipient, `quote-accepted:${q._id}:${recipient}`, `Customer accepted ${q.quoteNumber}`, q._id, s);
      }
    } else
      for (const o of await activeOwners(a, s)) {
        await task(
          a,
          `quote:change:${q._id}:${o._id}`,
          "Review quotation change request",
          o._id,
          new Date(Date.now() + 24 * 3600000).toISOString(),
          q._id,
          q.enquiryId,
          "To do",
          s,
        );
        await notify(
          a,
          o._id,
          `quote-change:${q._id}:${q.version}:${o._id}`,
          "Customer requested quotation changes",
          q._id,
          s,
        );
      }
    await audit(
      a,
      q._id,
      `Customer decision: ${p.decision}${p.reason ? " - " + p.reason : ""}`,
      s,
    );
  });
}

export async function packageTemplateWorkspace(a: Actor, id: string, requestedPage: number, search: string) {
  owner(a);
  const templates = await collection("quoteTemplates");
  if (id) {
    const template = await templates.findOne({ _id: id, org: a.org });
    if (!template) throw new Error("404: Package template not found.");
    return { template };
  }
  const pageSize = 20;
  const page = Math.min(500, Math.max(1, Number.isInteger(requestedPage) ? requestedPage : 1));
  const term = search.trim().slice(0, 100);
  const match = term ? new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") : null;
  const filter = { org: a.org, ...(match ? { $or: [{ name: match }, { destination: match }] } : {}) };
  const rows = await templates.find(filter, { projection: { name: 1, destination: 1, active: 1, updatedAt: 1 } })
    .sort({ name: 1, _id: 1 }).skip((page - 1) * pageSize).limit(pageSize + 1).toArray();
  return { templates: rows.slice(0, pageSize), hasMore: rows.length > pageSize && page < 500 };
}

export async function saveTemplate(a: Actor, input: unknown) {
  owner(a);
  const p = templateSchema.parse(input);
  p.content = reusablePackage(p.content);
  const tid = p.id || id(),
    c = await collection("quoteTemplates"),
    old = p.id ? await c.findOne({ _id: p.id, org: a.org }) : null;
  if (p.id && !old) throw new Error("404: Template not found.");
  if (old) {
    const r = await c.updateOne(
      { _id: tid, version: p.version },
      {
        $set: {
          name: p.name,
          destination: p.destination,
          active: p.active,
          content: p.content,
          updatedAt: now(),
        },
        $inc: { version: 1 },
      },
    );
    if (!r.matchedCount) throw new Error("409: Template changed. Refresh.");
  } else
    await c.insertOne({
      _id: tid,
      org: a.org,
      version: 1,
      name: p.name,
      destination: p.destination,
      active: p.active,
      content: p.content,
      createdAt: now(),
      updatedAt: now(),
    });
  await audit(
    a,
    tid,
    old ? "Package template updated" : "Package template created",
  );
  return tid;
}

export async function applyTemplate(a: Actor, input: unknown) {
  const p = z
    .object({
      quoteId: z.string(),
      version: z.number(),
      templateId: z.string(),
      replace: z.boolean().default(false),
    })
    .strict()
    .parse(input);
  return transact(async (s) => {
    const q = await quoteAccess(a, p.quoteId, s, true);
    if (!["Requested", "Needs information", "Draft"].includes(q.status))
      throw new Error("Templates can only be applied to editable quotations.");
    const t = await (
      await collection("quoteTemplates")
    ).findOne({ _id: p.templateId, org: a.org, active: true }, { session: s });
    if (!t) throw new Error("Template is unavailable.");
    const hasWork = ["itinerary", "stays", "transport", "options", "optionalExtras", "inclusions", "exclusions"].some((key) => q.content?.[key]?.length);
    if (hasWork && !p.replace) throw new Error("Confirm replacing the current draft with the template.");
    if (a.role !== "owner" && q.content?.options?.some((option: { internalCost?: string }) => minor(option.internalCost || "0") > 0))
      throw new Error("Ask the Owner to replace a draft that already has private supplier costs.");
    const source = reusablePackage(quoteContentSchema.parse(t.content));
    const previousDestination = String(q.content?.destinations || "").trim();
    if (previousDestination && t.destination && previousDestination.toLowerCase() !== String(t.destination).trim().toLowerCase())
      throw new Error("Choose a template for the same destination as this quote.");
    const merged = {
      ...source,
      options: a.role === "owner" ? source.options : source.options.map((option) => ({ ...option, internalCost: "0" })),
      internalNotes: q.content?.internalNotes || "",
      title: q.content?.title || source.title,
      destinations: previousDestination || source.destinations,
      adults: q.content?.adults || 0,
      childrenAges: q.content?.childrenAges || "",
      infants: q.content?.infants || 0,
      startDate: q.content?.startDate || "",
      endDate: q.content?.endDate || "",
      dateLabel: q.content?.dateLabel || "",
      dateScope: q.content?.dateScope || "Indicative",
    };
    const r = await (
      await collection("quotes")
    ).updateOne(
      { _id: q._id, version: p.version },
      {
        $set: {
          content: merged,
          status: "Draft",
          templateId: t._id,
          updatedAt: now(),
        },
        $inc: { version: 1 },
      },
      { session: s },
    );
    if (!r.matchedCount) throw new Error("409: Quotation changed. Refresh.");
    await audit(a, q._id, `Applied package template: ${t.name}`, s);
    await audit(a, q.enquiryId, `Applied package template: ${t.name}`, s);
  });
}

export async function expireQuotes() {
  const today = new Date().toISOString().slice(0, 10),
    soon = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10),
    expiring = await (
      await collection("quotes")
    )
      .find({
        status: { $in: ["Approved", "Sent"] },
        "snapshot.content.validUntil": { $gte: today, $lte: soon },
      })
      .limit(200)
      .toArray();
  for (const q of expiring) {
    const system: Actor = {
      id: "system",
      authId: "system",
      org: q.org,
      name: "System",
      role: "owner",
    };
    await notify(
      system,
      q.assigneeId,
      `quote-expiring:${q._id}:${q.quoteVersion}`,
      "Quotation expires soon - contact the customer",
      q._id,
    );
    await (
      await collection("tasks")
    ).updateOne(
      { _id: `quote:expiry:${q._id}` },
      {
        $set: {
          org: q.org,
          title: "Review expiring quotation",
          assigneeId: q.assigneeId,
          dueAt: new Date(
            `${q.snapshot.content.validUntil}T12:00:00+05:30`,
          ).toISOString(),
          status: "To do",
          quoteId: q._id,
          enquiryId: q.enquiryId,
          updatedAt: now(),
        },
        $setOnInsert: { createdAt: now() },
        $inc: { version: 1 },
      },
      { upsert: true },
    );
  }
  const candidates = await (
    await collection("quotes")
  )
    .find({
      status: { $in: ["Approved", "Sent"] },
      "snapshot.content.validUntil": { $lt: today },
    })
    .limit(200)
    .toArray();
  let count = 0;
  for (const q of candidates) {
    const result = await (
      await collection("quotes")
    ).updateOne(
      { _id: q._id, version: q.version, status: { $in: ["Approved", "Sent"] } },
      { $set: { status: "Expired", updatedAt: now() }, $inc: { version: 1 } },
    );
    if (!result.modifiedCount) continue;
    const system: Actor = {
      id: "system",
      authId: "system",
      org: q.org,
      name: "System",
      role: "owner",
    };
    await notify(
      system,
      q.assigneeId,
      `quote-expired:${q._id}:${q.quoteVersion}`,
      "Quotation expired - review before resending",
      q._id,
    );
    for (const o of await activeOwners(system))
      await notify(
        system,
        o._id,
        `quote-expired-owner:${q._id}:${o._id}`,
        "Quotation expired and may need repricing",
        q._id,
      );
    await (
      await collection("tasks")
    ).updateOne(
      { _id: `quote:expiry:${q._id}` },
      {
        $set: { status: "Done", note: "Quotation expired", updatedAt: now() },
        $inc: { version: 1 },
      },
    );
    count++;
  }
  return count;
}
