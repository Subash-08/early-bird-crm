import ExcelJS from "exceljs";
import { z } from "zod";
import type { Actor } from "@/lib/domain";
import { collection } from "./db";

const filterSchema = z.object({
  from: z.union([z.literal(""), z.iso.date()]).default(""),
  to: z.union([z.literal(""), z.iso.date()]).default(""),
  staffId: z.string().max(100).default(""),
  stage: z.string().max(80).default(""),
  source: z.string().max(80).default(""),
  destination: z.string().trim().max(120).default(""),
});
export type ReportFilters = z.infer<typeof filterSchema>;

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const dateRange = (field: string, filters: ReportFilters) => {
  if (!filters.from && !filters.to) return {};
  return {
    [field]: {
      ...(filters.from ? { $gte: `${filters.from}T00:00:00.000Z` } : {}),
      ...(filters.to ? { $lte: `${filters.to}T23:59:59.999Z` } : {}),
    },
  };
};
const groupCounts = async (name: string, match: object, field: string) =>
  (await collection(name))
    .aggregate([
      { $match: match },
      { $group: { _id: `$${field}`, count: { $sum: 1 } } },
      { $sort: { count: -1, _id: 1 } },
    ])
    .toArray();
const sum = (rows: any[], field: string) =>
  rows.reduce((total, row) => total + Number(row[field] || 0), 0);

