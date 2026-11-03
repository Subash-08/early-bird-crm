import { Binary, type ClientSession } from "mongodb";
import { z } from "zod";
import type { Actor } from "@/lib/domain";
import { publicBookingForRole } from "@/lib/booking-domain";
import { balanceOf, cents, changeSchema, convertMinor, currencySchema, effectiveEntries, entrySchema, settlementTotals } from "@/lib/settlement-domain";
import { collection, type Row } from "./db";
import { audit, notify, owner, transact } from "./crm";

const now = () => new Date().toISOString();
const children: Record<string, string> = { "Supplier payment": "Supplier bill", "Supplier credit": "Supplier bill", "Recovery received": "Recovery expected", "Recovery credit": "Recovery expected", "Refund paid": "Refund approved", "Expense paid": "Expense" };
async function access(a: Actor, bookingId: string, s?: ClientSession, writing = false) {
  if (a.role === "operations") throw new Error("403: Finance is available to Owner and assigned Sales only.");
  const b = await (await collection("bookings")).findOne({ _id: bookingId, org: a.org }, { session: s });
  if (!b) throw new Error("404: Booking not found.");
  if (a.role !== "owner" && b.salesAssigneeId !== a.id) throw new Error("403: Booking is not assigned to you.");
  if (writing && b.financialClosed) throw new Error("This booking is financially closed. Ask the Owner to reopen it first.");
  if (writing) {
    // Every finance command writes this shared record before checking aggregate limits.
    // Concurrent allocations/refunds therefore conflict and retry with fresh balances.
    await (await collection("bookings")).updateOne({ _id: b._id, org: a.org }, { $inc: { version: 1 }, $set: { updatedAt: now() } }, { session: s });
  }
  return b;
}
async function rows(name: string, a: Actor, bookingId: string, s?: ClientSession) {
  return (await collection(name)).find({ org: a.org, bookingId }, { session: s }).toArray();
}
async function task(a: Actor, b: Row, key: string, title: string, person: string, s: ClientSession, dueAt = now(), status = "To do") {
  await (await collection("tasks")).updateOne({ _id: key, org: a.org }, { $set: { title, assigneeId: person, bookingId: b._id, dueAt, status, updatedAt: now() }, $setOnInsert: { createdAt: now() }, $inc: { version: 1 } }, { upsert: true, session: s });
}
async function alert(a: Actor, b: Row, key: string, title: string, s: ClientSession, review = false, submitterId = "") {
  const owners = await (await collection("staff")).find({ org: a.org, role: "owner", status: "active" }, { session: s }).toArray();
  if (review && !owners.some(p => p._id !== submitterId)) throw new Error("A different active Owner must review this request. With one Owner, ask Sales to submit it.");
  for (const person of owners) {
    if (review && person._id === submitterId) continue;
    await notify(a, person._id, `${key}:${person._id}`, title, b._id, s);
    if (review) await task(a, b, `${key}:${person._id}`, title, person._id, s);
  }
  if (b.salesAssigneeId) await notify(a, b.salesAssigneeId, `${key}:sales`, title, b._id, s);
}
async function resolveTasks(a: Actor, key: string, s: ClientSession) {
  await (await collection("tasks")).updateMany({ org: a.org, _id: { $regex: `^${key}:` }, status: { $nin: ["Done", "Cancelled"] } }, { $set: { status: "Done", updatedAt: now() }, $inc: { version: 1 } }, { session: s });
}
function evidence(p: z.infer<typeof entrySchema>) {
  if (!p.evidenceBase64) return undefined;
  const data = Buffer.from(p.evidenceBase64, "base64");
  const valid = (p.evidenceType === "application/pdf" && data.subarray(0, 5).toString() === "%PDF-") ||
    (p.evidenceType === "image/png" && data.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) ||
    (p.evidenceType === "image/jpeg" && data[0] === 255 && data[1] === 216 && data[2] === 255);
  if (!valid || !p.evidenceName || data.length > 1500000) throw new Error("Attach a valid JPG, PNG or PDF of 1.5 MB or less.");
  return new Binary(data);
}
async function validateEntry(a: Actor, b: Row, e: Row, s: ClientSession) {
  const all = await rows("settlementEntries", a, b._id, s);
  const live = effectiveEntries(all);
  if (children[e.kind]) {
    const target = live.find(t => t._id === e.targetId && t.kind === children[e.kind]);
    if (!target) throw new Error("Choose an approved, unreversed balance to allocate this amount to.");
    if (target.currency !== e.currency) throw new Error("Allocation currency must match the original balance.");
    if (e.amountMinor > balanceOf(target, live)) throw new Error("Amount exceeds the remaining balance.");
    e.arrangementId = target.arrangementId || "";
  }
  if (e.kind === "Reversal") {
    const target = live.find(t => t._id === e.targetId);
    if (!target) throw new Error("Choose a posted entry that has not already been reversed.");
    if (live.some(t => t.targetId === target._id)) throw new Error("Reverse linked payments or credits first.");
    if (target.amountMinor !== e.amountMinor || target.currency !== e.currency || target.baseMinor !== e.baseMinor) throw new Error("A reversal must use the exact original amount, currency and rate.");
  }
  if (["Supplier bill", "Recovery expected"].includes(e.kind)) {
    const arrangement = await (await collection("arrangements")).findOne({ _id: e.arrangementId, org: a.org, bookingId: b._id }, { session: s });
    if (!arrangement || arrangement.responsibility !== "Agency arranged" || !arrangement.supplierId) throw new Error("Choose an agency arrangement with a supplier.");
    if (e.kind === "Supplier bill" && e.currency !== arrangement.currency) throw new Error("Supplier bill currency must match the arrangement.");
    e.supplierId = arrangement.supplierId;
    if (e.kind === "Recovery expected") {
      const paid = live.filter(t => t.kind === "Supplier payment" && t.arrangementId === e.arrangementId && t.currency === e.currency).reduce((n, t) => n + t.amountMinor, 0);
      const expected = live.filter(t => t.kind === "Recovery expected" && t.arrangementId === e.arrangementId && t.currency === e.currency).reduce((n, t) => n + t.amountMinor, 0);
      if (e.amountMinor + expected > paid) throw new Error("Recovery cannot exceed recorded supplier payments in this currency.");
    }
  }
  if (e.kind === "Expense") {
    const expense = await (await collection("operationsRequests")).findOne({ _id: e.expenseRequestId, org: a.org, bookingId: b._id, type: "Expense", status: "Approved" }, { session: s });
    if (!expense || expense.amountMinor !== e.amountMinor || expense.currency !== e.currency) throw new Error("Select an approved driver expense and use its exact amount and currency.");
    if (live.some(t => t.kind === "Expense" && t.expenseRequestId === expense._id)) throw new Error("This expense is already recorded.");
  }
  if (e.kind.startsWith("Refund") && e.currency !== b.currency) throw new Error("Customer refunds use the booking currency.");
  const simulated = effectiveEntries([...all, { ...e, status: "Posted" }]);
  const totals = settlementTotals(b, simulated, await rows("payments", a, b._id, s));
  const approved = simulated.filter(t => t.kind === "Refund approved").reduce((n, t) => n + t.amountMinor, 0);
  if (approved > Math.max(0, totals.receivedMinor - b.totalMinor)) throw new Error("Refund approval exceeds customer credit. Approve the booking adjustment first.");
  if (totals.refundPendingMinor < 0 || totals.obligations.some(t => t.remainingMinor < 0)) throw new Error("This correction would over-allocate an existing balance.");
  // Reversing a supplier payment must not leave a larger expected recovery behind.
  for (const recovery of simulated.filter(t => t.kind === "Recovery expected")) {
    const paid = simulated.filter(t => t.kind === "Supplier payment" && t.arrangementId === recovery.arrangementId && t.currency === recovery.currency).reduce((n, t) => n + t.amountMinor, 0);
    const due = simulated.filter(t => t.kind === "Recovery expected" && t.arrangementId === recovery.arrangementId && t.currency === recovery.currency).reduce((n, t) => n + t.amountMinor, 0);
    if (due > paid) throw new Error("Resolve related supplier recoveries before reversing this payment.");
  }
}

