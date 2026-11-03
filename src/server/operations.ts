import { Binary, type ClientSession } from "mongodb";
import { z } from "zod";
import type { Actor } from "@/lib/domain";
import {
  arrangementSchema,
  collectionReportSchema,
  incidentSchema,
  readinessSchema,
  supplierSchema,
  tripProgressSchema,
  tripSegmentSchema,
  vehicleSchema,
} from "@/lib/operations-domain";
import { minor } from "@/lib/quote-domain";
import { collection, type Row } from "./db";
import { audit, notify, transact } from "./crm";
import { buildOperationsPdf } from "./operations-pdf";

const now = () => new Date().toISOString();
const id = () => crypto.randomUUID();

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
  if (s && booking.financialClosed) throw new Error("Financial settlement is closed. Ask the Owner to reopen it before changing this booking.");
  if (s) await (await collection("bookings")).updateOne({ _id: booking._id, org: a.org }, { $inc: { financialRevision: 1 } }, { session: s });
  return booking;
}

function coordinator(a: Actor) {
  if (a.role === "operations")
    throw new Error(
      "403: Only Owner or assigned Sales can coordinate services.",
    );
}

async function activeStaff(
  a: Actor,
  staffId: string,
  role: "operations",
  s: ClientSession,
) {
  const person = await (
    await collection("staff")
  ).findOne(
    { _id: staffId, org: a.org, role, status: "active" },
    { session: s },
  );
  if (!person) throw new Error("Choose an active Operations staff member.");
  return person;
}

async function task(
  a: Actor,
  taskId: string,
  title: string,
  assigneeId: string,
  bookingId: string,
  dueAt: string,
  s: ClientSession,
  status = "To do",
) {
  await (
    await collection("tasks")
  ).updateOne(
    { _id: taskId },
    {
      $set: {
        org: a.org,
        title,
        assigneeId,
        bookingId,
        dueAt,
        status,
        updatedAt: now(),
      },
      $setOnInsert: { createdAt: now() },
      $inc: { version: 1 },
    },
    { upsert: true, session: s },
  );
}

async function notifyCoordinators(
  a: Actor,
  booking: Row,
  key: string,
  message: string,
  s: ClientSession,
) {
  const recipients = new Set<string>(
    [booking.ownerId, booking.salesAssigneeId].filter(Boolean),
  );
  const owners = await (
    await collection("staff")
  )
    .find({ org: a.org, role: "owner", status: "active" }, { session: s })
    .toArray();
  owners.forEach((person) => recipients.add(person._id));
  for (const recipient of recipients)
    await notify(a, recipient, `${key}:${recipient}`, message, booking._id, s);
}

export async function initializeOperations(a: Actor, input: unknown) {
  coordinator(a);
  const p = z
    .object({ bookingId: z.string().min(1) })
    .strict()
    .parse(input);
  return transact(async (s) => {
    const booking = await bookingAccess(a, p.bookingId, s);
    if (!booking.operationsReleased)
      throw new Error("Release this booking to Operations first.");
    const existing = await (
      await collection("readinessItems")
    ).countDocuments({ org: a.org, bookingId: booking._id }, { session: s });
    if (existing) return booking._id;
    const items = [
      ["travellers", "Traveller names and contact checked"],
      ["confirmations", "Agency service confirmations complete"],
      ["documents", "Required travel documents checked"],
      ["driver-brief", "Driver / operations brief acknowledged"],
    ];
    await (
      await collection("readinessItems")
    ).insertMany(
      items.map(([key, label]) => ({
        _id: `${booking._id}:${key}`,
        org: a.org,
        version: 1,
        bookingId: booking._id,
        key,
        label,
        status: "Pending",
        note: "",
        expiresAt: "",
        createdAt: now(),
        updatedAt: now(),
      })),
      { session: s },
    );
    await audit(a, booking._id, "Operations setup started", s);
    return booking._id;
  });
}

export async function saveSupplier(a: Actor, input: unknown) {
  coordinator(a);
  const p = z
    .object({
      id: z.string().optional(),
      version: z.number().optional(),
      data: z.unknown(),
    })
    .strict()
    .parse(input);
  const data = supplierSchema.parse(p.data);
  return transact(async (s) => {
    const c = await collection("suppliers");
    const old = p.id
      ? await c.findOne({ _id: p.id, org: a.org }, { session: s })
      : null;
    if (p.id && !old) throw new Error("404: Supplier not found.");
    const duplicate = await c.findOne(
      {
        org: a.org,
        ...(p.id ? { _id: { $ne: p.id } } : {}),
        name: {
          $regex: `^${data.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`,
          $options: "i",
        },
        location: data.location,
      },
      { session: s },
    );
    if (duplicate)
      throw new Error(
        "409: A supplier with this name and location already exists.",
      );
    const supplierId = p.id || id();
    if (old) {
      const result = await c.updateOne(
        { _id: supplierId, org: a.org, version: p.version },
        { $set: { ...data, updatedAt: now() }, $inc: { version: 1 } },
        { session: s },
      );
      if (!result.matchedCount)
        throw new Error("409: Supplier changed. Refresh first.");
    } else {
      await c.insertOne(
        {
          _id: supplierId,
          org: a.org,
          version: 1,
          ...data,
          createdAt: now(),
          updatedAt: now(),
        },
        { session: s },
      );
    }
    await audit(
      a,
      supplierId,
      old ? "Supplier updated" : "Supplier created",
      s,
    );
    return supplierId;
  });
}

