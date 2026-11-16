import type { QuoteContent } from "./quote-domain";

export function packageText(text = "") {
  const number = String.raw`\d[\d,]*(?:\.\d{1,2})?`;
  const currency = String.raw`(?:₹|\$|€|£|\b(?:INR|USD|EUR|GBP|AED|SGD|Rs\.?)(?=\s|\d))`;
  return text
    .replace(new RegExp(`${currency}\\s*${number}(?:\\s*/-)?|(?<![\\d,])${number}\\s*(?:/-|${currency})`, "gi"), "")
    .replace(/ {2,}/g, " ")
    .trim();
}

export function packageDocument(content: QuoteContent) {
  const clean = <T extends object>(row: T, fields: (keyof T)[]) => {
    const result = { ...row };
    for (const field of fields) {
      if (typeof result[field] === "string") result[field] = packageText(result[field] as string) as T[keyof T];
    }
    return result;
  };
  return {
    title: packageText(content.title),
    summary: packageText(content.summary),
    destinations: packageText(content.destinations),
    dateScope: content.dateScope,
    startDate: content.startDate,
    endDate: content.endDate,
    dateLabel: packageText(content.dateLabel),
    adults: content.adults,
    childrenAges: packageText(content.childrenAges),
    infants: content.infants,
    services: content.services,
    validUntil: content.validUntil,
    options: content.options.map(({ id, name, description, hotel, mealPlan }) =>
      clean({ id, name, description, hotel, mealPlan }, ["name", "description", "hotel", "mealPlan"])),
    stays: content.stays.map((stay) => clean(stay, ["city", "property", "roomType", "occupancy", "mealPlan", "extraBed", "notes"])),
    transport: content.transport.map(({ id, optionId, mode, responsibility, from, to, date, time, timeZone, provider, passengers, details }) =>
      clean({ id, optionId, mode, responsibility, from, to, date, time, timeZone, provider, passengers, details },
        ["from", "to", "provider", "passengers", "details"])),
    itinerary: [...content.itinerary].sort((a, b) => a.day - b.day)
      .map((day) => clean(day, ["title", "city", "activities", "transfers", "stay", "meals", "notes"])),
    optionalExtras: content.optionalExtras.map(({ id, name, description, included }) =>
      clean({ id, name, description, included }, ["name", "description"])),
    inclusions: content.inclusions.map(packageText).filter(Boolean),
    exclusions: content.exclusions.map(packageText).filter(Boolean),
    cancellationTerms: packageText(content.cancellationTerms),
    customerNotes: packageText(content.customerNotes),
  };
}