export async function submitSettlement(a: Actor, input: unknown) {
  const p = entrySchema.parse(input);
  const attachment = evidence(p);
  return transact(async s => {
    const b = await access(a, p.bookingId, s, true);
    const existing = await (await collection("settlementEntries")).findOne({ _id: `${a.org}:${p.commandId}`, org: a.org }, { session: s });
    if (existing) { if (existing.bookingId !== b._id || existing.submittedById !== a.id) throw new Error("409: Request key already used."); return existing._id; }
    const amountMinor = cents(p.amount);
    if (!amountMinor) throw new Error("Amount must be greater than zero.");
    currencySchema.parse(b.currency);
    if (new Date(p.occurredAt).getTime() > Date.now() + 60000) throw new Error("Recorded transaction date cannot be in the future.");
    if (p.currency === b.currency && Number(p.rate) !== 1) throw new Error("Use rate 1 for the booking currency.");
    if (p.currency !== b.currency && (!p.rateSource || !p.rateDate)) throw new Error("Add the conversion rate source and date.");
    if (p.rateDate && p.rateDate > now().slice(0, 10)) throw new Error("Rate date cannot be in the future.");
    const { evidenceBase64: _base64, ...safe } = p; void _base64;
    const entry: Row = { ...safe, _id: `${a.org}:${p.commandId}`, org: a.org, version: 1, amountMinor, baseMinor: convertMinor(amountMinor, p.rate), baseCurrency: b.currency,
      referenceKey: `${p.kind}:${p.reference.toLowerCase()}`, status: "Pending review", submittedById: a.id, submittedByName: a.name, createdAt: now(), ...(attachment ? { evidenceBytes: attachment } : {}) };
    await validateEntry(a, b, entry, s);
    const duplicate = await (await collection("settlementEntries")).findOne({ org: a.org, referenceKey: entry.referenceKey, status: { $ne: "Rejected" } }, { session: s });
    if (duplicate) throw new Error("409: This reference is already recorded for this type of transaction.");
    await (await collection("settlementEntries")).insertOne(entry, { session: s });
    await alert(a, b, `finance-review:${entry._id}`, `Review ${entry.kind.toLowerCase()} for ${b.bookingNumber}`, s, true, a.id);
    await audit(a, b._id, `${entry.kind} submitted for owner review`, s);
    return entry._id;
  });
}