export async function saveVehicle(a: Actor, input: unknown) {
  coordinator(a);
  const p = z
    .object({
      id: z.string().optional(),
      version: z.number().optional(),
      data: z.unknown(),
    })
    .strict()
    .parse(input);
  const data = vehicleSchema.parse(p.data);
  return transact(async (s) => {
    if (data.supplierId) {
      const supplier = await (
        await collection("suppliers")
      ).findOne(
        { _id: data.supplierId, org: a.org, status: "Active" },
        { session: s },
      );
      if (!supplier) throw new Error("Choose an active vehicle supplier.");
    }
    const c = await collection("vehicles");
    const old = p.id
      ? await c.findOne({ _id: p.id, org: a.org }, { session: s })
      : null;
    if (p.id && !old) throw new Error("404: Vehicle not found.");
    const vehicleId = p.id || id();
    const duplicate = await c.findOne(
      { org: a.org, registration: data.registration, _id: { $ne: vehicleId } },
      { session: s },
    );
    if (duplicate)
      throw new Error("409: This vehicle registration already exists.");
    if (old) {
      const result = await c.updateOne(
        { _id: vehicleId, version: p.version },
        { $set: { ...data, updatedAt: now() }, $inc: { version: 1 } },
        { session: s },
      );
      if (!result.matchedCount)
        throw new Error("409: Vehicle changed. Refresh first.");
    } else
      await c.insertOne(
        {
          _id: vehicleId,
          org: a.org,
          version: 1,
          ...data,
          createdAt: now(),
          updatedAt: now(),
        },
        { session: s },
      );
    await audit(a, vehicleId, old ? "Vehicle updated" : "Vehicle created", s);
    return vehicleId;
  });
}

export async function saveArrangement(a: Actor, input: unknown) {
  coordinator(a);
  const p = z
    .object({
      id: z.string().optional(),
      version: z.number().optional(),
      data: z.unknown(),
    })
    .strict()
    .parse(input);
  const data = arrangementSchema.parse(p.data);
  return transact(async (s) => {
    const booking = await bookingAccess(a, data.bookingId, s);
    if (booking.status === "Cancelled") throw new Error("Do not add or change services on a cancelled booking.");
    if (!booking.operationsReleased)
      throw new Error("Release the booking before arranging services.");
    if (data.supplierId) {
      const supplier = await (
        await collection("suppliers")
      ).findOne(
        { _id: data.supplierId, org: a.org, status: "Active" },
        { session: s },
      );
      if (!supplier) throw new Error("Choose an active supplier.");
    }
    if (
      a.role === "sales" &&
      data.responsibility === "Agency arranged" &&
      data.confirmationStatus === "Confirmed"
    )
      throw new Error("Owner must approve an agency supplier commitment.");
    if (data.costMinor < 0)
      throw new Error("Supplier cost cannot be negative.");
    const c = await collection("arrangements");
    const old = p.id
      ? await c.findOne({ _id: p.id, org: a.org }, { session: s })
      : null;
    if (p.id && !old) throw new Error("404: Arrangement not found.");
    if (old && old.bookingId !== data.bookingId)
      throw new Error("An arrangement cannot move to another booking.");
    if (old?.confirmationStatus === "Confirmed" && a.role !== "owner")
      throw new Error("Owner must review changes to a confirmed arrangement.");
    const arrangementId = p.id || id();
    const fields = {
      ...data,
      ...(data.confirmationStatus === "Confirmed"
        ? { confirmedAt: now(), confirmedById: a.id }
        : {}),
      updatedAt: now(),
    };
    if (old) {
      const result = await c.updateOne(
        { _id: arrangementId, version: p.version },
        { $set: fields, $inc: { version: 1 } },
        { session: s },
      );
      if (!result.matchedCount)
        throw new Error("409: Arrangement changed. Refresh first.");
    } else
      await c.insertOne(
        {
          _id: arrangementId,
          org: a.org,
          version: 1,
          ...fields,
          createdAt: now(),
        },
        { session: s },
      );
    if (["Unavailable", "Cancelled"].includes(data.confirmationStatus)) {
      await notifyCoordinators(
        a,
        booking,
        `arrangement:exception:${arrangementId}:${data.confirmationStatus}`,
        `${data.title} requires a replacement or review`,
        s,
      );
    }
    await audit(
      a,
      booking._id,
      `${data.type} arrangement ${old ? "updated" : "created"}: ${data.title} (${data.confirmationStatus})`,
      s,
    );
    return arrangementId;
  });
}

async function overlappingSegment(
  a: Actor,
  data: z.infer<typeof tripSegmentSchema>,
  excludeId: string,
  s: ClientSession,
) {
  if (!data.driverId && !data.vehicleId) return null;
  const buffer = data.bufferMinutes * 60_000;
  const start = new Date(
    new Date(data.startAt).getTime() - buffer,
  ).toISOString();
  const end = new Date(new Date(data.endAt).getTime() + buffer).toISOString();
  const candidates = await (await collection("tripSegments")).find(
    {
      org: a.org,
      _id: { $ne: excludeId },
      status: { $nin: ["Cancelled", "Completed"] },
      $or: [
        ...(data.driverId ? [{ driverId: data.driverId }] : []),
        ...(data.vehicleId ? [{ vehicleId: data.vehicleId }] : []),
      ],
    },
    { session: s },
  ).toArray();
  return candidates.find(item => new Date(item.startAt).getTime() - Number(item.bufferMinutes || 0) * 60000 < new Date(end).getTime() && new Date(item.endAt).getTime() + Number(item.bufferMinutes || 0) * 60000 > new Date(start).getTime()) || null;
}

