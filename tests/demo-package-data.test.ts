import { describe, expect, it } from "vitest";
import { demoPackages } from "../scripts/demo-packages";

describe("package templates from the travel references", () => {
  it("keeps itinerary, rates and reusable fields without payment instructions", () => {
    expect(demoPackages.map(({ key, content }) => [key, content.itinerary.length, content.options.map((option) => option.unitPrice)])).toEqual([
      ["andaman", 5, ["42000"]], ["kerala", 4, ["49340", "52750"]], ["kashmir", 6, ["50500", "62500"]],
      ["sikkim", 5, ["58000"]], ["himachal", 6, ["39600"]],
    ]);
    for (const { content } of demoPackages) {
      expect(content).toMatchObject({ advanceAmount: "0", advanceDue: "", balanceTerms: "", startDate: "", validUntil: "", adults: 0 });
      expect(content.stays.every((stay) => !stay.checkIn && !stay.checkOut)).toBe(true);
    }
    expect(demoPackages[0].content.transport.filter((leg) => leg.mode === "Ferry / boat")).toHaveLength(2);
    expect(demoPackages[2].content.stays.map((stay) => stay.optionId)).toEqual(["option-1", "option-2"]);
  });
});