export async function decideSettlement(a: Actor, input: unknown) {
  owner(a);
  const p = z.object({ id: z.string(), version: z.number().int(), decision: z.enum(["Posted", "Rejected"]), reason: z.string().trim().min(3).max(1000) }).strict().parse(input);
  return transact(async s => {
    const entry = await (await collection("settlementEntries")).findOne({ _id: p.id, org: a.org }, { session: s });
    if (!entry) throw new Error("404: Financial request not found.");
    const b = await access(a, entry.bookingId, s, true);
    if (entry.status !== "Pending review" || entry.version !== p.version) throw new Error("409: This request has already changed. Refresh first.");
    if (entry.submittedById === a.id) throw new Error("403: A different Owner must review your request.");
    if (p.decision === "Posted") await validateEntry(a, b, entry, s);
    await (await collection("settlementEntries")).updateOne({ _id: entry._id, org: a.org, version: p.version }, { $set: { status: p.decision, reviewedById: a.id, reviewedByName: a.name, reviewedAt: now(), decisionReason: p.reason }, $inc: { version: 1 } }, { session: s });
    if (p.decision === "Posted") await (await collection("ledgerEvents")).insertOne({ _id: `settlement:${entry._id}`, org: a.org, version: 1, bookingId: b._id, type: entry.kind, entryId: entry._id, targetId: entry.targetId, amountMinor: entry.amountMinor, currency: entry.currency, baseMinor: entry.baseMinor, rate: entry.rate, actorId: a.id, createdAt: now() }, { session: s });
    await resolveTasks(a, `finance-review:${entry._id}`, s);
    await alert(a, b, `finance-decided:${entry._id}`, `${entry.kind}: ${p.decision === "Posted" ? "approved and recorded" : "rejected"}`, s);
    await syncTasks(a, b, s);
    await audit(a, b._id, `${entry.kind} ${p.decision.toLowerCase()} - ${p.reason}`, s);
    return entry._id;
  });
}

