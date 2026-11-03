import { mkdir, writeFile } from "node:fs/promises";
import { buildFinancialPdf } from "../src/server/financial-pdf";
import { calculateInvoice, defaultInvoiceTemplate } from "../src/lib/invoice-domain";

const lines = [
  { id: "1", kind: "Charge", hsnCode: "998552", description: "Singapore Package Hotel Booking Charges & Cab Booking Charges", quantity: 7, unitPrice: 117813, gstRate: 5 },
  { id: "2", kind: "Charge", hsnCode: "998552", description: "Singapore Package Hotel Booking Charges & Cab Booking Charges", quantity: 1, unitPrice: 112815, gstRate: 5 },
  { id: "3", kind: "Note", hsnCode: "", description: "Visa", quantity: 0, unitPrice: 0, gstRate: 0 },
  { id: "4", kind: "Note", hsnCode: "", description: "Accommodation with Breakfast, sightseeing and transfers as mentioned in the itinerary", quantity: 0, unitPrice: 0, gstRate: 0 },
] as const;
const totals = calculateInvoice([...lines], "CGST + SGST", 2, true);

const snapshot = {
  kind: "Invoice",
  number: "EBV-26-27-0008",
  status: "Issued",
  bookingNumber: "EB-BK-2026-0008",
  issuedAt: "2026-11-03T12:00:00.000Z",
  dueDate: "2026-11-15",
  payer: {
    name: "Sample Singapore Traveller",
    email: "traveller@example.com",
    phone: "+91 98765 43210",
    billingAddress: "Chennai, Tamil Nadu, India",
    deliveryAddress: "Same as billing address",
    taxId: "",
  },
  currency: "INR",
  lines: totals.lines,
  totals,
  totalMinor: totals.grandTotalMinor,
  requiredAdvanceMinor: 25000000,
  verifiedPaidMinor: 25000000,
  outstandingMinor: totals.grandTotalMinor - 25000000,
  taxMode: "CGST + SGST",
  tcsRate: 2,
  placeOfSupply: "Tamil Nadu",
  buyerStateCode: "33",
  copyLabels: ["Customer copy", "Office copy"],
  template: {
    ...defaultInvoiceTemplate,
    legalName: "Early Bird Vacations",
    address: "Chennai, Tamil Nadu, India",
    phone: "+91 98765 43210",
    email: "accounts@earlybird.example",
    gstin: "33ABCDE1234F1Z5",
    bankName: "Sample Bank",
    accountName: "Early Bird Vacations",
    accountNumber: "000000000008",
    ifsc: "SAMP0000008",
    authorisedSignatory: "Agency Owner",
  },
  balanceTerms: "Balance due seven days before travel.",
};

async function main() {
  await mkdir("output/pdf", { recursive: true });
  const output = "output/pdf/earlybird-tax-invoice-reference-sample.pdf";
  await writeFile(output, await buildFinancialPdf(snapshot));
  console.log(output);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
