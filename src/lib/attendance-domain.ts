import { z } from "zod";

export const attendanceRoles = ["sales", "operations"] as const;
export const attendanceStatuses = ["Present", "Late", "Checked in", "Missed checkout"] as const;

const clock = /^([01]\d|2[0-3]):[0-5]\d$/;
const iso = z.string().datetime({ offset: true });
export const attendanceDateSchema = z.iso.date();
export const attendanceHolidaySchema = z.object({
  workDate: attendanceDateSchema,
  name: z.string().trim().min(1, "Enter a holiday name.").max(100),
}).strict();
export const offsiteAttendanceSchema = z.object({
  workDate: attendanceDateSchema,
  start: z.string().regex(clock, "Enter the work start time."),
  end: z.string().regex(clock, "Enter the work end time."),
  place: z.string().trim().min(2, "Enter the work location.").max(160),
  reason: z.string().trim().min(10, "Describe the company work in at least 10 characters.").max(1_000),
  reference: z.string().trim().max(120).default(""),
}).strict().refine((value) => value.start < value.end, { path: ["end"], message: "Work end must be after work start on the same day." });

export const attendanceLocationSchema = z.object({
  latitude: z.number().finite().gte(-90).lte(90),
  longitude: z.number().finite().gte(-180).lte(180),
  // Some desktop browsers report a very large (but valid) uncertainty radius.
  // Accept it as input so the server can return a useful policy error below,
  // rather than exposing a raw schema-validation limit to the staff member.
  accuracyM: z.number().finite().positive().max(1_000_000),
  capturedAt: iso,
}).strict();

export const attendancePolicySchema = z.object({
  officeName: z.string().trim().min(2).max(100),
  latitude: z.number().finite().gte(-90).lte(90),
  longitude: z.number().finite().gte(-180).lte(180),
  radiusM: z.number().int().min(25).max(1_000),
  maximumAccuracyM: z.number().int().min(10).max(250),
  maximumLocationAgeSeconds: z.number().int().min(15).max(300),
  timezone: z.literal("Asia/Kolkata"),
  workStart: z.string().regex(clock, "Choose a valid start time."),
  workEnd: z.string().regex(clock, "Choose a valid end time."),
  graceMinutes: z.number().int().min(0).max(120),
  workingDays: z.array(z.number().int().min(0).max(6)).min(1).max(7),
}).strict().superRefine((value, context) => {
  if (value.workEnd <= value.workStart)
    context.addIssue({ code: "custom", path: ["workEnd"], message: "End time must be after start time." });
});

export const attendanceActionSchema = z.object({
  commandId: z.string().uuid(),
  location: attendanceLocationSchema,
}).strict();

export const attendanceCorrectionSchema = z.object({
  workDate: attendanceDateSchema,
  requestedCheckIn: z.union([z.literal(""), iso]).default(""),
  requestedCheckOut: z.union([z.literal(""), iso]).default(""),
  reason: z.string().trim().min(10, "Explain the correction in at least 10 characters.").max(1_000),
}).strict().superRefine((value, context) => {
  if (!value.requestedCheckIn && !value.requestedCheckOut)
    context.addIssue({ code: "custom", path: ["requestedCheckIn"], message: "Enter a requested check-in or check-out time." });
  if (value.requestedCheckIn && value.requestedCheckOut && Date.parse(value.requestedCheckOut) <= Date.parse(value.requestedCheckIn))
    context.addIssue({ code: "custom", path: ["requestedCheckOut"], message: "Requested check-out must be after check-in." });
});

export const attendanceDecisionSchema = z.object({
  id: z.string().min(1).max(180),
  decision: z.enum(["Approved", "Rejected"]),
  note: z.string().trim().max(1_000).default(""),
}).strict().superRefine((value, context) => {
  if (value.decision === "Rejected" && !value.note)
    context.addIssue({ code: "custom", path: ["note"], message: "Explain why this correction was rejected." });
});

export type AttendancePolicy = z.infer<typeof attendancePolicySchema>;

const radians = (value: number) => (value * Math.PI) / 180;

export function distanceMetres(
  first: { latitude: number; longitude: number },
  second: { latitude: number; longitude: number },
) {
  const earthRadiusM = 6_371_000;
  const lat = radians(second.latitude - first.latitude);
  const lon = radians(second.longitude - first.longitude);
  const a = Math.sin(lat / 2) ** 2 + Math.cos(radians(first.latitude)) * Math.cos(radians(second.latitude)) * Math.sin(lon / 2) ** 2;
  return 2 * earthRadiusM * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function workDateAt(value: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((entry) => entry.type === type)?.value || "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function weekdayAt(value: Date, timezone: string) {
  const name = new Intl.DateTimeFormat("en-US", { timeZone: timezone, weekday: "short" }).format(value);
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(name);
}

export function attendanceStatusAt(value: Date, policy: AttendancePolicy) {
  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone: policy.timezone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(value);
  const [hour, minute] = time.split(":").map(Number);
  const [startHour, startMinute] = policy.workStart.split(":").map(Number);
  return hour * 60 + minute > startHour * 60 + startMinute + policy.graceMinutes ? "Late" : "Present";
}

export function durationMinutes(start: string, end: string) {
  return Math.max(0, Math.floor((new Date(end).getTime() - new Date(start).getTime()) / 60_000));
}
