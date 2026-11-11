import { describe, expect, it } from "vitest";
import { enquirySchema } from "@/lib/domain";
import { publicErrorMessage } from "@/lib/public-error";

const enquiry = {
  customerId: "customer-1",
  destination: "Singapore",
  source: "WhatsApp",
  assigneeId: "sales-1",
  stage: "New",
  firstContactAt: "2026-11-04T10:00:00.000Z",
  dateMode: "Unknown",
  departure: "",
  returnDate: "",
  travelPreference: "",
  adults: 2,
  childrenAges: "",
  infants: 0,
  budget: "",
  budgetBasis: "Unknown",
  services: "",
  serviceResponsibility: "",
  hotelPreference: "",
  rooms: "",
  pickup: "",
  dropoff: "",
  specialRequirements: "",
  notes: "",
  reason: "",
  nextAction: "",
  nextFollowUp: "2026-11-18T10:00:00.000Z",
  contactOutcome: "Not contacted",
  reviewNeeded: false,
};

describe("publicErrorMessage", () => {
  it("returns the validation message without JSON paths or issue metadata", () => {
    const result = enquirySchema.safeParse(enquiry);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(publicErrorMessage(result.error)).toBe("Describe the next action.");
      expect(publicErrorMessage(result.error)).not.toContain("path");
      expect(publicErrorMessage(result.error)).not.toContain("code");
    }
  });

  it("hides strict-schema implementation keys behind a useful refresh message", () => {
    const result = enquirySchema.safeParse({
      ...enquiry,
      nextFollowUp: "",
      _id: "enquiry-1",
      org: "earlybird",
      version: 1,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(publicErrorMessage(result.error)).toBe(
        "This form contains outdated data. Refresh the page and try again.",
      );
    }
  });
});
