import { describe, expect, it } from "vitest";
import {
  bookingDetailsSchema,
  paymentSubmissionSchema,
  paymentTotals,
  publicBookingForRole,
} from "../src/lib/booking-domain";

describe("Phase 3 booking rules", () => {
  it("requires exactly one named lead traveller", () => {
    const result = bookingDetailsSchema.safeParse({
      payerName: "Anita Rao",
      payerPhone: "",
      payerEmail: "",
      billingAddress: "",
      taxId: "",
      travellers: [
        {
          id: "1",
          name: "Anita Rao",
          type: "Adult",
          lead: true,
          dateOfBirth: "",
          nationality: "",
          phone: "",
          notes: "",
        },
        {
          id: "2",
          name: "Ravi Rao",
          type: "Adult",
          lead: true,
          dateOfBirth: "",
          nationality: "",
          phone: "",
          notes: "",
        },
      ],
      advanceDueAt: "",
      balanceDueAt: "",
      coordinatorNotes: "",
    });
    expect(result.success).toBe(false);
  });

  it("uses exact minor units and requires reference or evidence", () => {
    const parsed = paymentSubmissionSchema.parse({
      bookingId: "booking-1",
      amount: "1250.75",
      currency: "inr",
      receivedAt: "2027-01-01T10:00:00.000Z",
      method: "UPI",
      reference: "UPI-101",
      payerName: "Anita Rao",
      note: "",
      evidenceName: "",
      evidenceType: "",
      evidenceBase64: "",
    });
    expect(parsed.amountMinor).toBe(125075);
    expect(parsed.currency).toBe("INR");
  });

  it("separates outstanding value and overpayment credit", () => {
    expect(
      paymentTotals([{ status: "Verified", amountMinor: 12000 }], 10000),
    ).toEqual({
      verifiedPaidMinor: 12000,
      outstandingMinor: 0,
      unappliedCreditMinor: 2000,
    });
  });

  it("removes commercial fields from Operations booking views", () => {
    const safe = publicBookingForRole(
      {
        _id: "b1",
        totalMinor: 500000,
        requiredAdvanceMinor: 100000,
        verifiedPaidMinor: 100000,
        unappliedCreditMinor: 0,
        payer: { name: "Payer" },
        agreementSnapshot: { selectedOption: { internalCostMinor: 300000 } },
        advanceAmendments: [],
        coordinatorNotes: "private",
        destination: "Munnar",
      },
      "operations",
    );
    expect(safe.totalMinor).toBeUndefined();
    expect(safe.agreementSnapshot).toBeUndefined();
    expect(safe.payer).toBeUndefined();
    expect(safe.destination).toBe("Munnar");
  });
});
