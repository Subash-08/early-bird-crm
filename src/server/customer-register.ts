import ExcelJS from "exceljs";
import { PassThrough, Readable } from "node:stream";
import type { Document } from "mongodb";
import { z } from "zod";
import type { Actor } from "@/lib/domain";
import { registerSources, registerStages, registerStatuses } from "@/lib/customer-register";
import { indiaInput } from "@/lib/workspace-time";
import { displayedNextAction } from "@/lib/booking-next-action";
import { collection } from "./db";

const date = z.union([z.literal(""), z.iso.date()]);
const searchText = z.string().trim().max(100);
const filtersSchema = z.object({
  from: date.default(""), to: date.default(""), stage: z.string().default(""),
  status: z.string().default(""), source: z.string().default(""), staffId: searchText.default(""),
  destination: searchText.default(""), q: searchText.default(""),
  page: z.coerce.number().int().min(1).max(100000).default(1),
});

const customerProjection = { name: 1, phone: 1, email: 1, address: 1, language: 1 };
const enquiryProjection = { customerId: 1, assigneeId: 1, stage: 1, reviewNeeded: 1, source: 1, destination: 1, dateMode: 1,
  departure: 1, returnDate: 1, travelPreference: 1, budget: 1, budgetBasis: 1, adults: 1, childrenAges: 1, infants: 1,
  services: 1, serviceResponsibility: 1, hotelPreference: 1, rooms: 1, pickup: 1, dropoff: 1, specialRequirements: 1,
  contactOutcome: 1, nextAction: 1, nextFollowUp: 1, firstContactCompletedAt: 1, createdAt: 1, updatedAt: 1 };
const pageSize = 25;
const literal = (term: string) => new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");

const columns = [
  ["Customer", "customer", 27], ["Phone", "phone", 19], ["Email", "email", 28], ["Address", "address", 32], ["Language", "language", 16],
  ["Record created (IST)", "createdAt", 22], ["Stage", "stage", 20], ["Status", "status", 24], ["Lead", "lead", 20], ["Source", "source", 16],
  ["Destination", "destination", 26], ["Travel date type", "dateMode", 18], ["From", "departure", 14], ["To", "returnDate", 14],
  ["Travel preference", "travelPreference", 32], ["Budget", "budget", 17], ["Budget basis", "budgetBasis", 18],
  ["Adults", "adults", 10], ["Children and ages", "childrenAges", 22], ["Infants", "infants", 10],
  ["Services", "services", 24], ["Who arranges services", "serviceResponsibility", 28], ["Hotel preference", "hotelPreference", 24], ["Rooms", "rooms", 16],
  ["Pickup", "pickup", 23], ["Drop-off", "dropoff", 23], ["Special requirements", "specialRequirements", 32], ["Last call outcome", "contactOutcome", 19],
  ["First contact (IST)", "firstContactAt", 22], ["Next action", "nextAction", 28], ["Follow-up (IST)", "nextFollowUp", 22], ["Latest activity (IST)", "lastActivityAt", 22], ["Last updated (IST)", "updatedAt", 22],
  ["Quote number", "quoteNumber", 21], ["Quote title", "quoteTitle", 28], ["Quote status", "quoteStatus", 21], ["Booking number", "bookingNumber", 21],
  ["Booking status", "bookingStatus", 24],
] as const;

const time = (value?: string) => indiaInput(value).replace("T", " ");
function outputRow(record: Document): Record<string, string | number | undefined> {
  const values = {
    ...record, ...record.customerRecord,
    customer: record.customerRecord?.name || "Customer unavailable",
    stage: record.stage === "Won" ? "Accepted" : record.stage,
    lead: record.leadRecord?.name || "",
    createdAt: time(record.createdAt), updatedAt: time(record.updatedAt),
    firstContactAt: time(record.firstContactCompletedAt), nextFollowUp: time(record.nextFollowUp),
    nextAction: displayedNextAction(record.nextAction, record.booking?.status),
    lastActivityAt: time(record.activityRecord?.createdAt),
    quoteNumber: record.quote?.quoteNumber, quoteTitle: record.quote?.content?.title, quoteStatus: record.quote?.status,
    bookingNumber: record.booking?.bookingNumber, bookingStatus: record.booking?.status,
  } as Record<string, string | number | undefined>;
  return {
    enquiryId: values.enquiryId,
    customerId: values.customerId,
    ...Object.fromEntries(columns.map(([, key]) => [key, values[key]])),
  };
}

