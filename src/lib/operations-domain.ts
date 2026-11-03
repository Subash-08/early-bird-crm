import { z } from "zod";
import { minor } from "./quote-domain";

const text = (max = 2000) => z.string().trim().max(max).default("");
const optionalDateTime = z.union([z.literal(""), z.iso.datetime()]).default("");

export const supplierSchema = z
  .object({
    name: z.string().trim().min(2).max(180),
    type: z.enum([
      "Hotel",
      "Transport",
      "Activity",
      "Guide",
      "Permit / visa",
      "Other",
    ]),
    contactName: text(160),
    phone: text(40),
    email: z.union([z.literal(""), z.email()]).default(""),
    location: text(300),
    notes: text(2000),
    status: z.enum(["Active", "Inactive"]).default("Active"),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (!value.phone && !value.email)
      ctx.addIssue({
        code: "custom",
        path: ["phone"],
        message: "Add a supplier phone or email.",
      });
  });

export const vehicleSchema = z
  .object({
    label: z.string().trim().min(2).max(160),
    registration: z
      .string()
      .trim()
      .min(3)
      .max(40)
      .transform((v) => v.toUpperCase()),
    ownership: z.enum(["Agency", "Supplier"]),
    supplierId: text(80),
    seats: z.number().int().min(1).max(100),
    luggage: z.number().int().min(0).max(100),
    vehicleType: z.enum([
      "Sedan",
      "SUV",
      "Tempo traveller",
      "Van",
      "Bus",
      "Other",
    ]),
    notes: text(1000),
    status: z
      .enum(["Available", "Maintenance", "Inactive"])
      .default("Available"),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.ownership === "Supplier" && !value.supplierId)
      ctx.addIssue({
        code: "custom",
        path: ["supplierId"],
        message: "Choose the vehicle supplier.",
      });
  });

export const arrangementSchema = z
  .object({
    bookingId: z.string().min(1),
    type: z.enum([
      "Hotel",
      "Car",
      "Train",
      "Flight",
      "Bus",
      "Ferry",
      "Activity",
      "Guide",
      "Permit / visa",
      "Other",
    ]),
    title: z.string().trim().min(2).max(220),
    supplierId: text(80),
    responsibility: z.enum([
      "Agency arranged",
      "Customer booked",
      "Third party",
    ]),
    startAt: optionalDateTime,
    endAt: optionalDateTime,
    location: text(500),
    details: text(3000),
    confirmationStatus: z.enum([
      "Draft",
      "On hold",
      "Confirmed",
      "Unavailable",
      "Cancelled",
    ]),
    confirmationReference: text(180),
    holdUntil: optionalDateTime,
    cost: z.union([z.string(), z.number()]).default("0"),
    currency: z
      .string()
      .trim()
      .length(3)
      .transform((v) => v.toUpperCase()),
    dueAt: optionalDateTime,
  })
  .strict()
  .transform((value) => ({ ...value, costMinor: minor(String(value.cost)) }))
  .superRefine((value, ctx) => {
    if (value.startAt && value.endAt && value.endAt <= value.startAt)
      ctx.addIssue({
        code: "custom",
        path: ["endAt"],
        message: "End must be after start.",
      });
    if (value.confirmationStatus === "On hold" && !value.holdUntil)
      ctx.addIssue({
        code: "custom",
        path: ["holdUntil"],
        message: "Add the hold expiry.",
      });
    if (
      value.confirmationStatus === "Confirmed" &&
      !value.confirmationReference
    )
      ctx.addIssue({
        code: "custom",
        path: ["confirmationReference"],
        message: "Add the supplier confirmation reference.",
      });
    if (value.responsibility === "Agency arranged" && !value.supplierId)
      ctx.addIssue({
        code: "custom",
        path: ["supplierId"],
        message: "Choose a supplier for an agency-arranged service.",
      });
    if (value.responsibility !== "Agency arranged" && value.costMinor > 0)
      ctx.addIssue({
        code: "custom",
        path: ["cost"],
        message:
          "Do not add agency supplier cost to customer-booked or third-party services.",
      });
  });

