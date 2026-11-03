import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import type { Actor } from "../src/lib/domain";

let repl: MongoMemoryReplSet;
let dbmod: any;
let operations: any;
let bookingApi: any;
let crm: any;
const owner: Actor = {
  id: "owner-1",
  authId: "auth-owner",
  org: "phase4-agency",
  name: "Owner",
  role: "owner",
};
const sales: Actor = {
  id: "sales-1",
  authId: "auth-sales",
  org: owner.org,
  name: "Sales",
  role: "sales",
};
const driver: Actor = {
  id: "ops-1",
  authId: "auth-ops-1",
  org: owner.org,
  name: "Driver One",
  role: "operations",
  capabilities: [
    "trip-times",
    "trip-notes",
    "expense-evidence",
    "logistics-request",
  ],
};
const driverTwo: Actor = {
  id: "ops-2",
  authId: "auth-ops-2",
  org: owner.org,
  name: "Driver Two",
  role: "operations",
  capabilities: ["trip-times", "trip-notes"],
};

beforeAll(async () => {
  repl = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  process.env.MONGODB_URI = repl.getUri();
  process.env.MONGODB_DB_NAME = "operations_flow";
  process.env.APP_ORG_ID = owner.org;
  dbmod = await import("../src/server/db");
  operations = await import("../src/server/operations");
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
      role: "owner",
      status: "active",
      email: "owner@test.local",
    },
    {
      _id: sales.id,
      org: owner.org,
      version: 1,
      name: sales.name,
      role: "sales",
      status: "active",
      email: "sales@test.local",
    },
    {
      _id: driver.id,
      org: owner.org,
      version: 1,
      name: driver.name,
      role: "operations",
      status: "active",
      email: "driver1@test.local",
      capabilities: driver.capabilities,
    },
    {
      _id: driverTwo.id,
      org: owner.org,
      version: 1,
      name: driverTwo.name,
      role: "operations",
      status: "active",
      email: "driver2@test.local",
      capabilities: driverTwo.capabilities,
    },
  ]);
  await (
    await dbmod.collection("bookings")
  ).insertOne({
    _id: "booking-1",
    org: owner.org,
    version: 1,
    bookingNumber: "EB-BK-2027-0001",
    customerId: "customer-1",
    enquiryId: "enquiry-1",
    quoteId: "quote-1",
    ownerId: owner.id,
    salesAssigneeId: sales.id,
    operationsReleased: true,
    operationsAssigneeIds: [driver.id],
    status: "Pending confirmation",
    destination: "Munnar",
    serviceStart: "2027-02-10",
    serviceEnd: "2027-02-13",
    currency: "INR",
    totalMinor: 5000000,
    requiredAdvanceMinor: 1000000,
    verifiedPaidMinor: 1000000,
    outstandingMinor: 4000000,
    payer: {
      name: "Test Couple",
      phone: "+919876543210",
      email: "couple@test.local",
      billingAddress: "Kochi",
    },
    travellers: [
      {
        id: "traveller-1",
        name: "Test Couple",
        type: "Adult",
        lead: true,
        phone: "+919876543210",
      },
    ],
    agreementSnapshot: { content: { balanceTerms: "Before travel" } },
    createdAt: "2027-01-01T00:00:00.000Z",
    updatedAt: "2027-01-01T00:00:00.000Z",
  });
}, 120000);

afterAll(async () => {
  if (dbmod) await (await dbmod.client()).close();
  if (repl) await repl.stop();
}, 30000);

