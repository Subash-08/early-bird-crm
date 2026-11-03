import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";

const W = 595.28;
const H = 841.89;
const M = 48;
const INK = rgb(0.09, 0.17, 0.23);
const MUTED = rgb(0.39, 0.47, 0.52);
const BLUE = rgb(0.086, 0.466, 0.655);
const NAVY = rgb(0.063, 0.165, 0.263);
const SAND = rgb(0.965, 0.945, 0.91);
const LINE = rgb(0.86, 0.9, 0.91);
const BLACK = rgb(0, 0, 0);

type Context = { doc: PDFDocument; page: PDFPage; font: PDFFont; y: number };
const amount = (minor: number, currency: string) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency }).format(
    minor / 100,
  );
const date = (value: string) =>
  value
    ? new Intl.DateTimeFormat("en-IN", {
        dateStyle: "medium",
        timeZone: "Asia/Kolkata",
      }).format(new Date(value))
    : "Not set";

function text(
  ctx: Context,
  value: string,
  x: number,
  y: number,
  size = 9,
  color = INK,
) {
  ctx.page.drawText(value || "-", { x, y, size, font: ctx.font, color });
}
function wrap(ctx: Context, value: string, maxWidth: number, size = 9) {
  const words = String(value || "-").split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (ctx.font.widthOfTextAtSize(next, size) > maxWidth && current) {
      lines.push(current);
      current = word;
    } else current = next;
  }
  if (current) lines.push(current);
  return lines;
}
function labelValue(
  ctx: Context,
  label: string,
  value: string,
  x: number,
  width: number,
) {
  text(ctx, label.toUpperCase(), x, ctx.y, 7, MUTED);
  ctx.y -= 15;
  for (const line of wrap(ctx, value, width, 10)) {
    text(ctx, line, x, ctx.y, 10);
    ctx.y -= 13;
  }
}
function divider(ctx: Context) {
  ctx.page.drawLine({
    start: { x: M, y: ctx.y },
    end: { x: W - M, y: ctx.y },
    thickness: 1,
    color: LINE,
  });
  ctx.y -= 22;
}
function footer(ctx: Context, number: string) {
  text(ctx, "EarlyBird Travel CRM", M, 28, 8, MUTED);
  const right = `Document ${number}`;
  text(ctx, right, W - M - ctx.font.widthOfTextAtSize(right, 8), 28, 8, MUTED);
}

function moneyPlain(minor = 0) {
  return new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(minor) / 100);
}

function safeDate(value: string) {
  if (!value) return "";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? value
    : new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeZone: "Asia/Kolkata" }).format(parsed);
}

function cellText(
  page: PDFPage,
  font: PDFFont,
  value: unknown,
  x: number,
  y: number,
  width: number,
  size = 7.2,
  align: "left" | "center" | "right" = "left",
  maxLines = 5,
) {
  const words = String(value ?? "").replace(/\s+/g, " ").trim().split(" ");
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) > width - 8 && line) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  for (const [index, raw] of lines.slice(0, maxLines).entries()) {
    const valueLine = index === maxLines - 1 && lines.length > maxLines ? `${raw.slice(0, -3)}...` : raw;
    const measured = font.widthOfTextAtSize(valueLine, size);
    const tx = align === "right" ? x + width - measured - 4 : align === "center" ? x + (width - measured) / 2 : x + 4;
    page.drawText(valueLine, { x: tx, y: y - index * (size + 2), size, font, color: BLACK });
  }
}

function box(page: PDFPage, x: number, y: number, width: number, height: number, thickness = 0.7) {
  page.drawRectangle({ x, y, width, height, borderColor: BLACK, borderWidth: thickness });
}

async function dataImage(doc: PDFDocument, value: string) {
  if (!value) return null;
  const bytes = Buffer.from(value.split(",")[1] || "", "base64");
  return value.startsWith("data:image/png") ? doc.embedPng(bytes) : doc.embedJpg(bytes);
}

