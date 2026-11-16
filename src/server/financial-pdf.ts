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
  const textWidth = width - 8;
  const words = String(value ?? "").replace(/\s+/g, " ").trim().split(" ");
  if (align === "right" && maxLines === 1 && words.length === 1 && words[0]) {
    const fittedSize = Math.min(size, size * textWidth / font.widthOfTextAtSize(words[0], size));
    page.drawText(words[0], { x: x + width - 4 - font.widthOfTextAtSize(words[0], fittedSize), y, size: fittedSize, font, color: BLACK });
    return;
  }
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) <= textWidth) { line = next; continue; }
    if (line) lines.push(line);
    line = "";
    for (const character of word) {
      if (line && font.widthOfTextAtSize(line + character, size) > textWidth) {
        lines.push(line);
        line = "";
      }
      line += character;
    }
  }
  if (line) lines.push(line);
  for (const [index, raw] of lines.slice(0, maxLines).entries()) {
    let valueLine = raw;
    if (index === maxLines - 1 && lines.length > maxLines) {
      while (valueLine && font.widthOfTextAtSize(valueLine + "...", size) > textWidth) valueLine = valueLine.slice(0, -1);
      valueLine += "...";
    }
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

export async function embedBusinessLogo(doc: PDFDocument, configured = "") {
  if (configured) {
    try { return await dataImage(doc, configured); }
    catch { /* Use the bundled agency logo when the configured file cannot be read. */ }
  }
  return doc.embedPng(await readFile(path.join(process.cwd(), "public", "earlybird-vacations-logo.png")));
}

export function invoicePrintSnapshot(snapshot: any, agreement: any, copies?: string[]) {
  const title = String(agreement?.content?.title || "").trim();
  const optionName = String(agreement?.selectedOption?.name || "").trim();
  const oldAutoDescription = title && optionName ? `${optionName} - ${title}` : "";
  return {
    ...snapshot,
    copyLabels: copies || [snapshot.copyLabels?.[0] || "Customer copy"],
    lines: (snapshot.lines || []).map((line: any) =>
      line.kind === "Charge" && oldAutoDescription && line.description === oldAutoDescription
        ? { ...line, description: title } : line),
    travelSummary: snapshot.travelSummary && {
      ...snapshot.travelSummary,
      selectedOptionName: title || snapshot.travelSummary.selectedOptionName,
    },
  };
}

async function buildRuledFinancialPdf(snapshot: any) {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const font = await doc.embedFont(
    await readFile(path.join(process.cwd(), "src", "assets", "fonts", "NotoSans-Regular.ttf")),
    { subset: true },
  );
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const template = snapshot.template || {};
  const quote = snapshot.kind === "Quotation";
  const logo = await embedBusinessLogo(doc, template.logoDataUrl);
  const signature = quote ? null : await dataImage(doc, template.signatureDataUrl || "");
  const serif = await doc.embedFont(StandardFonts.TimesRomanBold);
  const copyLabels = quote ? [""] : (snapshot.copyLabels?.length ? snapshot.copyLabels : ["Customer copy"]).slice(0, 6);
  const allLines = snapshot.lines || [];
  const lineChunks: any[][] = [];
  for (let index = 0; index < allLines.length; index += 10) lineChunks.push(allLines.slice(index, index + 10));
  if (!lineChunks.length) lineChunks.push([]);

  const height = 792;
  const left = 63, right = 492, split = 310, taxSplit = 423;
  const grid = quote ? [left, 103, 237, right] : [left, 103, 152, split, 351, 391, taxSplit, right];
  for (const copyLabel of copyLabels) {
    for (let pageIndex = 0; pageIndex < lineChunks.length; pageIndex++) {
      const page = doc.addPage([612, height]);
      const last = pageIndex === lineChunks.length - 1;
      const horizontal = (top: number, from = left, to = right, thickness = 0.7) =>
        page.drawLine({ start: { x: from, y: height - top }, end: { x: to, y: height - top }, thickness, color: BLACK });
      const vertical = (x: number, from: number, to: number) =>
        page.drawLine({ start: { x, y: height - from }, end: { x, y: height - to }, thickness: 0.7, color: BLACK });
      const cell = (value: unknown, x1: number, x2: number, top: number, size = 8.5, align: "left" | "center" | "right" = "left", lines = 1, face = font) =>
        cellText(page, face, value, x1, height - top - size, x2 - x1, size, align, lines);
      const picture = (img: NonNullable<typeof logo>, x1: number, x2: number, top: number, bottom: number) => {
        const scaled = img.scale(Math.min((x2 - x1 - 8) / img.width, (bottom - top - 4) / img.height));
        page.drawImage(img, { x: (x1 + x2 - scaled.width) / 2, y: height - (top + bottom + scaled.height) / 2, ...scaled });
      };

      box(page, left, height - 778, right - left, 763, 1.45);
      for (const top of [32, 129, 142, 155, 219, 232, 591, 719]) horizontal(top, left, right, [32, 129, 219, 591, 719].includes(top) ? 1.15 : 0.7);
      vertical(split, 32, 109);
      vertical(split, 129, 219);
      vertical(152, 129, 142);
      vertical(split, 591, 778);
      for (const top of [45, 82, 95, 109]) horizontal(top, split, right);
      horizontal(109, left, split, 1.15);
      horizontal(167, split, right);

      cell(quote ? "QUOTATION" : template.documentTitle || "TAX INVOICE", left, right, 16, 12.6, "center", 1, serif);
      if (logo) picture(logo, left + 3, split - 3, 33, 108);
      cell(template.legalName || "Early Bird Vacations", split, right, 33, 9, "left", 1, font);
      cell(template.address, split, right, 46, 8, "center", 3);
      if (template.phone) cell(`Mobile: ${template.phone}`, split, right, 82.5, 8);
      if (template.email) cell(`Email: ${template.email}`, split, right, 95.5, 8);
      if (template.gstin) cell(`GSTIN: ${template.gstin}`, split, right, 110, 12, "center", 1, bold);
      if (!quote && template.pan) cell(`PAN: ${template.pan}`, left, split, 114, 8.5);

      cell(`Date: ${safeDate(snapshot.issuedAt)}`, left, 152, 129.5, 8);
      cell(`${quote ? "Quote" : "Invoice"} No: ${snapshot.number}`, 152, split, 129.5, 8);
      const metadata = quote ? `Version ${snapshot.quoteVersion} · Valid until ${safeDate(snapshot.dueDate) || "As agreed"}`
        : [snapshot.bookingNumber, safeDate(snapshot.dueDate) && `Due ${safeDate(snapshot.dueDate)}`].filter(Boolean).join(" · ");
      cell(metadata, split, right, 130, 7.25);
      cell(quote ? "Prepared for" : "Name & Address of Buyer", left, split, 142.5, 8.5, "left", 1, bold);
      cell(snapshot.payer?.name || "Customer", left, split, 155.5, 9.1, "left", 1);
      if (quote) {
        cell([snapshot.payer?.phone, snapshot.payer?.email].filter(Boolean).join(" · "), left, split, 169, 8, "left", 3);
        cell("Trip details:", split, right, 154.5, 8.5, "left", 1, bold);
        cell(snapshot.trip.title, split, right, 169, 8.5, "left", 2);
        cell(snapshot.trip.destination, split, right, 192, 8, "left", 1);
        cell(snapshot.trip.dates || "Dates to be confirmed", split, right, 205, 7.6, "left", 1);
      } else {
        cell(snapshot.payer?.billingAddress, left, split, 168, 8.1, "left", 3);
        if (snapshot.payer?.phone) cell(`Phone: ${snapshot.payer.phone}`, left, split, 200, 7.6);
        if (template.showBuyerGstin && snapshot.payer?.taxId) cell(`GSTIN: ${snapshot.payer.taxId}`, left, split, 209, 7.8);
        if (template.showDeliveryAddress) {
          cell("Delivery address:", split, right, 154.5, 8.5, "left", 1, bold);
          cell(snapshot.payer?.deliveryAddress || snapshot.payer?.billingAddress || "Same as billing address", split, right, 172, 8.1, "left", 3);
        }
        const supply = [snapshot.placeOfSupply, snapshot.buyerStateCode].filter(Boolean).join(" · ");
        if (supply) cell(`Place of supply: ${supply}`, split, right, 206, 7.4);
      }

      for (const x of grid.slice(1, -1)) vertical(x, 219, 591);
      const labels = quote ? ["Sl. No.", "PACKAGE OPTION", "PARTICULARS"] : ["Sl. No.", template.showHsn ? "HSN CODE" : "", "PARTICULARS", template.showQuantity ? "Quantity" : "", template.showUnitPrice ? "Price" : "", template.showGstRate ? "GST" : "", "Total"];
      labels.forEach((label, index) => cell(label, grid[index], grid[index + 1], 220, 7.1, "center", 1, bold));
      lineChunks[pageIndex].forEach((line: any, index: number) => {
        const top = !quote && lineChunks[pageIndex].length <= 4
          ? [248, 314, 364, 389][index]
          : 237 + index * 34.8;
        cell(pageIndex * 10 + index + 1, grid[0], grid[1], top, 8.5, "center");
        if (quote) {
          cell(line.name, grid[1], grid[2], top, 8.6, "left", 3);
          cell(line.description, grid[2], grid[3], top, 8.5, "left", 3);
          return;
        }
        cell(line.description, grid[2], grid[3], top, 8.5, "left", 3);
        if (line.kind !== "Note") {
          cell(template.showHsn ? line.hsnCode : "", grid[1], grid[2], top, 8.2, "center");
          cell(template.showQuantity ? (line.quantityNumber ?? line.quantity) : "", grid[3], grid[4], top, 8.4, "right");
          cell(template.showUnitPrice ? moneyPlain(line.unitPriceMinor) : "", grid[4], grid[5], top, 7.6, "right");
          cell(template.showGstRate ? `${line.gstRate}` : "", grid[5], grid[6], top, 8.2, "center");
          cell(moneyPlain(line.taxableMinor), grid[6], grid[7], top, 8.1, "right");
        }
      });

      if (!last) {
        cell("Continued on the next page", left, right, 653, 9, "center");
      } else if (quote) {
        cell("CANCELLATION TERMS", left, split, 602, 9, "left", 1, serif);
        cell(snapshot.cancellationTerms, left, split, 624, 8.4, "left", 8);
        cell("DETAILED PACKAGE", split, right, 602, 9, "left", 1, serif);
        cell("See the detailed package for stays, transfers, itinerary, inclusions and full terms.", split, right, 621, 8.5, "left", 5);
        cell("Services are subject to confirmation.", left, split, 746, 8.5, "center", 2);
      } else {
        horizontal(625, left, right);
        for (const top of [608, 644, 663, 682, 701]) horizontal(top, split, right);
        vertical(taxSplit, 591, 719);
        const totals = snapshot.totals || {};
        const taxableRows = [
          ["GROSS TAXABLE VALUE", totals.taxableMinor],
          ["CGST", template.showTaxBreakdown ? totals.cgstMinor : undefined],
          ["SGST", template.showTaxBreakdown ? totals.sgstMinor : undefined],
          ["IGST", template.showTaxBreakdown ? totals.igstMinor : undefined],
          ["TOTAL GST", template.showTaxBreakdown ? totals.totalGstMinor : undefined],
          ["TOTAL TCS", template.showTcs ? totals.tcsMinor : undefined],
          ["GRAND TOTAL", totals.grandTotalMinor],
        ] as const;
        taxableRows.forEach(([label, value], index) => {
          if (value === undefined) return;
          const top = [594, 612, 630, 649, 668, 687, 706][index];
          const face = index === 0 || index >= 4 ? bold : font;
          cell(label, split, taxSplit, top, 8.5, "center", 1, face);
          cell(moneyPlain(value), taxSplit, right, top, 9.3, "right", 1, index >= 4 ? font : face);
        });
        if (template.showBankDetails && [template.accountName, template.accountNumber, template.bankName, template.ifsc].some(Boolean)) {
          cell("BANK DETAILS:", left, split, 626, 11, "left", 1, serif);
          const details = [["A/c Name", template.accountName], ["A/c No", template.accountNumber], ["IFSC", template.ifsc], ["A/c Type", template.accountType], ["Bank", template.bankName]].filter(([, value]) => value);
          details.forEach(([label, value], index) => {
            cell(`${label}:`, left, left + 87, 643 + index * 14.5, 9.4, "left", 1, serif);
            cell(value, left + 87, split, 643 + index * 14.5, 9.4, "left");
          });
        }
        if (template.showPaymentSummary) {
          cell(`Paid: ${moneyPlain(snapshot.verifiedPaidMinor)} · Balance: ${moneyPlain(snapshot.outstandingMinor)}`, left, split, 608, 7.8, "left");
        }
        if (template.showReceiverSignature) cell("Receiver's Signature", left, split, 767, 8.5, "center");
        if (template.showAuthorisedSignature) {
          cell(`For ${template.legalName || "Early Bird Vacations"}`, split, right, 722, 8.5, "center", 1);
          if (signature) picture(signature, split + 50, right - 50, 735, 764);
          else if (template.authorisedSignatory) cell(template.authorisedSignatory, split, right, 747, 8, "center");
          cell("(Authorised Signature)", split, right, 767, 8.5, "center");
        }
      }
      const footerText = quote ? "Quotation · Package details" : template.footerNote || "This is a computer-generated invoice.";
      cell([footerText, copyLabel, lineChunks.length > 1 && `Page ${pageIndex + 1} of ${lineChunks.length}`].filter(Boolean).join(" · "), left, right, 780, 6.5, "center");
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
  doc.setTitle(`${quote ? "Quotation" : "Tax Invoice"} ${snapshot.number}`);
  doc.setAuthor(template.legalName || "EarlyBird Travel CRM");
  doc.setCreationDate(new Date(snapshot.issuedAt));
  return doc.save();
}

export async function buildFinancialPdf(snapshot: any) {
  if (snapshot.kind === "Invoice" || snapshot.kind === "Quotation") return buildRuledFinancialPdf(snapshot);
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