export async function reportData(actor: Actor, input: unknown) {
  const filters = filterSchema.parse(input);
  const destination = filters.destination
    ? { destination: { $regex: escapeRegex(filters.destination), $options: "i" } }
    : {};
  const enquiryMatch = {
    org: actor.org,
    ...(actor.role === "owner" ? {} : actor.role === "sales" ? { assigneeId: actor.id } : { _id: "__none__" }),
    ...(actor.role === "owner" && filters.staffId ? { assigneeId: filters.staffId } : {}),
    ...(filters.stage ? { stage: filters.stage } : {}),
    ...(filters.source ? { source: filters.source } : {}),
    ...destination,
    ...dateRange("createdAt", filters),
  };
  const taskMatch = {
    org: actor.org,
    ...(actor.role === "owner" ? {} : { assigneeId: actor.id }),
    ...(actor.role === "owner" && filters.staffId ? { assigneeId: filters.staffId } : {}),
    ...dateRange("createdAt", filters),
  };
  const bookingMatch = {
    org: actor.org,
    ...(actor.role === "owner"
      ? {}
      : actor.role === "sales"
        ? { salesAssigneeId: actor.id }
        : { operationsReleased: true, operationsAssigneeIds: actor.id }),
    ...(actor.role === "owner" && filters.staffId ? { salesAssigneeId: filters.staffId } : {}),
    ...destination,
    ...dateRange("createdAt", filters),
  };
  const [staff, stages, sources, assignees, taskAssignees, bookings] = await Promise.all([
    (await collection("staff")).find({ org: actor.org }, { projection: { name: 1, role: 1, status: 1 } }).toArray(),
    groupCounts("enquiries", enquiryMatch, "stage"),
    groupCounts("enquiries", enquiryMatch, "source"),
    groupCounts("enquiries", enquiryMatch, "assigneeId"),
    groupCounts("tasks", taskMatch, "assigneeId"),
    (await collection("bookings"))
      .find(bookingMatch, {
        projection: {
          bookingNumber: 1,
          destination: 1,
          status: 1,
          currency: 1,
          totalMinor: 1,
          outstandingMinor: 1,
          serviceStart: 1,
          serviceEnd: 1,
          salesAssigneeId: 1,
        },
      })
      .sort({ serviceStart: 1 })
      .limit(5000)
      .toArray(),
  ]);
  const staffNames = Object.fromEntries(staff.map((person) => [person._id, person.name]));
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const inThirtyDays = new Date(now.getTime() + 30 * 86400000).toISOString().slice(0, 10);
  const [openTasks, overdueTasks, readinessPending, openIncidents, quoteTimes] = await Promise.all([
    (await collection("tasks")).countDocuments({ ...taskMatch, status: { $nin: ["Done", "Cancelled"] } }),
    (await collection("tasks")).countDocuments({ ...taskMatch, status: { $nin: ["Done", "Cancelled"] }, dueAt: { $lt: new Date().toISOString() } }),
    (await collection("readinessItems")).countDocuments({ org: actor.org, bookingId: { $in: bookings.map((booking) => booking._id) }, done: { $ne: true } }),
    (await collection("incidents")).countDocuments({ org: actor.org, bookingId: { $in: bookings.map((booking) => booking._id) }, status: { $ne: "Resolved" } }),
    actor.role === "operations"
      ? []
      : (await collection("quotes")).find(
          {
            org: actor.org,
            ...(actor.role === "sales" ? { assigneeId: actor.id } : {}),
            approvedAt: { $exists: true },
            requestedAt: { $exists: true },
          },
          { projection: { approvedAt: 1, requestedAt: 1 } },
        ).limit(5000).toArray(),
  ]);
  const turnaroundHours = quoteTimes
    .map((quote) => (new Date(quote.approvedAt).getTime() - new Date(quote.requestedAt).getTime()) / 3600000)
    .filter((hours) => Number.isFinite(hours) && hours >= 0);
  const result: any = {
    generatedAt: new Date().toISOString(),
    filters,
    definitions: {
      enquiries: "Enquiries created inside the selected date range.",
      conversion: "Won enquiries divided by all non-test enquiries in the same filtered cohort.",
      turnaround: "Hours from quotation request to Owner approval where both timestamps exist.",
      money: "Booking-currency minor units; currencies are never combined.",
    },
    pipeline: {
      total: sum(stages, "count"),
      won: Number(stages.find((row) => row._id === "Won")?.count || 0),
      byStage: stages.map((row) => ({ label: row._id || "Unknown", count: row.count })),
      bySource: sources.map((row) => ({ label: row._id || "Unknown", count: row.count })),
      byAssignee: assignees.map((row) => ({ label: staffNames[row._id] || "Unknown", count: row.count })),
      averageQuoteTurnaroundHours: turnaroundHours.length
        ? Math.round((turnaroundHours.reduce((a, b) => a + b, 0) / turnaroundHours.length) * 10) / 10
        : null,
    },
    workload: {
      openTasks,
      overdueTasks,
      readinessPending,
      openIncidents,
      byAssignee: taskAssignees.map((row) => ({ label: staffNames[row._id] || "Unknown", count: row.count })),
    },
    departures: bookings
      .filter((booking) => booking.serviceStart >= today && booking.serviceStart <= inThirtyDays)
      .slice(0, 100)
      .map((booking) => ({
        bookingNumber: booking.bookingNumber,
        destination: booking.destination,
        start: booking.serviceStart,
        end: booking.serviceEnd,
        status: booking.status,
        owner: staffNames[booking.salesAssigneeId] || "Unknown",
      })),
  };
  if (actor.role === "owner") {
    const bookingIds = bookings.map((booking) => booking._id);
    const [payments, invoices, entries] = await Promise.all([
      (await collection("payments")).find({ org: actor.org, bookingId: { $in: bookingIds }, status: "Verified" }, { projection: { bookingId: 1, amountMinor: 1 } }).toArray(),
      (await collection("invoices")).find({ org: actor.org, bookingId: { $in: bookingIds }, status: { $ne: "Void" } }, { projection: { bookingId: 1, totalMinor: 1, amountMinor: 1 } }).toArray(),
      (await collection("settlementEntries")).find({ org: actor.org, bookingId: { $in: bookingIds }, status: "Posted", kind: { $in: ["Supplier bill", "Supplier payment", "Refund approved", "Refund paid", "Recovery expected", "Recovery received", "Expense", "Expense paid"] } }, { projection: { bookingId: 1, kind: 1, baseMinor: 1 } }).toArray(),
    ]);
    const bookingById = Object.fromEntries(bookings.map((booking) => [booking._id, booking]));
    const currencies = [...new Set(bookings.map((booking) => booking.currency || "INR"))];
    result.finance = currencies.map((currency) => {
      const currencyBookings = bookings.filter((booking) => (booking.currency || "INR") === currency);
      const ids = new Set(currencyBookings.map((booking) => booking._id));
      const currencyPayments = payments.filter((row) => ids.has(row.bookingId));
      const currencyInvoices = invoices.filter((row) => ids.has(row.bookingId));
      const currencyEntries = entries.filter((row) => ids.has(row.bookingId) && bookingById[row.bookingId]);
      const byKind = (kind: string) => currencyEntries.filter((row) => row.kind === kind).reduce((total, row) => total + Number(row.baseMinor || 0), 0);
      return {
        currency,
        bookedMinor: currencyBookings.reduce((total, row) => total + Number(row.totalMinor || 0), 0),
        invoicedMinor: currencyInvoices.reduce((total, row) => total + Number(row.totalMinor || row.amountMinor || 0), 0),
        collectedMinor: currencyPayments.reduce((total, row) => total + Number(row.amountMinor || 0), 0),
        outstandingMinor: currencyBookings.reduce((total, row) => total + Number(row.outstandingMinor || 0), 0),
        supplierPayableMinor: Math.max(0, byKind("Supplier bill") + byKind("Expense") - byKind("Supplier payment") - byKind("Expense paid")),
        refundsPendingMinor: Math.max(0, byKind("Refund approved") - byKind("Refund paid")),
        recoveriesPendingMinor: Math.max(0, byKind("Recovery expected") - byKind("Recovery received")),
      };
    });
  }
  return result;
}

