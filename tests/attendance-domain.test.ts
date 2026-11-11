import { describe, expect, it } from "vitest";
import { attendanceCorrectionSchema, attendancePolicySchema, attendanceStatusAt, distanceMetres, durationMinutes, workDateAt } from "@/lib/attendance-domain";

const policy = attendancePolicySchema.parse({
  officeName: "Office", latitude: 11.780343, longitude: 77.7937358,
  radiusM: 100, maximumAccuracyM: 50, maximumLocationAgeSeconds: 60,
  timezone: "Asia/Kolkata", workStart: "09:30", workEnd: "18:30", graceMinutes: 10, workingDays: [1, 2, 3, 4, 5, 6],
});

describe("attendance domain", () => {
  it("calculates distance using server-side coordinates", () => {
    expect(distanceMetres(policy, policy)).toBe(0);
    expect(distanceMetres(policy, { latitude: 11.781343, longitude: 77.7937358 })).toBeGreaterThan(100);
  });

  it("uses the configured grace period for late attendance", () => {
    expect(attendanceStatusAt(new Date("2026-11-11T04:05:00.000Z"), policy)).toBe("Present"); // 09:35 IST
    expect(attendanceStatusAt(new Date("2026-11-11T04:11:00.000Z"), policy)).toBe("Late"); // 09:41 IST
  });

  it("uses the office timezone for work dates and duration", () => {
    expect(workDateAt(new Date("2026-11-11T18:40:00.000Z"), "Asia/Kolkata")).toBe("2026-11-12");
    expect(durationMinutes("2026-11-11T04:00:00.000Z", "2026-11-11T12:30:00.000Z")).toBe(510);
  });

  it("requires a real correction request", () => {
    expect(() => attendanceCorrectionSchema.parse({ workDate: "2026-11-11", requestedCheckIn: "", requestedCheckOut: "", reason: "GPS was not available after work." })).toThrow();
    expect(() => attendanceCorrectionSchema.parse({ workDate: "2026-11-11", requestedCheckIn: "2026-11-11T04:00:00.000Z", requestedCheckOut: "2026-11-11T12:00:00.000Z", reason: "GPS was not available after work." })).not.toThrow();
  });
});
