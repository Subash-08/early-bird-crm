import { describe, expect, it } from "vitest";
import { cents, convertMinor, effectiveEntries, settlementTotals } from "../src/lib/settlement-domain";
import { minor, publicQuoteForRole } from "../src/lib/quote-domain";
import { publicBookingForRole } from "../src/lib/booking-domain";

describe("Money and access regression checks", () => {
  it("rejects signs, exponent notation and silent precision truncation", () => {
    for (const input of ["-1", "1e4", "3.999", "NaN", "1.2.3"]) { expect(() => cents(input)).toThrow(); expect(() => minor(input)).toThrow(); }
    expect(cents("120.05")).toBe(12005);
  });
  it("converts exact rates with deterministic half-up rounding", () => {
    expect(convertMinor(10001, "83.123456")).toBe(831318);
    expect(convertMinor(1, "0.5")).toBe(1);
    expect(() => convertMinor(1, "0")).toThrow();
  });
  it("keeps customer refunds independent of supplier recoveries", () => {
    const rows = [{ _id: "r", kind: "Refund approved", status: "Posted", amountMinor: 6000, baseMinor: 6000 }, { _id: "paid", kind: "Refund paid", targetId: "r", status: "Posted", amountMinor: 2000, baseMinor: 2000 }, { _id: "s", kind: "Recovery expected", status: "Posted", amountMinor: 9000, baseMinor: 9000 }];
    const totals = settlementTotals({ totalMinor: 4000 }, rows, [{ status: "Verified", amountMinor: 10000 }]);
    expect(totals.refundPendingMinor).toBe(4000); expect(totals.customerCreditMinor).toBe(4000); expect(totals.obligations.find(e => e._id === "s")?.remainingMinor).toBe(9000);
    expect(effectiveEntries([...rows, { kind: "Reversal", status: "Posted", targetId: "paid" }]).some(e => e._id === "paid")).toBe(false);
  });
  it("does not expose current or future finance fields to Operations", () => {
    const safe = publicBookingForRole({ _id: "b", destination: "Kerala", outstandingMinor: 100, financialException: true, futureSecretMargin: 9999, travellers: [{ id: "t", name: "Traveller", passport: "PRIVATE", phone: "999", lead: false }] }, "operations");
    expect(safe.outstandingMinor).toBeUndefined(); expect(safe.futureSecretMargin).toBeUndefined(); expect(safe.travellers[0].passport).toBeUndefined(); expect(safe.travellers[0].phone).toBe("");
  });
  it("strips costs from accepted quote and booking snapshots for Sales", () => {
    const content = { internalNotes: "PRIVATE", options: [{ internalCost: "100", internalCostMinor: 10000, estimatedMarginMinor: 50 }] };
    expect(publicQuoteForRole({ acceptedSnapshot: { content } }, "sales").acceptedSnapshot.content.options[0].internalCost).toBeUndefined();
    expect(publicBookingForRole({ agreementSnapshot: { content, selectedOption: content.options[0] } }, "sales").agreementSnapshot.selectedOption.internalCost).toBeUndefined();
    expect(content.internalNotes).toBe("PRIVATE");
  });
});