const safeCell = (value: unknown) => {
  const text = String(value ?? "");
  return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
};
export function reportRows(report: any) {
  const rows: Record<string, string | number>[] = [];
  const add = (section: string, metric: string, value: string | number, dimension = "", currency = "") =>
    rows.push({ Section: section, Metric: metric, Dimension: dimension, Value: value, Currency: currency, GeneratedAt: report.generatedAt });
  add("Pipeline", "Total enquiries", report.pipeline.total);
  add("Pipeline", "Won enquiries", report.pipeline.won);
  add("Pipeline", "Conversion percent", report.pipeline.total ? Math.round((report.pipeline.won / report.pipeline.total) * 1000) / 10 : 0);
  add("Pipeline", "Average quote turnaround hours", report.pipeline.averageQuoteTurnaroundHours ?? "Unavailable");
  for (const item of report.pipeline.byStage) add("Pipeline by stage", "Enquiries", item.count, item.label);
  for (const item of report.pipeline.bySource) add("Pipeline by source", "Enquiries", item.count, item.label);
  for (const item of report.pipeline.byAssignee) add("Pipeline by staff", "Enquiries", item.count, item.label);
  add("Workload", "Open tasks", report.workload.openTasks);
  add("Workload", "Overdue tasks", report.workload.overdueTasks);
  add("Operations", "Readiness items pending", report.workload.readinessPending);
  add("Operations", "Open incidents", report.workload.openIncidents);
  for (const item of report.departures) add("Departure", `${item.bookingNumber} · ${item.destination}`, item.start, item.owner);
  for (const item of report.finance || []) {
    for (const [metric, value] of Object.entries(item)) if (metric !== "currency") add("Finance", metric, Number(value) / 100, "", item.currency);
  }
  return rows.map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, typeof value === "string" ? safeCell(value) : value])));
}

export function reportCsv(report: any) {
  const rows = reportRows(report);
  const headers = Object.keys(rows[0] || { Section: "" });
  const quote = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  return [headers.map(quote).join(","), ...rows.map((row) => headers.map((header) => quote(row[header])).join(","))].join("\r\n");
}

export async function reportXlsx(report: any) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "EarlyBird Travel CRM";
  workbook.created = new Date(report.generatedAt);
  const sheet = workbook.addWorksheet("CRM report", { views: [{ state: "frozen", ySplit: 1 }] });
  const rows = reportRows(report);
  const headers = Object.keys(rows[0] || { Section: "" });
  sheet.columns = headers.map((header) => ({ header, key: header, width: header === "Metric" ? 34 : 22 }));
  sheet.addRows(rows);
  sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF12637D" } };
  sheet.autoFilter = { from: "A1", to: `${String.fromCharCode(64 + headers.length)}1` };
  return Buffer.from(await workbook.xlsx.writeBuffer());
}
