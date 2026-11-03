import { z } from "zod";

const text = (max = 1000) => z.string().trim().max(max).default("");
const moneyInput = z.union([z.string(), z.number()]);

export const invoiceLineSchema = z
  .object({
    id: z.string().min(1),
    kind: z.enum(["Charge", "Note"]),
    hsnCode: text(20),
    description: z.string().trim().min(1).max(2000),
    quantity: moneyInput.default("1"),
    unitPrice: moneyInput.default("0"),
    gstRate: z.number().min(0).max(100).default(0),
  })
  .strict();

export const invoiceDraftSchema = z
  .object({
    invoiceId: z.string().min(1),
    version: z.number().int().positive(),
    bookingId: z.string().min(1),
    taxMode: z.enum(["CGST + SGST", "IGST", "No GST"]),
    placeOfSupply: text(120),
    buyerStateCode: text(10),
    dueDate: z.union([z.literal(""), z.iso.date()]).default(""),
    tcsRate: z.number().min(0).max(100).default(0),
    copyLabels: z.array(z.string().trim().min(1).max(50)).min(1).max(6),
    lines: z.array(invoiceLineSchema).min(1).max(100),
  })
  .strict();

const asset = z
  .string()
  .max(750_000)
  .refine(
    (value) => !value || /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(value),
    "Use a PNG or JPEG image.",
  )
  .default("");

export const invoiceTemplateSchema = z
  .object({
    legalName: z.string().trim().min(2).max(200),
    address: z.string().trim().min(5).max(1500),
    phone: text(50),
    email: z.union([z.literal(""), z.email()]).default(""),
    gstin: text(20),
    pan: text(20),
    stateName: text(80),
    stateCode: text(10),
    bankName: text(120),
    accountName: text(160),
    accountNumber: text(50),
    ifsc: text(30),
    accountType: text(50),
    authorisedSignatory: text(160),
    documentTitle: z.string().trim().min(2).max(80).default("TAX INVOICE"),
    footerNote: text(500),
    paymentTerms: text(1000),
    prefix: z.string().trim().min(1).max(20).default("EBV"),
    sequenceDigits: z.number().int().min(3).max(8).default(4),
    roundTaxToRupee: z.boolean().default(true),
    logoDataUrl: asset,
    signatureDataUrl: asset,
    copyLabels: z.array(z.string().trim().min(1).max(50)).min(1).max(6),
    showDeliveryAddress: z.boolean().default(true),
    showBuyerGstin: z.boolean().default(true),
    showBankDetails: z.boolean().default(true),
    showHsn: z.boolean().default(true),
    showQuantity: z.boolean().default(true),
    showUnitPrice: z.boolean().default(true),
    showGstRate: z.boolean().default(true),
    showTaxBreakdown: z.boolean().default(true),
    showTcs: z.boolean().default(true),
    showPaymentSummary: z.boolean().default(true),
    showReceiverSignature: z.boolean().default(true),
    showAuthorisedSignature: z.boolean().default(true),
    includeTravelSummary: z.boolean().default(false),
  })
  .strict();

export type InvoiceTemplate = z.infer<typeof invoiceTemplateSchema>;
export type InvoiceLineInput = z.infer<typeof invoiceLineSchema>;

export const defaultInvoiceTemplate: InvoiceTemplate = {
  legalName: "Early Bird Vacations",
  address: "Add the registered business address",
  phone: "",
  email: "",
  gstin: "",
  pan: "",
  stateName: "Tamil Nadu",
  stateCode: "33",
  bankName: "",
  accountName: "",
  accountNumber: "",
  ifsc: "",
  accountType: "Current account",
  authorisedSignatory: "Owner",
  documentTitle: "TAX INVOICE",
  footerNote: "This is a computer-generated invoice.",
  paymentTerms: "Payment terms are as agreed in the approved quotation.",
  prefix: "EBV",
  sequenceDigits: 4,
  roundTaxToRupee: true,
  logoDataUrl: "",
  signatureDataUrl: "",
  copyLabels: ["Customer copy", "Office copy"],
  showDeliveryAddress: true,
  showBuyerGstin: true,
  showBankDetails: true,
  showHsn: true,
  showQuantity: true,
  showUnitPrice: true,
  showGstRate: true,
  showTaxBreakdown: true,
  showTcs: true,
  showPaymentSummary: true,
  showReceiverSignature: true,
  showAuthorisedSignature: true,
  includeTravelSummary: false,
};

function decimal(value: string | number, field: string) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0)
    throw new Error(`${field} must be zero or more.`);
  return number;
}

const roundMinor = (value: number, toRupee: boolean) =>
  toRupee ? Math.round(value / 100) * 100 : Math.round(value);

export function calculateInvoice(
  rawLines: unknown[],
  taxMode: "CGST + SGST" | "IGST" | "No GST",
  tcsRate: number,
  roundTaxToRupee = true,
) {
  const lines = rawLines.map((value) => {
    const line = value as Record<string, unknown>;
    return invoiceLineSchema.parse({
      id: line.id,
      kind: line.kind,
      hsnCode: line.hsnCode,
      description: line.description,
      quantity: line.quantityNumber ?? line.quantity,
      unitPrice: line.unitPriceMinor !== undefined ? Number(line.unitPriceMinor) / 100 : line.unitPrice,
      gstRate: line.gstRate,
    });
  });
  const calculatedLines = lines.map((line) => {
    if (line.kind === "Note")
      return { ...line, quantityNumber: 0, unitPriceMinor: 0, taxableMinor: 0, gstMinor: 0 };
    const quantityNumber = decimal(line.quantity, "Quantity");
    const unitPriceMinor = Math.round(decimal(line.unitPrice, "Unit price") * 100);
    if (quantityNumber <= 0) throw new Error("Charge quantity must be greater than zero.");
    const taxableMinor = Math.round(quantityNumber * unitPriceMinor);
    const gstMinor = taxMode === "No GST" ? 0 : Math.round((taxableMinor * line.gstRate) / 100);
    return { ...line, quantityNumber, unitPriceMinor, taxableMinor, gstMinor };
  });
  const taxableMinor = calculatedLines.reduce((sum, line) => sum + line.taxableMinor, 0);
  const unroundedGstMinor = calculatedLines.reduce((sum, line) => sum + line.gstMinor, 0);
  const totalGstMinor = roundMinor(unroundedGstMinor, roundTaxToRupee);
  const lastCharge = calculatedLines.findLastIndex((line) => line.kind === "Charge");
  if (lastCharge >= 0) calculatedLines[lastCharge].gstMinor += totalGstMinor - unroundedGstMinor;
  const cgstMinor = taxMode === "CGST + SGST" ? Math.floor(totalGstMinor / 2) : 0;
  const sgstMinor = taxMode === "CGST + SGST" ? totalGstMinor - Math.floor(totalGstMinor / 2) : 0;
  const igstMinor = taxMode === "IGST" ? totalGstMinor : 0;
  const tcsMinor = roundMinor((taxableMinor * decimal(tcsRate, "TCS rate")) / 100, roundTaxToRupee);
  return {
    lines: calculatedLines,
    taxableMinor,
    cgstMinor,
    sgstMinor,
    igstMinor,
    totalGstMinor,
    tcsMinor,
    grandTotalMinor: taxableMinor + totalGstMinor + tcsMinor,
  };
}

export function financialYear(value = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
    })
      .formatToParts(value)
      .map((part) => [part.type, part.value]),
  );
  const year = Number(parts.year);
  const start = Number(parts.month) >= 4 ? year : year - 1;
  return `${String(start).slice(-2)}-${String(start + 1).slice(-2)}`;
}
