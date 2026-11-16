import { readFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { Binary } from "mongodb";
import { PDFDocument, rgb, type PDFPage, type PDFFont } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { collection } from "./db";
import { notify } from "./crm";
import type { Actor } from "@/lib/domain";
import { packageDocument } from "@/lib/package-document";
import { buildFinancialPdf, embedBusinessLogo } from "./financial-pdf";

type FontChoice = { font: PDFFont; characters: Set<number> };
type Painter = {
  doc: PDFDocument;
  page: PDFPage;
  y: number;
  fonts: FontChoice[];
  pages: PDFPage[];
};
const W = 595.28,
  H = 841.89,
  M = 46,
  INK = rgb(0.09, 0.17, 0.23),
  MUTED = rgb(0.39, 0.47, 0.52),
  BLUE = rgb(0.16, 0.34, 0.25),
  NAVY = rgb(0.125, 0.278, 0.224),
  LINE = rgb(0.84, 0.89, 0.85);
const now = () => new Date().toISOString();

async function fonts(doc: PDFDocument) {
  doc.registerFontkit(fontkit);
  const root = path.join(process.cwd(), "src", "assets", "fonts");
  const files = ["NotoSans-Regular.ttf", "NotoSansDevanagari-Regular.ttf"];
  const result: FontChoice[] = [];
  for (const file of files) {
    const font = await doc.embedFont(await readFile(path.join(root, file)), {
      subset: true,
    });
    result.push({ font, characters: new Set(font.getCharacterSet()) });
  }
  return result;
}
function pick(p: Painter, char: string) {
  const code = char.codePointAt(0) || 32;
  return p.fonts.find((x) => x.characters.has(code)) || p.fonts[0];
}
function width(p: Painter, text: string, size: number) {
  let total = 0;
  for (const ch of text)
    total += pick(p, ch).font.widthOfTextAtSize(
      pick(p, ch).characters.has(ch.codePointAt(0) || 32) ? ch : "?",
      size,
    );
  return total;
}
function runs(p: Painter, text: string) {
  const out: { choice: FontChoice; text: string }[] = [];
  for (const raw of text) {
    const choice = pick(p, raw),
      char = choice.characters.has(raw.codePointAt(0) || 32) ? raw : "?";
    const last = out.at(-1);
    if (last?.choice === choice) last.text += char;
    else out.push({ choice, text: char });
  }
  return out;
}
function drawText(
  p: Painter,
  text: string,
  x: number,
  y: number,
  size = 9,
  color = INK,
) {
  for (const run of runs(p, text)) {
    p.page.drawText(run.text, { x, y, size, font: run.choice.font, color });
    x += run.choice.font.widthOfTextAtSize(run.text, size);
  }
}
function wrap(p: Painter, text: string, max: number, size = 9) {
  const paragraphs = String(text || "").split(/\r?\n/),
    lines: string[] = [];
  for (const para of paragraphs) {
    if (!para) {
      lines.push("");
      continue;
    }
    let line = "";
    for (const word of para.split(/\s+/)) {
      const candidate = line ? `${line} ${word}` : word;
      if (width(p, candidate, size) <= max) line = candidate;
      else {
        if (line) lines.push(line);
        if (width(p, word, size) <= max) line = word;
        else {
          let part = "";
          for (const ch of word) {
            if (width(p, part + ch, size) > max) {
              lines.push(part);
              part = ch;
            } else part += ch;
          }
          line = part;
        }
      }
    }
    if (line) lines.push(line);
  }
  return lines;
}
function footer(p: Painter) {
  const index = p.pages.length;
  p.page.drawLine({
    start: { x: M, y: 33 },
    end: { x: W - M, y: 33 },
    thickness: 0.6,
    color: LINE,
  });
  drawText(
    p,
    "Subject to availability until services are confirmed.",
    M,
    19,
    7,
    MUTED,
  );
  drawText(p, `Page ${index}`, W - M - 40, 19, 7, MUTED);
}
function addPage(p: Painter, first = false) {
  if (p.page) footer(p);
  p.page = p.doc.addPage([W, H]);
  p.pages.push(p.page);
  p.y = H - M;
  if (!first) {
    p.page.drawRectangle({
      x: 0,
      y: H - 34,
      width: W,
      height: 34,
      color: NAVY,
    });
    drawText(p, "EarlyBird Travel", M, H - 22, 9, rgb(1, 1, 1));
    p.y = H - 54;
  }
}
function ensure(p: Painter, height: number) {
  if (p.y - height < 48) addPage(p);
}
function paragraph(
  p: Painter,
  text: string,
  opts: {
    size?: number;
    color?: ReturnType<typeof rgb>;
    gap?: number;
    indent?: number;
  } = {},
) {
  const size = opts.size || 9,
    indent = opts.indent || 0,
    lines = wrap(p, text, W - M * 2 - indent, size);
  for (const line of lines) {
    ensure(p, size + 4);
    drawText(p, line, M + indent, p.y, size, opts.color || INK);
    p.y -= size + 4;
  }
  p.y -= opts.gap || 8;
}
function heading(p: Painter, text: string) {
  ensure(p, 32);
  p.y -= 5;
  drawText(p, text, M, p.y, 13, NAVY);
  p.y -= 9;
  p.page.drawLine({
    start: { x: M, y: p.y },
    end: { x: W - M, y: p.y },
    thickness: 1,
    color: LINE,
  });
  p.y -= 18;
}
function labelValue(
  p: Painter,
  label: string,
  value: string,
  x: number,
  w: number,
) {
  drawText(p, label.toUpperCase(), x, p.y, 6.5, MUTED);
  const lines = wrap(p, value || "Not specified", w, 9);
  lines
    .slice(0, 3)
    .forEach((line, i) => drawText(p, line, x, p.y - 13 - i * 12, 9, INK));
}
function list(p: Painter, items: string[]) {
  if (!items.length) {
    paragraph(p, "Not specified", { color: MUTED });
    return;
  }
  for (const item of items) {
    const lines = wrap(p, item, W - M * 2 - 18, 9);
    ensure(p, 17);
    p.page.drawCircle({ x: M + 3, y: p.y + 3, size: 2, color: BLUE });
    for (const line of lines) {
      ensure(p, 17);
      drawText(p, line, M + 15, p.y, 9);
      p.y -= 13;
    }
    p.y -= 5;
  }
  p.y -= 5;
}

export async function brandedQuoteSnapshot(snapshot: any, org: string) {
  const templateId = snapshot.company?.logoTemplateId;
  const branding = templateId ? await (await collection("invoiceTemplates")).findOne(
    { _id: templateId, org }, { projection: { logoDataUrl: 1 } },
  ) : null;
  return { ...snapshot, company: { ...snapshot.company, logoDataUrl: branding?.logoDataUrl || "" } };
}

export async function buildQuotePdf(snapshot: any, kind: "quotation" | "package" = "quotation") {
  const content = packageDocument(snapshot.content);
  const customer = snapshot.customer || {};
  const printableDate = (value: string) => {
    const date = new Date(`${value}T00:00:00Z`);
    return value && Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat("en-IN", {
      day: "numeric", month: "short", year: "numeric", timeZone: "UTC",
    }).format(date) : value || "";
  };
  const travel = content.dateScope === "Exact"
    ? [printableDate(content.startDate), printableDate(content.endDate)].filter(Boolean).join(" to ")
    : content.dateLabel;
  if (kind === "quotation") {
    return buildFinancialPdf({
      kind: "Quotation",
      number: snapshot.quoteNumber,
      quoteVersion: snapshot.quoteVersion,
      issuedAt: snapshot.approvedAt,
      dueDate: content.validUntil,
      template: snapshot.company,
      payer: customer,
      trip: { title: content.title, destination: content.destinations, dates: travel },
      lines: content.options.map((option) => ({
        name: option.name,
        description: [option.description, option.hotel, option.mealPlan].filter(Boolean).join(" · "),
      })),
      cancellationTerms: content.cancellationTerms,
    });
  }

  const optionNames = new Map(content.options.map((option) => [option.id, option.name]));
  const doc = await PDFDocument.create();
  const logo = await embedBusinessLogo(doc, snapshot.company?.logoDataUrl);
  doc.setTitle(`${snapshot.quoteNumber} v${snapshot.quoteVersion} - Detailed travel package`);
  doc.setAuthor(snapshot.company?.legalName || "Early Bird Vacations");
  doc.setSubject("Detailed travel package");
  doc.setCreationDate(new Date(snapshot.approvedAt));
  doc.setModificationDate(new Date(snapshot.approvedAt));
  const p = { doc, fonts: await fonts(doc), pages: [] } as unknown as Painter;
  addPage(p, true);
  p.page.drawRectangle({ x: 0, y: H - 177, width: W, height: 177, color: NAVY });
  if (logo) {
    const scaled = logo.scale(Math.min(160 / logo.width, 48 / logo.height));
    p.page.drawRectangle({ x: M, y: H - 73, width: 174, height: 53, color: rgb(1, 1, 1) });
    p.page.drawImage(logo, { x: M + (174 - scaled.width) / 2, y: H - 73 + (53 - scaled.height) / 2, ...scaled });
  }
  drawText(p, "DETAILED PACKAGE", W - M - 98, H - 51, 9, rgb(0.88, 0.92, 0.89));
  const travelTitle = wrap(p, content.title || "Travel package", W - M * 2, 22).slice(0, 2);
  travelTitle.forEach((line, index) => drawText(p, line, M, H - 107 - index * 24, 22, rgb(1, 1, 1)));
  drawText(p, `${snapshot.quoteNumber} · Version ${snapshot.quoteVersion}`, M, H - 153, 9, rgb(0.88, 0.92, 0.89));
  p.page.drawRectangle({ x: M - 7, y: H - 307, width: W - M * 2 + 14, height: 117, color: rgb(0.969, 0.980, 0.965), borderColor: LINE, borderWidth: 0.7 });
  p.y = H - 201;
  labelValue(p, "Prepared for", customer.name, M, 150);
  labelValue(p, "Destination", content.destinations, M + 167, 153);
  labelValue(p, "Travel dates", travel || "To be confirmed", M + 337, 165);
  p.y -= 61;
  labelValue(p, "Travellers", [
    content.adults > 0 && `${content.adults} adult${content.adults === 1 ? "" : "s"}`,
    content.childrenAges && `Children: ${content.childrenAges}`,
    content.infants > 0 && `${content.infants} infant${content.infants === 1 ? "" : "s"}`,
  ].filter(Boolean).join(" · ") || "To be confirmed", M, 308);
  labelValue(p, "Valid until", printableDate(content.validUntil), M + 337, 165);
  p.y -= 58;
  if (content.summary) paragraph(p, content.summary, { size: 10, gap: 10 });

  const rows = (title: string, values: { title: string; details: (string | false | undefined)[] }[]) => {
    if (!values.length) return;
    heading(p, title);
    for (const row of values) {
      ensure(p, 41);
      paragraph(p, row.title, { size: 10, color: NAVY, gap: 3 });
      const details = row.details.filter(Boolean).join(" · ");
      if (details) paragraph(p, details, { indent: 10, gap: 5 });
      p.page.drawLine({ start: { x: M, y: p.y + 1 }, end: { x: W - M, y: p.y + 1 }, thickness: 0.5, color: LINE });
      p.y -= 9;
    }
  };
  if (content.services.length) {
    heading(p, "Services covered");
    paragraph(p, content.services.join(" · "));
  }
  rows("Package options", content.options.map((option) => ({
    title: option.name, details: [option.description, option.hotel && `Stay: ${option.hotel}`, option.mealPlan && `Meal plan: ${option.mealPlan}`],
  })));
  rows("Accommodation and meal plan", content.stays.map((stay) => ({
    title: stay.property || "Stay to be confirmed",
    details: [stay.city, optionNames.get(stay.optionId),
      [printableDate(stay.checkIn), printableDate(stay.checkOut)].filter(Boolean).join(" to ") || "Stay dates to be confirmed",
      stay.rooms > 0 && `${stay.rooms} room${stay.rooms === 1 ? "" : "s"}`, stay.roomType, stay.occupancy,
      stay.extraBed, stay.mealPlan && `Meal plan: ${stay.mealPlan}`, stay.notes],
  })));
  rows("Transport and transfers", content.transport.map((leg) => ({
    title: [leg.mode, [leg.from, leg.to].filter(Boolean).join(" to ")].filter(Boolean).join(" · "),
    details: [leg.responsibility, optionNames.get(leg.optionId), printableDate(leg.date), leg.time, leg.time && leg.timeZone, leg.provider,
      leg.passengers && `Passengers: ${leg.passengers}`, leg.details],
  })));
  rows("Day-wise itinerary", content.itinerary.map((day) => ({
    title: `Day ${day.day} · ${day.title || day.city || "Planned day"}`,
    details: [day.city, printableDate(day.date), day.activities, day.transfers && `Transfers: ${day.transfers}`,
      day.stay && `Stay: ${day.stay}`, day.meals && `Meals: ${day.meals}`, day.notes],
  })));
  rows("Optional extras", content.optionalExtras.map((extra) => ({
    title: extra.name, details: [extra.included ? "Included" : "Optional", extra.description],
  })));
  heading(p, "Inclusions");
  list(p, content.inclusions);
  heading(p, "Exclusions");
  list(p, content.exclusions);
  if (content.cancellationTerms) {
    heading(p, "Cancellation terms");
    paragraph(p, content.cancellationTerms);
  }
  if (content.customerNotes) {
    heading(p, "Useful information");
    paragraph(p, content.customerNotes);
  }
  footer(p);
  return doc.save();
}

export async function processQuotePdfJob(jobId: string) {
  const jobs = await collection("documentJobs");
  const job = await jobs.findOneAndUpdate(
    { _id: jobId, status: { $in: ["Queued", "Failed"] }, attempts: { $lt: 2 } },
    {
      $set: { status: "Running", startedAt: now(), updatedAt: now() },
      $inc: { attempts: 1, version: 1 },
    },
    { returnDocument: "after" },
  );
  if (!job) return;
  try {
    const quotes = await collection("quotes"),
      q = await quotes.findOne({ _id: job.quoteId, org: job.org });
    if (!q || !q.snapshot || !["Approved", "Sent"].includes(q.status))
      throw new Error("Approved frozen quotation snapshot is unavailable.");
    const bytes = await buildQuotePdf(await brandedQuoteSnapshot(q.snapshot, q.org)),
      documentId = `quote:${q._id}:v${q.quoteVersion}`,
      hash = createHash("sha256").update(bytes).digest("hex");
    await (
      await collection("documents")
    ).updateOne(
      { _id: documentId },
      {
        $setOnInsert: {
          org: q.org,
          version: 1,
          type: "quote-pdf",
          quoteId: q._id,
          quoteVersion: q.quoteVersion,
          layoutVersion: 2,
          filename: `${q.quoteNumber}-v${q.quoteVersion}.pdf`,
          mime: "application/pdf",
          data: new Binary(bytes),
          size: bytes.length,
          sha256: hash,
          createdAt: now(),
        },
      },
      { upsert: true },
    );
    await quotes.updateOne(
      { _id: q._id },
      {
        $set: {
          pdfStatus: "Ready",
          pdfDocumentId: documentId,
          pdfReadyAt: now(),
          updatedAt: now(),
        },
        $inc: { version: 1 },
      },
    );
    await jobs.updateOne(
      { _id: job._id },
      {
        $set: {
          status: "Succeeded",
          documentId,
          finishedAt: now(),
          updatedAt: now(),
        },
        $inc: { version: 1 },
      },
    );
    const system: Actor = {
      id: "system",
      authId: "system",
      org: q.org,
      name: "System",
      role: "owner",
    };
    await (
      await collection("tasks")
    ).updateOne(
      { _id: `quote:send:${q._id}` },
      {
        $set: {
          org: q.org,
          title: "Send approved quotation",
          assigneeId: q.assigneeId,
          dueAt: new Date(Date.now() + 4 * 3600000).toISOString(),
          status: "To do",
          quoteId: q._id,
          enquiryId: q.enquiryId,
          updatedAt: now(),
        },
        $setOnInsert: { createdAt: now() },
        $inc: { version: 1 },
      },
      { upsert: true },
    );
    await notify(
      system,
      q.assigneeId,
      `quote-pdf-ready:${q._id}:v${q.quoteVersion}`,
      "Approved quotation PDF is ready to send",
      q._id,
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "PDF generation failed";
    await jobs.updateOne(
      { _id: job._id },
      {
        $set: {
          status: "Failed",
          lastError: message,
          finishedAt: now(),
          updatedAt: now(),
        },
        $inc: { version: 1 },
      },
    );
    await (
      await collection("quotes")
    ).updateOne(
      { _id: job.quoteId },
      {
        $set: {
          pdfStatus: "Failed",
          pdfError: "Generation failed. Owner can retry.",
          updatedAt: now(),
        },
        $inc: { version: 1 },
      },
    );
    const q = await (await collection("quotes")).findOne({ _id: job.quoteId });
    if (q) {
      const system: Actor = {
        id: "system",
        authId: "system",
        org: q.org,
        name: "System",
        role: "owner",
      };
      const recipients = new Set([
        q.requesterId,
        ...(
          await (
            await collection("staff")
          )
            .find({ org: q.org, role: "owner", status: "active" })
            .toArray()
        ).map((x) => x._id),
      ]);
      for (const recipient of recipients)
        await notify(
          system,
          recipient,
          `quote-pdf-failed:${q._id}:v${q.quoteVersion}:${job.attempts}`,
          "Quotation PDF generation failed",
          q._id,
        );
    }
    throw e;
  }
}

export async function processQuotePdfJobs() {
  const jobs = await (
    await collection("documentJobs")
  )
    .find({ type: "quote-pdf", status: "Queued", attempts: { $lt: 2 } })
    .sort({ createdAt: 1 })
    .limit(20)
    .toArray();
  let processed = 0;
  for (const job of jobs) {
    try {
      await processQuotePdfJob(job._id);
    } catch {}
    processed++;
  }
  return processed;
}
