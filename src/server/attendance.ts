import { z } from "zod";
import type { ClientSession } from "mongodb";
import type { Actor } from "@/lib/domain";
import {
  attendanceActionSchema,
  attendanceCorrectionSchema,
  attendanceDecisionSchema,
  attendancePolicySchema,
  attendanceStatusAt,
  distanceMetres,
  durationMinutes,
  weekdayAt,
  workDateAt,
  type AttendancePolicy,
} from "@/lib/attendance-domain";
import { collection } from "./db";
import { audit, notify, owner, transact } from "./crm";

const now = () => new Date();
const stamp = () => now().toISOString();
const id = () => crypto.randomUUID();
const policyId = (org: string) => `attendance-policy:${org}`;

const initialPolicy: AttendancePolicy = {
  officeName: "EarlyBird office",
  latitude: 11.780343,
  longitude: 77.7937358,
  radiusM: 100,
  maximumAccuracyM: 50,
  maximumLocationAgeSeconds: 60,
  timezone: "Asia/Kolkata",
  workStart: "09:30",
  workEnd: "18:30",
  graceMinutes: 10,
  workingDays: [1, 2, 3, 4, 5, 6],
};

function employee(a: Actor) {
  if (a.role === "owner") throw new Error("403: Owner monitors attendance and does not check in.");
  if (a.role !== "sales" && a.role !== "operations") throw new Error("403: Attendance is not available for this role.");
}

async function policyFor(org: string, session?: ClientSession): Promise<AttendancePolicy & { _id: string; org: string; version: number }> {
  const policies = await collection("attendancePolicies");
  const found = await policies.findOne({ _id: policyId(org), org }, { session });
  if (found) {
    const policy = attendancePolicySchema.parse({
      officeName: found.officeName,
      latitude: found.latitude,
      longitude: found.longitude,
      radiusM: found.radiusM,
      maximumAccuracyM: found.maximumAccuracyM,
      maximumLocationAgeSeconds: found.maximumLocationAgeSeconds,
      timezone: found.timezone,
      workStart: found.workStart,
      workEnd: found.workEnd,
      graceMinutes: found.graceMinutes,
      workingDays: found.workingDays,
    });
    return { _id: found._id, org: found.org, version: Number(found.version || 1), ...policy };
  }
  const created = { _id: policyId(org), org, version: 1, ...initialPolicy, createdAt: stamp(), updatedAt: stamp() };
  await policies.updateOne({ _id: created._id }, { $setOnInsert: created }, { upsert: true, session });
  return created;
}

function publicPolicy(policy: AttendancePolicy) {
  return {
    officeName: policy.officeName,
    latitude: policy.latitude,
    longitude: policy.longitude,
    radiusM: policy.radiusM,
    maximumAccuracyM: policy.maximumAccuracyM,
    maximumLocationAgeSeconds: policy.maximumLocationAgeSeconds,
    timezone: policy.timezone,
    workStart: policy.workStart,
    workEnd: policy.workEnd,
    graceMinutes: policy.graceMinutes,
    workingDays: policy.workingDays,
  };
}

async function verifyLocation(policy: AttendancePolicy, raw: unknown) {
  const location = attendanceActionSchema.parse(raw).location;
  const captured = new Date(location.capturedAt);
  const age = now().getTime() - captured.getTime();
  if (age < -30_000 || age > policy.maximumLocationAgeSeconds * 1_000)
    throw new Error("Your location is no longer current. Try again.");
  if (location.accuracyM > policy.maximumAccuracyM)
    throw new Error(`Location accuracy is too low (${Math.round(location.accuracyM)} m). Move outdoors and try again.`);
  const distanceM = distanceMetres(location, policy);
  if (distanceM > policy.radiusM)
    throw new Error(`You are ${Math.round(distanceM)} m from the office. Check-in is allowed within ${policy.radiusM} m.`);
  return { ...location, distanceM: Math.round(distanceM * 10) / 10 };
}

