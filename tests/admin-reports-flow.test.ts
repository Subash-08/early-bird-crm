import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import type { Actor } from "../src/lib/domain";
import ExcelJS from "exceljs";
import { registerDates } from "../src/lib/customer-register";
import { PDFDocument } from "pdf-lib";
import { defaultInvoiceTemplate } from "../src/lib/invoice-domain";

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

  it("lists and streams CRM register data within each role and applied filter", async () => {
    const register = await import("../src/server/customer-register");
    const sales: Actor = { ...owner, id: "sales-2", role: "sales" };
    const operations: Actor = { ...owner, id: "ops-2", role: "operations" };
    const customers = await db.collection("customers");
    await customers.insertMany([
      { _id: "customer-only", org, version: 1, name: "Standalone Customer", assigneeId: "sales-2", createdAt: stamp, updatedAt: stamp },
      { _id: "customer-other-org", org: "another-company", version: 1, name: "Hidden other agency", createdAt: stamp, updatedAt: stamp },
    ]);
    await (await db.collection("quotes")).updateOne({ _id: "quote" }, { $set: { enquiryId: "enquiry", quoteNumber: "EB-Q-TEST", quoteVersion: 1, "content.title": "Kerala plan", "content.internalNotes": "PRIVATE" } });
    await (await db.collection("bookings")).updateOne({ _id: "booking" }, { $set: { enquiryId: "enquiry" } });
    await (await db.collection("enquiries")).updateOne({ _id: "enquiry" }, { $set: { nextAction: "Create booking" } });
    const filtered = await register.customerRegister(sales, { stage: "Won", status: "Confirmed", q: "Formula" });
    expect(filtered).toMatchObject({ total: 1, rows: [{ customer: "=Formula Customer", stage: "Accepted", quoteTitle: "Kerala plan", bookingNumber: "EB-TEST", nextAction: "Review and coordinate trip services" }] });
    expect(JSON.stringify(filtered)).not.toContain("PRIVATE");
    expect((await register.customerRegister(sales, {})).total).toBe(2);
    expect((await register.customerRegister(owner, { stage: "No enquiry" })).rows.map((row) => row.customer)).toEqual(["Standalone Customer"]);
    expect((await register.customerRegister({ ...sales, id: "unassigned" }, {})).total).toBe(0);
    await expect(register.customerRegister(operations, {})).rejects.toThrow("403");
    await expect(register.exportCustomerRegister(operations, {}, true, "csv")).rejects.toThrow("403");
    await expect(register.customerRegister(sales, { from: "2027-01-03", to: "2027-01-01" })).rejects.toThrow("Start date");
    expect(registerDates(1, new Date("2026-11-16T18:40:00Z"))).toEqual({ from: "2026-11-17", to: "2026-11-17" });

    const csvParts: Buffer[] = [];
    for await (const part of await register.exportCustomerRegister(sales, { stage: "Won" }, false, "csv")) csvParts.push(Buffer.from(part));
    const csv = Buffer.concat(csvParts).toString("utf8");
    expect(csv).toContain("'=Formula Customer");
    expect(csv).not.toContain("Standalone Customer");
    const xlsxParts: Buffer[] = [];
    for await (const part of await register.exportCustomerRegister(sales, { stage: "Won" }, true, "xlsx")) xlsxParts.push(Buffer.from(part));
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.read((await import("node:stream")).Readable.from(xlsxParts));
    const sheet = workbook.getWorksheet("Customer register");
    expect(sheet?.rowCount).toBe(3);
    expect([sheet?.getCell("A2").value, sheet?.getCell("A3").value]).toContain("Standalone Customer");
  });

  it("restricts document numbers to authorized editors and supports clearing them", async () => {
    const sales: Actor = { ...owner, id: "sales-2", role: "sales" };
    const otherSales: Actor = { ...sales, id: "unrelated-sales" };
    const operations: Actor = { ...owner, id: "ops-2", role: "operations" };
    const profile = { name: "Identity test", email: "identity@example.test" };
    const customerId = await crm.saveCustomer(sales, { ...profile, pan: "abcde1234f", passportNumber: "zz012345" });
    expect(await crm.customerEdit(sales, customerId)).toMatchObject({ pan: "ABCDE1234F", passportNumber: "ZZ012345" });
    const ordinaryDetail = await crm.customerDetail(sales, customerId);
    expect(ordinaryDetail.customer).toMatchObject({ panOnFile: true, passportOnFile: true });
    expect(JSON.stringify(ordinaryDetail)).not.toMatch(/ABCDE1234F|ZZ012345/);
    expect(JSON.stringify(await crm.snapshot(sales, "customers"))).not.toMatch(/ABCDE1234F|ZZ012345/);
    await expect(crm.customerEdit(otherSales, customerId)).rejects.toThrow("403");
    await crm.saveCustomer(sales, profile, customerId, 1);
    expect((await crm.customerEdit(sales, customerId)).pan).toBe("ABCDE1234F");
    await crm.saveCustomer(sales, { ...profile, pan: "", passportNumber: "" }, customerId, 2);
    expect(await crm.customerEdit(sales, customerId)).toMatchObject({ pan: "", passportNumber: "" });
    await expect(crm.saveCustomer(sales, { ...profile, pan: "bad" })).rejects.toThrow("valid 10-character PAN");

    const bookings = await import("../src/server/bookings");
    const row = await (await db.collection("bookings")).findOne({ _id: "booking" });
    const detail = { payerName: "Sample payer", travellers: [{ id: "guest", name: "Sample passenger", type: "Adult", lead: true }] };
    await bookings.saveBookingDetails(sales, {
      bookingId: "booking", version: row!.version,
      details: { ...detail, payerPan: "abcde1234f", travellers: [{ ...detail.travellers[0], passportNumber: "zz012345" }] },
    });
    expect(await bookings.bookingPrivateNumbers(sales, "booking")).toEqual({ payerPan: "ABCDE1234F", passports: { guest: "ZZ012345" } });
    expect(JSON.stringify(await crm.snapshot(owner, "bookings"))).not.toMatch(/ABCDE1234F|ZZ012345/);
    await expect(bookings.bookingPrivateNumbers(otherSales, "booking")).rejects.toThrow("403");
    await expect(bookings.bookingPrivateNumbers(operations, "booking")).rejects.toThrow("403");
  });

  it("updates customer document numbers independently with write permissions and version checks", async () => {
    const sales: Actor = { ...owner, id: "sales-2", role: "sales" };
    const collaborator: Actor = { ...sales, id: "collaborating-sales" };
    const driver: Actor = { ...sales, id: "ops-2", role: "operations" };
    const customerId = await crm.saveCustomer(sales, { name: "Trip documents", email: "trip-docs@example.test" });
    await (await db.collection("enquiries")).insertOne({
      _id: "shared-trip-docs", org, version: 1, customerId, assigneeId: sales.id, collaboratorIds: [collaborator.id],
    });
    await (await db.collection("quotes")).insertOne({
      _id: "shared-trip-quote", org, version: 1, customerId, enquiryId: "shared-trip-docs", assigneeId: sales.id,
      content: { title: "Trip package", internalNotes: "Confidential quote note" },
    });
    const update = { customerId, version: 1, pan: "abcde1234f", passportNumber: "a1234567" };
    expect(await crm.customerNumbers(owner, customerId)).toMatchObject({ pan: "", passportNumber: "", version: 1 });
    await expect(crm.customerNumbers(collaborator, customerId)).rejects.toThrow("403");
    await expect(crm.saveCustomerNumbers(collaborator, update)).rejects.toThrow("403");
    await expect(crm.saveCustomerNumbers(driver, update)).rejects.toThrow("403");
    await expect(crm.saveCustomerNumbers(sales, { ...update, passportNumber: "!!" })).rejects.toThrow("passport number");
    await expect(crm.saveCustomerNumbers(sales, update)).resolves.toEqual({ panOnFile: true, passportOnFile: true });
    await expect(crm.saveCustomerNumbers(owner, update)).rejects.toThrow("409");
    expect(await crm.customerNumbers(sales, customerId)).toEqual({ pan: "ABCDE1234F", passportNumber: "A1234567", version: 2 });
    const profile = await crm.customerDetail(collaborator, customerId);
    expect(profile).toMatchObject({
      canEditNumbers: false,
      customer: { email: "trip-docs@example.test", panOnFile: true, passportOnFile: true },
      quotes: [{ _id: "shared-trip-quote" }],
    });
    expect(JSON.stringify(profile)).not.toMatch(/ABCDE1234F|A1234567|Confidential quote note/);
    const auditEntry = await (await db.collection("activity")).findOne({ recordId: customerId, event: "Customer document numbers updated" });
    expect(auditEntry).toBeTruthy();
    expect(JSON.stringify(auditEntry)).not.toMatch(/ABCDE1234F|A1234567/);
    await expect(crm.saveCustomerNumbers(owner, { ...update, version: 2, pan: "", passportNumber: "" }))
      .resolves.toEqual({ panOnFile: false, passportOnFile: false });
  });

  it("counts Overview work beyond its previews and scopes direct records by role and agency", async () => {
    const agency = "overview-test";
    const scope = { org: agency, version: 1 };
    const boss = { ...owner, org: agency };
    const sales: Actor = { ...boss, id: "overview-sales", role: "sales" };
    const driver: Actor = { ...boss, id: "overview-driver", role: "operations" };
    const { workspaceOverview } = await import("../src/server/overview");
    const { alertDestination } = await import("../src/lib/alert-destination");
    const now = new Date("2026-11-17T18:00:00.000Z");
    await (await db.collection("tasks")).insertMany([
      ...Array.from({ length: 7 }, (_, index) => ({
        ...scope, _id: `overview:old:${index}`, assigneeId: sales.id, status: "To do", dueAt: "2026-11-16T05:00:00.000Z",
      })),
      { ...scope, _id: "overview:today", assigneeId: sales.id, status: "Waiting", dueAt: "2026-11-17T18:29:00.000Z" },
      { ...scope, _id: "overview:tomorrow", assigneeId: sales.id, status: "In progress", dueAt: "2026-11-17T18:30:00.000Z" },
      { ...scope, _id: "overview:done", assigneeId: sales.id, status: "Done", dueAt: "2026-11-16T05:00:00.000Z" },
      { ...scope, _id: "overview:driver", assigneeId: driver.id, status: "To do", dueAt: "2026-11-17T18:29:00.000Z" },
    ]);
    await (await db.collection("enquiries")).insertMany([
      { ...scope, _id: "overview:enquiry", assigneeId: boss.id, collaboratorIds: [sales.id], stage: "Quote requested" },
      { ...scope, _id: "overview:won", assigneeId: sales.id, stage: "Won" },
    ]);
    await (await db.collection("quotes")).insertMany([
      { ...scope, _id: "overview:accepted", quoteNumber: "OVERVIEW-1", quoteVersion: 1, assigneeId: boss.id, enquiryId: "overview:enquiry", status: "Accepted" },
      { ...scope, _id: "overview:booked", quoteNumber: "OVERVIEW-2", quoteVersion: 1, assigneeId: sales.id, enquiryId: "overview:won", status: "Accepted" },
      { ...scope, _id: "overview:unassigned", quoteNumber: "OVERVIEW-3", quoteVersion: 1, assigneeId: "someone-else", status: "Requested" },
    ]);
    await (await db.collection("bookings")).insertMany([
      { ...scope, _id: "overview:booking:old", quoteId: "overview:booked", salesAssigneeId: sales.id, operationsAssigneeIds: [driver.id], operationsReleased: true, status: "Pending confirmation", bookingNumber: "EB-BK-OVERVIEW", payer: { pan: "ABCDE1234F" } },
      { ...scope, _id: "overview:booking:private", bookingNumber: "EB-BK-PRIVATE", quoteId: "another", salesAssigneeId: boss.id, operationsAssigneeIds: [driver.id], operationsReleased: false, status: "Ready for coordination" },
      { ...scope, _id: "overview:booking:done", bookingNumber: "EB-BK-DONE", quoteId: "done", salesAssigneeId: sales.id, operationsAssigneeIds: [driver.id], operationsReleased: true, status: "Trip completed" },
    ]);
    await (await db.collection("notifications")).insertMany(Array.from({ length: 7 }, (_, index) => ({
      ...scope, _id: `overview:alert:${index}`, recipient: sales.id, title: "Overview alert", createdAt: now.toISOString(),
    })));
    const overview = await workspaceOverview(sales, now);
    expect(overview).toMatchObject({ openTaskCount: 9, overdueCount: 7, dueCount: 8, bookingCount: 1, unreadCount: 7 });
    expect(overview.dueTasks).toHaveLength(5);
    expect(overview.upcomingTasks.map(row => row.id)).toEqual(["overview:tomorrow"]);
    expect(overview.alerts).toHaveLength(5);
    expect(overview.crm).toMatchObject({ enquiryCount: 1, quoteCount: 1, quotes: [{ id: "overview:accepted" }] });
    expect(await workspaceOverview(boss, now)).toMatchObject({ openTaskCount: 10, bookingCount: 2 });
    const driverOverview = await workspaceOverview(driver, now);
    expect(driverOverview).toMatchObject({ crm: null, openTaskCount: 1, bookingCount: 1, unreadCount: 0 });
    expect(JSON.stringify(driverOverview)).not.toContain("ABCDE1234F");
    const booking = { recordId: "overview:booking:old", page: 50, query: "irrelevant", status: "Cancelled" };
    expect((await crm.snapshot(sales, "bookings", booking)).bookings.map(row => row._id)).toEqual([booking.recordId]);
    expect((await crm.snapshot(driver, "operations", booking)).bookings.map(row => row._id)).toEqual([booking.recordId]);
    expect((await crm.snapshot(driver, "operations", { recordId: "overview:booking:private" })).bookings).toEqual([]);
    expect((await crm.snapshot({ ...sales, id: "unknown" }, "bookings", booking)).bookings).toEqual([]);
    expect((await crm.snapshot({ ...boss, org }, "bookings", booking)).bookings).toEqual([]);
    expect((await crm.snapshot(sales, "bookings")).quotes.map(row => row._id)).not.toContain("overview:booked");
    expect((await crm.snapshot(driver, "tasks", { recordId: "overview:today" })).tasks).toEqual([]);
    expect((await crm.snapshot(sales, "tasks", { recordId: "overview:today" })).tasks.map(row => row._id)).toEqual(["overview:today"]);
    expect(alertDestination("sales", "due:follow:overview:enquiry:2", "overview:enquiry")).toEqual(["tasks", "follow:overview:enquiry"]);
    expect(alertDestination("operations", "booking:ops:1:2", booking.recordId)).toEqual(["operations", booking.recordId]);
    expect(alertDestination("sales", "quote-accepted:1", "quote:1")).toEqual(["quotations", "quote:1"]);
    expect(alertDestination("operations", "invoice:issued:1", booking.recordId)).toEqual(["notifications"]);
  });

  it("renders an Owner-only invoice-settings sample without issuing or numbering an invoice", async () => {
    const invoice = await import("../src/server/invoices");
    const count = await (await db.collection("invoices")).countDocuments();
    const counters = await (await db.collection("counters")).countDocuments();
    const bytes = await invoice.renderInvoiceTemplatePreview(owner, defaultInvoiceTemplate);
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1);
    const withSummary = await invoice.renderInvoiceTemplatePreview(owner, { ...defaultInvoiceTemplate, includeTravelSummary: true });
    expect((await PDFDocument.load(withSummary)).getPageCount()).toBe(2);
    await expect(invoice.renderInvoiceTemplatePreview({ ...owner, role: "sales" }, defaultInvoiceTemplate)).rejects.toThrow("Owner");
    expect(await (await db.collection("invoices")).countDocuments()).toBe(count);
    expect(await (await db.collection("counters")).countDocuments()).toBe(counters);
  });
});
