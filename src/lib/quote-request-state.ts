export const activeQuoteStatuses: readonly string[] = [
  "Requested", "Needs information", "Draft", "Approved", "Sent", "Accepted", "Changes requested",
];

export function quoteRequestBlock(enquiry: { stage?: string; reviewNeeded?: boolean }) {
  if (enquiry.reviewNeeded) return "Review and activate this imported enquiry before requesting a quotation.";
  if (enquiry.stage === "Won") return "The customer has already accepted a quotation for this enquiry.";
  if (enquiry.stage === "Lost") return "Reopen this lost enquiry before requesting a quotation.";
  return "";
}
