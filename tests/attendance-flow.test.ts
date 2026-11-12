import { afterAll, beforeAll, expect, it } from "vitest";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { workDateAt } from "../src/lib/attendance-domain";
import { activityDateBounds } from "../src/lib/activity-range";
import type { Actor } from "../src/lib/domain";

let replica: MongoMemoryReplSet;
let db: typeof import("../src/server/db");
let attendance: typeof import("../src/server/attendance");
const owner: Actor = { org: "attendance-test", id: "owner", role: "owner", name: "Owner", authId: "owner" };
const staff: Actor = { ...owner, id: "staff", role: "sales", name: "Staff", authId: "staff" };
const other: Actor = { ...staff, id: "other", name: "Other", authId: "other" };

beforeAll(async () => {
  replica = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  process.env.MONGODB_URI = replica.getUri();
  process.env.MONGODB_DB_NAME = "attendance_flow";
  db = await import("../src/server/db");
  attendance = await import("../src/server/attendance");
  await db.indexes();
  await (await db.collection("staff")).insertMany([owner, staff, other].map((person) => ({
    _id: person.id, org: person.org, name: person.name, email: `${person.id}@example.test`, role: person.role, status: "active", version: 1,
  })));
});
afterAll(async () => { if (db) await (await db.client()).close(); if (replica) await replica.stop(); });

it("approves a correction that needs a new daily record without a MongoDB version conflict", async () => {
  const id = await attendance.requestAttendanceCorrection(staff, {
    workDate: "2025-11-10", requestedCheckIn: "2025-11-10T09:30:00+05:30", requestedCheckOut: "2025-11-10T18:30:00+05:30", reason: "Internet was unavailable.",
  });
  await expect(attendance.decideAttendanceCorrection(staff, { id, decision: "Approved" })).rejects.toThrow("Owner");
  await attendance.decideAttendanceCorrection(owner, { id, decision: "Approved" });
  const row = await (await db.collection("attendanceSessions")).findOne({ org: owner.org, staffId: staff.id, workDate: "2025-11-10" });
  expect(row).toMatchObject({ version: 1, effectiveTotalWorkingMinutes: 540, effectiveStatus: "Present" });
  expect(row?.checkInAt).toBeUndefined();
  await expect(attendance.decideAttendanceCorrection(owner, { id, decision: "Approved" })).rejects.toThrow("already reviewed");
});

it("marks a holiday without absences, blocks normal check-in, and supports removing it", async () => {
  const workDate = workDateAt(new Date(), "Asia/Kolkata");
  await expect(attendance.saveAttendanceHoliday(staff, { workDate, name: "Office holiday" })).rejects.toThrow("Owner");
  await attendance.saveAttendanceHoliday(owner, { workDate, name: "Office holiday" });
  const overview = await attendance.attendanceOverview(owner, { date: workDate });
  expect(overview).toMatchObject({ dayType: "Holiday", holiday: { name: "Office holiday" }, summary: { absent: 0 } });
  expect(overview).toMatchObject({ attendance: [{ displayStatus: "Holiday" }, { displayStatus: "Holiday" }] });
  await expect(attendance.checkIn(staff, {
    commandId: crypto.randomUUID(), location: { latitude: 11.78, longitude: 77.79, accuracyM: 10, capturedAt: new Date().toISOString() },
  })).rejects.toThrow("office holiday");
  await attendance.removeAttendanceHoliday(owner, workDate);
  expect((await attendance.attendanceOverview(staff)).holiday).toBeNull();
});

it("only records off-site work after Owner approval, including on a holiday", async () => {
  const workDate = "2025-11-11";
  const payload = { workDate, start: "10:00", end: "14:30", place: "Supplier office", reason: "Confirmed vehicles for the next trip.", reference: "TEST-123" };
  await attendance.saveAttendanceHoliday(owner, { workDate, name: "Office closed" });
  const results = await Promise.allSettled([attendance.requestOffsiteAttendance(staff, payload), attendance.requestOffsiteAttendance(staff, payload)]);
  const submitted = results.filter((result) => result.status === "fulfilled");
  expect(submitted).toHaveLength(1);
  const id = submitted[0].value;
  expect(await attendance.attendanceOverview(owner, { date: workDate })).toMatchObject({ summary: { present: 0 } });
  expect((await attendance.attendanceOverview(other)).exceptions).toEqual([]);
  await attendance.decideAttendanceCorrection(owner, { id, decision: "Approved", note: "Verified with supplier." });
  const overview = await attendance.attendanceOverview(owner, { date: workDate });
  expect(overview).toMatchObject({ summary: { present: 1, late: 0, absent: 0 } });
  expect(overview).toEqual(expect.objectContaining({ attendance: expect.arrayContaining([
    expect.objectContaining({ staffId: staff.id, displayStatus: "Present", attendanceKind: "offsite", totalWorkingMinutes: 270 }),
  ]) }));
  expect((await attendance.attendanceOverview(staff)).exceptions[0]).toMatchObject({ status: "Approved", reference: "TEST-123" });
});

it("scopes period attendance to the staff member and uses India date boundaries", async () => {
  const { teamActivity } = await import("../src/server/team-activity");
  const range = { from: "2025-11-10", to: "2025-11-10", staffId: null };
  expect(activityDateBounds(range.from, range.to)).toMatchObject({ start: "2025-11-09T18:30:00.000Z", end: "2025-11-10T18:30:00.000Z" });
  await expect(teamActivity(staff, { ...range, staffId: other.id })).rejects.toThrow("own attendance");
  await expect(teamActivity(owner, { ...range, staffId: "unknown" })).rejects.toThrow("Team member not found");
  await expect(teamActivity(staff, { ...range, to: "2026-12-31" })).rejects.toThrow("93 days");
  const result = await teamActivity(staff, range);
  expect(result).toMatchObject({ attendance: { present: 1, minutes: 540 } });
  expect(result).not.toHaveProperty("work");
});

it("counts explicitly logged calls and task completions without counting ordinary edits", async () => {
  const { teamActivity } = await import("../src/server/team-activity");
  const { saveEnquiry, saveTask } = await import("../src/server/crm");
  const current = new Date().toISOString();
  const day = workDateAt(new Date(current), "Asia/Kolkata");
  await (await db.collection("customers")).insertOne({ _id: "activity-customer", org: owner.org, version: 1, name: "Test customer", assigneeId: staff.id });
  const payload = { customerId: "activity-customer", source: "Phone", assigneeId: staff.id, firstContactAt: current, contactOutcome: "Connected" };
  const enquiry = await saveEnquiry(staff, payload, undefined, undefined, true);
  await saveEnquiry(staff, { ...payload, destination: "Kochi" }, enquiry, 1);
  await expect(saveEnquiry(staff, payload, enquiry, 1, true)).rejects.toThrow("Enquiry changed");
  await saveEnquiry(staff, { ...payload, contactOutcome: "No answer" }, enquiry, 2, true);
  const task = { title: "Make follow-up call", assigneeId: staff.id, dueAt: current, status: "To do" };
  const tid = await saveTask(staff, task);
  await saveTask(staff, { ...task, status: "Done", note: "Called customer." }, tid, 1);
  await saveTask(staff, { ...task, status: "Done", note: "Updated the note." }, tid, 2);
  expect(await teamActivity(owner, { from: day, to: day, staffId: staff.id })).toMatchObject({
    work: { completed: 1, attempts: 2, connected: 1, recentEvents: expect.arrayContaining([expect.objectContaining({ customerName: "Test customer", outcome: "No answer" })]) },
  });
});