function sessionStatus(session: Record<string, unknown>, today: string) {
  if (!session.checkInAt) return "Not checked in";
  if (!session.checkOutAt && session.workDate !== today) return "Missed checkout";
  if (!session.checkOutAt) return "Checked in";
  return session.status || "Present";
}

function presentSession(session: Record<string, unknown>, today: string) {
  const checkInAt = session.effectiveCheckInAt || session.checkInAt || null;
  const checkOutAt = session.effectiveCheckOutAt || session.checkOutAt || null;
  return {
    ...session,
    checkInAt,
    checkOutAt,
    totalWorkingMinutes: session.effectiveTotalWorkingMinutes ?? session.totalWorkingMinutes ?? null,
    displayStatus: session.effectiveStatus || (checkInAt ? sessionStatus({ ...session, checkInAt, checkOutAt }, today) : "Not checked in"),
  };
}

export async function attendanceOverview(a: Actor, input: { date?: string; staffId?: string } = {}) {
  const policy = await policyFor(a.org);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(input.date || "")) ? String(input.date) : workDateAt(now(), policy.timezone);
  const today = workDateAt(now(), policy.timezone);
  const sessions = await collection("attendanceSessions");
  if (a.role !== "owner") {
    const [current, history, exceptions] = await Promise.all([
      sessions.findOne({ org: a.org, staffId: a.id, workDate: date }),
      sessions.find({ org: a.org, staffId: a.id }).sort({ workDate: -1 }).limit(31).toArray(),
      (await collection("attendanceExceptions")).find({ org: a.org, staffId: a.id }).sort({ createdAt: -1 }).limit(20).toArray(),
    ]);
    return { role: "staff", date, today, policy: publicPolicy(policy), current: current ? presentSession(current, today) : null, history: history.map((row) => presentSession(row, today)), exceptions };
  }
  const staff = await (await collection("staff")).find({ org: a.org, status: "active", role: { $in: ["sales", "operations"] } }, { projection: { name: 1, role: 1, status: 1 } }).sort({ name: 1 }).toArray();
  const staffIds = staff.map((row) => row._id);
  const rows = await sessions.find({ org: a.org, workDate: date, ...(input.staffId && staffIds.includes(input.staffId) ? { staffId: input.staffId } : {}) }).toArray();
  const sessionByStaff = new Map(rows.map((row) => [row.staffId, row]));
  const attendance = staff.filter((person) => !input.staffId || person._id === input.staffId).map((person) => {
    const current = sessionByStaff.get(person._id);
    return { staffId: person._id, name: person.name, role: person.role, ...(current ? presentSession(current, today) : {}), displayStatus: current ? presentSession(current, today).displayStatus : "Absent" };
  });
  const pendingExceptions = await (await collection("attendanceExceptions")).find({ org: a.org, status: "Pending" }).sort({ createdAt: -1 }).limit(100).toArray();
  const names = new Map(staff.map((person) => [person._id, person.name]));
  const exceptions = pendingExceptions.map((item) => ({ ...item, staffName: names.get(item.staffId) || "Former staff member" }));
  const summary = {
    present: attendance.filter((row) => ["Present", "Late", "Checked in"].includes(String(row.displayStatus))).length,
    late: attendance.filter((row) => row.displayStatus === "Late").length,
    absent: attendance.filter((row) => row.displayStatus === "Absent").length,
    missingCheckout: attendance.filter((row) => row.displayStatus === "Missed checkout").length,
  };
  return { role: "owner", date, today, policy: publicPolicy(policy), staff: staff.map((person) => ({ id: person._id, name: person.name })), attendance, exceptions, summary };
}

