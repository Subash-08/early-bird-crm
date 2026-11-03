import { describe, expect, it } from "vitest";
import {
  arrangementSchema,
  collectionReportSchema,
  publicArrangementForRole,
  tripProgressSchema,
  tripSegmentSchema,
  vehicleSchema,
} from "../src/lib/operations-domain";

describe("Phase 4 operations rules", () => {
  it("requires a supplier for a supplier-owned vehicle", () => {
    expect(() =>
      vehicleSchema.parse({
        label: "Vendor sedan",
        registration: "kl 01 aa 1234",
        ownership: "Supplier",
        supplierId: "",
        seats: 4,
        luggage: 2,
        vehicleType: "Sedan",
        notes: "",
        status: "Available",
      }),
    ).toThrow("Choose the vehicle supplier");
  });

  it("does not allow agency cost on customer-booked services", () => {
    expect(() =>
      arrangementSchema.parse({
        bookingId: "booking-1",
        type: "Flight",
        title: "Customer flight",
        supplierId: "",
        responsibility: "Customer booked",
        startAt: "",
        endAt: "",
        location: "Kochi",
        details: "Pickup coordination only",
        confirmationStatus: "Draft",
        confirmationReference: "",
        holdUntil: "",
        cost: "1000",
        currency: "INR",
        dueAt: "",
      }),
    ).toThrow("Do not add agency supplier cost");
  });

  it("requires driver and vehicle for car segments", () => {
    expect(() =>
      tripSegmentSchema.parse({
        bookingId: "booking-1",
        mode: "Car",
        title: "Airport pickup",
        from: "Airport",
        to: "Hotel",
        startAt: "2027-02-10T04:00:00.000Z",
        endAt: "2027-02-10T06:00:00.000Z",
        timeZone: "Asia/Kolkata",
        driverId: "",
        vehicleId: "",
        arrangementId: "",
        pickupContact: "",
        assistanceNotes: "",
        bufferMinutes: 60,
      }),
    ).toThrow("Choose a driver and vehicle");
  });

  it("validates trip progress and exact cash amounts", () => {
    expect(() =>
      tripProgressSchema.parse({
        segmentId: "trip-1",
        version: 1,
        status: "Completed",
        actualStart: "2027-02-10T06:00:00.000Z",
        actualEnd: "2027-02-10T05:00:00.000Z",
        startOdometer: 200,
        endOdometer: 190,
        note: "",
      }),
    ).toThrow();
    const report = collectionReportSchema.parse({
      bookingId: "booking-1",
      amount: "1250.75",
      currency: "inr",
      collectedAt: "2027-02-10T05:00:00.000Z",
      reference: "",
      payerName: "Test Customer",
      note: "Customer requested an exceptional cash collection",
    });
    expect(report.amountMinor).toBe(125075);
  });

  it("removes supplier cost from the Operations payload", () => {
    const safe = publicArrangementForRole(
      {
        _id: "arr-1",
        title: "Hotel",
        costMinor: 200000,
        currency: "INR",
        dueAt: "2027-01-01T00:00:00.000Z",
        approvedById: "owner-1",
      },
      "operations",
    );
    expect(safe.title).toBe("Hotel");
    expect(safe.costMinor).toBeUndefined();
    expect(safe.currency).toBeUndefined();
    expect(safe.dueAt).toBeUndefined();
  });
});