export async function submitBookingChange(a: Actor, input: unknown) {
  const p = changeSchema.parse(input);
  return transact(async s => {
    const b = await access(a, p.bookingId, s, true);
    if (b.status === "Cancelled") throw new Error("This booking is cancelled. Create a new booking for additional travel.");
    const changes = await collection("bookingChanges");
    const key = `${a.org}:${p.commandId}`;
    const prior = await changes.findOne({ _id: key, org: a.org }, { session: s });
    if (prior) { if (prior.bookingId !== b._id || prior.submittedById !== a.id) throw new Error("409: Request key already used."); return key; }
    if (await changes.findOne({ org: a.org, bookingId: b._id, status: { $in: ["Pending review", "Awaiting customer"] } }, { session: s })) throw new Error("Resolve the existing change request first.");
    const arrangements = await rows("arrangements", a, b._id, s), segments = await rows("tripSegments", a, b._id, s);
    if (p.arrangementIds.some(id => !arrangements.some(r => r._id === id)) || p.segmentIds.some(id => !segments.some(r => r._id === id)) || p.travellerIds.some(id => !b.travellers?.some((r: Row) => r.id === id))) throw new Error("Choose only services, trips and travellers from this booking.");
    if (p.kind === "Partial cancellation" && !p.arrangementIds.length && !p.segmentIds.length && !p.travellerIds.length) throw new Error("Choose the affected service, trip or traveller.");
    if (p.kind === "Partial cancellation" && p.travellerIds.length === b.travellers?.length) throw new Error("Use full cancellation when all travellers cancel.");
    if (p.kind !== "Amendment" && (p.newStart || p.newEnd)) throw new Error("Use an amendment to change travel dates.");
    await changes.insertOne({ ...p, _id: key, org: a.org, version: 1, newTotalMinor: cents(p.newTotal), previousTotalMinor: b.totalMinor, previousStart: b.serviceStart, previousEnd: b.serviceEnd,
      status: "Pending review", submittedById: a.id, submittedByName: a.name, createdAt: now() }, { session: s });
    await alert(a, b, `change-review:${key}`, `Review ${p.kind.toLowerCase()} for ${b.bookingNumber}`, s, true, a.id);
    await audit(a, b._id, `${p.kind} requested: ${p.reason}`, s);
    return key;
  });
}

export async function decideBookingChange(a: Actor, input: unknown) {
  owner(a);
  const p = z.object({ id: z.string(), version: z.number().int(), decision: z.enum(["Approved", "Rejected"]), reason: z.string().trim().min(3).max(1000) }).strict().parse(input);
  return transact(async s => {
    const change = await (await collection("bookingChanges")).findOne({ _id: p.id, org: a.org }, { session: s });
    if (!change) throw new Error("404: Change request not found.");
    const b = await access(a, change.bookingId, s, true);
    if (change.status !== "Pending review" || change.version !== p.version) throw new Error("409: Request changed. Refresh first.");
    if (change.submittedById === a.id) throw new Error("403: A different Owner must review your request.");
    await (await collection("bookingChanges")).updateOne({ _id: p.id, org: a.org }, { $set: { status: p.decision === "Approved" ? "Awaiting customer" : "Rejected", reviewedById: a.id, reviewedAt: now(), decisionReason: p.reason }, $inc: { version: 1 } }, { session: s });
    await resolveTasks(a, `change-review:${p.id}`, s);
    if (p.decision === "Approved") await task(a, b, `customer-change:${p.id}`, "Record customer decision on booking change", b.salesAssigneeId, s);
    await alert(a, b, `change-reviewed:${p.id}`, `Booking change ${p.decision.toLowerCase()}${p.decision === "Approved" ? " — customer confirmation needed" : ""}`, s);
    await audit(a, b._id, `Booking change ${p.decision.toLowerCase()}: ${p.reason}`, s);
  });
}