async function buildTaxInvoicePdf(snapshot: any) {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const font = await doc.embedFont(
    await readFile(path.join(process.cwd(), "src", "assets", "fonts", "NotoSans-Regular.ttf")),
    { subset: true },
  );
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const template = snapshot.template || {};
  const logo = await dataImage(doc, template.logoDataUrl || "");
  const signature = await dataImage(doc, template.signatureDataUrl || "");
  const copyLabels = (snapshot.copyLabels?.length ? snapshot.copyLabels : ["Customer copy"]).slice(0, 6);
  const lineChunks: any[][] = [];
  const allLines = snapshot.lines || [];
  for (let index = 0; index < allLines.length; index += 10) lineChunks.push(allLines.slice(index, index + 10));
  if (!lineChunks.length) lineChunks.push([]);

  for (const copyLabel of copyLabels) {
    for (let chunkIndex = 0; chunkIndex < lineChunks.length; chunkIndex++) {
      const page = doc.addPage([612, 792]);
      const x = 28, right = 584, width = right - x;
      const last = chunkIndex === lineChunks.length - 1;
      box(page, x, 35, width, 730, 1.2);
      box(page, x, 738, width, 27);
      cellText(page, bold, template.documentTitle || "TAX INVOICE", x, 755, width, 15, "center", 1);
      cellText(page, font, `${copyLabel}${lineChunks.length > 1 ? ` · Page ${chunkIndex + 1}/${lineChunks.length}` : ""}`, x, 739, width - 6, 6.6, "right", 1);

      box(page, x, 650, 150, 88);
      box(page, x + 150, 650, width - 150, 88);
      if (logo) {
        const scaled = logo.scale(Math.min(1, 120 / logo.width, 62 / logo.height));
        page.drawImage(logo, { x: x + (150 - scaled.width) / 2, y: 663, width: scaled.width, height: scaled.height });
      } else cellText(page, font, "EARLY BIRD\nVACATIONS", x, 705, 150, 12, "center", 2);
      cellText(page, font, template.legalName || "Early Bird Vacations", x + 150, 726, width - 150, 11, "center", 1);
      cellText(page, font, template.address || "", x + 158, 709, width - 166, 7.3, "center", 4);
      cellText(page, font, [template.phone, template.email].filter(Boolean).join(" · "), x + 158, 665, width - 166, 7, "center", 2);

      box(page, x, 628, width, 22);
      cellText(page, font, `GSTIN: ${template.gstin || "Not configured"}${template.pan ? `  ·  PAN: ${template.pan}` : ""}${template.stateName ? `  ·  ${template.stateName} (${template.stateCode || "-"})` : ""}`, x, 643, width, 8.2, "center", 1);
      const half = width / 2;
      box(page, x, 598, half, 30);
      box(page, x + half, 598, half, 30);
      cellText(page, font, `Invoice No: ${snapshot.number}`, x, 618, half, 8.2, "left", 1);
      cellText(page, font, `Date: ${safeDate(snapshot.issuedAt)}`, x + half, 618, half, 8.2, "left", 1);
      cellText(page, font, `Booking: ${snapshot.bookingNumber || ""}`, x, 604, half, 7, "left", 1);
      cellText(page, font, `Due: ${safeDate(snapshot.dueDate) || "As agreed"}`, x + half, 604, half, 7, "left", 1);

      box(page, x, 508, half, 90);
      box(page, x + half, 508, half, 90);
      cellText(page, bold, "BUYER / BILL TO", x, 589, half, 7.6, "left", 1);
      cellText(page, font, snapshot.payer?.name || "Customer", x, 575, half, 9.2, "left", 1);
      cellText(page, font, snapshot.payer?.billingAddress || "", x, 558, half, 7.2, "left", 4);
      if (template.showBuyerGstin) cellText(page, font, `GSTIN: ${snapshot.payer?.taxId || "Not provided"}`, x, 518, half, 7, "left", 1);
      cellText(page, bold, "SERVICE / DELIVERY DETAILS", x + half, 589, half, 7.6, "left", 1);
      if (template.showDeliveryAddress) cellText(page, font, snapshot.payer?.deliveryAddress || snapshot.payer?.billingAddress || "Same as billing address", x + half, 575, half, 7.2, "left", 4);
      cellText(page, font, `Place of supply: ${snapshot.placeOfSupply || "Not applicable"}`, x + half, 532, half, 7, "left", 1);
      cellText(page, font, `State code: ${snapshot.buyerStateCode || "-"}`, x + half, 518, half, 7, "left", 1);

      const columns = [28, 58, 116, 330, 370, 454, 502, 584];
      box(page, x, 478, width, 30);
      for (const cx of columns.slice(1, -1)) page.drawLine({ start: { x: cx, y: 230 }, end: { x: cx, y: 508 }, thickness: 0.55, color: BLACK });
      const headers = [
        "Sl.",
        template.showHsn ? "HSN/SAC" : "",
        "PARTICULARS",
        template.showQuantity ? "Qty" : "",
        template.showUnitPrice ? "Price" : "",
        template.showGstRate ? "GST" : "",
        "Total",
      ];
      for (let index = 0; index < headers.length; index++) cellText(page, bold, headers[index], columns[index], 497, columns[index + 1] - columns[index], 6.8, "center", 2);
      box(page, x, 230, width, 248);
      const rowHeight = 24;
      lineChunks[chunkIndex].forEach((line: any, index: number) => {
        const top = 468 - index * rowHeight;
        page.drawLine({ start: { x, y: top - rowHeight + 10 }, end: { x: right, y: top - rowHeight + 10 }, thickness: 0.35, color: rgb(0.65, 0.65, 0.65) });
        cellText(page, font, chunkIndex * 10 + index + 1, columns[0], top, columns[1] - columns[0], 7.4, "center", 1);
        cellText(page, font, line.kind === "Note" || !template.showHsn ? "" : line.hsnCode, columns[1], top, columns[2] - columns[1], 7.4, "center", 1);
        cellText(page, font, line.description, columns[2], top, columns[3] - columns[2], 7.2, "left", 2);
        if (line.kind !== "Note") {
          cellText(page, font, template.showQuantity ? (line.quantityNumber ?? line.quantity) : "", columns[3], top, columns[4] - columns[3], 7.4, "center", 1);
          cellText(page, font, template.showUnitPrice ? moneyPlain(line.unitPriceMinor) : "", columns[4], top, columns[5] - columns[4], 7.4, "right", 1);
          cellText(page, bold, template.showGstRate ? `${line.gstRate}%` : "", columns[5], top, columns[6] - columns[5], 7.2, "center", 1);
          cellText(page, font, moneyPlain(line.taxableMinor), columns[6], top, columns[7] - columns[6], 7.4, "right", 1);
        }
      });

      if (last) {
        box(page, x, 95, half, 135);
        box(page, x + half, 95, half, 135);
        let ly = 218;
        if (template.showBankDetails) {
          cellText(page, bold, "BANK DETAILS", x, ly, half, 7.6, "left", 1); ly -= 15;
          for (const line of [template.bankName, template.accountName, template.accountNumber ? `A/c: ${template.accountNumber}` : "", template.ifsc ? `IFSC: ${template.ifsc}` : "", template.accountType].filter(Boolean)) {
            cellText(page, font, line, x, ly, half, 7, "left", 1); ly -= 13;
          }
        }
        if (template.showPaymentSummary) {
          ly -= 3;
          cellText(page, bold, "PAYMENT STATUS AT INVOICE ISSUE", x, ly, half, 7.6, "left", 1); ly -= 14;
          cellText(page, font, `Advance required: ${moneyPlain(snapshot.requiredAdvanceMinor)}${snapshot.advanceDueAt ? ` · ${safeDate(snapshot.advanceDueAt)}` : ""}`, x, ly, half, 7, "left", 1); ly -= 12;
          cellText(page, font, `Verified paid: ${moneyPlain(snapshot.verifiedPaidMinor)}`, x, ly, half, 7, "left", 1); ly -= 12;
          cellText(page, font, `Balance due: ${moneyPlain(snapshot.outstandingMinor)}${snapshot.dueDate ? ` · ${safeDate(snapshot.dueDate)}` : ""}`, x, ly, half, 7, "left", 1); ly -= 12;
          if (snapshot.paymentNote) cellText(page, font, snapshot.paymentNote, x, ly, half, 6.4, "left", 2);
        }
        const totals = snapshot.totals || {};
        const totalRows = [
          ["Taxable value", totals.taxableMinor],
          ...(template.showTaxBreakdown ? [["CGST", totals.cgstMinor], ["SGST", totals.sgstMinor], ["IGST", totals.igstMinor]] : []),
          ...(template.showTcs && totals.tcsMinor ? [[`TCS @ ${snapshot.tcsRate}%`, totals.tcsMinor]] : []),
          ["GRAND TOTAL", totals.grandTotalMinor],
        ].filter((row) => row[1] !== undefined && (row[1] !== 0 || row[0] === "Taxable value" || row[0] === "GRAND TOTAL"));
        let ty = 216;
        for (const [label, value] of totalRows) {
          cellText(page, label === "GRAND TOTAL" ? bold : font, label, x + half, ty, half * 0.58, label === "GRAND TOTAL" ? 9 : 7.4, "left", 1);
          cellText(page, label === "GRAND TOTAL" ? bold : font, moneyPlain(Number(value)), x + half + half * 0.58, ty, half * 0.42, label === "GRAND TOTAL" ? 9 : 7.4, "right", 1);
          ty -= 17;
        }
      } else {
        box(page, x, 95, width, 135);
        cellText(page, font, "Continued on next page", x, 160, width, 9, "center", 1);
      }

      box(page, x, 55, half, 40);
      box(page, x + half, 55, half, 40);
      if (template.showReceiverSignature) cellText(page, font, "Receiver's signature", x, 67, half, 7, "center", 1);
      if (template.showAuthorisedSignature) {
        if (signature) {
          const scaled = signature.scale(Math.min(1, 70 / signature.width, 24 / signature.height));
          page.drawImage(signature, { x: x + half + (half - scaled.width) / 2, y: 69, width: scaled.width, height: scaled.height });
        }
        cellText(page, font, `Authorised signatory${template.authorisedSignatory ? ` · ${template.authorisedSignatory}` : ""}`, x + half, 62, half, 6.6, "center", 1);
      }
      cellText(page, font, template.footerNote || "This is a computer-generated invoice.", x, 43, width, 6.5, "center", 1);
    }
  }

  if (snapshot.travelSummary) {
    const page = doc.addPage([612, 792]);
    page.drawRectangle({ x: 0, y: 708, width: 612, height: 84, color: NAVY });
    page.drawText("TRAVEL SERVICE SUMMARY", { x: 42, y: 748, size: 20, font, color: rgb(1, 1, 1) });
    page.drawText(`${snapshot.bookingNumber} · accompanies ${snapshot.number}`, { x: 42, y: 724, size: 8, font, color: rgb(0.8, 0.88, 0.93) });
    const summary = snapshot.travelSummary;
    let sy = 676;
    for (const [label, value] of [
      ["Traveller / payer", snapshot.payer?.name],
      ["Destination", summary.destination],
      ["Travel dates", `${summary.serviceStart || "To confirm"} to ${summary.serviceEnd || "To confirm"}`],
      ["Travellers", (summary.travellers || []).map((person: any) => person.name).filter(Boolean).join(", ")],
      ["Package", summary.selectedOptionName],
    ]) {
      page.drawText(String(label).toUpperCase(), { x: 42, y: sy, size: 7, font, color: MUTED });
      cellText(page, font, value || "Not added", 160, sy, 405, 9, "left", 3);
      sy -= 48;
    }
    page.drawText("SERVICE NOTES", { x: 42, y: sy, size: 8, font, color: NAVY }); sy -= 20;
    const notes = [
      ...(summary.services || []),
      ...(summary.inclusions || []),
      ...(summary.exclusions || []).map((value: string) => `Not included: ${value}`),
    ];
    for (const note of notes.slice(0, 18)) {
      cellText(page, font, `• ${note}`, 42, sy, 520, 8, "left", 2);
      sy -= 22;
    }
    page.drawText("This summary describes travel services and is not a separate tax invoice.", { x: 42, y: 35, size: 7, font, color: MUTED });
  }
  doc.setTitle(`Tax Invoice ${snapshot.number}`);
  doc.setAuthor(template.legalName || "EarlyBird Travel CRM");
  doc.setCreationDate(new Date(snapshot.issuedAt));
  return doc.save();
}

