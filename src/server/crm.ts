import { z } from "zod";
import type { ClientSession } from "mongodb";
import { collection, client, db, type Row } from "./db";
import {
  type Actor,
  customerSchema,
  enquirySchema,
  normalizePhone,
  canAccess,
  taskStates,
  roles,
} from "@/lib/domain";
import { issueToken } from "./auth";
import { publicQuoteForRole } from "@/lib/quote-domain";
import { publicBookingForRole } from "@/lib/booking-domain";
import { publicArrangementForRole } from "@/lib/operations-domain";
import { defaultInvoiceTemplate } from "@/lib/invoice-domain";
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
      { org: a.org, customerId: cid, assigneeId: a.id },
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
                  { org: a.org, assigneeId: a.id },
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
export async function snapshot(a: Actor) {
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
  const bookingIds = bookings.map((booking) => booking._id);
  const phase3 = {
    bookings,
    payments:
      a.role === "operations"
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
      a.role === "operations"
        ? []
        : await (
            await collection("invoices")
          )
            .find({ org: a.org, bookingId: { $in: bookingIds } })
            .sort({ createdAt: -1 })
            .toArray(),
  };
  const tripSegments = await (
    await collection("tripSegments")
  )
    .find({
      org: a.org,
      bookingId: { $in: bookingIds },
      ...(a.role === "operations" ? { driverId: a.id } : {}),
    })
    .sort({ startAt: 1 })
    .toArray();
  const vehicleIds = [
    ...new Set(
      tripSegments.map((segment) => segment.vehicleId).filter(Boolean),
    ),
  ];
  const phase4 = {
    suppliers:
      a.role === "operations"
        ? []
        : await (
            await collection("suppliers")
          )
            .find({ org: a.org })
            .sort({ name: 1 })
            .limit(1000)
            .toArray(),
    vehicles: await (
      await collection("vehicles")
    )
      .find({
        org: a.org,
        ...(a.role === "operations" ? { _id: { $in: vehicleIds } } : {}),
      })
      .sort({ label: 1 })
      .limit(1000)
      .toArray(),
    arrangements: (
      await (
        await collection("arrangements")
      )
        .find({ org: a.org, bookingId: { $in: bookingIds } })
        .sort({ startAt: 1 })
        .limit(2000)
        .toArray()
    ).map((record) => publicArrangementForRole(record, a.role)),
    tripSegments,
    readinessItems: await (
      await collection("readinessItems")
    )
      .find({ org: a.org, bookingId: { $in: bookingIds } })
      .sort({ label: 1 })
      .limit(2000)
      .toArray(),
    incidents: await (
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
      .toArray(),
    collectionReports: await (
      await collection("collectionReports")
    )
      .find({
        org: a.org,
        bookingId: { $in: bookingIds },
        ...(a.role === "operations" ? { reportedById: a.id } : {}),
      })
      .sort({ createdAt: -1 })
      .limit(1000)
      .toArray(),
    operationsDocuments: await (
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
      .toArray(),
    travelDocuments:
      a.role === "operations"
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
    operationsRequests: await (
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
      .toArray(),
  };
  const enqs = await (
    await collection("enquiries")
  )
    .find({ org: a.org, ...(a.role === "owner" ? {} : { assigneeId: a.id }) })
    .sort({ updatedAt: -1 })
    .limit(1000)
    .toArray();
  const customers =
    a.role === "operations"
      ? []
      : await (
          await collection("customers")
        )
          .find({
            org: a.org,
            ...(a.role === "owner"
              ? {}
              : {
                  $or: [
                    { assigneeId: a.id },
                    { _id: { $in: enqs.map((x) => x.customerId) } },
                  ],
                }),
          })
          .sort({ name: 1 })
          .limit(1000)
          .toArray();
  const tasks = await (
    await collection("tasks")
  )
    .find({ org: a.org, ...(a.role === "owner" ? {} : { assigneeId: a.id }) })
    .sort({ dueAt: 1 })
    .limit(1000)
    .toArray();
  const quotes =
    a.role === "operations"
      ? []
      : (
          await (
            await collection("quotes")
          )
            .find({
              org: a.org,
              ...(a.role === "owner" ? {} : { assigneeId: a.id }),
            })
            .sort({ updatedAt: -1 })
            .limit(1000)
            .toArray()
        ).map((q) => publicQuoteForRole(q, a.role));
  const allowed = [
    ...enqs,
    ...customers,
    ...tasks,
    ...quotes,
    ...phase3.bookings,
    ...phase4.arrangements,
    ...phase4.tripSegments,
    ...phase4.incidents,
  ].map((x) => x._id);
  return {
    actor: a,
    enquiries: enqs,
    customers,
    tasks,
    quotes,
    ...phase3,
    ...phase4,
    quoteTemplates:
      a.role === "owner"
        ? await (
            await collection("quoteTemplates")
          )
            .find({ org: a.org })
            .sort({ name: 1 })
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
    notifications: await (
      await collection("notifications")
    )
      .find({
        org: a.org,
        recipient: a.id,
        ...(a.role === "owner"
          ? {}
          : { $or: [{ recordId: { $in: allowed } }, { recordId: a.id }] }),
      })
      .sort({ createdAt: -1 })
      .limit(200)
      .toArray(),
    activity: await (
      await collection("activity")
    )
      .find({
        org: a.org,
        ...(a.role === "owner" ? {} : { recordId: { $in: a.role === "operations" ? tasks.map(t => t._id) : allowed } }),
      })
      .sort({ createdAt: -1 })
      .limit(100)
      .toArray(),
    settings: await (async () => {
      const value = await (await collection("settings")).findOne({ _id: a.org });
      return value
        ? { contactHours: value.contactHours, escalateHours: value.escalateHours }
        : null;
    })(),
    invoiceTemplate:
      a.role === "owner"
        ? {
            ...defaultInvoiceTemplate,
            ...((await (
              await collection("invoiceTemplates")
            ).findOne({ org: a.org, active: true })) || {}),
          }
        : null,
    imports:
      a.role === "owner"
        ? await (
            await collection("importBatches")
          )
            .find({ org: a.org }, { projection: { rows: 0 } })
            .sort({ createdAt: -1 })
            .limit(50)
            .toArray()
        : [],
    limited:
      enqs.length === 1000 ||
      customers.length === 1000 ||
      tasks.length === 1000 ||
      quotes.length === 1000 ||
      phase3.bookings.length === 1000,
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
      { _id: tid },
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
  const due = e.nextFollowUp || (!e.acknowledgedAt ? contactDue : null);
  if (!due) {
    await tasks.updateOne(
      { _id: tid },
      { $set: { status: "Done" }, $inc: { version: 1 } },
      { session: s },
    );
    return;
  }
  const old = await tasks.findOne({ _id: tid }, { session: s });
  const changed =
    !old ||
    old.dueAt !== due ||
    old.assigneeId !== e.assigneeId ||
    ["Done", "Cancelled"].includes(old.status);
  await tasks.updateOne(
    { _id: tid },
    {
      $set: {
        org: a.org,
        assigneeId: e.assigneeId,
        enquiryId: e._id,
        customerId: e.customerId,
        title: e.nextFollowUp ? e.nextAction : "Contact customer",
        dueAt: due,
        status:
          e.stage === "On hold" ? "Waiting" : changed ? "To do" : old.status,
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
export async function saveEnquiry(
  a: Actor,
  input: unknown,
  recordId?: string,
  version?: number,
) {
  if (a.role === "operations") throw new Error("403: Not permitted.");
  const p = enquirySchema.parse(input);
  if (p.reviewNeeded) owner(a);
  return transact(async (s) => {
    const c = await collection("enquiries");
    const previous = recordId
      ? await c.findOne({ _id: recordId, org: a.org }, { session: s })
      : null;
    if (recordId && !previous) throw new Error("404: Enquiry not found.");
    if (previous && !canAccess(a, previous.assigneeId))
      throw new Error("403: Enquiry not assigned to you.");
    if (a.role !== "owner" && p.assigneeId !== (previous?.assigneeId || a.id))
      throw new Error("403: Only owner can reassign enquiries.");
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
    await customerAllowed(a, p.customerId, s);
    await assigned(a, p.assigneeId, s, true);
    const eid = recordId || id();
    const e: Row = {
      ...previous,
      ...p,
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
    if (previous?.assigneeId !== e.assigneeId) {
      await (
        await collection("customers")
      ).updateOne(
        { _id: p.customerId, org: a.org },
        { $set: { assigneeId: e.assigneeId } },
        { session: s },
      );
      await (
        await collection("tasks")
      ).updateMany(
        { enquiryId: eid, status: { $nin: ["Done", "Cancelled"] } },
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
        { org: a.org, recordId: eid, recipient: { $ne: e.assigneeId } },
        { session: s },
      );
    }
    await syncFollowUp(a, e, s);
    await audit(a, eid, previous ? "Enquiry updated" : "Enquiry created", s);
    return eid;
  });
}
export async function acknowledge(a: Actor, eid: string, version: number) {
  return transact(async (s) => {
    const c = await collection("enquiries");
    const e = await c.findOne({ _id: eid, org: a.org }, { session: s });
    if (!e || !canAccess(a, e.assigneeId))
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
    if (old) {
      const r = await c.updateOne(
        { _id: tid, version },
        { $set: { ...p, updatedAt: now() }, $inc: { version: 1 } },
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
          updatedAt: now(),
        },
        { session: s },
      );
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
          const replacements = [
            ...new Set(
              (booking.operationsAssigneeIds || []).map((staffId: string) =>
                staffId === newId ? p.replacementId : staffId,
              ),
            ),
          ];
          await (
            await collection("bookings")
          ).updateOne(
            { _id: booking._id },
            {
              $set: {
                operationsAssigneeIds: replacements,
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
