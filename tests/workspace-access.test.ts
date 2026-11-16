import { describe, expect, it } from "vitest";
import { canOpenWorkspace, workspaceViews } from "../src/lib/workspace-access";

describe("workspace route permissions", () => {
  it("gives only the Owner access to agency setup", () => {
    expect(workspaceViews.every((view) => canOpenWorkspace("owner", view))).toBe(true);
    expect(workspaceViews.filter((view) => !canOpenWorkspace("sales", view))).toEqual([
      "imports", "invoice-settings", "package-templates", "staff",
    ]);
  });

  it("keeps Operations within its daily-work pages", () => {
    expect(workspaceViews.filter((view) => canOpenWorkspace("operations", view))).toEqual([
      "dashboard", "operations", "tasks", "notifications", "reports", "attendance",
    ]);
  });
});
