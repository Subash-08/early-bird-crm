import { z } from "zod";
import type { ClientSession } from "mongodb";
import { collection, client, db, type Row } from "./db";
import {
  type Actor,
  customerSchema,
  enquirySchema,
  normalizePhone,
  canAccess,
  canWorkEnquiry,
  enquiryMembership,
  taskStates,
  roles,
} from "@/lib/domain";
import { issueToken } from "./auth";
import { publicQuoteForRole } from "@/lib/quote-domain";
import { publicBookingForRole } from "@/lib/booking-domain";
import { publicArrangementForRole } from "@/lib/operations-domain";
import { defaultInvoiceTemplate } from "@/lib/invoice-domain";
import { bookingCreationActions, bookingNextAction } from "@/lib/booking-next-action";
export function owner(a: Actor) {
  if (a.role !== "owner") throw new Error("403: Owner access required.");
}
const now = () => new Date().toISOString();
const id = () => crypto.randomUUID();
export async function audit(
  a: Actor,
  recordId: string,
  event: string,
  s?: ClientSession,
) {
  await (
    await collection("activity")
  ).insertOne(
    {
      _id: id(),
      org: a.org,
      version: 1,
      recordId,
      actor: a.name,
      event,
      createdAt: now(),
    },
    { session: s },
  );
}
export async function notify(
  a: Actor,
  recipient: string,
  key: string,
  title: string,
  recordId: string,
  s?: ClientSession,
) {
  await (
    await collection("notifications")
  ).updateOne(
    { _id: key },
    {
      $setOnInsert: {
        org: a.org,
        version: 1,
        recipient,
        title,
        recordId,
        read: false,
        createdAt: now(),
      },
    },
    { upsert: true, session: s },
  );
}
export async function transact<T>(f: (s: ClientSession) => Promise<T>) {
  const s = (await client()).startSession();
  try {
    return await s.withTransaction(() => f(s));
  } finally {
    await s.endSession();
  }
}
export async function assigned(
  a: Actor,
  staffId: string,
  s?: ClientSession,
  lead = false,
) {
  const p = await (
    await collection("staff")
  ).findOne({ _id: staffId, org: a.org, status: "active" }, { session: s });
  if (!p || (lead && p.role === "operations"))
    throw new Error("Choose an active owner or sales assignee.");
  return p;
}
export async function customerAllowed(
  a: Actor,
  cid: string,
  s?: ClientSession,
  sharedRead = false,
) {
  if (a.role === "operations")
    throw new Error(
      "403: Customer access is not available to operations in Phase 1.",
    );
  const c = await (
    await collection("customers")
  ).findOne({ _id: cid, org: a.org }, { session: s });
  if (!c) throw new Error("404: Customer not found.");
  if (
    a.role !== "owner" &&
    c.assigneeId !== a.id &&
    !(await (
      await collection("enquiries")
    ).findOne(
      { org: a.org, customerId: cid, ...(sharedRead ? enquiryMembership(a.id) : { assigneeId: a.id }) },
      { session: s },
    ))
  )
    throw new Error("403: Customer is not assigned to you.");
  return c;
}

export async function searchCustomers(a: Actor, input: unknown) {
  if (a.role === "operations") throw new Error("403: Not permitted.");
  const { query, limit } = z
    .object({
      query: z.string().trim().min(2).max(80),
      limit: z.number().int().min(1).max(20).default(20),
    })
    .parse(input);
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const matcher = { $regex: escaped, $options: "i" };
  const access =
    a.role === "owner"
      ? {}
      : {
          $or: [
            { assigneeId: a.id },
            {
              _id: {
                $in: await (await collection("enquiries")).distinct(
                  "customerId",
                  { org: a.org, ...enquiryMembership(a.id) },
                ),
              },
            },
          ],
        };
  return (await collection("customers"))
    .find(
      {
        org: a.org,
        ...access,
        $and: [
          {
            $or: [
              { name: matcher },
              { email: matcher },
              { phone: matcher },
            ],
          },
        ],
      },
      { projection: { name: 1, phone: 1, email: 1, assigneeId: 1 } },
    )
    .sort({ name: 1 })
    .limit(limit)
    .toArray();
}

export async function customerDetail(a: Actor, customerId: string) {
  const { pan, passportNumber, ...customer } = await customerAllowed(a, customerId, undefined, true);
  const assignedFilter = a.role === "owner" ? {} : { assigneeId: a.id };
  const salesBookingFilter = a.role === "owner" ? {} : { salesAssigneeId: a.id };
  const [enquiries, quotes, bookings, tasks] = await Promise.all([
    (await collection("enquiries")).find(
      { org: a.org, customerId, ...(a.role === "owner" ? {} : enquiryMembership(a.id)) },
    ).sort({ updatedAt: -1 }).limit(50).toArray(),
    (await collection("quotes")).find(
      { org: a.org, customerId, ...assignedFilter },
    ).sort({ updatedAt: -1 }).limit(50).toArray(),
    (await collection("bookings")).find(
      { org: a.org, customerId, ...salesBookingFilter },
    ).sort({ updatedAt: -1 }).limit(50).toArray(),
    (await collection("tasks")).find(
      { org: a.org, customerId, ...assignedFilter },
    ).sort({ dueAt: -1 }).limit(50).toArray(),
  ]);
  const bookingIds = bookings.map((booking) => booking._id);
  const invoices = bookingIds.length
    ? await (await collection("invoices")).find(
        { org: a.org, bookingId: { $in: bookingIds } },
        { projection: { bytes: 0 } },
      ).sort({ createdAt: -1 }).limit(100).toArray()
    : [];
  return {
    actor: a,
    customer: { ...customer, panOnFile: Boolean(pan), passportOnFile: Boolean(passportNumber) },
    enquiries,
    quotes: quotes.map((quote) => publicQuoteForRole(quote, a.role)),
    bookings: bookings.map((booking) => publicBookingForRole(booking, a.role)),
    tasks,
    invoices,
  };
}

