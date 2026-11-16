import { describe, expect, it } from "vitest";
import { packageDocument, packageText } from "../src/lib/package-document";
import { demoPackages } from "../scripts/demo-packages";
import { invoicePrintSnapshot } from "../src/server/financial-pdf";

describe("customer package documents", () => {
  it("preserves trip details and excludes money fields and private option notes", () => {
    const content = structuredClone(demoPackages.find((template) => template.key === "kerala")!.content);
    content.options[0].notes = "Private option note";
    content.summary = "3 nights for 2. Sample ₹49,340.00.";
    content.internalNotes = "Internal costs";
    const document = packageDocument(content);
    const encoded = JSON.stringify(document);
    expect(encoded).toContain("Vega Munnar");
    expect(encoded).toContain("Breakfast");
    expect(encoded).toContain("3 nights for 2");
    for (const value of ["₹", "49,340", "49340", "52750", "unitPrice", "advanceAmount", "internalNotes", "Private option note"])
      expect(encoded).not.toContain(value);
  });

  it("removes common amount formats without stripping traveller and room counts", () => {
    expect(packageText("2 adults · Rs. 6000/- · 1 room · 39,600/- · USD 100.50")).not.toMatch(/6000|39,600|100\.50/);
    expect(packageText("2 adults · 3 nights · 1 room")).toBe("2 adults · 3 nights · 1 room");
  });

  it("prints one invoice copy and keeps user-entered lines and amounts", () => {
    const agreement = { content: { title: "Munnar and Alleppey package" }, selectedOption: { name: "Breakfast and dinner (MAP)" } };
    const source = {
      copyLabels: ["Customer copy", "Office copy"],
      lines: [
        { kind: "Charge", description: "Breakfast and dinner (MAP) - Munnar and Alleppey package", unitPriceMinor: 5275000 },
        { kind: "Note", description: "Breakfast at the hotel on Day 2" },
      ],
    };
    const standard = invoicePrintSnapshot(source, agreement);
    expect(standard.copyLabels).toEqual(["Customer copy"]);
    expect(standard.lines).toEqual([
      { kind: "Charge", description: "Munnar and Alleppey package", unitPriceMinor: 5275000 }, source.lines[1],
    ]);
    expect(source.lines[0].description).toContain("Breakfast");
    expect(invoicePrintSnapshot(source, agreement, ["Customer", "Office"]).copyLabels).toEqual(["Customer", "Office"]);
  });
});
