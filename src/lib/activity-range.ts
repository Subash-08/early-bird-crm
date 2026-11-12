import { z } from "zod";
import { workDateAt } from "./attendance-domain";

export const activityPresets = ["Today", "Last 7 days", "This month", "Custom dates"] as const;
export type ActivityPreset = (typeof activityPresets)[number];
const DAY = 86_400_000;
const indiaMidnight = (date: string) => Date.parse(`${date}T00:00:00+05:30`);

export function presetActivityDates(preset: Exclude<ActivityPreset, "Custom dates">, today = workDateAt(new Date(), "Asia/Kolkata")) {
  const from = preset === "Today" ? today : preset === "This month" ? `${today.slice(0, 7)}-01`
    : new Date(Date.parse(`${today}T00:00:00Z`) - 6 * DAY).toISOString().slice(0, 10);
  return { from, to: today };
}

export function activityDateBounds(from: unknown, to: unknown) {
  const dates = z.object({ from: z.iso.date(), to: z.iso.date() }).safeParse({ from, to });
  if (!dates.success) throw new Error("Choose valid start and end dates.");
  const start = indiaMidnight(dates.data.from);
  const end = indiaMidnight(dates.data.to) + DAY;
  if (end <= start) throw new Error("End date must be on or after the start date.");
  if (end - start > 93 * DAY) throw new Error("Choose a date range of up to 93 days.");
  return { ...dates.data, start: new Date(start).toISOString(), end: new Date(end).toISOString() };
}
