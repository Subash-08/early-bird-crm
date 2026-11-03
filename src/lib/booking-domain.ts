import { z } from "zod";
import { minor } from "./quote-domain";

const text = (max = 1000) => z.string().trim().max(max).default("");
export const travellerSchema = z
  .object({
    id: z.string().min(1),
    name: text(160),
    type: z.enum(["Adult", "Child", "Infant"]),
    lead: z.boolean().default(false),
    dateOfBirth: text(10),
    nationality: text(80),
    phone: text(40),
    notes: text(500),
  })
  .strict();

export const bookingDetailsSchema = z
  .object({
    payerName: z.string().trim().min(2).max(160),
    payerPhone: text(40),
    payerEmail: z.union([z.literal(""), z.email()]).default(""),
    billingAddress: text(1000),
    deliveryAddress: text(1000),
    taxId: text(80),
    placeOfSupply: text(120),
    buyerStateCode: text(10),
    travellers: z.array(travellerSchema).min(1).max(100),
    advanceDueAt: z.union([z.literal(""), z.iso.datetime()]).default(""),
    balanceDueAt: z.union([z.literal(""), z.iso.datetime()]).default(""),
    paymentNote: text(500),
    coordinatorNotes: text(3000),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.travellers.filter((traveller) => traveller.lead).length !== 1)
      ctx.addIssue({
        code: "custom",
        path: ["travellers"],
        message: "Choose exactly one lead traveller.",
      });
    if (!value.travellers.find((traveller) => traveller.lead)?.name)
      ctx.addIssue({
        code: "custom",
        path: ["travellers"],
        message: "Add the lead traveller name.",
      });
    if (
      value.advanceDueAt &&
      value.balanceDueAt &&
      value.balanceDueAt < value.advanceDueAt
    )
      ctx.addIssue({
        code: "custom",
        path: ["balanceDueAt"],
        message: "Balance due date cannot be before the advance due date.",
      });
  });

export const paymentSubmissionSchema = z
  .object({
    bookingId: z.string().min(1),
    amount: z.union([z.string(), z.number()]),
    currency: z
      .string()
      .trim()
      .min(3)
      .max(3)
      .transform((value) => value.toUpperCase()),
    receivedAt: z.iso.datetime(),
    method: z.enum(["Bank transfer", "UPI", "Card", "Cash", "Cheque", "Other"]),
    reference: text(180),
    payerName: z.string().trim().min(2).max(160),
    note: text(2000),
    evidenceName: text(220),
    evidenceType: text(100),
    evidenceBase64: text(2_200_000),
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
        message: "Enter an amount greater than zero.",
      });
    if (!value.reference && !value.evidenceBase64)
      ctx.addIssue({
        code: "custom",
        path: ["reference"],
        message: "Add a transaction reference or private evidence file.",
      });
    if (value.evidenceBase64 && !value.evidenceName)
      ctx.addIssue({
        code: "custom",
        path: ["evidenceName"],
        message: "Evidence filename is missing.",
      });
  });

export const releaseSchema = z
  .object({
    bookingId: z.string().min(1),
    version: z.number().int().positive(),
    operationsAssigneeIds: z.array(z.string().min(1)).min(1).max(20),
    overrideReason: text(2000),
  })
  .strict();

export function publicBookingForRole(booking: any, role: string) {
  if (role === "owner") return booking;
  if (role === "sales") {
    const safe = structuredClone(booking);
    const content = safe.agreementSnapshot?.content;
    if (content) delete content.internalNotes;
    for (const option of [...(content?.options || []), safe.agreementSnapshot?.selectedOption].filter(Boolean)) {
      delete option.internalCost; delete option.internalCostMinor; delete option.estimatedMarginMinor;
    }
    return safe;
  }
  const safe: Record<string, any> = {};
  // Allowlist prevents newly added commercial fields from leaking to drivers.
  for (const key of ["_id", "org", "version", "bookingNumber", "customerId", "salesAssigneeId", "ownerId", "status", "serviceStart", "serviceEnd", "destination", "operationsReleased", "operationsAssigneeIds", "operationsChecklist", "tripCompletedAt", "updatedAt", "createdAt"]) {
    if (key in booking) safe[key] = structuredClone(booking[key]);
  }
  safe.travellers = (booking.travellers || []).filter((t: any) => !t.cancelled).map((t: any) => ({ id: t.id, name: t.name, type: t.type, lead: t.lead, phone: t.lead ? t.phone : "", notes: t.notes }));
  return safe;
}

export function paymentTotals(payments: any[], totalMinor: number) {
  const verifiedPaidMinor = payments
    .filter((payment) => payment.status === "Verified")
    .reduce((sum, payment) => sum + Number(payment.amountMinor || 0), 0);
  return {
    verifiedPaidMinor,
    outstandingMinor: Math.max(0, totalMinor - verifiedPaidMinor),
    unappliedCreditMinor: Math.max(0, verifiedPaidMinor - totalMinor),
  };
}
