import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import type { Actor } from "../src/lib/domain";
let replica: MongoMemoryReplSet;
let db: typeof import("../src/server/db");
let api: typeof import("../src/server/settlements");
const owner: Actor = { id: "owner", authId: "owner", name: "Demo Owner", org: "phase5-test", role: "owner" };
const sales: Actor = { ...owner, id: "sales", authId: "sales", name: "Demo Sales", role: "sales" };
const driver: Actor = { ...owner, id: "driver", authId: "driver", name: "Demo Driver", role: "operations" };
const stamp = "2026-01-01T10:00:00.000Z";
const command = () => crypto.randomUUID();
async function fixture() {
  const id = command();
  await (await db.collection("bookings")).insertOne({ _id: id, org: owner.org, version: 1, bookingNumber: id, quoteId: id, ownerId: owner.id, salesAssigneeId: sales.id, operationsAssigneeIds: [driver.id], operationsReleased: true, status: "Trip completed", totalMinor: 100000, requiredAdvanceMinor: 10000, currency: "INR", serviceStart: "2026-01-01", serviceEnd: "2026-01-03", travellers: [{ id: "t1", name: "Demo One", lead: true }, { id: "t2", name: "Demo Two", lead: false }], agreementSnapshot: { content: { internalNotes: "PRIVATE" } } });
  await (await db.collection("payments")).insertOne({ _id: `pay-${id}`, org: owner.org, version: 1, bookingId: id, status: "Verified", amountMinor: 100000, currency: "INR", referenceKey: id });
  await (await db.collection("arrangements")).insertOne({ _id: `service-${id}`, org: owner.org, version: 1, bookingId: id, supplierId: "supplier", responsibility: "Agency arranged", currency: "INR", costMinor: 60000, confirmationStatus: "Confirmed" });
  return id;
}
async function request(bookingId: string, kind: string, amount: string, more: Record<string, any> = {}) {
  return api.submitSettlement(sales, { bookingId, commandId: command(), kind, amount, currency: "INR", reference: command(), reason: "Demo transaction for automated testing", occurredAt: stamp, arrangementId: `service-${bookingId}`, ...more });
}
async function approve(id: string) { await api.decideSettlement(owner, { id, version: 1, decision: "Posted", reason: "Checked supporting records" }); }
async function post(bookingId: string, kind: string, amount: string, more: Record<string, any> = {}) { const id = (await request(bookingId, kind, amount, more))!; await approve(id); return id; }
beforeAll(async () => {
  replica = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  process.env.MONGODB_URI = replica.getUri(); process.env.MONGODB_DB_NAME = "settlement_tests"; process.env.APP_ORG_ID = owner.org;
  db = await import("../src/server/db"); api = await import("../src/server/settlements"); await db.indexes();
  await (await db.collection("staff")).insertMany([owner, sales, driver].map(p => ({ _id: p.id, org: p.org, version: 1, name: p.name, role: p.role, status: "active", email: `${p.id}@example.test` })));
}, 60000);
afterAll(async () => { if (db) await (await db.client()).close(); if (replica) await replica.stop(); });

