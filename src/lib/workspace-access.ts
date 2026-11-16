import type { Actor } from "./domain";

export const workspaceViews = [
  "dashboard", "enquiries", "customers", "quotations", "bookings", "operations",
  "settlements", "tasks", "notifications", "reports", "imports", "invoice-settings",
  "package-templates", "staff", "attendance",
] as const;

export type View = typeof workspaceViews[number];

const ownerPages: readonly View[] = ["imports", "invoice-settings", "package-templates", "staff"];
const operationsPages: readonly View[] = ["dashboard", "operations", "tasks", "notifications", "reports", "attendance"];

export function canOpenWorkspace(role: Actor["role"], view: View) {
  if (role === "operations") return operationsPages.includes(view);
  if (role === "sales") return !ownerPages.includes(view);
  return role === "owner";
}
