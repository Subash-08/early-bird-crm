import { createHash } from "node:crypto";
import type { ClientSession } from "mongodb";
import type { Actor } from "@/lib/domain";
import {
  attendanceActionSchema,
  attendanceCorrectionSchema,
  attendanceDecisionSchema,
  attendanceDateSchema,
  attendanceHolidaySchema,
  offsiteAttendanceSchema,
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
const policyId = (org: string) => `attendance-policy:${org}`;
const holidayId = (org: string, date: string) => `attendance-holiday:${org}:${date}`;

async function holidayFor(org: string, date: string, session?: ClientSession) {
  return (await collection("attendanceHolidays")).findOne({ _id: holidayId(org, date), org }, { session });
}

export async function saveAttendanceHoliday(a: Actor, input: unknown) {
  owner(a);
  const { workDate, name } = attendanceHolidaySchema.parse(input);
  const key = holidayId(a.org, workDate);
  await transact(async (s) => {
    await (await collection("attendanceHolidays")).updateOne({ _id: key, org: a.org },
      { $set: { name, workDate, updatedAt: stamp() }, $inc: { version: 1 } }, { upsert: true, session: s });
    await audit(a, key, "Attendance holiday saved", s);
  });
}

export async function removeAttendanceHoliday(a: Actor, input: unknown) {
  owner(a);
  const workDate = attendanceDateSchema.parse(input);
  const key = holidayId(a.org, workDate);
  await transact(async (s) => {
    const result = await (await collection("attendanceHolidays")).deleteOne({ _id: key, org: a.org }, { session: s });
    if (result.deletedCount) await audit(a, key, "Attendance holiday removed", s);
  });
}

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

export function presentSession(session: Record<string, unknown>, today: string) {
  const checkInAt = session.effectiveCheckInAt || session.checkInAt || null;
  const checkOutAt = session.effectiveCheckOutAt || session.checkOutAt || null;
  return {
    ...session,
    checkInAt,
    checkOutAt,
    totalWorkingMinutes: session.effectiveTotalWorkingMinutes ?? session.totalWorkingMinutes ?? null,
    displayStatus: checkInAt ? sessionStatus({ ...session, status: session.effectiveStatus || session.status, checkInAt, checkOutAt }, today) : "Not checked in",
  };
}

export async function attendanceOverview(a: Actor, input: { date?: string; staffId?: string } = {}) {
  const policy = await policyFor(a.org);
  const today = workDateAt(now(), policy.timezone);
  const date = a.role === "owner" ? attendanceDateSchema.safeParse(input.date).data ?? today : today;
  const holiday = await holidayFor(a.org, date);
  const dayType = holiday ? "Holiday" : policy.workingDays.includes(new Date(`${date}T12:00:00Z`).getUTCDay()) ? "Workday" : "Day off";
  const calendar = { holiday: holiday ? { name: String(holiday.name) } : null, dayType };
  const sessions = await collection("attendanceSessions");
  if (a.role !== "owner") {
    const [current, history, exceptions] = await Promise.all([
      sessions.findOne({ org: a.org, staffId: a.id, workDate: date }),
      sessions.find({ org: a.org, staffId: a.id }).sort({ workDate: -1 }).limit(31).toArray(),
      (await collection("attendanceExceptions")).find({ org: a.org, staffId: a.id }).sort({ createdAt: -1 }).limit(20).toArray(),
    ]);
    return { role: "staff", date, today, ...calendar, policy: publicPolicy(policy), current: current ? presentSession(current, today) : null, history: history.map((row) => presentSession(row, today)), exceptions };
  }
  const rows = await sessions.find({ org: a.org, workDate: date }).toArray();
  const staff = await (await collection("staff")).find({ org: a.org, $or: [
    { status: "active", role: { $in: ["sales", "operations"] } },
    { _id: { $in: rows.map((row) => row.staffId) } },
  ] }, { projection: { name: 1, role: 1, createdAt: 1, requestedAt: 1 } }).sort({ name: 1 }).toArray();
  const sessionByStaff = new Map(rows.map((row) => [row.staffId, row]));
  const attendance = staff.filter((person) => {
    const joined = person.createdAt || person.requestedAt;
    const joinedAt = joined ? new Date(joined) : null;
    return (!input.staffId || person._id === input.staffId) &&
      (sessionByStaff.has(person._id) || !joinedAt || !Number.isFinite(joinedAt.getTime()) || workDateAt(joinedAt, policy.timezone) <= date);
  }).map((person) => {
    const current = sessionByStaff.get(person._id);
    return { staffId: person._id, name: person.name, role: person.role, ...(current ? presentSession(current, today) : {}),
      displayStatus: current ? presentSession(current, today).displayStatus : dayType !== "Workday" ? dayType : date > today ? "Scheduled" : date === today ? "Not checked in" : "Absent" };
  });
  const pendingExceptions = await (await collection("attendanceExceptions")).find({ org: a.org, status: "Pending" }).sort({ createdAt: -1 }).limit(100).toArray();
  const names = new Map(staff.map((person) => [person._id, person.name]));
  const exceptions = pendingExceptions.map((item) => ({ ...item, staffName: names.get(item.staffId) || item.staffName || "Former staff member" }));
  const summary = {
    present: attendance.filter((row) => Boolean(sessionByStaff.get(row.staffId))).length,
    late: attendance.filter((row) => {
      const record = sessionByStaff.get(row.staffId);
      return (record?.effectiveStatus || record?.status) === "Late";
    }).length,
    absent: attendance.filter((row) => row.displayStatus === "Absent" || row.displayStatus === "Not checked in").length,
    missingCheckout: attendance.filter((row) => row.displayStatus === "Missed checkout").length,
  };
  return { role: "owner", date, today, ...calendar, policy: publicPolicy(policy), staff: staff.map((person) => ({ id: person._id, name: person.name })), attendance, exceptions, summary };
}

export async function checkIn(a: Actor, input: unknown) {
  employee(a);
  const command = attendanceActionSchema.parse(input);
  return transact(async (s) => {
    const policy = await policyFor(a.org, s);
    const instant = now();
    const workDate = workDateAt(instant, policy.timezone);
    if (await holidayFor(a.org, workDate, s)) throw new Error("Today is an office holiday. Submit an attendance request if you worked.");
    if (!policy.workingDays.includes(weekdayAt(instant, policy.timezone))) throw new Error("Today is not a scheduled working day.");
    const location = await verifyLocation(policy, command);
    const sessions = await collection("attendanceSessions");
    const existing = await sessions.findOne({ org: a.org, staffId: a.id, workDate }, { session: s });
    if (existing?.checkInAt || existing?.effectiveCheckInAt) throw new Error("Attendance already has a check-in for today.");
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
    const checkInAt = session?.effectiveCheckInAt || session?.checkInAt;
    if (!session || !checkInAt) throw new Error("Check-in is required before check-out.");
    if (session.checkOutAt || session.effectiveCheckOutAt) throw new Error("You already checked out today.");
    const eventId = `attendance:${command.commandId}:check-out`;
    await (await collection("attendanceEvents")).updateOne({ _id: eventId }, { $setOnInsert: {
      _id: eventId, org: a.org, version: 1, staffId: a.id, sessionId: session._id,
      type: "Check out", serverAt: instant.toISOString(), capturedAt: location.capturedAt,
      location: { latitude: location.latitude, longitude: location.longitude, accuracyM: location.accuracyM, distanceM: location.distanceM },
      officeName: policy.officeName, source: "web", createdAt: stamp(),
    } }, { upsert: true, session: s });
    const totalWorkingMinutes = durationMinutes(String(checkInAt), instant.toISOString());
    await sessions.updateOne({ _id: session._id, org: a.org, checkOutAt: { $exists: false } }, { $set: { checkOutAt: instant.toISOString(), checkOutEventId: eventId, totalWorkingMinutes, updatedAt: stamp() }, $inc: { version: 1 } }, { session: s });
    await audit(a, session._id, "Attendance check-out recorded", s);
    return { workDate, checkOutAt: instant.toISOString(), totalWorkingMinutes };
  });
}

export async function requestAttendanceCorrection(a: Actor, input: unknown) {
  employee(a);
  return submitAttendanceRequest(a, attendanceCorrectionSchema.parse(input));
}

export async function requestOffsiteAttendance(a: Actor, input: unknown) {
  employee(a);
  const { workDate, start, end, place, reason, reference } = offsiteAttendanceSchema.parse(input);
  return submitAttendanceRequest(a, {
    workDate, reason,
    requestedCheckIn: new Date(`${workDate}T${start}:00+05:30`).toISOString(),
    requestedCheckOut: new Date(`${workDate}T${end}:00+05:30`).toISOString(),
  }, { place, reference });
}

async function submitAttendanceRequest(
  a: Actor, request: ReturnType<typeof attendanceCorrectionSchema.parse>,
  offsite?: { place: string; reference: string },
) {
  const policy = await policyFor(a.org);
  const instant = now();
  if (request.workDate > workDateAt(instant, policy.timezone)) throw new Error("Choose today or a past date.");
  const normalize = (value: string) => {
    if (!value) return null;
    const time = new Date(value);
    if (time > instant) throw new Error("Attendance requests cannot include future times.");
    if (workDateAt(time, policy.timezone) !== request.workDate) throw new Error("Enter times on the selected date (India time).");
    return time.toISOString();
  };
  const requestedCheckIn = normalize(request.requestedCheckIn);
  const requestedCheckOut = normalize(request.requestedCheckOut);
  const label = offsite ? "Off-site attendance" : "Attendance correction";
  return transact(async (s) => {
    const requests = await collection("attendanceExceptions");
    const scope = { org: a.org, staffId: a.id, workDate: request.workDate };
    if (await requests.findOne({ ...scope, status: "Pending" }, { session: s }))
      throw new Error("409: An attendance request is already waiting for review for this date.");
    const sequence = await requests.countDocuments(scope, { session: s });
    const requestId = `attendance-request:${createHash("sha256").update(JSON.stringify([a.org, a.id, request.workDate, sequence])).digest("hex")}`;
    await requests.insertOne({ _id: requestId, ...scope, version: 1, staffName: a.name,
      kind: offsite ? "offsite" : "correction", ...offsite, requestedCheckIn, requestedCheckOut,
      reason: request.reason, status: "Pending", createdAt: stamp(), updatedAt: stamp() }, { session: s });
    const owners = await (await collection("staff")).find({ org: a.org, role: "owner", status: "active" }, { session: s }).toArray();
    for (const person of owners) await notify(a, person._id, `attendance-correction:${requestId}:${person._id}`, `${label} needs review`, requestId, s);
    await audit(a, requestId, `${label} requested`, s);
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
    const label = record.kind === "offsite" ? "Off-site attendance" : "Attendance correction";
    if (decision.decision === "Approved") {
      const policy = await policyFor(a.org, s);
      const sessions = await collection("attendanceSessions");
      const existing = await sessions.findOne({ org: a.org, staffId: record.staffId, workDate: record.workDate }, { session: s });
      const effectiveCheckInAt = record.requestedCheckIn || existing?.effectiveCheckInAt || existing?.checkInAt || "";
      const effectiveCheckOutAt = record.requestedCheckOut || existing?.effectiveCheckOutAt || existing?.checkOutAt || "";
      if (!effectiveCheckInAt) throw new Error("This request needs a check-in time before it can be approved.");
      if (effectiveCheckOutAt && Date.parse(effectiveCheckOutAt) <= Date.parse(effectiveCheckInAt)) throw new Error("Corrected check-out must be after check-in.");
      const effectiveStatus = record.kind === "offsite" || existing?.attendanceKind === "offsite" ? "Present" : attendanceStatusAt(new Date(effectiveCheckInAt), policy);
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
            attendanceKind: record.kind === "offsite" || existing?.attendanceKind === "offsite" ? "offsite" : "office",
            correctionId: record._id,
            updatedAt: stamp(),
          },
          $setOnInsert: { createdAt: stamp() },
          $inc: { version: 1 },
        },
        { upsert: true, session: s },
      );
    }
    await corrections.updateOne({ _id: record._id, version: record.version, status: "Pending" }, { $set: { status: decision.decision, ownerNote: decision.note, decidedAt: stamp(), decidedById: a.id, updatedAt: stamp() }, $inc: { version: 1 } }, { session: s });
    await notify(a, record.staffId, `attendance-correction-decision:${record._id}`, `${label} ${decision.decision.toLowerCase()}`, record._id, s);
    await audit(a, record._id, `${label} ${decision.decision.toLowerCase()}`, s);
    return record._id;
  });
}

export async function saveAttendancePolicy(a: Actor, input: unknown) {
  owner(a);
  const policy = attendancePolicySchema.parse(input);
  await (await collection("attendancePolicies")).updateOne({ _id: policyId(a.org), org: a.org }, { $set: { ...policy, org: a.org, updatedAt: stamp() }, $setOnInsert: { _id: policyId(a.org), createdAt: stamp() }, $inc: { version: 1 } }, { upsert: true });
  await audit(a, policyId(a.org), "Attendance policy updated");
}