export async function saveTripSegment(a: Actor, input: unknown) {
  coordinator(a);
  const p = z
    .object({
      id: z.string().optional(),
      version: z.number().optional(),
      data: z.unknown(),
    })
    .strict()
    .parse(input);
  const data = tripSegmentSchema.parse(p.data);
  return transact(async (s) => {
    const booking = await bookingAccess(a, data.bookingId, s);
    if (booking.status === "Cancelled") throw new Error("Do not assign travel on a cancelled booking.");
    if (!booking.operationsReleased)
      throw new Error("Release the booking before assigning trips.");
    if (data.driverId) {
      await activeStaff(a, data.driverId, "operations", s);
      await (await collection("staff")).updateOne({ _id: data.driverId, org: a.org }, { $inc: { scheduleRevision: 1 } }, { session: s });
    }
    if (data.vehicleId) {
      const vehicle = await (
        await collection("vehicles")
      ).findOne(
        { _id: data.vehicleId, org: a.org, status: "Available" },
        { session: s },
      );
      if (!vehicle) throw new Error("Choose an available vehicle.");
      await (await collection("vehicles")).updateOne({ _id: vehicle._id, org: a.org }, { $inc: { scheduleRevision: 1 } }, { session: s });
      if (Number(vehicle.seats || 0) < Number(booking.travellers?.filter((t: Row) => !t.cancelled).length || 1))
        throw new Error(
          "Vehicle capacity is lower than the recorded traveller count.",
        );
    }
    if (data.arrangementId) {
      const arrangement = await (
        await collection("arrangements")
      ).findOne(
        { _id: data.arrangementId, org: a.org, bookingId: booking._id },
        { session: s },
      );
      if (!arrangement)
        throw new Error("Linked arrangement is not part of this booking.");
    }
    const segmentId = p.id || id();
    const conflict = await overlappingSegment(a, data, segmentId, s);
    if (conflict)
      throw new Error(
        `409: Driver or vehicle overlaps ${conflict.title}. Change the time, buffer, driver or vehicle.`,
      );
    const c = await collection("tripSegments");
    const old = p.id
      ? await c.findOne({ _id: p.id, org: a.org }, { session: s })
      : null;
    if (p.id && !old) throw new Error("404: Trip segment not found.");
    if (old && old.bookingId !== data.bookingId) throw new Error("403: A trip segment cannot move to another booking.");
    if (
      old?.status &&
      !["Scheduled", "Unable to complete"].includes(old.status) &&
      a.role !== "owner"
    )
      throw new Error("Owner must review changes after a trip has started.");
    const fields = {
      ...data,
      status: old?.status || "Scheduled",
      updatedAt: now(),
    };
    if (old) {
      const result = await c.updateOne(
        { _id: segmentId, version: p.version },
        { $set: fields, $inc: { version: 1 } },
        { session: s },
      );
      if (!result.matchedCount)
        throw new Error("409: Trip changed. Refresh first.");
    } else
      await c.insertOne(
        { _id: segmentId, org: a.org, version: 1, ...fields, createdAt: now() },
        { session: s },
      );
    if (
      data.driverId &&
      !(booking.operationsAssigneeIds || []).includes(data.driverId)
    ) {
      await (
        await collection("bookings")
      ).updateOne(
        { _id: booking._id },
        {
          $set: {
            operationsAssigneeIds: [
              ...(booking.operationsAssigneeIds || []),
              data.driverId,
            ],
            updatedAt: now(),
          },
          $inc: { version: 1 },
        },
        { session: s },
      );
    }
    if (data.driverId) {
      await task(
        a,
        `trip:${segmentId}`,
        `${booking.bookingNumber}: ${data.title}`,
        data.driverId,
        booking._id,
        data.startAt,
        s,
      );
      await (await collection("tasks")).updateOne({ _id: `trip:${segmentId}`, org: a.org }, { $set: { segmentId } }, { session: s });
      await notify(
        a,
        data.driverId,
        `trip:assigned:${segmentId}:${old?.version || 1}`,
        "Trip assigned or rescheduled",
        booking._id,
        s,
      );
    }
    if (old?.driverId && old.driverId !== data.driverId) {
      const remaining = await (await collection("tripSegments")).countDocuments({ org: a.org, bookingId: booking._id, driverId: old.driverId, status: { $nin: ["Cancelled", "Completed"] } }, { session: s });
      if (!remaining) await (await collection("bookings")).updateOne({ _id: booking._id, org: a.org }, { $pull: { operationsAssigneeIds: old.driverId }, $inc: { version: 1 } }, { session: s });
      if (!data.driverId) await (await collection("tasks")).updateOne({ _id: `trip:${segmentId}`, org: a.org }, { $set: { status: "Cancelled", note: "Driver reassigned" }, $inc: { version: 1 } }, { session: s });
    }
    await audit(
      a,
      booking._id,
      `Trip segment ${old ? "updated" : "assigned"}: ${data.title}`,
      s,
    );
    return segmentId;
  });
}