export async function customerEdit(a: Actor, customerId: string) {
  const customer = await customerAllowed(a, customerId);
  const { name, phone, email, address, language, notes, reviewNeeded, pan, passportNumber, version } = customer;
  return { name, phone, email, address, language, notes, reviewNeeded, pan, passportNumber, version };
}
export type WorkspaceScope =
  | "all" | "shell" | "dashboard" | "enquiries" | "customers" | "quotations"
  | "bookings" | "operations" | "settlements" | "tasks" | "notifications"
  | "reports" | "imports" | "invoice-settings" | "staff" | "attendance";

export type WorkspaceListQuery = {
  page?: number;
  pageSize?: number;
  query?: string;
  status?: string;
  assigneeId?: string;
  from?: string;
  to?: string;
};

const escapedRegex = (value = "") =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export async function snapshot(
  a: Actor,
  scope: WorkspaceScope = "all",
  input: WorkspaceListQuery = {},
) {
  const page = Math.max(1, Math.floor(Number(input.page) || 1));
  const pageSize = Math.min(50, Math.max(10, Math.floor(Number(input.pageSize) || 20)));
  const query = String(input.query || "").trim().slice(0, 80);
  const status = String(input.status || "").trim().slice(0, 80);
  const assigneeId = String(input.assigneeId || "").trim().slice(0, 100);
  const from = /^\d{4}-\d{2}-\d{2}$/.test(String(input.from || "")) ? String(input.from) : "";
  const to = /^\d{4}-\d{2}-\d{2}$/.test(String(input.to || "")) ? String(input.to) : "";
  const matcher = query ? { $regex: escapedRegex(query), $options: "i" } : null;
  const dateRange = (field: string, dateOnly = false) =>
    from || to
      ? {
          [field]: {
            ...(from ? { $gte: dateOnly ? from : `${from}T00:00:00.000Z` } : {}),
            ...(to ? { $lte: dateOnly ? to : `${to}T23:59:59.999Z` } : {}),
          },
        }
      : {};
  let pagination = { page, pageSize, total: 0, totalPages: 1 };
  const setPagination = (total: number) => {
    pagination = {
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  };
  const needs = (...values: WorkspaceScope[]) => scope === "all" || values.includes(scope);
  const needBookings = needs("bookings", "operations", "settlements");
  const needPayments = needs("bookings");
  const needInvoices = needs("bookings");
  const needOperations = needs("operations");
  const needSettlementLinks = needs("operations", "settlements");
  const needEnquiries = needs("dashboard", "enquiries", "quotations");
  const needCustomers = needs("customers", "enquiries", "quotations");
  const needTasks = needs("dashboard", "tasks");
  const needQuotes = needs("quotations", "bookings");
  const needNotificationRows = needs("dashboard", "notifications");
  const bookingAccess =
    a.role === "owner"
      ? { org: a.org }
      : a.role === "sales"
        ? { org: a.org, salesAssigneeId: a.id }
        : { org: a.org, operationsReleased: true, operationsAssigneeIds: a.id };
  const bookingIsPrimary = ["bookings", "operations", "settlements"].includes(scope);
  const bookingFilter = {
    ...bookingAccess,
    ...(scope === "operations" ? { operationsReleased: true } : {}),
    ...(bookingIsPrimary && status ? { status } : {}),
    ...(bookingIsPrimary && assigneeId && a.role === "owner"
      ? { $or: [{ salesAssigneeId: assigneeId }, { operationsAssigneeIds: assigneeId }] }
      : {}),
    ...(bookingIsPrimary ? dateRange("serviceStart", true) : {}),
    ...(bookingIsPrimary && matcher
      ? { $and: [{ $or: [{ bookingNumber: matcher }, { destination: matcher }, { status: matcher }] }] }
      : {}),
  };
  if (needBookings && bookingIsPrimary)
    setPagination(await (await collection("bookings")).countDocuments(bookingFilter));
  const bookings = needBookings ? (
    await (
      await collection("bookings")
    )
      .find(bookingFilter)
      .sort({ updatedAt: -1 })
      .skip(bookingIsPrimary ? (page - 1) * pageSize : 0)
      .limit(bookingIsPrimary ? pageSize : 100)
      .toArray()
  ).map((booking) => publicBookingForRole(booking, a.role)) : [];
  const bookingIds = bookings.map((booking) => booking._id);
  const phase3 = {
    bookings,
    payments:
      !needPayments || a.role === "operations"
        ? []
        : await (
            await collection("payments")
          )
            .find(
              { org: a.org, bookingId: { $in: bookingIds } },
              { projection: { referenceKey: 0 } },
            )
            .sort({ createdAt: -1 })
            .toArray(),
    invoices:
      !needInvoices || a.role === "operations"
        ? []
        : await (
            await collection("invoices")
          )
            .find({ org: a.org, bookingId: { $in: bookingIds } })
            .sort({ createdAt: -1 })
            .toArray(),
  };
  const tripSegments = needSettlementLinks ? await (
    await collection("tripSegments")
  )
    .find({
      org: a.org,
      bookingId: { $in: bookingIds },
      ...(a.role === "operations" ? { driverId: a.id } : {}),
    })
    .sort({ startAt: 1 })
    .toArray() : [];
  const vehicleIds = [
    ...new Set(
      tripSegments.map((segment) => segment.vehicleId).filter(Boolean),
    ),
  ];
  const phase4 = {
    suppliers:
      !needOperations || a.role === "operations"
        ? []
        : await (
            await collection("suppliers")
          )
            .find({ org: a.org })
            .sort({ name: 1 })
            .limit(1000)
            .toArray(),
    vehicles: needOperations ? await (
      await collection("vehicles")
    )
      .find({
        org: a.org,
        ...(a.role === "operations" ? { _id: { $in: vehicleIds } } : {}),
      })
      .sort({ label: 1 })
      .limit(1000)
      .toArray() : [],
    arrangements: needSettlementLinks ? (
      await (
        await collection("arrangements")
      )
        .find({ org: a.org, bookingId: { $in: bookingIds } })
        .sort({ startAt: 1 })
        .limit(2000)
        .toArray()
    ).map((record) => publicArrangementForRole(record, a.role)) : [],
    tripSegments,
    readinessItems: needOperations ? await (
      await collection("readinessItems")
    )
      .find({ org: a.org, bookingId: { $in: bookingIds } })
      .sort({ label: 1 })
      .limit(2000)
      .toArray() : [],
    incidents: needOperations ? await (
      await collection("incidents")
    )
      .find({
        org: a.org,
        bookingId: { $in: bookingIds },
        ...(a.role === "operations"
          ? {
              $or: [
                { reportedById: a.id },
                {
                  segmentId: {
                    $in: tripSegments.map((segment) => segment._id),
                  },
                },
              ],
            }
          : {}),
      })
      .sort({ reportedAt: -1 })
      .limit(1000)
      .toArray() : [],
    collectionReports: needOperations ? await (
      await collection("collectionReports")
    )
      .find({
        org: a.org,
        bookingId: { $in: bookingIds },
        ...(a.role === "operations" ? { reportedById: a.id } : {}),
      })
      .sort({ createdAt: -1 })
      .limit(1000)
      .toArray() : [],
    operationsDocuments: needOperations ? await (
      await collection("operationsDocuments")
    )
      .find(
        {
          org: a.org,
          bookingId: { $in: bookingIds },
          ...(a.role === "operations"
            ? { kind: "Driver trip sheet", driverId: a.id }
            : {}),
        },
        { projection: { bytes: 0, snapshot: 0 } },
      )
      .sort({ createdAt: -1 })
      .limit(1000)
      .toArray() : [],
    travelDocuments:
      !needOperations || a.role === "operations"
        ? []
        : await (
            await collection("travelDocuments")
          )
            .find(
              { org: a.org, bookingId: { $in: bookingIds } },
              { projection: { bytes: 0 } },
            )
            .sort({ createdAt: -1 })
            .limit(1000)
            .toArray(),
    operationsRequests: needSettlementLinks ? await (
      await collection("operationsRequests")
    )
      .find(
        {
          org: a.org,
          bookingId: { $in: bookingIds },
          ...(a.role === "operations" ? { submittedById: a.id } : {}),
        },
        { projection: { evidenceBytes: 0 } },
      )
      .sort({ createdAt: -1 })
      .limit(1000)
      .toArray() : [],
  };
  const enquiryIsPrimary = scope === "enquiries";
  const matchingCustomerIds = enquiryIsPrimary && matcher
    ? await (await collection("customers")).find(
        { org: a.org, $or: [{ name: matcher }, { phone: matcher }, { email: matcher }] },
        { projection: { _id: 1 } },
      ).limit(100).map((row) => row._id).toArray()
    : [];
  const enquiryFilter = {
    org: a.org,
    ...(a.role === "owner" ? {} : enquiryMembership(a.id)),
    ...(enquiryIsPrimary && status ? { stage: status } : {}),
    ...(enquiryIsPrimary && assigneeId && a.role === "owner" ? { assigneeId } : {}),
    ...(enquiryIsPrimary ? dateRange("updatedAt") : {}),
    ...(enquiryIsPrimary && matcher
      ? { $and: [{ $or: [{ destination: matcher }, { source: matcher }, { stage: matcher }, { customerId: { $in: matchingCustomerIds } }] }] }
      : {}),
  };
  if (needEnquiries && enquiryIsPrimary)
    setPagination(await (await collection("enquiries")).countDocuments(enquiryFilter));
  let enqs = needEnquiries ? await (
    await collection("enquiries")
  )
    .find(enquiryFilter)
    .sort({ updatedAt: -1 })
    .skip(enquiryIsPrimary ? (page - 1) * pageSize : 0)
    .limit(enquiryIsPrimary ? pageSize : scope === "dashboard" ? 100 : 200)
    .toArray() : [];
  const customerIsPrimary = scope === "customers";
  const customerAccess = a.role === "owner"
    ? {}
    : {
        $or: [
          { assigneeId: a.id },
          { _id: { $in: customerIsPrimary
            ? await (await collection("enquiries")).distinct("customerId", { org: a.org, ...enquiryMembership(a.id) })
            : enqs.map((x) => x.customerId) } },
        ],
      };
  const customerFilter = {
    org: a.org,
    ...customerAccess,
    ...(!customerIsPrimary && ["enquiries", "quotations", "notifications"].includes(scope)
      ? { _id: { $in: enqs.map((item) => item.customerId) } }
      : {}),
    ...(customerIsPrimary && status === "Needs review" ? { reviewNeeded: true } : {}),
    ...(customerIsPrimary && status === "Ready" ? { reviewNeeded: { $ne: true } } : {}),
    ...(customerIsPrimary && assigneeId && a.role === "owner" ? { assigneeId } : {}),
    ...(customerIsPrimary ? dateRange("updatedAt") : {}),
    ...(customerIsPrimary && matcher
      ? { $and: [{ $or: [{ name: matcher }, { phone: matcher }, { email: matcher }] }] }
      : {}),
  };
  if (needCustomers && customerIsPrimary)
    setPagination(await (await collection("customers")).countDocuments(customerFilter));
  let customers =
    !needCustomers || a.role === "operations"
      ? []
      : await (
          await collection("customers")
        )
          .find(customerFilter, { projection: { pan: 0, passportNumber: 0 } })
          .sort({ name: 1 })
          .skip(customerIsPrimary ? (page - 1) * pageSize : 0)
          .limit(customerIsPrimary ? pageSize : 250)
          .toArray();
  const taskIsPrimary = scope === "tasks";
  const taskFilter = {
    org: a.org,
    ...(a.role === "owner" ? {} : { assigneeId: a.id }),
    ...(taskIsPrimary && status ? { status } : {}),
    ...(taskIsPrimary && assigneeId && a.role === "owner" ? { assigneeId } : {}),
    ...(taskIsPrimary ? dateRange("dueAt") : {}),
    ...(taskIsPrimary && matcher ? { $and: [{ $or: [{ title: matcher }, { note: matcher }] }] } : {}),
  };
  if (needTasks && taskIsPrimary)
    setPagination(await (await collection("tasks")).countDocuments(taskFilter));
  const tasks = needTasks ? await (
    await collection("tasks")
  )
    .find(taskFilter)
    .sort({ dueAt: 1 })
    .skip(taskIsPrimary ? (page - 1) * pageSize : 0)
    .limit(taskIsPrimary ? pageSize : 100)
    .toArray() : [];
  const quoteIsPrimary = scope === "quotations";
  const teamEnquiryIds = a.role === "sales" && quoteIsPrimary ? await (await collection("enquiries"))
    .distinct("_id", { org: a.org, $or: [{ createdById: a.id }, { collaboratorIds: a.id }] }) : [];
  const quoteFilter = {
    org: a.org,
    ...(a.role === "owner" ? {} : teamEnquiryIds.length ? { $or: [{ assigneeId: a.id }, { enquiryId: { $in: teamEnquiryIds } }] } : { assigneeId: a.id }),
    ...(quoteIsPrimary && status ? { status } : {}),
    ...(quoteIsPrimary && assigneeId && a.role === "owner" ? { assigneeId } : {}),
    ...(quoteIsPrimary ? dateRange("updatedAt") : {}),
    ...(quoteIsPrimary && matcher
      ? { $and: [{ $or: [{ quoteNumber: matcher }, { status: matcher }, { "content.title": matcher }] }] }
      : {}),
  };
  if (needQuotes && quoteIsPrimary)
    setPagination(await (await collection("quotes")).countDocuments(quoteFilter));
  const quotes =
    !needQuotes || a.role === "operations"
      ? []
      : (
          await (
            await collection("quotes")
          )
            .find(quoteFilter)
            .sort({ updatedAt: -1 })
            .skip(quoteIsPrimary ? (page - 1) * pageSize : 0)
            .limit(quoteIsPrimary ? pageSize : scope === "bookings" ? 100 : 200)
            .toArray()
        ).map((q) => publicQuoteForRole(q, a.role));
  if (scope === "quotations" && quotes.length) {
    const knownEnquiries = new Set(enqs.map((item) => item._id));
    const missingEnquiryIds = quotes.map((item) => item.enquiryId).filter((item) => item && !knownEnquiries.has(item));
    if (missingEnquiryIds.length) {
      const related = await (await collection("enquiries")).find({
        org: a.org,
        _id: { $in: missingEnquiryIds },
        ...(a.role === "owner" ? {} : enquiryMembership(a.id)),
      }).toArray();
      enqs = [...enqs, ...related];
    }
    const knownCustomers = new Set(customers.map((item) => item._id));
    const missingCustomerIds = quotes.map((item) => item.customerId).filter((item) => item && !knownCustomers.has(item));
    if (missingCustomerIds.length) {
      const related = await (await collection("customers")).find({
        org: a.org,
        _id: { $in: missingCustomerIds },
        ...(a.role === "owner" ? {} : { assigneeId: a.id }),
      }, { projection: { pan: 0, passportNumber: 0 } }).toArray();
      customers = [...customers, ...related];
    }
  }
  return {
    actor: a,
    enquiries: enqs,
    customers,
    tasks,
    quotes,
    ...phase3,
    ...phase4,
    quoteTemplates:
      a.role !== "operations" && needs("quotations")
        ? await (
            await collection("quoteTemplates")
          )
            .find({ org: a.org, active: true }, { projection: { name: 1, active: 1 } })
            .sort({ name: 1 })
            .limit(100)
            .toArray()
        : [],
    staff: await (
      await collection("staff")
    )
      .find(
        { org: a.org, ...(a.role === "owner" ? {} : { status: "active" }) },
        {
          projection:
            a.role === "owner"
              ? { authId: 0 }
              : { name: 1, role: 1, status: 1 },
        },
      )
      .toArray(),
    notificationUnread: await (await collection("notifications")).countDocuments({
      org: a.org,
      recipient: a.id,
      read: { $ne: true },
    }),
    notifications: needNotificationRows ? await (async () => {
      const notificationFilter = {
        org: a.org,
        recipient: a.id,
        ...(scope === "notifications" && status === "Unread" ? { read: { $ne: true } } : {}),
        ...(scope === "notifications" && status === "Read" ? { read: true } : {}),
        ...(scope === "notifications" ? dateRange("createdAt") : {}),
        ...(scope === "notifications" && matcher ? { title: matcher } : {}),
      };
      if (scope === "notifications")
        setPagination(await (await collection("notifications")).countDocuments(notificationFilter));
      return (
      await collection("notifications")
    )
      .find(notificationFilter)
      .sort({ createdAt: -1 })
      .skip(scope === "notifications" ? (page - 1) * pageSize : 0)
      .limit(scope === "notifications" ? pageSize : 20)
      .toArray();
    })() : [],
    activity: [],
    settings: needs("staff") ? await (async () => {
      const value = await (await collection("settings")).findOne({ _id: a.org });
      return value
        ? { contactHours: value.contactHours, escalateHours: value.escalateHours }
        : null;
    })() : null,
    invoiceTemplate:
      a.role === "owner" && needs("invoice-settings", "bookings")
        ? {
            ...defaultInvoiceTemplate,
            ...((await (
              await collection("invoiceTemplates")
            ).findOne({ org: a.org, active: true })) || {}),
          }
        : null,
    imports:
      a.role === "owner" && needs("imports")
        ? await (
            await collection("importBatches")
          )
            .find({ org: a.org }, { projection: { rows: 0 } })
            .sort({ createdAt: -1 })
            .limit(50)
            .toArray()
        : [],
    pagination,
    limited: false,
    scope,
  };
}
export async function saveCustomer(
  a: Actor,
  input: unknown,
  recordId?: string,
  version?: number,
) {
  if (a.role === "operations") throw new Error("403: Not permitted.");
  const p = customerSchema.parse(input);
  p.phone = normalizePhone(p.phone);
  if (!p.phone && !p.email && !p.reviewNeeded)
    throw new Error("Provide phone or email.");
  if (p.reviewNeeded) owner(a);
  const dup = await (
    await collection("customers")
  ).findOne({
    org: a.org,
    ...(recordId ? { _id: { $ne: recordId } } : {}),
    $or: [
      ...(p.phone ? [{ phone: p.phone }] : []),
      ...(p.email ? [{ email: p.email.toLowerCase() }] : []),
      { name: p.name, phone: p.phone, email: p.email },
    ],
  });
  if (dup && !p.duplicateConfirmed)
    throw new Error(
      "A possible duplicate exists. Review the customer list, or confirm this is a separate person.",
    );
  return transact(async (s) => {
    const c = await collection("customers");
    const { _id: cid } = recordId
      ? await customerAllowed(a, recordId, s)
      : { _id: id() };
    const { duplicateConfirmed: _, ...fields } = p;
    void _;
    if (recordId) {
      const r = await c.updateOne(
        { _id: cid, org: a.org, version },
        {
          $set: { ...fields, email: p.email.toLowerCase(), updatedAt: now() },
          $inc: { version: 1 },
        },
        { session: s },
      );
      if (!r.matchedCount)
        throw new Error("409: Record changed. Refresh before saving.");
    } else
      await c.insertOne(
        {
          _id: cid,
          org: a.org,
          version: 1,
          ...fields,
          email: p.email.toLowerCase(),
          assigneeId: a.id,
          createdAt: now(),
          updatedAt: now(),
        },
        { session: s },
      );
    await audit(a, cid, recordId ? "Customer updated" : "Customer created", s);
    return cid;
  });
}
export async function syncFollowUp(a: Actor, e: Row, s: ClientSession) {
  const tasks = await collection("tasks");
  const tid = `follow:${e._id}`;
  if (["Lost", "Won"].includes(e.stage) || e.reviewNeeded) {
    await tasks.updateOne(
      { _id: tid, org: a.org, status: { $in: ["To do", "In progress", "Waiting"] } },
      { $set: { status: "Cancelled" }, $inc: { version: 1 } },
      { session: s },
    );
    return;
  }
  const settings = await (
    await collection("settings")
  ).findOne({ _id: a.org }, { session: s });
  const contactDue = new Date(
    new Date(e.firstContactAt).getTime() +
      (settings?.contactHours || 4) * 3600000,
  ).toISOString();
  const due = e.nextFollowUp || (!e.firstContactCompletedAt ? contactDue : null);
  if (!due) {
    await tasks.updateOne(
      { _id: tid, org: a.org, status: { $in: ["To do", "In progress", "Waiting"] } },
      { $set: { status: "Done" }, $inc: { version: 1 } },
      { session: s },
    );
    return;
  }
  const old = await tasks.findOne({ _id: tid }, { session: s });
  if (!e.nextFollowUp && old?.status === "Done") return;
  const changed =
    !old ||
    old.dueAt !== due ||
    old.assigneeId !== e.assigneeId ||
    ["Done", "Cancelled"].includes(old.status);
  const status = e.stage === "On hold" ? "Waiting" : changed || old?.status === "Waiting" ? "To do" : old?.status;
  const title = e.nextFollowUp ? e.nextAction : "Contact customer";
  if (old && !changed && old.status === status && old.title === title && old.customerId === e.customerId) return;
  await tasks.updateOne(
    { _id: tid },
    {
      $set: {
        org: a.org,
        assigneeId: e.assigneeId,
        enquiryId: e._id,
        customerId: e.customerId,
        title,
        dueAt: due,
        status,
        updatedAt: now(),
      },
      $setOnInsert: { createdAt: now() },
      $inc: { version: 1 },
    },
    { upsert: true, session: s },
  );
  if (changed)
    await notify(
      a,
      e.assigneeId,
      `follow:${e._id}:${e.version}`,
      e.nextFollowUp ? "Follow-up scheduled" : "Enquiry assigned",
      e._id,
      s,
    );
}
export async function enquiryActivity(a: Actor, enquiryId: string) {
  if (a.role === "operations") throw new Error("403: Not permitted.");
  const enquiry = await (await collection("enquiries")).findOne({ _id: enquiryId, org: a.org });
  if (!enquiry || !canWorkEnquiry(a, enquiry)) throw new Error("404: Enquiry not found.");
  const [events, followUp, customer, quotes] = await Promise.all([
    (await collection("activity")).find({ org: a.org, recordId: enquiryId }, { projection: { actor: 1, event: 1, createdAt: 1 } }).sort({ createdAt: -1, _id: -1 }).limit(30).toArray(),
    (await collection("tasks")).findOne({ org: a.org, _id: `follow:${enquiryId}` }, { projection: { status: 1, title: 1, dueAt: 1 } }),
    (await collection("customers")).findOne({ org: a.org, _id: enquiry.customerId }, { projection: { name: 1, phone: 1, email: 1 } }),
    (await collection("quotes")).find({ org: a.org, enquiryId }, { projection: { quoteNumber: 1, quoteVersion: 1, status: 1, pdfStatus: 1 } }).sort({ updatedAt: -1 }).limit(12).toArray(),
  ]);
  const booking = await (await collection("bookings")).findOne(
    { org: a.org, enquiryId }, { projection: { bookingNumber: 1, status: 1 }, sort: { createdAt: -1, _id: -1 } },
  );
  const safeEnquiry = booking && bookingCreationActions.includes(enquiry.nextAction) ? { ...enquiry, nextAction: "" } : enquiry;
  return { enquiry: safeEnquiry, customer, events, followUp, quotes, booking, bookingNextAction: bookingNextAction(booking?.status) };
}

export async function saveEnquiry(
  a: Actor,
  input: unknown,
  recordId?: string,
  version?: number,
  logContact = false,
) {
  if (a.role === "operations") throw new Error("403: Not permitted.");
  const p = enquirySchema.parse(input);
  if (logContact && (p.reviewNeeded || p.contactOutcome === "Not contacted"))
    throw new Error("Choose Connected, No answer, or Call back to log a contact attempt.");
  if (p.reviewNeeded) owner(a);
  return transact(async (s) => {
    const c = await collection("enquiries");
    const previous = recordId
      ? await c.findOne({ _id: recordId, org: a.org }, { session: s })
      : null;
    if (recordId && !previous) throw new Error("404: Enquiry not found.");
    if (previous && !canWorkEnquiry(a, previous))
      throw new Error("403: Enquiry not assigned to you.");
    const canHandoff = !previous || a.role === "owner" || previous.createdById === a.id;
    const oldMembers: string[] = Array.isArray(previous?.collaboratorIds) ? previous.collaboratorIds : [];
    const members = [...new Set(p.collaboratorIds ?? oldMembers)].filter((person) => person !== p.assigneeId);
    if (!canHandoff && (p.assigneeId !== previous?.assigneeId || oldMembers.some((person) => !members.includes(person))))
      throw new Error("403: Only the Owner or creator can change the lead or remove team members.");
    if (previous?.reviewNeeded && a.role !== "owner")
      throw new Error("403: Ask the Owner to review and activate this imported enquiry first.");
    if (
      ["Quote requested", "Quote sent", "Won"].includes(p.stage) &&
      p.stage !== previous?.stage
    )
      throw new Error(
        "Use the quotation workflow to set Quote requested, Quote sent or Won.",
      );
    if (
      previous &&
      ["Quote requested", "Quote sent", "Won"].includes(previous.stage) &&
      !["Quote requested", "Quote sent", "Won", "Lost", "On hold"].includes(
        p.stage,
      )
    )
      throw new Error(
        "Use the quotation workflow to move an enquiry backwards after a quote exists.",
      );
    if (!previous || p.customerId !== previous.customerId) await customerAllowed(a, p.customerId, s, true);
    await assigned(a, p.assigneeId, s, true);
    const added = members.filter((person) => !oldMembers.includes(person));
    for (const person of added) await assigned(a, person, s, true);
    const changedLead = previous?.assigneeId !== p.assigneeId;
    if (logContact && p.nextFollowUp === previous?.nextFollowUp) {
      p.nextFollowUp = "";
      if (p.stage !== "On hold") p.nextAction = "";
      else throw new Error("Choose a new follow-up date before logging this call on an enquiry on hold.");
    }
    const eid = recordId || id();
    const e: Row = {
      ...previous,
      ...p,
      collaboratorIds: members,
      ...(previous ? {} : { createdById: a.id }),
      ...(previous && changedLead ? { acknowledgedAt: null } : {}),
      ...(logContact ? { firstContactCompletedAt: previous?.firstContactCompletedAt || now() } : {}),
      _id: eid,
      org: a.org,
      version: previous ? previous.version + 1 : 1,
      createdAt: previous?.createdAt || now(),
      updatedAt: now(),
    };
    if (previous) {
      const r = await c.replaceOne({ _id: eid, org: a.org, version }, e, {
        session: s,
      });
      if (!r.matchedCount)
        throw new Error("409: Enquiry changed. Refresh before saving.");
    } else await c.insertOne(e, { session: s });
    if (changedLead) {
      await (
        await collection("tasks")
      ).updateMany(
        { org: a.org, enquiryId: eid, _id: { $ne: `follow:${eid}` }, status: { $nin: ["Done", "Cancelled"] } },
        { $set: { assigneeId: e.assigneeId }, $inc: { version: 1 } },
        { session: s },
      );
      await (
        await collection("quotes")
      ).updateMany(
        {
          enquiryId: eid,
          org: a.org,
        },
        {
          $set: { assigneeId: e.assigneeId, updatedAt: now() },
          $inc: { version: 1 },
        },
        { session: s },
      );
      await (
        await collection("bookings")
      ).updateMany(
        { enquiryId: eid, org: a.org },
        {
          $set: { salesAssigneeId: e.assigneeId, updatedAt: now() },
          $inc: { version: 1 },
        },
        { session: s },
      );
      await (
        await collection("notifications")
      ).deleteMany(
        { org: a.org, recordId: eid, recipient: previous?.assigneeId || "" },
        { session: s },
      );
    }
    await syncFollowUp(a, e, s);
    for (const person of added) await notify(a, person, `enquiry-team:${eid}:${e.version}:${person}`, "Added to an enquiry team", eid, s);
    if (previous) {
      const changes = [
        ...(previous.stage !== e.stage ? [`Status: ${previous.stage} → ${e.stage}`] : []),
        ...(changedLead ? ["Lead changed"] : []),
        ...(added.length || oldMembers.some((person) => !members.includes(person)) ? ["Team updated"] : []),
        ...(previous.nextFollowUp !== e.nextFollowUp ? [`Follow-up: ${previous.nextFollowUp || "not set"} → ${e.nextFollowUp || "cleared"}`] : []),
        ...(previous.nextAction !== e.nextAction ? ["Next action changed"] : []),
        ...(previous.customerId !== e.customerId ? ["Customer changed"] : []),
        ...(["destination", "departure", "returnDate", "dateMode", "travelPreference", "adults", "childrenAges", "infants", "budget", "budgetBasis", "services", "hotelPreference", "rooms", "pickup", "dropoff", "specialRequirements"].some((field) => previous[field] !== e[field]) ? ["Trip details updated"] : []),
        ...(previous.notes !== e.notes ? ["Notes updated"] : []),
        ...(logContact ? [`Call: ${p.contactOutcome}`] : []),
      ];
      await audit(a, eid, changes.length ? changes.join(" · ") : "Enquiry updated", s);
    }
    if (logContact) await (await collection("staffActivityEvents")).insertOne({
      _id: `contact:${eid}:${e.version}`, org: a.org, version: 1, staffId: a.id, kind: "contact",
      occurredAt: e.updatedAt, customerId: p.customerId, label: p.destination, outcome: p.contactOutcome,
    }, { session: s });
    if (!previous) await audit(a, eid, "Enquiry created", s);
    return eid;
  });
}
export async function acknowledge(a: Actor, eid: string, version: number) {
  return transact(async (s) => {
    const c = await collection("enquiries");
    const e = await c.findOne({ _id: eid, org: a.org }, { session: s });
    if (!e || a.role === "operations" || !canAccess(a, e.assigneeId))
      throw new Error("403: Not permitted.");
    const r = await c.updateOne(
      { _id: eid, version },
      { $set: { acknowledgedAt: now() }, $inc: { version: 1 } },
      { session: s },
    );
    if (!r.matchedCount) throw new Error("409: Refresh this enquiry.");
    await audit(a, eid, "Assignment acknowledged", s);
  });
}
const taskSchema = z
  .object({
    title: z.string().trim().min(2).max(300),
    assigneeId: z.string(),
    dueAt: z.iso.datetime(),
    status: z.enum(taskStates).default("To do"),
    note: z.string().max(3000).default(""),
    enquiryId: z.string().default(""),
    customerId: z.string().default(""),
  })
  .strict();
export async function saveTask(
  a: Actor,
  input: unknown,
  recordId?: string,
  version?: number,
) {
  const p = taskSchema.parse(input);
  return transact(async (s) => {
    const c = await collection("tasks");
    const old = recordId
      ? await c.findOne({ _id: recordId, org: a.org }, { session: s })
      : null;
    if (recordId && !old) throw new Error("404: Task not found.");
    if (old && !canAccess(a, old.assigneeId))
      throw new Error("403: Not permitted.");
    if (a.role !== "owner" && p.assigneeId !== a.id)
      throw new Error("403: Only owner can assign another person.");
    await assigned(a, p.assigneeId, s);
    if (
      old &&
      (old.dueAt !== p.dueAt ||
        ["Done", "Cancelled", "Waiting"].includes(p.status)) &&
      !p.note.trim()
    )
      throw new Error("Add a completion, waiting or reschedule note.");
    if (p.enquiryId) {
      const e = await (
        await collection("enquiries")
      ).findOne({ _id: p.enquiryId, org: a.org }, { session: s });
      if (!e || !canAccess(a, e.assigneeId) || a.role === "operations")
        throw new Error("403: Linked enquiry is not available.");
      if (recordId?.startsWith("follow:")) {
        if (p.assigneeId !== e.assigneeId)
          throw new Error("Reassign the enquiry to transfer its follow-up.");
        await (
          await collection("enquiries")
        ).updateOne(
          { _id: e._id },
          {
            $set: {
              ...(p.status === "Done" ? { firstContactCompletedAt: e.firstContactCompletedAt || now() } : {}),
              nextFollowUp: ["Done", "Cancelled"].includes(p.status)
                ? ""
                : p.dueAt,
              nextAction: ["Done", "Cancelled"].includes(p.status)
                ? ""
                : p.title,
              updatedAt: now(),
            },
            $inc: { version: 1 },
          },
          { session: s },
        );
      }
    }
    if (p.customerId) await customerAllowed(a, p.customerId, s);
    if (
      old &&
      (p.enquiryId !== (old.enquiryId || "") || p.customerId !== (old.customerId || ""))
    )
      throw new Error("Linked records cannot be changed after task creation.");
    const tid = recordId || id();
    const updatedAt = now();
    if (old) {
      const r = await c.updateOne(
        { _id: tid, version },
        { $set: { ...p, updatedAt }, $inc: { version: 1 } },
        { session: s },
      );
      if (!r.matchedCount)
        throw new Error("409: Task changed. Refresh before saving.");
    } else
      await c.insertOne(
        {
          _id: tid,
          org: a.org,
          version: 1,
          ...p,
          createdAt: now(),
          updatedAt,
        },
        { session: s },
      );
    if (p.status === "Done" && old?.status !== "Done") await (await collection("staffActivityEvents")).insertOne({
      _id: `task-done:${tid}:${(old?.version ?? 0) + 1}`, org: a.org, version: 1, staffId: a.id,
      kind: "task-done", occurredAt: updatedAt, label: p.title, customerId: p.customerId,
    }, { session: s });
    await audit(
      a,
      p.enquiryId || tid,
      `Task ${old ? "updated" : "created"}: ${p.title}${p.note ? " — " + p.note : ""}`,
      s,
    );
    if (!old || old.assigneeId !== p.assigneeId || old.dueAt !== p.dueAt)
      await notify(
        a,
        p.assigneeId,
        `task:${tid}:${(old?.version || 0) + 1}`,
        "Task assigned or rescheduled",
        p.enquiryId || tid,
        s,
      );
    return tid;
  });
}
export async function staffAction(a: Actor, input: unknown) {
  owner(a);
  const p = z
    .object({
      id: z.string().optional(),
      name: z.string().trim().min(2).max(160),
      email: z.email(),
      role: z.enum(roles),
      status: z.enum(["active", "pending", "invited", "inactive"]),
      replacementId: z.string().default(""),
      capabilities: z
        .array(
          z.enum([
            "trip-notes",
            "trip-times",
            "expense-evidence",
            "logistics-request",
          ]),
        )
        .default([]),
      reset: z.boolean().default(false),
      version: z.number().optional(),
    })
    .strict()
    .parse(input);
  const sid = await transact(async (s) => {
    const c = await collection("staff");
    const old = p.id
      ? await c.findOne({ _id: p.id, org: a.org }, { session: s })
      : null;
    if (p.id && !old) throw new Error("404: Staff not found.");
    if (old && p.email.toLowerCase() !== old.email)
      throw new Error(
        "Account email is immutable. Create a replacement account if required.",
      );
    if (old?.status === "invited" && p.status === "active")
      throw new Error(
        "The staff member must activate using their one-time link.",
      );
    const newId = p.id || id();
    const roleChanged = Boolean(old && old.role !== p.role);
    if (old && newId === a.id && (roleChanged || p.status !== "active"))
      throw new Error("You cannot change your own role or deactivate yourself. Ask another active Owner.");
    if (
      old?.role === "owner" &&
      old.status === "active" &&
      (p.role !== "owner" || p.status !== "active")
    ) {
      const otherOwners = await c.countDocuments(
        { org: a.org, role: "owner", status: "active", _id: { $ne: newId } },
        { session: s },
      );
      if (!otherOwners)
        throw new Error("Add and activate another Owner before changing the last active Owner.");
    }
    const leavingSalesDuty = Boolean(
      old && old.status === "active" && old.role !== "operations" && (p.role === "operations" || p.status === "inactive"),
    );
    const leavingOperationsDuty = Boolean(
      old && old.status === "active" && old.role === "operations" && (p.role !== "operations" || p.status === "inactive"),
    );
    if (old && (leavingSalesDuty || leavingOperationsDuty)) {
      const replacement = await c.findOne(
        {
          _id: p.replacementId,
          org: a.org,
          status: "active",
          role: leavingOperationsDuty ? "operations" : { $in: ["owner", "sales"] },
        },
        { session: s },
      );
      if (!replacement)
        throw new Error(
          leavingOperationsDuty
            ? "Choose a different active Operations replacement."
            : "Choose a different active Owner or Sales replacement.",
        );
      if (p.replacementId === newId)
        throw new Error("Choose a different replacement.");
      if (leavingSalesDuty) {
        await (await collection("enquiries")).updateMany(
          { org: a.org, assigneeId: newId },
          { $set: { assigneeId: p.replacementId, updatedAt: now() }, $inc: { version: 1 } },
          { session: s },
        );
        await (await collection("customers")).updateMany(
          { org: a.org, assigneeId: newId },
          { $set: { assigneeId: p.replacementId, updatedAt: now() } },
          { session: s },
        );
        await (await collection("tasks")).updateMany(
          { org: a.org, assigneeId: newId, status: { $nin: ["Done", "Cancelled"] } },
          { $set: { assigneeId: p.replacementId, updatedAt: now() }, $inc: { version: 1 } },
          { session: s },
        );
        await (await collection("quotes")).updateMany(
          { org: a.org, assigneeId: newId },
          { $set: { assigneeId: p.replacementId, updatedAt: now() }, $inc: { version: 1 } },
          { session: s },
        );
        await (await collection("bookings")).updateMany(
          { org: a.org, salesAssigneeId: newId },
          { $set: { salesAssigneeId: p.replacementId, updatedAt: now() }, $inc: { version: 1 } },
          { session: s },
        );
      }
      if (leavingOperationsDuty) {
        const affected = await (
          await collection("bookings")
        )
          .find({ org: a.org, operationsAssigneeIds: newId }, { session: s })
          .toArray();
        for (const booking of affected) {
          const replaceAssignee = (ids: string[]) => [
            ...new Set(ids.map((staffId) => staffId === newId ? p.replacementId : staffId)),
          ];
          await (
            await collection("bookings")
          ).updateOne(
            { _id: booking._id },
            {
              $set: {
                operationsAssigneeIds: replaceAssignee(booking.operationsAssigneeIds || []),
                ...(booking.operationsReleaseAssigneeIds && {
                  operationsReleaseAssigneeIds: replaceAssignee(booking.operationsReleaseAssigneeIds),
                }),
                updatedAt: now(),
              },
              $inc: { version: 1 },
            },
            { session: s },
          );
        }
        await (
          await collection("tripSegments")
        ).updateMany(
          {
            org: a.org,
            driverId: newId,
            status: { $nin: ["Completed", "Cancelled"] },
          },
          {
            $set: { driverId: p.replacementId, updatedAt: now() },
            $inc: { version: 1 },
          },
          { session: s },
        );
      }
      await notify(
        a,
        p.replacementId,
        `reassign:${newId}:${old.version}`,
        "Staff work reassigned to you",
        p.replacementId,
        s,
      );
    }
    if (old && (roleChanged || old.status !== p.status))
      await (await db()).collection("session").deleteMany({ userId: old.authId }, { session: s });
    const fields = {
      name: p.name,
      email: p.email.toLowerCase(),
      role: p.role,
      status: old ? p.status : "invited",
      capabilities: p.role === "operations" ? p.capabilities : [],
      updatedAt: now(),
    };
    if (old) {
      const r = await c.updateOne(
        { _id: newId, version: p.version },
        { $set: fields, $inc: { version: 1 } },
        { session: s },
      );
      if (!r.matchedCount) throw new Error("409: Staff record changed.");
    } else
      await c.insertOne(
        { _id: newId, org: a.org, version: 1, ...fields },
        { session: s },
      );
    if (old?.status === "pending" && p.status === "active")
      await notify(
        a,
        newId,
        `account-approved:${newId}:${old.version}`,
        "Your account is active. You can now use the CRM.",
        newId,
        s,
      );
    await audit(
      a,
      newId,
      old
        ? `Staff updated: ${old.role} → ${p.role}; ${old.status} → ${p.status}`
        : "Staff invited",
      s,
    );
    return newId;
  });
  return {
    id: sid,
    url: !p.id || p.reset ? await issueToken(sid!) : undefined,
  };
}
export async function settings(a: Actor, input: unknown) {
  owner(a);
  const p = z
    .object({
      contactHours: z.number().int().min(1).max(168),
      escalateHours: z.number().int().min(1).max(168),
    })
    .strict()
    .parse(input);
  await (
    await collection("settings")
  ).updateOne(
    { _id: a.org },
    { $set: { org: a.org, ...p }, $inc: { version: 1 } },
    { upsert: true },
  );
  await audit(a, a.id, "Reminder settings updated");
}
