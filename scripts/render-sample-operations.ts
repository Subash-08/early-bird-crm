import { mkdir, writeFile } from "node:fs/promises";
import { buildOperationsPdf } from "../src/server/operations-pdf";

const snapshot = {
  kind: "Driver trip sheet",
  status: "Ready",
  bookingNumber: "EB-BK-2027-0001",
  customerName: "Aarav and Meera",
  customerContact: "+91 98765 43210",
  destination: "Kochi, Munnar and Alleppey",
  serviceStart: "2027-01-10",
  serviceEnd: "2027-01-14",
  segments: [
    {
      title: "Kochi pickup to Munnar",
      from: "Kochi Airport",
      to: "Munnar hotel",
      startAt: "2027-01-10T04:00:00.000Z",
      timeZone: "Asia/Kolkata",
      vehicle: "White Ertiga - KL 01 AA 1234",
      driver: "Arun Kumar",
    },
    {
      title: "Munnar to Alleppey",
      from: "Munnar hotel",
      to: "Alleppey houseboat",
      startAt: "2027-01-12T03:30:00.000Z",
      timeZone: "Asia/Kolkata",
      vehicle: "White Ertiga - KL 01 AA 1234",
      driver: "Arun Kumar",
    },
  ],
  notes:
    "Call the lead traveller after landing. Keep drinking water ready. Contact the coordinator before any route or vehicle change.",
  createdAt: "2026-10-30T10:00:00.000Z",
};

async function main() {
  await mkdir("output/pdf", { recursive: true });
  const output = "output/pdf/earlybird-sample-driver-trip-sheet.pdf";
  await writeFile(output, await buildOperationsPdf(snapshot));
  console.log(output);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
