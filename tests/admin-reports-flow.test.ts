import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import type { Actor } from "../src/lib/domain";

let replica: MongoMemoryReplSet;
let db: typeof import("../src/server/db");
let crm: typeof import("../src/server/crm");
let reports: typeof import("../src/server/reports");
const org = "admin-report-test";
const owner: Actor = { id: "owner-1", authId: "owner-auth", org, name: "Owner One", role: "owner" };
const stamp = new Date().toISOString();

beforeAll(async () => {
  replica = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  process.env.MONGODB_URI = replica.getUri();
  process.env.MONGODB_DB_NAME = "admin_reports";
  process.env.APP_ORG_ID = org;
  db = await import("../src/server/db");
  crm = await import("../src/server/crm");
  reports = await import("../src/server/reports");
  await db.indexes();
  await (await db.collection("staff")).insertMany([
    { _id: "owner-1", authId: "owner-auth", org, version: 1, name: "Owner One", email: "owner1@example.test", role: "owner", status: "active" },
    { _id: "owner-2", authId: "owner2-auth", org, version: 1, name: "Owner Two", email: "owner2@example.test", role: "owner", status: "active" },
    { _id: "sales-1", authId: "sales1-auth", org, version: 1, name: "Sales One", email: "sales1@example.test", role: "sales", status: "active" },
    { _id: "sales-2", authId: "sales2-auth", org, version: 1, name: "Sales Two", email: "sales2@example.test", role: "sales", status: "active" },
    { _id: "ops-1", authId: "ops1-auth", org, version: 1, name: "Driver One", email: "ops1@example.test", role: "operations", status: "active" },
    { _id: "ops-2", authId: "ops2-auth", org, version: 1, name: "Driver Two", email: "ops2@example.test", role: "operations", status: "active" },
  ]);
  await (await db.collection("customers")).insertOne({ _id: "customer", org, version: 1, name: "=Formula Customer", phone: "+919900000001", assigneeId: "sales-1", createdAt: stamp, updatedAt: stamp });
  await (await db.collection("enquiries")).insertOne({ _id: "enquiry", org, version: 1, customerId: "customer", assigneeId: "sales-1", destination: "=Kerala", source: "Phone", stage: "Won", createdAt: stamp, updatedAt: stamp });
  await (await db.collection("tasks")).insertOne({ _id: "task", org, version: 1, assigneeId: "sales-1", title: "Follow up", status: "To do", dueAt: stamp, createdAt: stamp, updatedAt: stamp });
  await (await db.collection("quotes")).insertOne({ _id: "quote", org, version: 1, assigneeId: "sales-1", status: "Approved", requestedAt: new Date(Date.now() - 3600000).toISOString(), approvedAt: stamp, createdAt: stamp, updatedAt: stamp });
  await (await db.collection("bookings")).insertOne({ _id: "booking", org, version: 1, bookingNumber: "EB-TEST", quoteId: "quote", salesAssigneeId: "sales-1", operationsAssigneeIds: ["ops-1"], operationsReleased: true, destination: "=Kerala", status: "Confirmed", currency: "INR", totalMinor: 100000, outstandingMinor: 40000, serviceStart: new Date(Date.now() + 86400000).toISOString().slice(0, 10), serviceEnd: new Date(Date.now() + 172800000).toISOString().slice(0, 10), createdAt: stamp, updatedAt: stamp });
  await (await db.collection("tripSegments")).insertOne({ _id: "segment", org, version: 1, bookingId: "booking", driverId: "ops-1", vehicleId: "vehicle", status: "Assigned", startAt: new Date(Date.now() + 86400000).toISOString(), endAt: new Date(Date.now() + 90000000).toISOString() });
  await (await db.collection("payments")).insertOne({ _id: "payment", org, version: 1, bookingId: "booking", status: "Verified", amountMinor: 60000 });
});
afterAll(async () => { if (db) await (await db.client()).close(); if (replica) await replica.stop(); });

describe("administration completion and reports", () => {
  it("changes Sales to Operations only after reassigning every Sales-owned record", async () => {
    await crm.staffAction(owner, { id: "sales-1", version: 1, name: "Sales One", email: "sales1@example.test", role: "operations", status: "active", replacementId: "sales-2", capabilities: ["trip-times"], reset: false });
    expect((await (await db.collection("staff")).findOne({ _id: "sales-1" }))?.role).toBe("operations");
    expect((await (await db.collection("enquiries")).findOne({ _id: "enquiry" }))?.assigneeId).toBe("sales-2");
    expect((await (await db.collection("customers")).findOne({ _id: "customer" }))?.assigneeId).toBe("sales-2");
    expect((await (await db.collection("quotes")).findOne({ _id: "quote" }))?.assigneeId).toBe("sales-2");
    expect((await (await db.collection("bookings")).findOne({ _id: "booking" }))?.salesAssigneeId).toBe("sales-2");
  });

  it("changes Operations to Sales only after active trip reassignment", async () => {
    await crm.staffAction(owner, { id: "ops-1", version: 1, name: "Driver One", email: "ops1@example.test", role: "sales", status: "active", replacementId: "ops-2", capabilities: [], reset: false });
    expect((await (await db.collection("tripSegments")).findOne({ _id: "segment" }))?.driverId).toBe("ops-2");
    expect((await (await db.collection("bookings")).findOne({ _id: "booking" }))?.operationsAssigneeIds).toContain("ops-2");
  });

  it("protects the current user and the last active Owner", async () => {
    await expect(crm.staffAction(owner, { id: "owner-1", version: 1, name: "Owner One", email: "owner1@example.test", role: "sales", status: "active", replacementId: "", capabilities: [], reset: false })).rejects.toThrow("own role");
    await (await db.collection("staff")).updateOne({ _id: "owner-2" }, { $set: { status: "inactive" } });
    const externalOwner: Actor = { ...owner, id: "security-owner" };
    await expect(crm.staffAction(externalOwner, { id: "owner-1", version: 1, name: "Owner One", email: "owner1@example.test", role: "sales", status: "active", replacementId: "sales-2", capabilities: [], reset: false })).rejects.toThrow("last active Owner");
  });

  it("returns role-scoped reports and safe spreadsheet exports", async () => {
    const ownerReport = await reports.reportData(owner, {});
    expect(ownerReport.pipeline.total).toBe(1);
    expect(ownerReport.finance[0].collectedMinor).toBe(60000);
    const salesReport = await reports.reportData({ ...owner, id: "sales-2", role: "sales" }, {});
    expect(salesReport.finance).toBeUndefined();
    const operationsReport = await reports.reportData({ ...owner, id: "ops-2", role: "operations" }, {});
    expect(operationsReport.pipeline.total).toBe(0);
    const csv = reports.reportCsv(ownerReport);
    expect(csv).toContain("Pipeline");
    const xlsx = await reports.reportXlsx(ownerReport);
    expect(xlsx.byteLength).toBeGreaterThan(1000);
  });
});