export async function confirmBookingChange(a: Actor, input: unknown) {
  const p = z.object({ id: z.string(), version: z.number().int(), accepted: z.boolean(), reference: z.string().trim().min(3).max(500), confirmedAt: z.iso.datetime() }).strict().parse(input);
  if (new Date(p.confirmedAt).getTime() > Date.now() + 60000) throw new Error("Customer decision cannot be dated in the future.");
  return transact(async s => {
    const change = await (await collection("bookingChanges")).findOne({ _id: p.id, org: a.org }, { session: s });
    if (!change) throw new Error("404: Change request not found.");
    const b = await access(a, change.bookingId, s, true);
    if (change.status !== "Awaiting customer" || change.version !== p.version) throw new Error("409: This change is not awaiting a customer decision.");
    if (p.accepted) {
      if (b.totalMinor !== change.previousTotalMinor || b.serviceStart !== change.previousStart || b.serviceEnd !== change.previousEnd) throw new Error("409: Booking terms changed. Reject this request and prepare a fresh one.");
      const entries = await rows("settlementEntries", a, b._id, s), payments = await rows("payments", a, b._id, s);
      const totals = settlementTotals({ ...b, totalMinor: change.newTotalMinor }, entries, payments);
      if (totals.refundPaidMinor + totals.refundPendingMinor > Math.max(0, totals.receivedMinor - change.newTotalMinor)) throw new Error("Resolve existing refund commitments before increasing the booking price.");
      const full = change.kind === "Full cancellation", partial = change.kind === "Partial cancellation";
      if (!full && !partial) await (await collection("readinessItems")).insertOne({ _id: `change-readiness:${change._id}`, org: a.org, version: 1, bookingId: b._id, key: `change:${change._id}`, label: "Check revised dates and services with suppliers", status: "Pending", note: change.description, createdAt: now() }, { session: s });
      const updatedTravellers = (b.travellers || []).map((t: Row) => ({ ...t, ...(full || (partial && change.travellerIds.includes(t.id)) ? { cancelled: true, lead: false } : {}) }));
      const activeTravellers = updatedTravellers.filter((t: Row) => !t.cancelled);
      if (activeTravellers.length && !activeTravellers.some((t: Row) => t.lead)) activeTravellers[0].lead = true;
      await (await collection("bookings")).updateOne({ _id: b._id, org: a.org }, { $set: { totalMinor: change.newTotalMinor, originalTotalMinor: b.originalTotalMinor ?? b.totalMinor,
        outstandingMinor: totals.outstandingMinor, unappliedCreditMinor: totals.customerCreditMinor, requiredAdvanceMinor: Math.min(b.requiredAdvanceMinor, change.newTotalMinor),
        travellers: updatedTravellers, ...(change.newStart ? { serviceStart: change.newStart, serviceEnd: change.newEnd } : {}),
        ...(full ? { status: "Cancelled", cancelledAt: now() } : {}), latestChangeId: change._id, settlementOutstanding: true,
      } }, { session: s });
      if (full || partial) {
        const af = { org: a.org, bookingId: b._id, ...(full ? {} : { _id: { $in: change.arrangementIds } }) };
        const sf = { org: a.org, bookingId: b._id, status: { $nin: ["Completed", "In progress"] }, ...(full ? {} : { _id: { $in: change.segmentIds } }) };
        if (full || change.arrangementIds.length) await (await collection("arrangements")).updateMany(af, { $set: { confirmationStatus: "Cancelled", cancellationChangeId: change._id, cancellationVendorConfirmed: false }, $inc: { version: 1 } }, { session: s });
        if (full || change.segmentIds.length) {
          const active = await (await collection("tripSegments")).countDocuments({ org: a.org, bookingId: b._id, status: "In progress", ...(full ? {} : { _id: { $in: change.segmentIds } }) }, { session: s });
          if (active) throw new Error("Finish or resolve the running trip segment before applying cancellation.");
          await (await collection("tripSegments")).updateMany(sf, { $set: { status: "Cancelled", cancellationChangeId: change._id }, $inc: { version: 1 } }, { session: s });
        }
        await (await collection("tasks")).updateMany({ org: a.org, bookingId: b._id, status: { $nin: ["Done", "Cancelled"] }, ...(full ? { _id: { $not: /^(finance-|settlement-|change-review:|payment:|booking:payment-exception:|operations-request:|handover:)/ } } : { $or: [{ arrangementId: { $in: change.arrangementIds } }, { segmentId: { $in: change.segmentIds } }, { _id: { $in: change.segmentIds.map((id: string) => `trip:${id}`) } }] }) }, { $set: { status: "Cancelled", note: "Booking cancellation confirmed", updatedAt: now() }, $inc: { version: 1 } }, { session: s });
      }
      await (await collection("ledgerEvents")).insertOne({ _id: `adjustment:${change._id}`, org: a.org, version: 1, bookingId: b._id, type: "Customer adjustment", amountMinor: change.newTotalMinor - b.totalMinor, currency: b.currency, changeId: change._id, createdAt: now() }, { session: s });
      await task(a, b, `change-services:${change._id}`, "Confirm affected suppliers, penalties and updated travel documents", b.salesAssigneeId, s);
      for (const driverId of b.operationsAssigneeIds || []) await notify(a, driverId, `trip-change:${change._id}:${driverId}`, "Your booking has changed. Check your trip details with the coordinator.", b._id, s);
    }
    await (await collection("bookingChanges")).updateOne({ _id: p.id, org: a.org }, { $set: { status: p.accepted ? "Applied" : "Customer declined", customerReference: p.reference, customerConfirmedAt: p.confirmedAt, recordedById: a.id, appliedAt: now() }, $inc: { version: 1 } }, { session: s });
    await (await collection("tasks")).updateOne({ _id: `customer-change:${p.id}`, org: a.org }, { $set: { status: "Done" }, $inc: { version: 1 } }, { session: s });
    await alert(a, b, `change-applied:${p.id}`, p.accepted ? "Booking change applied; review services and balances" : "Customer declined booking change", s);
    await audit(a, b._id, `Customer ${p.accepted ? "accepted" : "declined"} ${change.kind.toLowerCase()} - ${p.reference}`, s);
    await syncTasks(a, { ...b, totalMinor: p.accepted ? change.newTotalMinor : b.totalMinor }, s);
  });
}