export async function checkIn(a: Actor, input: unknown) {
  employee(a);
  const command = attendanceActionSchema.parse(input);
  return transact(async (s) => {
    const policy = await policyFor(a.org, s);
    const instant = now();
    if (!policy.workingDays.includes(weekdayAt(instant, policy.timezone))) throw new Error("Today is not a scheduled working day.");
    const location = await verifyLocation(policy, command);
    const workDate = workDateAt(instant, policy.timezone);
    const sessions = await collection("attendanceSessions");
    const existing = await sessions.findOne({ org: a.org, staffId: a.id, workDate }, { session: s });
    if (existing?.checkInAt) throw new Error("You already checked in today.");
    const eventId = `attendance:${command.commandId}:check-in`;
    const event = {
      _id: eventId, org: a.org, version: 1, staffId: a.id, sessionId: `attendance-session:${a.org}:${a.id}:${workDate}`,
      type: "Check in", serverAt: instant.toISOString(), capturedAt: location.capturedAt,
      location: { latitude: location.latitude, longitude: location.longitude, accuracyM: location.accuracyM, distanceM: location.distanceM },
      officeName: policy.officeName, source: "web", createdAt: stamp(),
    };
    await (await collection("attendanceEvents")).updateOne({ _id: eventId }, { $setOnInsert: event }, { upsert: true, session: s });
    await sessions.insertOne({
      _id: event.sessionId, org: a.org, version: 1, staffId: a.id, workDate,
      checkInAt: instant.toISOString(), checkInEventId: eventId, status: attendanceStatusAt(instant, policy),
      createdAt: stamp(), updatedAt: stamp(),
    }, { session: s });
    await audit(a, event.sessionId, "Attendance check-in recorded", s);
    return { workDate, checkInAt: instant.toISOString(), status: attendanceStatusAt(instant, policy) };
  });
}

export async function checkOut(a: Actor, input: unknown) {
  employee(a);
  const command = attendanceActionSchema.parse(input);
  return transact(async (s) => {
    const policy = await policyFor(a.org, s);
    const instant = now();
    const location = await verifyLocation(policy, command);
    const workDate = workDateAt(instant, policy.timezone);
    const sessions = await collection("attendanceSessions");
    const session = await sessions.findOne({ org: a.org, staffId: a.id, workDate }, { session: s });
    if (!session?.checkInAt) throw new Error("Check-in is required before check-out.");
    if (session.checkOutAt) throw new Error("You already checked out today.");
    const eventId = `attendance:${command.commandId}:check-out`;
    await (await collection("attendanceEvents")).updateOne({ _id: eventId }, { $setOnInsert: {
      _id: eventId, org: a.org, version: 1, staffId: a.id, sessionId: session._id,
      type: "Check out", serverAt: instant.toISOString(), capturedAt: location.capturedAt,
      location: { latitude: location.latitude, longitude: location.longitude, accuracyM: location.accuracyM, distanceM: location.distanceM },
      officeName: policy.officeName, source: "web", createdAt: stamp(),
    } }, { upsert: true, session: s });
    const totalWorkingMinutes = durationMinutes(String(session.checkInAt), instant.toISOString());
    await sessions.updateOne({ _id: session._id, org: a.org, checkOutAt: { $exists: false } }, { $set: { checkOutAt: instant.toISOString(), checkOutEventId: eventId, totalWorkingMinutes, updatedAt: stamp() }, $inc: { version: 1 } }, { session: s });
    await audit(a, session._id, "Attendance check-out recorded", s);
    return { workDate, checkOutAt: instant.toISOString(), totalWorkingMinutes };
  });
}

