import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import type { Actor } from "../src/lib/domain";

let repl: MongoMemoryReplSet;
let dbmod: any;
let bookingApi: any;
let crm: any;
const owner: Actor = {
  id: "owner-1",
  authId: "auth-owner",
  org: "phase3-agency",
  name: "Owner",
  role: "owner",
};
const sales: Actor = {
  id: "sales-1",
  authId: "auth-sales",
  org: "phase3-agency",
  name: "Sales",
  role: "sales",
};
const operations: Actor = {
  id: "ops-1",
  authId: "auth-ops",
  org: "phase3-agency",
  name: "Driver One",
  role: "operations",
};

beforeAll(async () => {
  repl = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  process.env.MONGODB_URI = repl.getUri();
  process.env.MONGODB_DB_NAME = "booking_flow";
  process.env.APP_ORG_ID = owner.org;
  dbmod = await import("../src/server/db");
  bookingApi = await import("../src/server/bookings");
  crm = await import("../src/server/crm");
  await dbmod.indexes();
  await (
    await dbmod.collection("staff")
  ).insertMany([
    {
      _id: owner.id,
      org: owner.org,
      version: 1,
      name: owner.name,
      email: "owner@test.local",
      role: "owner",
      status: "active",
    },
    {
      _id: sales.id,
      org: sales.org,
      version: 1,
      name: sales.name,
      email: "sales@test.local",
      role: "sales",
      status: "active",
    },
    {
      _id: operations.id,
      org: operations.org,
      version: 1,
      name: operations.name,
      email: "ops@test.local",
      role: "operations",
      status: "active",
    },
  ]);
  await (
    await dbmod.collection("customers")
  ).insertOne({
    _id: "customer-1",
    org: owner.org,
    version: 1,
    name: "Test Couple",
    phone: "+919876543210",
    email: "couple@test.local",
    address: "Kochi",
    assigneeId: sales.id,
  });
  await (
    await dbmod.collection("enquiries")
  ).insertOne({
    _id: "enquiry-1",
    org: owner.org,
    version: 1,
    customerId: "customer-1",
    assigneeId: sales.id,
    destination: "Munnar",
    stage: "Won",
  });
  const option = {
    id: "comfort",
    name: "Comfort",
    description: "Hotel and private car",
    internalCost: "private cost",
    quantity: 1,
    unitPriceMinor: 5000000,
    discountMinor: 0,
    taxAmountMinor: 0,
    subtotalMinor: 5000000,
    totalMinor: 5000000,
  };
  await (
    await dbmod.collection("quotes")
  ).insertOne({
    _id: "quote-1",
    org: owner.org,
    version: 5,
    groupId: "group-1",
    quoteNumber: "EB-Q-2027-0001",
    quoteVersion: 1,
    status: "Accepted",
    assigneeId: sales.id,
    approvedById: owner.id,
    enquiryId: "enquiry-1",
    customerId: "customer-1",
    selectedOptionId: "comfort",
    decisionAt: "2027-01-01T10:00:00.000Z",
    acceptedSnapshot: {
      approvedAt: "2027-01-01T09:00:00.000Z",
      content: {
        title: "Munnar escape",
        destinations: "Munnar",
        startDate: "2027-02-10",
        endDate: "2027-02-13",
        adults: 2,
        childrenAges: "",
        infants: 0,
        currency: "INR",
        advanceAmountMinor: 1000000,
        balanceTerms: "Balance before travel",
        services: ["Accommodation", "Car / transfer"],
        inclusions: ["Breakfast"],
        exclusions: ["Personal expenses"],
        internalNotes: "never expose this note",
        options: [option],
        stays: [{ id: "stay-1", optionId: "comfort", property: "Hill Hotel" }],
        transport: [
          {
            id: "leg-1",
            optionId: "comfort",
            mode: "Car",
            responsibility: "Agency arranged",
          },
        ],
      },
    },
  });
}, 120000);

afterAll(async () => {
  if (dbmod) await (await dbmod.client()).close();
  if (repl) await repl.stop();
}, 30000);

