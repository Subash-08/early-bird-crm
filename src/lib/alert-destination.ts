import type { Actor } from "./domain";
import type { View } from "./workspace-access";

export function alertDestination(role: Actor["role"], key: string, recordId?: string): [View, string?] {
  if (key.startsWith("attendance-")) return ["attendance"];
  if (/^(trip[:\-]|operations-|incident:|collection:|handover:|readiness:|booking:ops:)/.test(key))
    return ["operations", recordId];
  if (role !== "operations") {
    if (/^(settlement-|change-|customer-change:)/.test(key)) return ["settlements"];
    if (/^(booking:|invoice:|payment:|finance-|feedback:)/.test(key)) return ["bookings", recordId];
    if (/^quote/.test(key)) return ["quotations", recordId];
    if (/^(enquiry-team:|follow:)/.test(key)) return ["enquiries", recordId];
    if (role === "owner" && key.startsWith("account-")) return ["staff"];
  }
  const taskKey = /^(?:task|due):(.+):\d+$/.exec(key);
  if (taskKey) return ["tasks", taskKey[1]];
  if (/^(overdue:|follow:|reassign:)/.test(key)) return ["tasks"];
  return ["notifications"];
}