export async function requestAttendanceCorrection(a: Actor, input: unknown) {
  employee(a);
  const request = attendanceCorrectionSchema.parse(input);
  const policy = await policyFor(a.org);
  if (request.workDate > workDateAt(now(), policy.timezone)) throw new Error("A future date cannot be corrected.");
  return transact(async (s) => {
    const duplicate = await (await collection("attendanceExceptions")).findOne({ org: a.org, staffId: a.id, workDate: request.workDate, status: "Pending" }, { session: s });
    if (duplicate) throw new Error("A correction request is already waiting for review for this date.");
    const requestId = id();
    await (await collection("attendanceExceptions")).insertOne({ _id: requestId, org: a.org, version: 1, staffId: a.id, workDate: request.workDate, requestedCheckIn: request.requestedCheckIn || null, requestedCheckOut: request.requestedCheckOut || null, reason: request.reason, status: "Pending", createdAt: stamp(), updatedAt: stamp() }, { session: s });
    const owners = await (await collection("staff")).find({ org: a.org, role: "owner", status: "active" }, { session: s }).toArray();
    for (const person of owners) await notify(a, person._id, `attendance-correction:${requestId}:${person._id}`, "Attendance correction needs review", requestId, s);
    await audit(a, requestId, "Attendance correction requested", s);
    return requestId;
  });
}

export async function decideAttendanceCorrection(a: Actor, input: unknown) {
  owner(a);
  const decision = attendanceDecisionSchema.parse(input);
  return transact(async (s) => {
    const corrections = await collection("attendanceExceptions");
    const record = await corrections.findOne({ _id: decision.id, org: a.org, status: "Pending" }, { session: s });
    if (!record) throw new Error("404: Attendance correction request not found or already reviewed.");
    if (decision.decision === "Approved") {
      const policy = await policyFor(a.org, s);
      const sessions = await collection("attendanceSessions");
      const existing = await sessions.findOne({ org: a.org, staffId: record.staffId, workDate: record.workDate }, { session: s });
      const effectiveCheckInAt = record.requestedCheckIn || existing?.checkInAt || "";
      const effectiveCheckOutAt = record.requestedCheckOut || existing?.checkOutAt || "";
      if (!effectiveCheckInAt) throw new Error("This request needs a check-in time before it can be approved.");
      if (effectiveCheckOutAt && effectiveCheckOutAt <= effectiveCheckInAt) throw new Error("Corrected check-out must be after check-in.");
      const effectiveStatus = attendanceStatusAt(new Date(effectiveCheckInAt), policy);
      await sessions.updateOne(
        { _id: existing?._id || `attendance-session:${a.org}:${record.staffId}:${record.workDate}`, org: a.org },
        {
          $set: {
            org: a.org,
            staffId: record.staffId,
            workDate: record.workDate,
            effectiveCheckInAt,
            effectiveCheckOutAt: effectiveCheckOutAt || null,
            effectiveTotalWorkingMinutes: effectiveCheckOutAt ? durationMinutes(effectiveCheckInAt, effectiveCheckOutAt) : null,
            effectiveStatus,
            correctionId: record._id,
            updatedAt: stamp(),
          },
          $setOnInsert: { _id: `attendance-session:${a.org}:${record.staffId}:${record.workDate}`, version: 0, createdAt: stamp() },
          $inc: { version: 1 },
        },
        { upsert: true, session: s },
      );
    }
    await corrections.updateOne({ _id: record._id, version: record.version, status: "Pending" }, { $set: { status: decision.decision, ownerNote: decision.note, decidedAt: stamp(), decidedById: a.id, updatedAt: stamp() }, $inc: { version: 1 } }, { session: s });
    await notify(a, record.staffId, `attendance-correction-decision:${record._id}`, `Attendance correction ${decision.decision.toLowerCase()}`, record._id, s);
    await audit(a, record._id, `Attendance correction ${decision.decision.toLowerCase()}`, s);
    return record._id;
  });
}

export async function saveAttendancePolicy(a: Actor, input: unknown) {
  owner(a);
  const policy = attendancePolicySchema.parse(input);
  await (await collection("attendancePolicies")).updateOne({ _id: policyId(a.org), org: a.org }, { $set: { ...policy, org: a.org, updatedAt: stamp() }, $setOnInsert: { _id: policyId(a.org), createdAt: stamp() }, $inc: { version: 1 } }, { upsert: true });
  await audit(a, policyId(a.org), "Attendance policy updated");
}