export async function updateTripProgress(a: Actor, input: unknown) {
  const p = tripProgressSchema.parse(input);
  return transact(async (s) => {
    const c = await collection("tripSegments");
    const segment = await c.findOne(
      { _id: p.segmentId, org: a.org },
      { session: s },
    );
    if (!segment) throw new Error("404: Trip segment not found.");
    await bookingAccess(a, segment.bookingId, s);
    if (a.role === "operations" && segment.driverId !== a.id)
      throw new Error("403: This trip is assigned to another driver.");
    const capabilities = new Set(a.capabilities || []);
    if (
      a.role === "operations" &&
      (p.actualStart ||
        p.actualEnd ||
        p.startOdometer !== null ||
        p.endOdometer !== null) &&
      !capabilities.has("trip-times")
    )
      throw new Error(
        "Owner has not enabled actual-time and odometer entry for this account.",
      );
    if (a.role === "operations" && p.note && !capabilities.has("trip-notes"))
      throw new Error("Owner has not enabled trip notes for this account.");
    const order = ["Scheduled", "Started", "Picked up", "Completed"];
    if (
      p.status !== "Unable to complete" &&
      order.indexOf(p.status) < order.indexOf(segment.status)
    )
      throw new Error(
        "Trip progress cannot move backwards. Report an incident for corrections.",
      );
    const result = await c.updateOne(
      { _id: segment._id, version: p.version },
      {
        $set: {
          status: p.status,
          actualStart: p.actualStart,
          actualEnd: p.actualEnd,
          startOdometer: p.startOdometer,
          endOdometer: p.endOdometer,
          progressNote: p.note,
          updatedAt: now(),
        },
        $inc: { version: 1 },
      },
      { session: s },
    );
    if (!result.matchedCount)
      throw new Error("409: Trip changed. Refresh first.");
    await (
      await collection("tasks")
    ).updateOne(
      { _id: `trip:${segment._id}`, org: a.org },
      {
        $set: {
          status: p.status === "Completed" ? "Done" : "In progress",
          note: p.note,
          updatedAt: now(),
        },
        $inc: { version: 1 },
      },
      { session: s },
    );
    const booking = await bookingAccess(a, segment.bookingId, s);
    if (p.status === "Unable to complete")
      await notifyCoordinators(
        a,
        booking,
        `trip:unable:${segment._id}:${segment.version}`,
        `${segment.title} could not be completed`,
        s,
      );
    await audit(
      a,
      segment.bookingId,
      `Trip progress: ${segment.title} - ${p.status}${p.note ? ` - ${p.note}` : ""}`,
      s,
    );
    return segment._id;
  });
}

export async function updateReadiness(a: Actor, input: unknown) {
  coordinator(a);
  const p = readinessSchema.parse(input);
  return transact(async (s) => {
    await bookingAccess(a, p.bookingId, s);
    const c = await collection("readinessItems");
    const item = await c.findOne(
      { _id: p.itemId, bookingId: p.bookingId, org: a.org },
      { session: s },
    );
    if (!item) throw new Error("404: Readiness item not found.");
    await c.updateOne(
      { _id: item._id },
      {
        $set: {
          status: p.status,
          note: p.note,
          expiresAt: p.expiresAt,
          updatedById: a.id,
          updatedAt: now(),
        },
        $inc: { version: 1 },
      },
      { session: s },
    );
    await audit(
      a,
      p.bookingId,
      `Readiness ${item.label}: ${p.status}${p.note ? ` - ${p.note}` : ""}`,
      s,
    );
    return item._id;
  });
}

export async function reportIncident(a: Actor, input: unknown) {
  const p = incidentSchema.parse(input);
  return transact(async (s) => {
    const booking = await bookingAccess(a, p.bookingId, s);
    if (p.segmentId) {
      const segment = await (
        await collection("tripSegments")
      ).findOne(
        { _id: p.segmentId, org: a.org, bookingId: booking._id },
        { session: s },
      );
      if (!segment)
        throw new Error("Trip segment is not part of this booking.");
      if (a.role === "operations" && segment.driverId !== a.id)
        throw new Error("403: This segment is assigned to another driver.");
    }
    const incidentId = id();
    await (
      await collection("incidents")
    ).insertOne(
      {
        _id: incidentId,
        org: a.org,
        version: 1,
        ...p,
        status: "Open",
        reportedById: a.id,
        reportedByName: a.name,
        reportedAt: now(),
        createdAt: now(),
        updatedAt: now(),
      },
      { session: s },
    );
    await notifyCoordinators(
      a,
      booking,
      `incident:${incidentId}`,
      `${p.severity} ${p.type.toLowerCase()} reported for ${booking.bookingNumber}`,
      s,
    );
    const owners = await (
      await collection("staff")
    )
      .find({ org: a.org, role: "owner", status: "active" }, { session: s })
      .toArray();
    for (const person of owners)
      await task(
        a,
        `incident:${incidentId}:${person._id}`,
        `Resolve ${p.type.toLowerCase()} for ${booking.bookingNumber}`,
        person._id,
        booking._id,
        new Date(
          Date.now() + (p.severity === "Urgent" ? 30 : 240) * 60000,
        ).toISOString(),
        s,
      );
    await audit(
      a,
      booking._id,
      `${p.severity} incident reported: ${p.type} - ${p.description}`,
      s,
    );
    return incidentId;
  });
}

