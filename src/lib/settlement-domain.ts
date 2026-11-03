import { z } from "zod";

export const entryKinds = ["Supplier bill", "Supplier payment", "Supplier credit", "Recovery expected", "Recovery received", "Recovery credit", "Refund approved", "Refund paid", "Expense", "Expense paid", "Reversal"] as const;
export const amountSchema = z.string().trim().regex(/^\d{1,9}(\.\d{1,2})?$/, "Enter a positive amount with at most two decimal places.");
export function cents(value: string) {
  const [whole, fraction = ""] = amountSchema.parse(value).split(".");
  return Number(BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0")));
}
export const currencySchema = z.enum(["INR", "USD", "EUR", "GBP", "AED", "SGD", "AUD", "CAD", "CHF", "THB", "MYR", "NPR", "LKR"]);
const note = z.string().trim().min(3).max(2000);
export const entrySchema = z.object({
  bookingId: z.string().min(1), commandId: z.string().uuid(), kind: z.enum(entryKinds),
  amount: amountSchema, currency: currencySchema, targetId: z.string().default(""),
  arrangementId: z.string().default(""), expenseRequestId: z.string().default(""),
  reference: z.string().trim().min(2).max(160), reason: note,
  occurredAt: z.iso.datetime(), dueAt: z.union([z.literal(""), z.iso.datetime()]).default(""),
  method: z.enum(["Bank transfer", "UPI", "Cash", "Card", "Cheque", "Supplier credit", "Other"]).default("Bank transfer"),
  rate: z.string().regex(/^\d{1,6}(\.\d{1,6})?$/).default("1"), rateSource: z.string().trim().max(160).default(""),
  rateDate: z.union([z.literal(""), z.iso.date()]).default(""),
  evidenceName: z.string().trim().max(220).default(""), evidenceType: z.string().max(100).default(""),
  evidenceBase64: z.string().max(2200000).default(""),
}).strict();
export const changeSchema = z.object({
  bookingId: z.string().min(1), commandId: z.string().uuid(),
  kind: z.enum(["Amendment", "Partial cancellation", "Full cancellation"]),
  reason: note, description: note, newTotal: amountSchema, effectiveDate: z.iso.date(),
  arrangementIds: z.array(z.string().min(1)).max(100).default([]),
  segmentIds: z.array(z.string().min(1)).max(100).default([]),
  travellerIds: z.array(z.string().min(1)).max(100).default([]),
  serviceUsage: note, supplierImpact: note,
  newStart: z.union([z.literal(""), z.iso.date()]).default(""), newEnd: z.union([z.literal(""), z.iso.date()]).default(""),
}).strict().refine(p => (!p.newStart && !p.newEnd) || (!!p.newStart && !!p.newEnd && p.newEnd >= p.newStart), "Choose both new dates in order.");

// Rate is booking-currency units per one original-currency unit. BigInt prevents floating-point rounding drift.
export function convertMinor(amount: number, rate: string) {
  if (!/^\d{1,6}(\.\d{1,6})?$/.test(rate)) throw new Error("Enter a valid exchange rate.");
  const [w, f = ""] = rate.split(".");
  const factor = BigInt(w) * 1000000n + BigInt(f.padEnd(6, "0"));
  if (factor <= 0n) throw new Error("Exchange rate must be greater than zero.");
  const value = (BigInt(amount) * factor + 500000n) / 1000000n;
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("Converted amount is too large.");
  return Number(value);
}
export type Entry = Record<string, any>;
export function effectiveEntries(entries: Entry[]) {
  const posted = entries.filter(e => e.status === "Posted");
  const reversed = new Set(posted.filter(e => e.kind === "Reversal").map(e => e.targetId));
  return posted.filter(e => e.kind !== "Reversal" && !reversed.has(e._id));
}
export function balanceOf(target: Entry, entries: Entry[]) {
  const childKinds: Record<string, string[]> = {
    "Supplier bill": ["Supplier payment", "Supplier credit"], "Recovery expected": ["Recovery received", "Recovery credit"],
    "Refund approved": ["Refund paid"], Expense: ["Expense paid"],
  };
  return target.amountMinor - entries.filter(e => e.targetId === target._id && (childKinds[target.kind] || []).includes(e.kind)).reduce((n, e) => n + e.amountMinor, 0);
}
export function settlementTotals(booking: Entry, all: Entry[], payments: Entry[]) {
  const entries = effectiveEntries(all);
  const sum = (kind: string, field = "baseMinor") => entries.filter(e => e.kind === kind).reduce((n, e) => n + Number(e[field]), 0);
  const received = payments.filter(p => p.status === "Verified").reduce((n, p) => n + p.amountMinor, 0);
  const refundPaid = sum("Refund paid"), refundApproved = sum("Refund approved");
  const credits = Math.max(0, received - booking.totalMinor);
  const obligations: (Entry & { remainingMinor: number })[] = entries.filter(e => ["Supplier bill", "Recovery expected", "Refund approved", "Expense"].includes(e.kind)).map(e => ({ ...e, remainingMinor: balanceOf(e, entries) }));
  const supplierCost = sum("Supplier bill") - sum("Supplier credit") - sum("Recovery expected");
  const actualCost = sum("Supplier payment") - sum("Recovery received") - sum("Recovery credit") + sum("Expense paid");
  return { receivedMinor: received, refundPaidMinor: refundPaid, refundPendingMinor: refundApproved - refundPaid,
    outstandingMinor: Math.max(0, booking.totalMinor - received + refundPaid), refundableMinor: Math.max(0, credits - refundApproved),
    customerCreditMinor: Math.max(0, credits - refundPaid), estimatedMarginMinor: booking.totalMinor - supplierCost - sum("Expense"),
    actualCostMinor: actualCost, finalProfitMinor: booking.financialClosed ? booking.totalMinor - actualCost : null,
    exchangeDifferenceMinor: actualCost - supplierCost - sum("Expense"), obligations };
}