export async function buildFinancialPdf(snapshot: any) {
  if (snapshot.kind === "Invoice") return buildTaxInvoicePdf(snapshot);
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const font = await doc.embedFont(
    await readFile(
      path.join(
        process.cwd(),
        "src",
        "assets",
        "fonts",
        "NotoSans-Regular.ttf",
      ),
    ),
    { subset: true },
  );
  const page = doc.addPage([W, H]);
  const ctx: Context = { doc, page, font, y: H - 50 };
  const isReceipt = snapshot.kind === "Receipt";
  page.drawRectangle({ x: 0, y: H - 150, width: W, height: 150, color: NAVY });
  text(ctx, "EARLYBIRD", M, H - 48, 11, rgb(0.45, 0.78, 0.88));
  text(
    ctx,
    isReceipt ? "Payment receipt" : "Customer invoice",
    M,
    H - 82,
    25,
    rgb(1, 1, 1),
  );
  text(ctx, snapshot.number, M, H - 108, 11, rgb(0.82, 0.88, 0.92));
  const status = isReceipt
    ? "VERIFIED"
    : String(snapshot.status || "ISSUED").toUpperCase();
  page.drawRectangle({
    x: W - M - 94,
    y: H - 92,
    width: 94,
    height: 28,
    color: BLUE,
  });
  text(ctx, status, W - M - 78, H - 82, 9, rgb(1, 1, 1));
  ctx.y = H - 188;
  labelValue(ctx, "Billed to", snapshot.payer?.name || "Customer", M, 220);
  for (const line of wrap(
    ctx,
    snapshot.payer?.billingAddress ||
      snapshot.payer?.email ||
      snapshot.payer?.phone,
    220,
    8,
  )) {
    text(ctx, line, M, ctx.y, 8, MUTED);
    ctx.y -= 11;
  }
  const metaY = H - 188;
  text(ctx, "BOOKING", 350, metaY, 7, MUTED);
  text(ctx, snapshot.bookingNumber, 350, metaY - 15, 10);
  text(ctx, isReceipt ? "RECEIVED" : "ISSUED", 350, metaY - 42, 7, MUTED);
  text(
    ctx,
    date(isReceipt ? snapshot.receivedAt : snapshot.issuedAt),
    350,
    metaY - 57,
    10,
  );
  ctx.y = Math.min(ctx.y, H - 292);
  divider(ctx);

  if (!isReceipt) {
    text(ctx, "DESCRIPTION", M, ctx.y, 7, MUTED);
    text(ctx, "AMOUNT", W - M - 75, ctx.y, 7, MUTED);
    ctx.y -= 24;
    for (const lineItem of snapshot.lines || []) {
      const startY = ctx.y;
      for (const line of wrap(ctx, lineItem.description, 340, 10)) {
        text(ctx, line, M, ctx.y, 10);
        ctx.y -= 14;
      }
      text(
        ctx,
        amount(lineItem.totalMinor, snapshot.currency),
        W - M - 92,
        startY,
        10,
      );
      ctx.y -= 12;
    }
    divider(ctx);
    page.drawRectangle({
      x: W - M - 220,
      y: ctx.y - 76,
      width: 220,
      height: 90,
      color: SAND,
    });
    text(ctx, "TOTAL", W - M - 196, ctx.y - 12, 8, MUTED);
    text(
      ctx,
      amount(snapshot.totalMinor, snapshot.currency),
      W - M - 196,
      ctx.y - 42,
      19,
      NAVY,
    );
    text(
      ctx,
      `Advance required: ${amount(snapshot.requiredAdvanceMinor, snapshot.currency)}`,
      W - M - 196,
      ctx.y - 64,
      8,
      MUTED,
    );
    ctx.y -= 112;
    labelValue(
      ctx,
      "Payment terms",
      snapshot.balanceTerms || "As agreed in the approved quotation.",
      M,
      W - 2 * M,
    );
  } else {
    page.drawRectangle({
      x: M,
      y: ctx.y - 106,
      width: W - 2 * M,
      height: 122,
      color: SAND,
    });
    text(ctx, "VERIFIED PAYMENT", M + 22, ctx.y - 15, 8, MUTED);
    text(
      ctx,
      amount(snapshot.amountMinor, snapshot.currency),
      M + 22,
      ctx.y - 50,
      25,
      NAVY,
    );
    text(
      ctx,
      `${snapshot.method} - reference ${snapshot.reference || "recorded by agency"}`,
      M + 22,
      ctx.y - 77,
      9,
    );
    text(ctx, `Payer: ${snapshot.payerName}`, M + 22, ctx.y - 96, 9, MUTED);
    ctx.y -= 146;
    labelValue(ctx, "Allocation", snapshot.allocationLabel, M, W - 2 * M);
    labelValue(
      ctx,
      "Booking balance after this receipt",
      amount(snapshot.outstandingMinor, snapshot.currency),
      M,
      W - 2 * M,
    );
  }
  ctx.y -= 12;
  divider(ctx);
  text(ctx, "Important", M, ctx.y, 9, NAVY);
  ctx.y -= 18;
  for (const line of wrap(
    ctx,
    isReceipt
      ? "This receipt confirms only the verified customer payment shown above. Supplier confirmations and trip readiness are tracked separately."
      : "This invoice reflects the accepted quotation option. Supplier availability and service confirmation remain separate operational steps.",
    W - 2 * M,
    8,
  )) {
    text(ctx, line, M, ctx.y, 8, MUTED);
    ctx.y -= 12;
  }
  footer(ctx, snapshot.number);
  doc.setTitle(`${snapshot.kind} ${snapshot.number}`);
  doc.setAuthor("EarlyBird Travel CRM");
  doc.setCreationDate(new Date(snapshot.issuedAt || snapshot.receivedAt));
  return doc.save();
}