describe("Phase 3 booking and verified advance", () => {
  it("converts once, blocks partial release, verifies remaining advance and releases one checklist", async () => {
    const bookingId = await bookingApi.convertAcceptedQuote(sales, {
      quoteId: "quote-1",
    });
    expect(
      await bookingApi.convertAcceptedQuote(sales, { quoteId: "quote-1" }),
    ).toBe(bookingId);
    expect(
      await (
        await dbmod.collection("bookings")
      ).countDocuments({ quoteId: "quote-1" }),
    ).toBe(1);
    let booking = await (
      await dbmod.collection("bookings")
    ).findOne({ _id: bookingId });
    await (await dbmod.collection("invoiceTemplates")).insertOne({
      _id: "invoice-template-1",
      org: owner.org,
      version: 1,
      versionNumber: 1,
      active: true,
      includeTravelSummary: true,
    });
    await bookingApi.issueInvoice(owner, {
      bookingId,
      bookingVersion: booking.version,
    });
    booking = await (
      await dbmod.collection("bookings")
    ).findOne({ _id: bookingId });
    expect(booking.invoiceStatus).toBe("Issued");
    const salesSnapshot = await bookingApi.phase3Snapshot(sales);
    expect(JSON.stringify(salesSnapshot.invoices)).not.toContain("never expose this note");
    expect(JSON.stringify(salesSnapshot.invoices)).not.toContain("private cost");
    expect(salesSnapshot.invoices[0].snapshot.travelSummary.selectedOptionName).toBe("Comfort");

    const first = await bookingApi.submitPayment(sales, {
      bookingId,
      amount: "4000",
      currency: "INR",
      receivedAt: "2027-01-02T10:00:00.000Z",
      method: "UPI",
      reference: "UPI-PART-1",
      payerName: "Test Couple",
      note: "",
      evidenceName: "",
      evidenceType: "",
      evidenceBase64: "",
    });
    let payment = await (
      await dbmod.collection("payments")
    ).findOne({ _id: first });
    await bookingApi.decidePayment(owner, {
      paymentId: first,
      version: payment.version,
      decision: "Verified",
      reason: "Bank statement matched",
    });
    booking = await (
      await dbmod.collection("bookings")
    ).findOne({ _id: bookingId });
    expect(booking.status).toBe("Awaiting advance");
    await expect(
      bookingApi.releaseOperations(owner, {
        bookingId,
        version: booking.version,
        operationsAssigneeIds: [operations.id],
        overrideReason: "",
      }),
    ).rejects.toThrow("release reason");

    const second = await bookingApi.submitPayment(sales, {
      bookingId,
      amount: "6000",
      currency: "INR",
      receivedAt: "2027-01-03T10:00:00.000Z",
      method: "Bank transfer",
      reference: "BANK-PART-2",
      payerName: "Test Couple",
      note: "",
      evidenceName: "",
      evidenceType: "",
      evidenceBase64: "",
    });
    payment = await (
      await dbmod.collection("payments")
    ).findOne({ _id: second });
    await bookingApi.decidePayment(owner, {
      paymentId: second,
      version: payment.version,
      decision: "Verified",
      reason: "Reference matched",
    });
    booking = await (
      await dbmod.collection("bookings")
    ).findOne({ _id: bookingId });
    expect(booking.status).toBe("Ready for operations release");
    expect(booking.verifiedPaidMinor).toBe(1000000);
    await expect(
      bookingApi.submitPayment(sales, {
        bookingId,
        amount: "100",
        currency: "INR",
        receivedAt: "2027-01-03T10:00:00.000Z",
        method: "UPI",
        reference: "BANK-PART-2",
        payerName: "Test Couple",
        note: "",
        evidenceName: "",
        evidenceType: "",
        evidenceBase64: "",
      }),
    ).rejects.toThrow("already recorded");

    await bookingApi.releaseOperations(owner, {
      bookingId,
      version: booking.version,
      operationsAssigneeIds: [operations.id],
      overrideReason: "",
    });
    const taskCount = await (
      await dbmod.collection("tasks")
    ).countDocuments({ bookingId, assigneeId: operations.id });
    booking = await (
      await dbmod.collection("bookings")
    ).findOne({ _id: bookingId });
    await bookingApi.releaseOperations(owner, {
      bookingId,
      version: booking.version,
      operationsAssigneeIds: [operations.id],
      overrideReason: "",
    });
    expect(
      await (
        await dbmod.collection("tasks")
      ).countDocuments({ bookingId, assigneeId: operations.id }),
    ).toBe(taskCount);
    expect(taskCount).toBeGreaterThan(0);

    const opsSnapshot = await crm.snapshot(operations);
    expect(opsSnapshot.bookings).toHaveLength(1);
    expect(opsSnapshot.bookings[0].totalMinor).toBeUndefined();
    expect(opsSnapshot.payments).toEqual([]);
    expect(opsSnapshot.invoices).toEqual([]);

    payment = await (
      await dbmod.collection("payments")
    ).findOne({ _id: second });
    await bookingApi.reversePayment(owner, {
      paymentId: second,
      version: payment.version,
      reason: "Bank reversed the transfer",
    });
    booking = await (
      await dbmod.collection("bookings")
    ).findOne({ _id: bookingId });
    expect(booking.operationsReleased).toBe(true);
    expect(booking.financialException).toBe(true);
    expect(
      await (
        await dbmod.collection("tasks")
      ).countDocuments({ bookingId, title: /Resolve payment reversal/ }),
    ).toBe(1);
    expect(
      await (
        await dbmod.collection("financeDocuments")
      ).countDocuments({ bookingId }),
    ).toBe(3);
  }, 120000);
});
