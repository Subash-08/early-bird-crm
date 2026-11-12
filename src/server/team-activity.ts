import type { Actor } from "@/lib/domain";
import { activityDateBounds } from "@/lib/activity-range";
import { workDateAt } from "@/lib/attendance-domain";
import { presentSession } from "./attendance";
import { collection } from "./db";

const PREVIEW = 20;

export async function teamActivity(a: Actor, input: { from: string | null; to: string | null; staffId: string | null }) {
  const { from, to, start, end } = activityDateBounds(input.from, input.to);
  const self = a.role !== "owner";
  if (self && input.staffId && input.staffId !== a.id) throw new Error("403: You can only view your own attendance.");
  const staffId = self ? a.id : input.staffId;
  if (!staffId || staffId.length > 160) throw new Error("Choose a team member.");
  const person = !self ? await (await collection("staff")).findOne({ _id: staffId, org: a.org }, { projection: { name: 1, role: 1 } }) : null;
  if (!self && !person) throw new Error("404: Team member not found.");
  const today = workDateAt(new Date(), "Asia/Kolkata");
  const rows = (await (await collection("attendanceSessions"))
    .find({ org: a.org, staffId, workDate: { $gte: from, $lte: to } })
    .sort({ workDate: -1 }).limit(93).toArray()).map((row) => {
      const record = presentSession(row, today);
      return {
        _id: row._id, workDate: String(row.workDate), checkInAt: record.checkInAt as string | null,
        checkOutAt: record.checkOutAt as string | null, displayStatus: String(record.displayStatus),
        totalWorkingMinutes: typeof record.totalWorkingMinutes === "number" ? record.totalWorkingMinutes : null,
        attendanceKind: row.attendanceKind as string | undefined, correctionId: row.correctionId as string | undefined,
        late: (row.effectiveStatus || row.status) === "Late",
      };
    });
  const attendance = {
    rows,
    present: rows.filter((row) => row.checkInAt).length,
    late: rows.filter((row) => row.late).length,
    missed: rows.filter((row) => row.displayStatus === "Missed checkout").length,
    offsite: rows.filter((row) => row.attendanceKind === "offsite").length,
    minutes: rows.reduce((total, row) => total + (row.totalWorkingMinutes ?? 0), 0),
  };
  if (self) return { attendance };

  const due = { org: a.org, assigneeId: staffId, dueAt: { $gte: start, $lt: end } };
  const events = { org: a.org, staffId, occurredAt: { $gte: start, $lt: end } };
  const [tasks, logs, segments] = await Promise.all([
    collection("tasks"), collection("staffActivityEvents"), collection("tripSegments"),
  ]);
  const tripMatch = { org: a.org, driverId: staffId, startAt: { $lt: end }, endAt: { $gt: start }, status: { $ne: "Cancelled" } };
  const [dueCount, overdue, dueRows, activityCounts, recentEvents, tripCount, tripRows] = await Promise.all([
    tasks.countDocuments({ ...due, status: { $ne: "Cancelled" } }),
    tasks.countDocuments({ ...due, status: { $nin: ["Done", "Cancelled"] }, $and: [{ dueAt: { $lt: new Date().toISOString() } }] }),
    tasks.find({ ...due, status: { $ne: "Cancelled" } }, { projection: { title: 1, status: 1, dueAt: 1 } }).sort({ dueAt: 1 }).limit(PREVIEW).toArray(),
    logs.aggregate<{ _id: string; count: number }>([
      { $match: events },
      { $group: { _id: { $cond: [{ $eq: ["$kind", "contact"] }, "$outcome", "$kind"] }, count: { $sum: 1 } } },
    ]).toArray(),
    logs.find(events, { projection: { kind: 1, label: 1, outcome: 1, occurredAt: 1, customerId: 1 } }).sort({ occurredAt: -1 }).limit(PREVIEW).toArray(),
    segments.countDocuments(tripMatch),
    segments.find(tripMatch, { projection: { title: 1, startAt: 1, endAt: 1, status: 1 } }).sort({ startAt: 1 }).limit(PREVIEW).toArray(),
  ]);
  const customerIds = [...new Set(recentEvents.flatMap((row) => typeof row.customerId === "string" && row.customerId ? [row.customerId] : []))];
  const names = new Map(customerIds.length ? await (await collection("customers"))
    .find({ org: a.org, _id: { $in: customerIds } }, { projection: { name: 1 } })
    .map((row) => [row._id, String(row.name)] as const).toArray() : []);
  const counts = new Map(activityCounts.map((row) => [row._id, row.count]));
  const connected = counts.get("Connected") ?? 0;
  return { attendance, member: { name: String(person?.name), role: String(person?.role) },
    work: {
      dueCount, overdue, dueRows, tripCount, tripRows, completed: counts.get("task-done") ?? 0,
      connected, attempts: connected + (counts.get("No answer") ?? 0) + (counts.get("Call back") ?? 0),
      recentEvents: recentEvents.map(({ customerId, ...event }) => ({ ...event, customerName: names.get(customerId) })),
    },
  };
}
