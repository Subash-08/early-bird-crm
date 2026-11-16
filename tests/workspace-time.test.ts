import { expect, it } from "vitest";
import { formatFollowUpEvent, indiaInput, indiaIso } from "../src/lib/workspace-time";

it("round-trips existing follow-up instants without timezone or minute drift", () => {
  const saved = "2026-11-04T18:30:45.100Z";
  expect(indiaInput(saved)).toBe("2026-11-05T00:00");
  expect(indiaIso(indiaInput(saved), saved)).toBe(saved);
  expect(indiaIso("2026-11-05T05:30")).toBe("2026-11-05T00:00:00.000Z");
  expect(indiaIso("")).toBe("");
  expect(() => indiaIso("unparseable")).toThrow("valid date");
});

it("formats existing timeline timestamps without changing adjacent events", () => {
  const formatted = formatFollowUpEvent("Status: New → Contacting · Follow-up: 2026-11-05T00:00:00.000Z → 2026-11-04T18:30:00.000Z · Team updated");
  expect(formatted).toMatch(/^Status: New → Contacting · Follow-up: 5 Nov 2026/);
  expect(formatted).not.toContain("T18:30");
  expect(formatted).toMatch(/ · Team updated$/);
});