describe("Phase 5 live database workflows", () => {
  it("blocks other roles, other assignments, other agencies and self-review", async () => {
    const bookingId = await fixture();
    await expect(api.settlementView(driver, bookingId)).rejects.toThrow("403");
    await expect(api.settlementView({ ...sales, id: "another" }, bookingId)).rejects.toThrow("403");
    await expect(api.settlementView({ ...owner, org: "other" }, bookingId)).rejects.toThrow("404");
    const id = (await request(bookingId, "Supplier bill", "600"))!;
    await expect(api.decideSettlement(sales, { id, version: 1, decision: "Posted", reason: "No rights" })).rejects.toThrow("403");
    await expect(api.decideSettlement({ ...owner, id: sales.id }, { id, version: 1, decision: "Posted", reason: "Self review" })).rejects.toThrow("different Owner");
    const view = await api.settlementView(sales, bookingId); expect(view.totals.estimatedMarginMinor).toBeUndefined(); expect(view.booking.agreementSnapshot.content.internalNotes).toBeUndefined();
  });
  it("requires a second reviewer when the only Owner submits", async () => {
    const b = await fixture();
    await expect(api.submitSettlement(owner, { bookingId: b, commandId: command(), kind: "Supplier bill", amount: "600", currency: "INR", arrangementId: `service-${b}`, reference: command(), reason: "Owner entered bill", occurredAt: stamp })).rejects.toThrow("ask Sales");
  });
  it("deduplicates a retried command and rejects repeated references", async () => {
    const b = await fixture(), p = { bookingId: b, commandId: command(), kind: "Supplier bill", amount: "600", currency: "INR", arrangementId: `service-${b}`, reference: command(), reason: "Demo supplier bill", occurredAt: stamp };
    const a = await api.submitSettlement(sales, p); expect(await api.submitSettlement(sales, p)).toBe(a);
    await expect(api.submitSettlement(sales, { ...p, commandId: command() })).rejects.toThrow("already recorded");
  });
  it("prevents two concurrent allocations from paying a bill twice", async () => {
    const b = await fixture(), bill = await post(b, "Supplier bill", "600");
    const one = (await request(b, "Supplier payment", "400", { targetId: bill }))!, two = (await request(b, "Supplier payment", "400", { targetId: bill }))!;
    const results = await Promise.allSettled([approve(one), approve(two)]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect((await api.settlementView(owner, b)).totals.obligations.find(r => r._id === bill)?.remainingMinor).toBe(20000);
  });
  it("handles cancellation, partial refunds, independent recovery, and safe closure", async () => {
    const b = await fixture(), bill = await post(b, "Supplier bill", "600"), paid = await post(b, "Supplier payment", "600", { targetId: bill });
    const change = (await api.submitBookingChange(sales, { bookingId: b, commandId: command(), kind: "Full cancellation", reason: "Customer cancelled", description: "Cancellation with retained service charge", newTotal: "400", effectiveDate: "2026-01-01", serviceUsage: "No travel used. Retain agreed cancellation charge.", supplierImpact: "Supplier keeps 200 and returns 400." }))!;
    await api.decideBookingChange(owner, { id: change, version: 1, decision: "Approved", reason: "Cancellation terms checked" });
    expect((await api.settlementView(owner, b)).booking.totalMinor).toBe(100000);
    await api.confirmBookingChange(sales, { id: change, version: 2, accepted: true, reference: "Customer written agreement", confirmedAt: stamp });
    expect((await api.settlementView(owner, b)).booking.status).toBe("Cancelled");
    const refund = await post(b, "Refund approved", "600");
    await post(b, "Refund paid", "200", { targetId: refund });
    const recovery = await post(b, "Recovery expected", "400");
    await post(b, "Recovery received", "400", { targetId: recovery });
    let view = await api.settlementView(owner, b); expect(view.totals.refundPendingMinor).toBe(40000);
    await expect(api.closeSettlement(owner, { bookingId: b, version: view.booking.version, reason: "Attempt early closure" })).rejects.toThrow();
    await post(b, "Refund paid", "400", { targetId: refund });
    await expect(request(b, "Refund paid", "1", { targetId: refund })).rejects.toThrow("exceeds");
    await expect(request(b, "Reversal", "600", { targetId: paid })).rejects.toThrow("recoveries");
    await (await db.collection("tasks")).updateOne({ _id: `change-services:${change}` }, { $set: { status: "Done" } });
    view = await api.settlementView(owner, b); expect(view.blockers).toEqual([]);
    await api.closeSettlement(owner, { bookingId: b, version: view.booking.version, reason: "Every balance reconciled" });
    view = await api.settlementView(owner, b); expect(view.totals.finalProfitMinor).toBe(20000);
    await expect(request(b, "Supplier bill", "1")).rejects.toThrow("closed");
    await api.closeSettlement(owner, { bookingId: b, version: view.booking.version, reopen: true, reason: "Review a correction" });
    expect((await api.settlementView(owner, b)).booking.financialClosed).toBe(false);
  });
  it("preserves unaffected services and selects another lead after partial traveller cancellation", async () => {
    const b = await fixture();
    const id = (await api.submitBookingChange(sales, { bookingId: b, commandId: command(), kind: "Partial cancellation", reason: "One guest cannot travel", description: "Remove first traveller only", newTotal: "700", effectiveDate: "2026-01-01", travellerIds: ["t1"], serviceUsage: "No services used", supplierImpact: "Hotel and car remain for second traveller" }))!;
    await api.decideBookingChange(owner, { id, version: 1, decision: "Approved", reason: "Checked remaining services" });
    await api.confirmBookingChange(sales, { id, version: 2, accepted: true, reference: "Customer confirms", confirmedAt: stamp });
    const view = await api.settlementView(owner, b); expect(view.booking.travellers[0].cancelled).toBe(true); expect(view.booking.travellers[1].lead).toBe(true);
    expect((await (await db.collection("arrangements")).findOne({ _id: `service-${b}` }))?.confirmationStatus).toBe("Confirmed");
  });
  it("reverses a payment once without deleting its record", async () => {
    const b = await fixture(), bill = await post(b, "Supplier bill", "600"), payment = await post(b, "Supplier payment", "200", { targetId: bill });
    await post(b, "Reversal", "200", { targetId: payment });
    await expect(request(b, "Reversal", "200", { targetId: payment })).rejects.toThrow("already been reversed");
    expect((await (await db.collection("settlementEntries")).findOne({ _id: payment }))?.status).toBe("Posted");
    expect((await api.settlementView(owner, b)).totals.obligations.find(r => r._id === bill)?.remainingMinor).toBe(60000);
  });
  it("rejects false evidence and missing conversion provenance", async () => {
    const b = await fixture();
    await expect(request(b, "Supplier bill", "600", { evidenceBase64: Buffer.from("not a PDF").toString("base64"), evidenceName: "fake.pdf", evidenceType: "application/pdf" })).rejects.toThrow("valid JPG");
    await expect(request(b, "Supplier bill", "600", { currency: "USD", rate: "83" })).rejects.toThrow("rate source");
  });
  it("blocks closure on legacy driver cash records without a method field", async () => {
    const b = await fixture(), bill = await post(b, "Supplier bill", "600"); await post(b, "Supplier payment", "600", { targetId: bill });
    await (await db.collection("collectionReports")).insertOne({ _id: command(), org: owner.org, version: 1, bookingId: b, amountMinor: 1000, status: "Verified", duplicateKey: command(), handovers: [] });
    const view = await api.settlementView(owner, b);
    expect(view.blockers.some(v => v.includes("cash"))).toBe(true);
    await expect(api.closeSettlement(owner, { bookingId: b, version: view.booking.version, reason: "Try closing" })).rejects.toThrow("cash");
  });
  it("allows a generated booking task to be completed using its blank form links", async () => {
    const b = await fixture(), crm = await import("../src/server/crm");
    const taskId = command();
    await (await db.collection("tasks")).insertOne({ _id: taskId, org: owner.org, version: 1, bookingId: b, title: "Review changed services", assigneeId: sales.id, dueAt: stamp, status: "To do" });
    await crm.saveTask(sales, { title: "Review changed services", assigneeId: sales.id, dueAt: stamp, status: "Done", note: "Supplier confirmed", enquiryId: "", customerId: "" }, taskId, 1);
    expect((await (await db.collection("tasks")).findOne({ _id: taskId }))?.status).toBe("Done");
  });
  it("prevents simultaneous vehicle/driver assignments across different bookings", async () => {
    const b1 = await fixture(), b2 = await fixture(), ops = await import("../src/server/operations"), vehicleId = command();
    await (await db.collection("vehicles")).insertOne({ _id: vehicleId, org: owner.org, version: 1, label: "Demo car", registration: command(), status: "Available", seats: 4 });
    const data = { bookingId: b1, mode: "Car", title: "Demo pickup", from: "Kochi", to: "Munnar", startAt: "2027-04-01T04:00:00.000Z", endAt: "2027-04-01T06:00:00.000Z", timeZone: "Asia/Kolkata", driverId: driver.id, vehicleId, bufferMinutes: 60 };
    const results = await Promise.allSettled([ops.saveTripSegment(owner, { data }), ops.saveTripSegment(owner, { data: { ...data, bookingId: b2 } })]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    await expect(ops.saveTripSegment(owner, { data: { ...data, bookingId: b2, startAt: "2027-04-01T06:30:00.000Z", endAt: "2027-04-01T07:30:00.000Z", bufferMinutes: 0 } })).rejects.toThrow("overlap");
  });
});