async function syncTasks(a: Actor, b: Row, s: ClientSession) {
  const entries = await rows("settlementEntries", a, b._id, s), payments = await rows("payments", a, b._id, s);
  const totals = settlementTotals(b, entries, payments);
  await (await collection("tasks")).updateMany({ org: a.org, bookingId: b._id, _id: { $regex: "^settlement-due:" }, status: { $nin: ["Done", "Cancelled"] } }, { $set: { status: "Done" }, $inc: { version: 1 } }, { session: s });
  for (const item of totals.obligations.filter(t => t.remainingMinor > 0)) await task(a, b, `settlement-due:${item._id}`, `Follow up ${item.kind.toLowerCase()}: ${item.reference}`, b.ownerId || a.id, s, item.dueAt || now());
  await (await collection("bookings")).updateOne({ _id: b._id, org: a.org }, { $set: { outstandingMinor: totals.outstandingMinor, unappliedCreditMinor: totals.customerCreditMinor, refundedMinor: totals.refundPaidMinor, settlementOutstanding: true } }, { session: s });
}

export async function settlementView(a: Actor, bookingId: string) {
  const b = await access(a, bookingId);
  const entries = await (await collection("settlementEntries")).find({ org: a.org, bookingId }, { projection: { evidenceBytes: 0 } }).sort({ createdAt: -1 }).toArray();
  const changes = await rows("bookingChanges", a, bookingId);
  const totals = settlementTotals(b, entries, await rows("payments", a, bookingId));
  const blockers: string[] = [];
  if (!["Trip completed", "Cancelled"].includes(b.status)) blockers.push("Complete or cancel the trip.");
  if (totals.outstandingMinor) blockers.push("Collect the remaining customer balance.");
  if (totals.customerCreditMinor) blockers.push("Return or resolve customer credit.");
  if (entries.some(e => e.status === "Pending review")) blockers.push("Review pending financial requests.");
  if (totals.obligations.some(t => t.remainingMinor)) blockers.push("Settle outstanding supplier bills, refunds, recoveries and expenses.");
  if (changes.some(c => ["Pending review", "Awaiting customer"].includes(c.status))) blockers.push("Resolve pending booking changes.");
  const collections = await rows("collectionReports", a, bookingId);
  if (collections.some(r => (r.method || "Cash") === "Cash" && (r.handovers || []).filter((h: Row) => h.status === "Verified").reduce((n: number, h: Row) => n + h.amountMinor, 0) !== r.amountMinor)) blockers.push("Reconcile driver cash handovers, including rejected collections.");
  if (await (await collection("payments")).countDocuments({ org: a.org, bookingId, status: "Pending verification" })) blockers.push("Verify or reject pending customer payments.");
  const live = effectiveEntries(entries), arrangements = await rows("arrangements", a, bookingId), expenses = await rows("operationsRequests", a, bookingId);
  if (arrangements.some(r => r.responsibility === "Agency arranged" && r.costMinor > 0 && !live.some(e => e.kind === "Supplier bill" && e.arrangementId === r._id))) blockers.push("Record final supplier bills for agreed costs (including cancellation penalties).");
  if (expenses.some(r => r.type === "Expense" && (r.status === "Pending review" || (r.status === "Approved" && !live.some(e => e.kind === "Expense" && e.expenseRequestId === r._id))))) blockers.push("Resolve driver expenses and include approved expenses in settlement.");
  if (await (await collection("tasks")).countDocuments({ org: a.org, bookingId, _id: { $regex: "^change-services:" }, status: { $nin: ["Done", "Cancelled"] } })) blockers.push("Finish the affected-services review task.");
  return { booking: publicBookingForRole(b, a.role), entries, changes, totals: a.role === "owner" ? totals : { ...totals, estimatedMarginMinor: undefined, actualCostMinor: undefined, finalProfitMinor: undefined, exchangeDifferenceMinor: undefined }, blockers };
}

