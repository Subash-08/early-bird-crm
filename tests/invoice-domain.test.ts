import { describe, expect, it } from "vitest";
import { calculateInvoice, financialYear, invoiceTemplateSchema, defaultInvoiceTemplate } from "@/lib/invoice-domain";

const charge = (id: string, quantity: number, unitPrice: number, gstRate = 5) => ({
  id, kind: "Charge" as const, hsnCode: "998552", description: "Singapore Package Hotel Booking Charges & Cab Booking Charges",
  quantity, unitPrice, gstRate,
});

describe("invoice calculation", () => {
  it("matches the reference invoice taxable, tax, TCS and grand totals", () => {
    const result = calculateInvoice([
      charge("one", 7, 117813),
      charge("two", 1, 112815),
      { id: "visa", kind: "Note", hsnCode: "", description: "Visa", quantity: 0, unitPrice: 0, gstRate: 0 },
      { id: "stay", kind: "Note", hsnCode: "", description: "Accommodation with Breakfast & Sightseeing and transfers as mentioned in the itinerary", quantity: 0, unitPrice: 0, gstRate: 0 },
    ], "CGST + SGST", 2, true);
    expect(result.taxableMinor).toBe(93_750_600);
    expect(result.totalGstMinor).toBe(4_687_500);
    expect(result.cgstMinor + result.sgstMinor).toBe(result.totalGstMinor);
    expect(result.tcsMinor).toBe(1_875_000);
    expect(result.grandTotalMinor).toBe(100_313_100);
    expect(result.lines[2].taxableMinor).toBe(0);
  });

  it("excludes GST when No GST is selected", () => {
    const result = calculateInvoice([charge("one", 1, 1000, 18)], "No GST", 0, true);
    expect(result.totalGstMinor).toBe(0);
    expect(result.grandTotalMinor).toBe(100_000);
  });

  it("rejects negative prices and zero charge quantity", () => {
    expect(() => calculateInvoice([charge("one", 0, 1000)], "No GST", 0)).toThrow("greater than zero");
    expect(() => calculateInvoice([charge("one", 1, -1)], "No GST", 0)).toThrow();
  });

  it("validates the default template and financial year", () => {
    expect(invoiceTemplateSchema.parse(defaultInvoiceTemplate).legalName).toBe("Early Bird Vacations");
    expect(financialYear(new Date("2026-03-31T12:00:00Z"))).toBe("25-26");
    expect(financialYear(new Date("2026-04-01T12:00:00Z"))).toBe("26-27");
  });
});