export async function submitOperationsRequest(a: Actor, input: unknown) {
  if (a.role !== "operations")
    throw new Error("Only assigned Operations staff submit this request.");
  const p = z
    .object({
      bookingId: z.string().min(1),
      segmentId: z.string().min(1),
      type: z.enum(["Logistics change", "Expense"]),
      description: z.string().trim().min(5).max(2000),
      amount: z.union([z.string(), z.number()]).default("0"),
      currency: z
        .string()
        .trim()
        .length(3)
        .transform((v) => v.toUpperCase()),
      evidenceName: z.string().trim().max(220).default(""),
      evidenceType: z.string().trim().max(100).default(""),
      evidenceBase64: z.string().max(2_200_000).default(""),
    })
    .strict()
    .parse(input);
  const amountMinor = minor(String(p.amount));
  const capabilities = new Set(a.capabilities || []);
  if (p.type === "Expense" && !capabilities.has("expense-evidence"))
    throw new Error(
      "Owner has not enabled expense reporting for this account.",
    );
  if (p.type === "Logistics change" && !capabilities.has("logistics-request"))
    throw new Error(
      "Owner has not enabled logistics requests for this account.",
    );
  if (p.type === "Expense" && amountMinor <= 0)
    throw new Error("Enter an expense amount greater than zero.");
  return transact(async (s) => {
    const booking = await bookingAccess(a, p.bookingId, s);
    const segment = await (
      await collection("tripSegments")
    ).findOne(
      {
        _id: p.segmentId,
        org: a.org,
        bookingId: booking._id,
        driverId: a.id,
      },
      { session: s },
    );
    if (!segment) throw new Error("403: Trip segment is not assigned to you.");
    const bytes = p.evidenceBase64
      ? Buffer.from(p.evidenceBase64, "base64")
      : null;
    if (bytes && bytes.length > 1_500_000)
      throw new Error("Expense evidence must be 1.5 MB or smaller.");
    if (
      bytes &&
      !["image/jpeg", "image/png", "application/pdf"].includes(p.evidenceType)
    )
      throw new Error("Evidence must be a JPG, PNG or PDF file.");
    const requestId = id();
    await (
      await collection("operationsRequests")
    ).insertOne(
      {
        _id: requestId,
        org: a.org,
        version: 1,
        bookingId: booking._id,
        segmentId: segment._id,
        type: p.type,
        description: p.description,
        amountMinor: p.type === "Expense" ? amountMinor : 0,
        currency: p.currency,
        evidenceName: p.evidenceName,
        evidenceType: p.evidenceType,
        ...(bytes ? { evidenceBytes: new Binary(bytes) } : {}),
        status: "Pending review",
        submittedById: a.id,
        submittedByName: a.name,
        createdAt: now(),
        updatedAt: now(),
      },
      { session: s },
    );
    await notifyCoordinators(
      a,
      booking,
      `operations-request:${requestId}`,
      `${p.type} request from ${a.name}`,
      s,
    );
    await audit(
      a,
      booking._id,
      `${p.type} request submitted; no schedule or financial total changed`,
      s,
    );
    return requestId;
  });
}

export async function decideOperationsRequest(a: Actor, input: unknown) {
  coordinator(a);
  const p = z
    .object({
      requestId: z.string(),
      version: z.number(),
      decision: z.enum(["Approved", "Rejected"]),
      reason: z.string().trim().min(3).max(1500),
    })
    .strict()
    .parse(input);
  return transact(async (s) => {
    const c = await collection("operationsRequests");
    const request = await c.findOne(
      { _id: p.requestId, org: a.org },
      { session: s },
    );
    if (!request) throw new Error("404: Operations request not found.");
    await bookingAccess(a, request.bookingId, s);
    const result = await c.updateOne(
      {
        _id: request._id,
        version: p.version,
        status: "Pending review",
      },
      {
        $set: {
          status: p.decision,
          decisionReason: p.reason,
          decidedById: a.id,
          decidedAt: now(),
          updatedAt: now(),
        },
        $inc: { version: 1 },
      },
      { session: s },
    );
    if (!result.matchedCount)
      throw new Error("409: Request changed or was already reviewed.");
    await notify(
      a,
      request.submittedById,
      `operations-request:decision:${request._id}`,
      `${request.type} request ${p.decision.toLowerCase()}`,
      request.bookingId,
      s,
    );
    await audit(
      a,
      request.bookingId,
      `${request.type} request ${p.decision.toLowerCase()} - ${p.reason}`,
      s,
    );
    return request._id;
  });
}

export async function resolveIncident(a: Actor, input: unknown) {
  coordinator(a);
  const p = z
    .object({
      incidentId: z.string(),
      version: z.number(),
      resolution: z.string().trim().min(3).max(3000),
    })
    .strict()
    .parse(input);
  return transact(async (s) => {
    const c = await collection("incidents");
    const incident = await c.findOne(
      { _id: p.incidentId, org: a.org },
      { session: s },
    );
    if (!incident) throw new Error("404: Incident not found.");
    await bookingAccess(a, incident.bookingId, s);
    const result = await c.updateOne(
      { _id: incident._id, version: p.version, status: "Open" },
      {
        $set: {
          status: "Resolved",
          resolution: p.resolution,
          resolvedById: a.id,
          resolvedAt: now(),
          updatedAt: now(),
        },
        $inc: { version: 1 },
      },
      { session: s },
    );
    if (!result.matchedCount)
      throw new Error("409: Incident changed or was already resolved.");
    await (
      await collection("tasks")
    ).updateMany(
      {
        org: a.org,
        _id: { $regex: `^incident:${incident._id}:` },
        status: { $nin: ["Done", "Cancelled"] },
      },
      {
        $set: { status: "Done", note: p.resolution, updatedAt: now() },
        $inc: { version: 1 },
      },
      { session: s },
    );
    await audit(a, incident.bookingId, `Incident resolved: ${p.resolution}`, s);
    return incident._id;
  });
}