function pipeline(actor: Actor, input: unknown, all: boolean) {
  if (actor.role === "operations") throw new Error("403: Customer reports are available to the Owner and Sales.");
  const f = filtersSchema.parse(all ? {} : input);
  if (f.from && f.to && f.from > f.to) throw new Error("Start date must be on or before the end date.");
  if ((f.stage && !registerStages.includes(f.stage)) || (f.status && !registerStatuses.includes(f.status)) ||
    (f.source && !registerSources.includes(f.source))) throw new Error("Choose a valid report filter.");
  if (actor.role === "sales" && f.staffId) throw new Error("403: Only the Owner can filter by staff.");
  const org = actor.org;
  const access = actor.role === "sales"
    ? { $or: [{ assigneeId: actor.id }, { createdById: actor.id }, { collaboratorIds: actor.id }] } : {};
  const dates = f.from || f.to ? { createdAt: {
    ...(f.from ? { $gte: new Date(`${f.from}T00:00:00+05:30`).toISOString() } : {}),
    ...(f.to ? { $lte: new Date(`${f.to}T23:59:59.999+05:30`).toISOString() } : {}),
  } } : {};
  const lookup = (from: string, localField: string, foreignField: string, as: string, projection: Document, sort?: Document): Document => ({
    $lookup: { from, localField, foreignField, as, pipeline: [
      { $match: { org } }, ...(sort ? [{ $sort: sort }] : []), { $limit: 1 }, { $project: projection },
    ] },
  });
  const stages: Document[] = [
    { $match: { org, ...access, ...dates, ...(f.staffId ? { assigneeId: f.staffId } : {}),
      ...(f.stage === "No enquiry" ? { _id: { $exists: false } } : f.stage === "Needs review" ? { reviewNeeded: true }
        : f.stage ? { stage: f.stage, reviewNeeded: { $ne: true } } : {}),
      ...(f.source ? { source: f.source } : {}), ...(f.destination ? { destination: literal(f.destination) } : {}),
    } },
    { $project: enquiryProjection },
    lookup("customers", "customerId", "_id", "customerRows", customerProjection),
    lookup("quotes", "_id", "enquiryId", "quoteRows", { quoteNumber: 1, status: 1, "content.title": 1 }, { quoteVersion: -1, updatedAt: -1, _id: -1 }),
    lookup("bookings", "_id", "enquiryId", "bookingRows", { bookingNumber: 1, status: 1 }, { createdAt: -1, _id: -1 }),
    { $set: {
      customerRecord: { $first: "$customerRows" }, quote: { $first: "$quoteRows" }, booking: { $first: "$bookingRows" },
      stage: { $cond: [{ $eq: ["$reviewNeeded", true] }, "Needs review", "$stage"] }, enquiryId: "$_id",
    } },
    { $unset: ["customerRows", "quoteRows", "bookingRows", "reviewNeeded"] },
  ];
  if (!f.source && !f.destination && (!f.stage || f.stage === "No enquiry")) {
    stages.push({ $unionWith: { coll: "customers", pipeline: [
      { $match: { org, ...dates, ...(actor.role === "sales" ? { assigneeId: actor.id } : f.staffId ? { assigneeId: f.staffId } : {}) } },
      { $lookup: { from: "enquiries", localField: "_id", foreignField: "customerId", as: "visibleEnquiries",
        pipeline: [{ $match: { org, ...access } }, { $limit: 1 }, { $project: { _id: 1 } }] } },
      { $match: { "visibleEnquiries.0": { $exists: false } } },
      { $project: { customerId: "$_id", assigneeId: 1, createdAt: 1, updatedAt: 1, stage: { $literal: "No enquiry" },
        customerRecord: { name: "$name", phone: "$phone", email: "$email", address: "$address", language: "$language" },
      } },
    ] } });
  }
  if (f.q) {
    const regex = literal(f.q);
    stages.push({ $match: { $or: [{ "customerRecord.name": regex }, { "customerRecord.phone": regex }, { "customerRecord.email": regex },
      { "booking.bookingNumber": regex }, { "quote.quoteNumber": regex }] } });
  }
  stages.push({ $set: { status: { $ifNull: ["$booking.status", "$quote.status", "No quote or booking"] } } });
  if (f.status) stages.push({ $match: { status: f.status } });
  return {
    stages, page: f.page,
    rowStages: [
      lookup("staff", "assigneeId", "_id", "leadRows", { name: 1 }),
      lookup("activity", "_id", "recordId", "activityRows", { createdAt: 1 }, { createdAt: -1, _id: -1 }),
      { $set: { leadRecord: { $first: "$leadRows" }, activityRecord: { $first: "$activityRows" } } },
      { $unset: ["leadRows", "activityRows"] },
    ] as Document[],
  };
}