describe("Phase 4 arrangements and trip execution", () => {
  it("coordinates confirmations, blocks schedule conflicts, limits drivers and completes safely", async () => {
    await operations.initializeOperations(sales, { bookingId: "booking-1" });
    await operations.initializeOperations(sales, { bookingId: "booking-1" });
    expect(
      await (
        await dbmod.collection("readinessItems")
      ).countDocuments({ bookingId: "booking-1" }),
    ).toBe(4);

    const supplierId = await operations.saveSupplier(sales, {
      data: {
        name: "Munnar Hill Hotel",
        type: "Hotel",
        contactName: "Reservations",
        phone: "+919999999999",
        email: "",
        location: "Munnar",
        notes: "",
        status: "Active",
      },
    });
    const transportSupplierId = await operations.saveSupplier(sales, {
      data: {
        name: "Safe Road Travels",
        type: "Transport",
        contactName: "Dispatch",
        phone: "+918888888888",
        email: "",
        location: "Kochi",
        notes: "",
        status: "Active",
      },
    });
    const vehicleId = await operations.saveVehicle(owner, {
      data: {
        label: "White Ertiga",
        registration: "KL 01 AA 1234",
        ownership: "Supplier",
        supplierId: transportSupplierId,
        seats: 6,
        luggage: 4,
        vehicleType: "SUV",
        notes: "",
        status: "Available",
      },
    });

    const draft = {
      bookingId: "booking-1",
      type: "Hotel",
      title: "Munnar hotel - 3 nights",
      supplierId,
      responsibility: "Agency arranged",
      startAt: "2027-02-10T06:30:00.000Z",
      endAt: "2027-02-13T05:30:00.000Z",
      location: "Munnar",
      details: "One double room with breakfast",
      confirmationStatus: "Confirmed",
      confirmationReference: "HTL-1001",
      holdUntil: "",
      cost: "18000",
      currency: "INR",
      dueAt: "2027-02-01T05:30:00.000Z",
    };
    await expect(
      operations.saveArrangement(sales, { data: draft }),
    ).rejects.toThrow("Owner must approve");
    const arrangementId = await operations.saveArrangement(owner, {
      data: draft,
    });

    const tripData = {
      bookingId: "booking-1",
      mode: "Car",
      title: "Kochi pickup to Munnar",
      from: "Kochi",
      to: "Munnar",
      startAt: "2027-02-10T03:30:00.000Z",
      endAt: "2027-02-10T07:30:00.000Z",
      timeZone: "Asia/Kolkata",
      driverId: driver.id,
      vehicleId,
      arrangementId: "",
      pickupContact: "EarlyBird board",
      assistanceNotes: "Call the lead traveller after arrival",
      bufferMinutes: 60,
    };
    const segmentId = await operations.saveTripSegment(sales, {
      data: tripData,
    });
    await expect(
      operations.saveTripSegment(sales, {
        data: {
          ...tripData,
          title: "Conflicting airport duty",
          bookingId: "booking-1",
        },
      }),
    ).rejects.toThrow("overlaps");
    const secondVehicleId = await operations.saveVehicle(owner, {
      data: {
        label: "Agency Innova",
        registration: "KL 02 BB 4321",
        ownership: "Agency",
        supplierId: "",
        seats: 6,
        luggage: 4,
        vehicleType: "SUV",
        notes: "",
        status: "Available",
      },
    });
    const secondSegmentId = await operations.saveTripSegment(sales, {
      data: {
        ...tripData,
        title: "Munnar local sightseeing",
        startAt: "2027-02-11T03:30:00.000Z",
        endAt: "2027-02-11T09:30:00.000Z",
        driverId: driverTwo.id,
        vehicleId: secondVehicleId,
      },
    });

    let opsView = await crm.snapshot(driver);
    expect(opsView.tripSegments.map((x: any) => x._id)).toEqual([segmentId]);
    expect(opsView.arrangements[0].costMinor).toBeUndefined();
    expect(opsView.payments).toEqual([]);

    const incidentId = await operations.reportIncident(driver, {
      bookingId: "booking-1",
      segmentId,
      type: "Delay",
      severity: "Medium",
      description: "Pickup delayed by road closure",
      customerContacted: true,
    });
    let incident = await (
      await dbmod.collection("incidents")
    ).findOne({ _id: incidentId });
    await operations.resolveIncident(sales, {
      incidentId,
      version: incident.version,
      resolution: "Customer informed and revised pickup agreed",
    });

    const requestId = await operations.submitOperationsRequest(driver, {
      bookingId: "booking-1",
      segmentId,
      type: "Logistics change",
      description: "Request a revised pickup point because the road is closed",
      amount: "0",
      currency: "INR",
      evidenceName: "",
      evidenceType: "",
      evidenceBase64: "",
    });
    const request = await (
      await dbmod.collection("operationsRequests")
    ).findOne({ _id: requestId });
    await operations.decideOperationsRequest(owner, {
      requestId,
      version: request.version,
      decision: "Approved",
      reason: "Coordinator will update the pickup point",
    });
    expect(
      (
        await (
          await dbmod.collection("operationsRequests")
        ).findOne({ _id: requestId })
      ).status,
    ).toBe("Approved");

    await operations.saveTravelDocument(sales, {
      bookingId: "booking-1",
      category: "Ticket",
      travellerName: "Test Couple",
      expiresAt: "",
      note: "Customer-booked arrival ticket for pickup coordination",
      fileName: "arrival-ticket.pdf",
      mimeType: "application/pdf",
      fileBase64: "dGVzdA==",
    });
    opsView = await crm.snapshot(driver);
    expect(opsView.travelDocuments).toEqual([]);

    const reportId = await operations.reportCollection(driver, {
      bookingId: "booking-1",
      amount: "500",
      currency: "INR",
      collectedAt: "2027-02-10T08:00:00.000Z",
      reference: "CASH-DRIVER-1",
      payerName: "Test Couple",
      note: "Customer requested an emergency activity payment",
    });
    await expect(
      operations.reportCollection(driver, {
        bookingId: "booking-1",
        amount: "500",
        currency: "INR",
        collectedAt: "2027-02-10T08:00:00.000Z",
        reference: "CASH-DRIVER-1",
        payerName: "Test Couple",
        note: "Duplicate retry",
      }),
    ).rejects.toThrow("already recorded");
    let report = await (
      await dbmod.collection("collectionReports")
    ).findOne({ _id: reportId });
    const handoverId = await operations.recordCashHandover(driver, {
      reportId,
      version: report.version,
      amount: "500",
      handedAt: "2027-02-10T12:00:00.000Z",
      note: "Handed to agency owner",
    });
    report = await (
      await dbmod.collection("collectionReports")
    ).findOne({ _id: reportId });
    await operations.decideCashHandover(owner, {
      reportId,
      version: report.version,
      handoverId,
      decision: "Verified",
      reason: "Cash counted",
    });
    const payment = await (
      await dbmod.collection("payments")
    ).findOne({ collectionReportId: reportId });
    await bookingApi.decidePayment(owner, {
      paymentId: payment._id,
      version: payment.version,
      decision: "Verified",
      reason: "Cash and handover verified",
    });
    report = await (
      await dbmod.collection("collectionReports")
    ).findOne({ _id: reportId });
    expect(report.status).toBe("Verified");
    expect(report.custodyStatus).toBe("Fully handed over");
    expect(
      await (
        await dbmod.collection("payments")
      ).countDocuments({ collectionReportId: reportId }),
    ).toBe(1);

    let segment = await (
      await dbmod.collection("tripSegments")
    ).findOne({ _id: segmentId });
    await operations.updateTripProgress(driver, {
      segmentId,
      version: segment.version,
      status: "Completed",
      actualStart: "2027-02-10T03:40:00.000Z",
      actualEnd: "2027-02-10T07:40:00.000Z",
      startOdometer: 1000,
      endOdometer: 1130,
      note: "Customer dropped safely",
    });
    segment = await (
      await dbmod.collection("tripSegments")
    ).findOne({ _id: secondSegmentId });
    await operations.updateTripProgress(driverTwo, {
      segmentId: secondSegmentId,
      version: segment.version,
      status: "Completed",
      actualStart: "2027-02-11T03:30:00.000Z",
      actualEnd: "2027-02-11T09:20:00.000Z",
      startOdometer: 2000,
      endOdometer: 2070,
      note: "Sightseeing completed",
    });

    const readiness = await (
      await dbmod.collection("readinessItems")
    )
      .find({ bookingId: "booking-1" })
      .toArray();
    for (const item of readiness)
      await operations.updateReadiness(owner, {
        bookingId: "booking-1",
        itemId: item._id,
        status: "Ready",
        note: "Checked",
        expiresAt: "",
      });

    const finalDoc = await operations.generateOperationsDocument(owner, {
      bookingId: "booking-1",
      kind: "Final itinerary",
      arrangementId: "",
    });
    const driverDoc = await operations.generateOperationsDocument(driver, {
      bookingId: "booking-1",
      kind: "Driver trip sheet",
      arrangementId: "",
    });
    expect(finalDoc).toBeTruthy();
    expect(driverDoc).toBeTruthy();
    expect(
      await (
        await dbmod.collection("operationsDocuments")
      ).countDocuments({ bookingId: "booking-1" }),
    ).toBe(2);

    const booking = await (
      await dbmod.collection("bookings")
    ).findOne({ _id: "booking-1" });
    await operations.completeTrip(owner, {
      bookingId: "booking-1",
      version: booking.version,
    });
    const completed = await (
      await dbmod.collection("bookings")
    ).findOne({ _id: "booking-1" });
    expect(completed.status).toBe("Trip completed");
    expect(completed.settlementOutstanding).toBe(true);
    expect(
      await (
        await dbmod.collection("tasks")
      ).countDocuments({ _id: "feedback:booking-1" }),
    ).toBe(1);
    expect(arrangementId).toBeTruthy();
  });
});