export async function reportCollection(a: Actor, input: unknown) {
  if (a.role === "sales")
    throw new Error(
      "Owner records sales-collected payments through the standard payment form.",
    );
  const p = collectionReportSchema.parse(input);
  return transact(async (s) => {
    const booking = await bookingAccess(a, p.bookingId, s);
    if (p.currency !== booking.currency)
      throw new Error(
        "Collected currency must match the booking currency for this initial workflow.",
      );
    const duplicateKey = [
      booking._id,
      p.amountMinor,
      p.collectedAt,
      p.reference.toLowerCase(),
      p.payerName.toLowerCase(),
    ].join(":");
    const existing = await (
      await collection("collectionReports")
    ).findOne({ org: a.org, duplicateKey }, { session: s });
    if (existing)
      throw new Error("409: This collection report is already recorded.");
    const reportId = id();
    const paymentId = id();
    await (
      await collection("collectionReports")
    ).insertOne(
      {
        _id: reportId,
        org: a.org,
        version: 1,
        ...p,
        duplicateKey,
        bookingId: booking._id,
        paymentId,
        status: "Pending verification",
        custodyStatus: "Held by collector",
        method: "Cash",
        handedOverMinor: 0,
        reportedById: a.id,
        reportedByName: a.name,
        createdAt: now(),
        updatedAt: now(),
      },
      { session: s },
    );
    const reference = p.reference || `Driver report ${reportId.slice(0, 8)}`;
    await (
      await collection("payments")
    ).insertOne(
      {
        _id: paymentId,
        org: a.org,
        version: 1,
        bookingId: booking._id,
        invoiceId: booking.invoiceId || "",
        collectionReportId: reportId,
        amountMinor: p.amountMinor,
        currency: p.currency,
        receivedAt: p.collectedAt,
        method: "Cash",
        reference,
        referenceKey: `collection:${duplicateKey}`,
        payerName: p.payerName,
        note: p.note,
        evidenceId: "",
        evidenceName: "",
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
      await task(
        a,
        `payment:verify:${paymentId}:${person._id}`,
        `Verify exceptional collection for ${booking.bookingNumber}`,
        person._id,
        booking._id,
        new Date(Date.now() + 2 * 3600000).toISOString(),
        s,
      );
      await notify(
        a,
        person._id,
        `collection:${reportId}:${person._id}`,
        "Exceptional customer collection needs verification",
        booking._id,
        s,
      );
    }
    await audit(
      a,
      booking._id,
      `Exceptional collection reported; pending Owner verification (${p.currency} ${(p.amountMinor / 100).toFixed(2)})`,
      s,
    );
    return reportId;
  });
}

export async function recordCashHandover(a: Actor, input: unknown) {
  const p = z
    .object({
      reportId: z.string(),
      version: z.number(),
      amount: z.union([z.string(), z.number()]),
      handedAt: z.iso.datetime(),
      note: z.string().trim().min(3).max(1000),
    })
    .strict()
    .parse(input);
  const amountMinor = minor(String(p.amount));
  if (amountMinor <= 0)
    throw new Error("Enter a handover amount greater than zero.");
  return transact(async (s) => {
    const c = await collection("collectionReports");
    const report = await c.findOne(
      { _id: p.reportId, org: a.org },
      { session: s },
    );
    if (!report) throw new Error("404: Collection report not found.");
    await bookingAccess(a, report.bookingId, s);
    if (a.role === "operations" && report.reportedById !== a.id)
      throw new Error(
        "403: You can hand over only money you reported collecting.",
      );
    const pending = (report.handovers || [])
      .filter((x: Row) => x.status !== "Rejected")
      .reduce((sum: number, x: Row) => sum + Number(x.amountMinor || 0), 0);
    if (pending + amountMinor > report.amountMinor)
      throw new Error("Handover total cannot exceed the reported collection.");
    const handover = {
      id: id(),
      amountMinor,
      handedAt: p.handedAt,
      note: p.note,
      status: a.role === "owner" ? "Verified" : "Pending verification",
      recordedById: a.id,
      createdAt: now(),
    };
    const handovers = [...(report.handovers || []), handover];
    const handedOverMinor = handovers.filter(entry => entry.status === "Verified").reduce((sum, entry) => sum + entry.amountMinor, 0);
    const result = await c.updateOne(
      { _id: report._id, version: p.version },
      {
        $set: {
          handovers,
          handedOverMinor,
          custodyStatus:
            handedOverMinor === report.amountMinor
              ? "Handed over"
              : handover.status === "Verified" ? "Partly handed over"
              : "Handover pending verification",
          updatedAt: now(),
        },
        $inc: { version: 1 },
      },
      { session: s },
    );
    if (!result.matchedCount)
      throw new Error("409: Collection report changed. Refresh first.");
    if (a.role !== "owner") {
      const owners = await (
        await collection("staff")
      )
        .find({ org: a.org, role: "owner", status: "active" }, { session: s })
        .toArray();
      for (const person of owners)
        await notify(
          a,
          person._id,
          `handover:${handover.id}:${person._id}`,
          "Cash handover needs verification",
          report.bookingId,
          s,
        );
    }
    await audit(
      a,
      report.bookingId,
      `Cash handover recorded; this does not add customer credit`,
      s,
    );
    return handover.id;
  });
}

export async function decideCashHandover(a: Actor, input: unknown) {
  if (a.role !== "owner")
    throw new Error("403: Only Owner verifies cash handover.");
  const p = z
    .object({
      reportId: z.string(),
      version: z.number(),
      handoverId: z.string(),
      decision: z.enum(["Verified", "Rejected"]),
      reason: z.string().trim().max(1000).default(""),
    })
    .strict()
    .parse(input);
  if (p.decision === "Rejected" && !p.reason)
    throw new Error("Add a rejection reason.");
  return transact(async (s) => {
    const c = await collection("collectionReports");
    const report = await c.findOne(
      { _id: p.reportId, org: a.org },
      { session: s },
    );
    if (!report) throw new Error("404: Collection report not found.");
    const handovers = (report.handovers || []).map((entry: Row) =>
      entry.id === p.handoverId && entry.status === "Pending verification"
        ? {
            ...entry,
            status: p.decision,
            reason: p.reason,
            verifiedById: a.id,
            verifiedAt: now(),
          }
        : entry,
    );
    const target = (report.handovers || []).find(
      (entry: Row) => entry.id === p.handoverId,
    );
    if (!target || target.status !== "Pending verification")
      throw new Error("Handover is no longer pending.");
    const handedOverMinor = handovers
      .filter((entry: Row) => entry.status === "Verified")
      .reduce(
        (sum: number, entry: Row) => sum + Number(entry.amountMinor || 0),
        0,
      );
    const custodyStatus =
      handedOverMinor >= report.amountMinor
        ? "Fully handed over"
        : handedOverMinor
          ? "Partly handed over"
          : "Held by collector";
    const result = await c.updateOne(
      { _id: report._id, version: p.version },
      {
        $set: { handovers, handedOverMinor, custodyStatus, updatedAt: now() },
        $inc: { version: 1 },
      },
      { session: s },
    );
    if (!result.matchedCount)
      throw new Error("409: Collection report changed. Refresh first.");
    await audit(
      a,
      report.bookingId,
      `Cash handover ${p.decision.toLowerCase()}; no customer credit created`,
      s,
    );
    return report._id;
  });
}

export async function generateOperationsDocument(a: Actor, input: unknown) {
  const p = z
    .object({
      bookingId: z.string(),
      kind: z.enum([
        "Final itinerary",
        "Hotel / supplier voucher",
        "Passenger manifest",
        "Driver trip sheet",
      ]),
      arrangementId: z.string().default(""),
    })
    .strict()
    .parse(input);
  const prepared = await transact(async (s) => {
    const booking = await bookingAccess(a, p.bookingId, s);
    if (booking.status === "Cancelled") throw new Error("This booking is cancelled. Use the adjustment document instead of a travel document.");
    if (a.role === "operations" && p.kind !== "Driver trip sheet")
      throw new Error(
        "403: Operations can download only their driver trip sheet.",
      );
    const arrangements = await (
      await collection("arrangements")
    )
      .find({ org: a.org, bookingId: booking._id, confirmationStatus: { $ne: "Cancelled" } })
      .toArray();
    const segments = await (
      await collection("tripSegments")
    )
      .find({
        org: a.org,
        bookingId: booking._id,
        status: { $ne: "Cancelled" },
      })
      .sort({ startAt: 1 })
      .toArray();
    if (p.kind === "Final itinerary") {
      const missing = arrangements.filter(
        (item) =>
          item.responsibility === "Agency arranged" &&
          item.confirmationStatus !== "Confirmed",
      );
      if (missing.length)
        throw new Error(
          "Confirm every agency-arranged service before generating the final itinerary.",
        );
    }
    let selectedArrangements = arrangements;
    if (p.kind === "Hotel / supplier voucher") {
      const selected = arrangements.find(
        (item) =>
          item._id === p.arrangementId &&
          item.confirmationStatus === "Confirmed",
      );
      if (!selected)
        throw new Error("Choose a confirmed arrangement for the voucher.");
      selectedArrangements = [selected];
    }
    const selectedSegments =
      a.role === "operations"
        ? segments.filter((item) => item.driverId === a.id)
        : segments;
    if (p.kind === "Driver trip sheet" && !selectedSegments.length)
      throw new Error("No trip segment is assigned to this driver.");
    const lead =
      booking.travellers?.find((traveller: Row) => traveller.lead) ||
      booking.travellers?.[0] ||
      {};
    const staffIds = [
      ...new Set(
        selectedSegments.flatMap((item) => [item.driverId].filter(Boolean)),
      ),
    ];
    const vehicleIds = [
      ...new Set(
        selectedSegments.flatMap((item) => [item.vehicleId].filter(Boolean)),
      ),
    ];
    const [staff, vehicles] = await Promise.all([
      (await collection("staff"))
        .find({ org: a.org, _id: { $in: staffIds } })
        .toArray(),
      (await collection("vehicles"))
        .find({ org: a.org, _id: { $in: vehicleIds } })
        .toArray(),
    ]);
    const snapshot = {
      kind: p.kind,
      status: "Ready",
      bookingNumber: booking.bookingNumber,
      customerName: lead.name || "Traveller",
      customerContact: lead.phone || "Contact available in CRM",
      destination: booking.destination,
      serviceStart: booking.serviceStart,
      serviceEnd: booking.serviceEnd,
      travellers: (booking.travellers || []).filter((t: Row) => !t.cancelled),
      arrangements: selectedArrangements.map((item) => ({
        title: item.title,
        type: item.type,
        confirmationStatus: item.confirmationStatus,
        confirmationReference: item.confirmationReference,
        location: item.location,
        details: item.details,
      })),
      segments: selectedSegments.map((item) => ({
        ...item,
        driver:
          staff.find((person) => person._id === item.driverId)?.name || "",
        vehicle:
          vehicles.find((vehicle) => vehicle._id === item.vehicleId)?.label ||
          "",
      })),
      notes: selectedSegments
        .map((item) => item.assistanceNotes)
        .filter(Boolean)
        .join(" | "),
      createdAt: now(),
    };
    const bytes = await buildOperationsPdf(snapshot);
    const documentId = id();
    await (
      await collection("operationsDocuments")
    ).insertOne(
      {
        _id: documentId,
        org: a.org,
        version: 1,
        bookingId: booking._id,
        kind: p.kind,
        arrangementId: p.arrangementId,
        driverId: a.role === "operations" ? a.id : "",
        snapshot,
        mimeType: "application/pdf",
        bytes: new Binary(Buffer.from(bytes)),
        createdById: a.id,
        createdAt: now(),
      },
      { session: s },
    );
    await audit(a, booking._id, `${p.kind} generated`, s);
    return documentId;
  });
  return prepared;
}

export async function saveTravelDocument(a: Actor, input: unknown) {
  coordinator(a);
  const p = z
    .object({
      bookingId: z.string().min(1),
      category: z.enum([
        "Passport / ID",
        "Ticket",
        "Visa",
        "Permit",
        "Insurance",
        "Other",
      ]),
      travellerName: z.string().trim().min(2).max(160),
      expiresAt: z.union([z.literal(""), z.iso.datetime()]).default(""),
      note: z.string().trim().max(1000).default(""),
      fileName: z.string().trim().min(1).max(220),
      mimeType: z.enum(["image/jpeg", "image/png", "application/pdf"]),
      fileBase64: z.string().min(1).max(2_200_000),
    })
    .strict()
    .parse(input);
  return transact(async (s) => {
    const booking = await bookingAccess(a, p.bookingId, s);
    if (
      !booking.travellers?.some(
        (traveller: Row) => traveller.name === p.travellerName,
      )
    )
      throw new Error("Choose a traveller recorded on this booking.");
    const bytes = Buffer.from(p.fileBase64, "base64");
    if (!bytes.length || bytes.length > 1_500_000)
      throw new Error("Travel document must be 1.5 MB or smaller.");
    const documentId = id();
    await (
      await collection("travelDocuments")
    ).insertOne(
      {
        _id: documentId,
        org: a.org,
        version: 1,
        bookingId: booking._id,
        category: p.category,
        travellerName: p.travellerName,
        expiresAt: p.expiresAt,
        note: p.note,
        fileName: p.fileName,
        mimeType: p.mimeType,
        bytes: new Binary(bytes),
        uploadedById: a.id,
        createdAt: now(),
      },
      { session: s },
    );
    await audit(
      a,
      booking._id,
      `${p.category} document added for ${p.travellerName}`,
      s,
    );
    return documentId;
  });
}

export async function completeTrip(a: Actor, input: unknown) {
  coordinator(a);
  const p = z
    .object({ bookingId: z.string(), version: z.number() })
    .strict()
    .parse(input);
  return transact(async (s) => {
    const booking = await bookingAccess(a, p.bookingId, s);
    if (booking.status === "Cancelled") throw new Error("This booking was cancelled and cannot be completed as a trip.");
    const [arrangements, segments, readiness, incidents] = await Promise.all([
      (await collection("arrangements"))
        .find(
          {
            org: a.org,
            bookingId: booking._id,
            responsibility: "Agency arranged",
            confirmationStatus: { $nin: ["Cancelled"] },
          },
          { session: s },
        )
        .toArray(),
      (await collection("tripSegments"))
        .find(
          { org: a.org, bookingId: booking._id, status: { $ne: "Cancelled" } },
          { session: s },
        )
        .toArray(),
      (await collection("readinessItems"))
        .find({ org: a.org, bookingId: booking._id }, { session: s })
        .toArray(),
      (await collection("incidents")).countDocuments(
        { org: a.org, bookingId: booking._id, status: "Open" },
        { session: s },
      ),
    ]);
    if (arrangements.some((item) => item.confirmationStatus !== "Confirmed"))
      throw new Error(
        "Resolve or confirm every active agency arrangement first.",
      );
    if (segments.some((item) => item.status !== "Completed"))
      throw new Error("Complete every active trip segment first.");
    if (readiness.some((item) => ["Pending", "Blocked"].includes(item.status)))
      throw new Error("Resolve every pending or blocked readiness item first.");
    if (incidents) throw new Error("Resolve open trip incidents first.");
    const result = await (
      await collection("bookings")
    ).updateOne(
      { _id: booking._id, version: p.version },
      {
        $set: {
          status: "Trip completed",
          tripCompletedAt: now(),
          tripCompletedById: a.id,
          settlementOutstanding: true,
          updatedAt: now(),
        },
        $inc: { version: 1 },
      },
      { session: s },
    );
    if (!result.matchedCount)
      throw new Error("409: Booking changed. Refresh first.");
    await task(
      a,
      `feedback:${booking._id}`,
      `Request feedback for ${booking.bookingNumber}`,
      booking.salesAssigneeId,
      booking._id,
      new Date(Date.now() + 24 * 3600000).toISOString(),
      s,
    );
    await notify(
      a,
      booking.salesAssigneeId,
      `feedback:${booking._id}`,
      "Trip completed - request customer feedback",
      booking._id,
      s,
    );
    await audit(
      a,
      booking._id,
      "Trip marked complete; financial settlement remains open",
      s,
    );
    return booking._id;
  });
}

export async function operationsReminders() {
  const current = now();
  const holds = await (
    await collection("arrangements")
  )
    .find({
      confirmationStatus: "On hold",
      holdUntil: { $ne: "", $lte: current },
    })
    .toArray();
  for (const arrangement of holds) {
    const booking = await (
      await collection("bookings")
    ).findOne({
      _id: arrangement.bookingId,
      org: arrangement.org,
    });
    if (!booking) continue;
    const system: Actor = {
      id: "system",
      authId: "system",
      org: arrangement.org,
      name: "System",
      role: "owner",
    };
    await transact(async (s) =>
      notifyCoordinators(
        system,
        booking,
        `hold:expired:${arrangement._id}`,
        `${arrangement.title} supplier hold has expired`,
        s,
      ),
    );
  }
  const upcoming = await (
    await collection("tripSegments")
  )
    .find({
      status: "Scheduled",
      startAt: {
        $gte: current,
        $lte: new Date(Date.now() + 12 * 3600000).toISOString(),
      },
      driverId: { $ne: "" },
    })
    .toArray();
  for (const segment of upcoming) {
    const system: Actor = {
      id: "system",
      authId: "system",
      org: segment.org,
      name: "System",
      role: "owner",
    };
    await notify(
      system,
      segment.driverId,
      `trip:reminder:${segment._id}:${segment.startAt}`,
      `Upcoming trip: ${segment.title}`,
      segment.bookingId,
    );
  }
  return { expiredHolds: holds.length, upcomingTrips: upcoming.length };
}