export const tripSegmentSchema = z
  .object({
    bookingId: z.string().min(1),
    mode: z.enum([
      "Car",
      "Train",
      "Flight",
      "Bus",
      "Ferry",
      "Walk / activity",
      "Other",
    ]),
    title: z.string().trim().min(2).max(220),
    from: text(300),
    to: text(300),
    startAt: z.iso.datetime(),
    endAt: z.iso.datetime(),
    timeZone: z.string().trim().min(3).max(80).default("Asia/Kolkata"),
    driverId: text(80),
    vehicleId: text(80),
    arrangementId: text(80),
    pickupContact: text(180),
    assistanceNotes: text(2000),
    bufferMinutes: z.number().int().min(0).max(1440).default(60),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.endAt <= value.startAt)
      ctx.addIssue({
        code: "custom",
        path: ["endAt"],
        message: "Trip end must be after its start.",
      });
    if (value.mode === "Car" && (!value.driverId || !value.vehicleId))
      ctx.addIssue({
        code: "custom",
        path: ["driverId"],
        message: "Choose a driver and vehicle for a car segment.",
      });
  });

export const tripProgressSchema = z
  .object({
    segmentId: z.string().min(1),
    version: z.number().int().positive(),
    status: z.enum([
      "Scheduled",
      "Started",
      "Picked up",
      "Completed",
      "Unable to complete",
    ]),
    actualStart: optionalDateTime,
    actualEnd: optionalDateTime,
    startOdometer: z.number().min(0).max(10_000_000).nullable().default(null),
    endOdometer: z.number().min(0).max(10_000_000).nullable().default(null),
    note: text(2000),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (["Unable to complete"].includes(value.status) && !value.note)
      ctx.addIssue({
        code: "custom",
        path: ["note"],
        message: "Explain why the trip could not be completed.",
      });
    if (
      value.actualStart &&
      value.actualEnd &&
      value.actualEnd < value.actualStart
    )
      ctx.addIssue({
        code: "custom",
        path: ["actualEnd"],
        message: "Actual end cannot be before actual start.",
      });
    if (
      value.startOdometer !== null &&
      value.endOdometer !== null &&
      value.endOdometer < value.startOdometer
    )
      ctx.addIssue({
        code: "custom",
        path: ["endOdometer"],
        message: "End odometer cannot be lower than start odometer.",
      });
  });

export const readinessSchema = z
  .object({
    bookingId: z.string().min(1),
    itemId: z.string().min(1),
    status: z.enum(["Pending", "Ready", "Not required", "Blocked"]),
    note: text(1500),
    expiresAt: optionalDateTime,
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.status === "Blocked" && !value.note)
      ctx.addIssue({
        code: "custom",
        path: ["note"],
        message: "Explain what is blocking readiness.",
      });
  });

export const incidentSchema = z
  .object({
    bookingId: z.string().min(1),
    segmentId: text(80),
    type: z.enum([
      "Delay",
      "Vehicle issue",
      "Driver unavailable",
      "Customer issue",
      "Supplier issue",
      "Emergency",
      "Other",
    ]),
    severity: z.enum(["Low", "Medium", "High", "Urgent"]),
    description: z.string().trim().min(5).max(3000),
    customerContacted: z.boolean().default(false),
  })
  .strict();

export const collectionReportSchema = z
  .object({
    bookingId: z.string().min(1),
    amount: z.union([z.string(), z.number()]),
    currency: z
      .string()
      .trim()
      .length(3)
      .transform((v) => v.toUpperCase()),
    collectedAt: z.iso.datetime(),
    reference: text(180),
    payerName: z.string().trim().min(2).max(160),
    note: z.string().trim().min(3).max(2000),
  })
  .strict()
  .transform((value) => ({
    ...value,
    amountMinor: minor(String(value.amount)),
  }))
  .superRefine((value, ctx) => {
    if (value.amountMinor <= 0)
      ctx.addIssue({
        code: "custom",
        path: ["amount"],
        message: "Enter a collected amount greater than zero.",
      });
  });

export function publicArrangementForRole(record: any, role: string) {
  if (role !== "operations") return record;
  const {
    costMinor: _cost,
    currency: _currency,
    dueAt: _due,
    approvedById: _approved,
    ...safe
  } = structuredClone(record);
  void _cost;
  void _currency;
  void _due;
  void _approved;
  return safe;
}