export async function closeSettlement(a: Actor, input: unknown) {
  owner(a);
  const p = z.object({ bookingId: z.string(), version: z.number().int(), reopen: z.boolean().default(false), reason: z.string().trim().min(3).max(1000) }).strict().parse(input);
  // All balance checks must share the transaction snapshot; use a dedicated session-aware closure check.
  return transact(async s => {
    const b = await access(a, p.bookingId, s);
    if (b.version !== p.version) throw new Error("409: Booking changed. Refresh before closing.");
    if (b.financialClosed && !p.reopen) return b._id;
    await (await collection("bookings")).updateOne({ _id: b._id, version: b.version, org: a.org }, { $inc: { version: 1 } }, { session: s });
    if (!p.reopen) {
      const entries = await rows("settlementEntries", a, b._id, s), payments = await rows("payments", a, b._id, s);
      const t = settlementTotals(b, entries, payments), live = effectiveEntries(entries);
      if (!["Trip completed", "Cancelled"].includes(b.status) || t.outstandingMinor || t.customerCreditMinor || t.obligations.some(x => x.remainingMinor) || entries.some(x => x.status === "Pending review") || payments.some(x => x.status === "Pending verification")) throw new Error("Complete the trip and resolve every customer/supplier balance and pending request first.");
      if ((await rows("bookingChanges", a, b._id, s)).some(c => ["Pending review", "Awaiting customer"].includes(c.status))) throw new Error("Resolve booking changes first.");
      if ((await rows("collectionReports", a, b._id, s)).some(r => (r.method || "Cash") === "Cash" && (r.handovers || []).filter((h: Row) => h.status === "Verified").reduce((n: number, h: Row) => n + h.amountMinor, 0) !== r.amountMinor)) throw new Error("Reconcile all driver cash first.");
      if ((await rows("arrangements", a, b._id, s)).some(r => r.responsibility === "Agency arranged" && r.costMinor > 0 && !live.some(e => e.kind === "Supplier bill" && e.arrangementId === r._id))) throw new Error("Record final supplier bills for all agreed costs first.");
      if ((await rows("operationsRequests", a, b._id, s)).some(r => r.type === "Expense" && (r.status === "Pending review" || (r.status === "Approved" && !live.some(e => e.kind === "Expense" && e.expenseRequestId === r._id))))) throw new Error("Resolve and record driver expenses first.");
      if (await (await collection("tasks")).countDocuments({ org: a.org, bookingId: b._id, _id: { $regex: "^change-services:" }, status: { $nin: ["Done", "Cancelled"] } }, { session: s })) throw new Error("Complete the affected-services review task first.");
    }
    await (await collection("bookings")).updateOne({ _id: b._id, org: a.org }, { $set: { financialClosed: !p.reopen, settlementOutstanding: p.reopen, financialClosedAt: p.reopen ? "" : now(), financialClosedById: a.id } }, { session: s });
    await audit(a, b._id, `Financial settlement ${p.reopen ? "reopened" : "closed"}: ${p.reason}`, s);
    await alert(a, b, `settlement-closed:${b._id}:${b.version}`, `Financial settlement ${p.reopen ? "reopened" : "closed"}`, s);
  });
}

export async function settlementReminders() {
  const due = await (await collection("settlementEntries")).find({ status: "Posted", kind: { $in: ["Supplier bill", "Refund approved", "Recovery expected", "Expense"] }, dueAt: { $ne: "", $lte: now() } }).limit(500).toArray();
  let count = 0;
  for (const e of due) {
    const a: Actor = { id: "system", authId: "system", name: "System", role: "owner", org: e.org };
    await transact(async s => {
      const b = await access(a, e.bookingId, s);
      if (b.financialClosed) return;
      const entries = effectiveEntries(await rows("settlementEntries", a, b._id, s));
      if (!entries.some(x => x._id === e._id) || balanceOf(e, entries) <= 0) return;
      await notify(a, b.ownerId, `settlement-overdue:${e._id}`, `Settlement follow-up due for ${b.bookingNumber}`, b._id, s);
      count++;
    });
  }
  return count;
}
