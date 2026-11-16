import { indiaInput } from "./workspace-time";

export const registerStages = ["New", "Contacting", "Gathering details", "Quote requested", "Quote sent", "Won", "On hold", "Lost", "Needs review", "No enquiry"];
export const registerStatuses = ["No quote or booking", "Requested", "Needs information", "Draft", "Approved", "Sent", "Accepted", "Rejected", "Changes requested", "Expired", "Superseded", "Ready for coordination", "Awaiting advance", "Ready for operations release", "Pending confirmation", "Confirmed", "Operations released", "In progress", "Trip completed", "Cancelled"];
export const registerSources = ["WhatsApp", "Phone", "Website", "Instagram", "Referral", "Walk-in", "Other"];

export function registerDates(days: number, now = new Date()) {
  return {
    from: indiaInput(new Date(now.getTime() - (days - 1) * 86_400_000).toISOString()).slice(0, 10),
    to: indiaInput(now.toISOString()).slice(0, 10),
  };
}
