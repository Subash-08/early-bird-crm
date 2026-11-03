import { z } from "zod";
import { parsePhoneNumberFromString } from "libphonenumber-js";
export const roles = ["owner", "sales", "operations"] as const;
export type Role = (typeof roles)[number];
export type Actor = {
  id: string;
  authId: string;
  org: string;
  name: string;
  role: Role;
  capabilities?: string[];
};
export const sources = [
  "WhatsApp",
  "Phone",
  "Website",
  "Instagram",
  "Referral",
  "Walk-in",
  "Other",
] as const;
export const stages = [
  "New",
  "Contacting",
  "Gathering details",
  "Quote requested",
  "Quote sent",
  "Won",
  "On hold",
  "Lost",
] as const;
export const taskStates = [
  "To do",
  "In progress",
  "Waiting",
  "Done",
  "Cancelled",
] as const;
const text = z.string().trim().max(3000).default("");
export const customerSchema = z
  .object({
    name: z.string().trim().min(2).max(160),
    phone: text,
    email: z.union([z.literal(""), z.email()]).default(""),
    language: text,
    address: text,
    notes: text,
    duplicateConfirmed: z.boolean().default(false),
    reviewNeeded: z.boolean().default(false),
  })
  .strict();
export const enquirySchema = z
  .object({
    customerId: z.string().min(1),
    destination: text,
    source: z.enum(sources),
    assigneeId: z.string().min(1),
    stage: z.enum(stages).default("New"),
    firstContactAt: z.iso.datetime(),
    dateMode: z
      .enum(["Unknown", "Exact", "Flexible", "Month"])
      .default("Unknown"),
    departure: text,
    returnDate: text,
    travelPreference: text,
    adults: z.number().int().min(0).max(999).nullable().default(null),
    childrenAges: text,
    infants: z.number().int().min(0).max(99).default(0),
    budget: text,
    budgetBasis: z
      .enum(["Unknown", "Total", "Per person", "Per couple"])
      .default("Unknown"),
    services: text,
    serviceResponsibility: text,
    hotelPreference: text,
    rooms: text,
    pickup: text,
    dropoff: text,
    specialRequirements: text,
    notes: text,
    reason: text,
    nextAction: text,
    nextFollowUp: z.union([z.literal(""), z.iso.datetime()]).default(""),
    contactOutcome: z
      .enum(["Not contacted", "Connected", "No answer", "Call back"])
      .default("Not contacted"),
    reviewNeeded: z.boolean().default(false),
  })
  .strict()
  .superRefine((v, c) => {
    if (["Lost", "On hold"].includes(v.stage) && !v.reason)
      c.addIssue({
        code: "custom",
        path: ["reason"],
        message: "A reason is required.",
      });
    if (v.stage === "On hold" && !v.nextFollowUp)
      c.addIssue({
        code: "custom",
        path: ["nextFollowUp"],
        message: "Choose a review date.",
      });
    if (v.nextFollowUp && !v.nextAction)
      c.addIssue({
        code: "custom",
        path: ["nextAction"],
        message: "Describe the next action.",
      });
    if (
      v.dateMode === "Exact" &&
      (!/^\d{4}-\d{2}-\d{2}$/.test(v.departure) ||
        !/^\d{4}-\d{2}-\d{2}$/.test(v.returnDate) ||
        v.returnDate < v.departure)
    )
      c.addIssue({
        code: "custom",
        path: ["departure"],
        message: "Provide valid departure and return dates in order.",
      });
  });
export function normalizePhone(phone: string) {
  if (!phone) return "";
  const p = parsePhoneNumberFromString(phone);
  if (!p?.isValid() || !phone.startsWith("+"))
    throw new Error("Enter a valid phone with country code, for example +91.");
  return p.number;
}
export function canAccess(actor: Actor, assigneeId: string) {
  return actor.role === "owner" || actor.id === assigneeId;
}
export function safeCell(value: unknown) {
  const s = String(value ?? "");
  return /^[=+@\-\t\r]/.test(s) ? `'${s}` : s;
}
export function dateLabel(value: unknown) {
  if (!value) return "Not set";
  const d = new Date(String(value));
  return Number.isNaN(d.getTime())
    ? String(value)
    : d.toLocaleString("en-IN", {
        timeZone: "Asia/Kolkata",
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      });
}