export async function customerRegister(actor: Actor, input: unknown) {
  const { stages, page, rowStages } = pipeline(actor, input, false);
  const [result] = await (await collection("enquiries")).aggregate([
    ...stages, { $facet: { count: [{ $count: "total" }], rows: [
      { $sort: { createdAt: -1, _id: -1 } }, { $skip: (page - 1) * pageSize }, { $limit: pageSize }, ...rowStages,
    ] } },
  ], { allowDiskUse: true }).toArray();
  const rows: Document[] = result?.rows || [];
  return { page, pageSize, total: result?.count?.[0]?.total || 0, rows: rows.map(outputRow) };
}

const csvCell = (value: unknown) => {
  const str = String(value ?? "");
  const safe = /^\s*[=+\-@]|^[\t\r\n]/u.test(str) ? `'${str}` : str;
  return `"${safe.replaceAll('"', '""')}"`;
};

export async function exportCustomerRegister(actor: Actor, input: unknown, all: boolean, format: "csv" | "xlsx") {
  const { stages, rowStages } = pipeline(actor, input, all);
  const cursor = (await collection("enquiries")).aggregate([
    ...stages, { $sort: { createdAt: -1, _id: -1 } }, ...rowStages,
  ], { allowDiskUse: true, batchSize: 250 });
  if (format === "csv") {
    const records = async function* () {
      try {
        yield "\uFEFF" + columns.map(([header]) => csvCell(header)).join(",") + "\r\n";
        for await (const row of cursor) {
          const values = outputRow(row);
          yield columns.map(([, key]) => csvCell(values[key])).join(",") + "\r\n";
        }
      } finally { await cursor.close(); }
    };
    return Readable.from(records());
  }
  const stream = new PassThrough();
  const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({ stream, useStyles: true });
  stream.on("close", () => { void cursor.close(); });
  void (async () => {
    const create = (number: number) => {
      const worksheet = workbook.addWorksheet(number === 1 ? "Customer register" : `Register ${number}`, { views: [{ state: "frozen", ySplit: 1 }] });
      worksheet.columns = columns.map(([header, key, width]) => ({ header, key, width }));
      worksheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
      worksheet.getRow(1).font = { bold: true };
      worksheet.getRow(1).commit();
      return worksheet;
    };
    try {
      let page = 1, sheet = create(page), rowNumber = 1;
      for await (const row of cursor) {
        if (stream.destroyed) break;
        if (rowNumber === 1_048_576) { sheet.commit(); sheet = create(++page); rowNumber = 1; }
        sheet.addRow(outputRow(row)).commit();
        rowNumber++;
      }
      if (!stream.destroyed) { sheet.commit(); await workbook.commit(); }
    } catch (error) { stream.destroy(error as Error); }
    finally { await cursor.close(); }
  })();
  return stream;
}
