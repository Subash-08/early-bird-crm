import type { Filter } from "mongodb";
import { collection, type Row } from "./db";

export async function acceptedQuotesWithoutBooking(org: string, access: Filter<Row>, limit: number) {
  const quotes = await collection("quotes");
  const [result] = await quotes.aggregate<{ rows: Row[]; total: { count: number }[] }>([
    { $match: { org, status: "Accepted", ...access } },
    { $project: { quoteNumber: 1, status: 1, "content.title": 1, updatedAt: 1 } },
    { $lookup: {
      from: "bookings", localField: "_id", foreignField: "quoteId",
      pipeline: [{ $match: { org } }, { $limit: 1 }, { $project: { _id: 1 } }], as: "existingBooking",
    } },
    { $match: { "existingBooking.0": { $exists: false } } },
    { $facet: {
      rows: [{ $sort: { updatedAt: -1, _id: 1 } }, { $limit: limit }, { $unset: "existingBooking" }],
      total: [{ $count: "count" }],
    } },
  ]).toArray();
  return { rows: result?.rows ?? [], count: result?.total[0]?.count ?? 0 };
}
