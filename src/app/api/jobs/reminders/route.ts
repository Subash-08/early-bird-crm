import { timingSafeEqual } from "node:crypto";
import { reminders } from "@/server/reminders";
import { expireQuotes } from "@/server/quotes";
import { processQuotePdfJobs } from "@/server/quote-pdf";
import { bookingReminders } from "@/server/bookings";
import { operationsReminders } from "@/server/operations";
import { settlementReminders } from "@/server/settlements";
export const runtime = "nodejs";
export async function POST(req: Request) {
  const expected = process.env.JOB_RUNNER_SECRET;
  const actual = req.headers.get("authorization")?.replace(/^Bearer /, "");
  if (
    !expected ||
    expected.length < 32 ||
    !actual ||
    Buffer.byteLength(actual) !== Buffer.byteLength(expected) ||
    !timingSafeEqual(Buffer.from(actual), Buffer.from(expected))
  )
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const [tasks, pdfs, expired, bookingMoney, operations, settlements] = await Promise.all([
      reminders(),
      processQuotePdfJobs(),
      expireQuotes(),
      bookingReminders(),
      operationsReminders(),
      settlementReminders(),
    ]);
    return Response.json({
      processed: { tasks, pdfs, expired, bookingMoney, operations, settlements },
    });
  } catch {
    return Response.json(
      {
        error:
          "Background run failed; retry safely. Check server logs/configuration.",
      },
      { status: 503 },
    );
  }
}
