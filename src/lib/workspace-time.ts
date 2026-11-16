const INDIA_OFFSET = 330 * 60_000;

export function indiaInput(value?: string) {
  const time = value ? Date.parse(value) : NaN;
  return Number.isFinite(time) ? new Date(time + INDIA_OFFSET).toISOString().slice(0, 16) : "";
}

export function indiaIso(value?: string, original?: string) {
  if (!value) return "";
  if (original && value === indiaInput(original)) return original;
  const time = Date.parse(`${value}+05:30`);
  if (!Number.isFinite(time)) throw new Error("Enter a valid date and time.");
  return new Date(time).toISOString();
}

export function shortIndiaTime(value?: string) {
  if (!value || !Number.isFinite(Date.parse(value))) return "Not scheduled";
  return new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true }).format(new Date(value));
}

export function formatFollowUpEvent(event: string) {
  return event.replace(/Follow-up: ([^·]+?) → ([^·]+?)(?= · |$)/g, (_, before: string, after: string) => {
    const format = (text: string) => Number.isFinite(Date.parse(text.trim())) ? shortIndiaTime(text.trim()) : text.trim();
    return `Follow-up: ${format(before)} → ${format(after)}`;
  });
}
