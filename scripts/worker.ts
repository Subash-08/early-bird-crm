import { reminders } from "../src/server/reminders";
import { expireQuotes } from "../src/server/quotes";
import { processQuotePdfJobs } from "../src/server/quote-pdf";
import { bookingReminders } from "../src/server/bookings";
import { operationsReminders } from "../src/server/operations";
import { settlementReminders } from "../src/server/settlements";

let running = false;
async function tick() {
  if (running) return;
  running = true;
  try {
    const [tasks, pdfs, expired, bookingMoney, operations, settlements] = await Promise.all([
      reminders(),
      processQuotePdfJobs(),
      expireQuotes(),
      bookingReminders(),
      operationsReminders(),
      settlementReminders(),
    ]);
    console.log(new Date().toISOString(), {
      tasks,
      pdfs,
      expired,
      bookingMoney,
      operations,
      settlements,
    });
  } catch {
    console.error("Background processing failed. Will retry in 60 seconds.");
  } finally {
    running = false;
  }
}

async function main() {
  console.log(
    "Background worker started. Keep running, or configure the authenticated scheduler endpoint.",
  );
  await tick();
  setInterval(() => void tick(), 60_000);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
