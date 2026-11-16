export const bookingCreationActions = ["Create booking", "Create booking and collect the agreed advance"];

export function bookingNextAction(status?: string) {
  if (!status || status === "Cancelled" || status === "Trip completed") return "";
  if (status === "Awaiting advance") return "Review the booking and advance";
  if (["Ready for coordination", "Ready for operations release"].includes(status)) return "Start the service checklist";
  return "Review and coordinate trip services";
}

export function displayedNextAction(saved?: string, bookingStatus?: string) {
  if (!bookingStatus) return saved || "";
  return saved && !bookingCreationActions.includes(saved) ? saved : bookingNextAction(bookingStatus);
}
