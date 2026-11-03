import { readFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { Binary } from "mongodb";
import { PDFDocument, rgb, type PDFPage, type PDFFont } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { collection } from "./db";
import { notify } from "./crm";
import type { Actor } from "@/lib/domain";
import { displayMinor } from "@/lib/quote-domain";

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
  BLUE = rgb(0.086, 0.466, 0.655),
  NAVY = rgb(0.063, 0.165, 0.263),
  SAND = rgb(0.965, 0.945, 0.91),
  CORAL = rgb(0.937, 0.463, 0.373),
  LINE = rgb(0.86, 0.9, 0.91);
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
  ensure(p, lines.length * (size + 4) + (opts.gap || 8));
  for (const line of lines) {
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
    ensure(p, lines.length * 13 + 4);
    p.page.drawCircle({ x: M + 3, y: p.y + 3, size: 2, color: BLUE });
    lines.forEach((line, i) => drawText(p, line, M + 15, p.y - i * 13, 9));
    p.y -= lines.length * 13 + 5;
  }
  p.y -= 5;
}

export async function buildQuotePdf(snapshot: any) {
  const doc = await PDFDocument.create(),
    approved = new Date(snapshot.approvedAt);
  doc.setTitle(`${snapshot.quoteNumber} v${snapshot.quoteVersion}`);
  doc.setAuthor("EarlyBird Travel");
  doc.setSubject("Approved travel quotation");
  doc.setCreator("EarlyBird Travel CRM");
  doc.setProducer("EarlyBird Travel CRM");
  doc.setCreationDate(approved);
  doc.setModificationDate(approved);
  const p = {} as Painter;
  p.doc = doc;
  p.fonts = await fonts(doc);
  p.pages = [];
  addPage(p, true);
  p.page.drawRectangle({
    x: 0,
    y: H - 190,
    width: W,
    height: 190,
    color: NAVY,
  });
  p.page.drawRectangle({
    x: W - 155,
    y: H - 190,
    width: 155,
    height: 190,
    color: BLUE,
    opacity: 0.35,
  });
  drawText(p, "EARLYBIRD", M, H - 58, 20, rgb(1, 1, 1));
  drawText(p, "TRAVEL QUOTATION", M, H - 89, 8, rgb(0.63, 0.84, 0.91));
  drawText(
    p,
    snapshot.content.title || "Travel proposal",
    M,
    H - 126,
    24,
    rgb(1, 1, 1),
  );
  drawText(
    p,
    `${snapshot.quoteNumber}  |  Version ${snapshot.quoteVersion}`,
    M,
    H - 153,
    9,
    rgb(0.84, 0.91, 0.94),
  );
  p.y = H - 224;
  labelValue(p, "Prepared for", snapshot.customer.name, M, 150);
  labelValue(
    p,
    "Contact",
    [snapshot.customer.phone, snapshot.customer.email]
      .filter(Boolean)
      .join(" / "),
    M + 175,
    155,
  );
  labelValue(p, "Valid until", snapshot.content.validUntil, M + 355, 150);
  p.y -= 64;
  if (snapshot.content.summary)
    paragraph(p, snapshot.content.summary, { size: 10, gap: 14 });
  heading(p, "Trip overview");
  labelValue(p, "Destination", snapshot.content.destinations, M, 150);
  labelValue(
    p,
    "Travel dates",
    snapshot.content.dateScope === "Exact"
      ? `${snapshot.content.startDate} to ${snapshot.content.endDate}`
      : snapshot.content.dateLabel,
    M + 175,
    155,
  );
  labelValue(
    p,
    "Travellers",
    `${snapshot.content.adults} adult(s)${snapshot.content.childrenAges ? `, children: ${snapshot.content.childrenAges}` : ""}${snapshot.content.infants ? `, ${snapshot.content.infants} infant(s)` : ""}`,
    M + 355,
    150,
  );
  p.y -= 64;
  labelValue(p, "Services", snapshot.content.services.join(", "), M, W - M * 2);
  p.y -= 54;
  heading(p, "Package options");
  for (const o of snapshot.content.options) {
    ensure(p, 98);
    p.page.drawRectangle({
      x: M,
      y: p.y - 75,
      width: W - M * 2,
      height: 82,
      color: SAND,
      borderColor: LINE,
      borderWidth: 0.7,
    });
    drawText(p, o.name, M + 14, p.y - 19, 12, NAVY);
    drawText(
      p,
      displayMinor(o.totalMinor, snapshot.content.currency),
      W - M - 132,
      p.y - 19,
      12,
      BLUE,
    );
    drawText(p, `${o.priceBasis} x ${o.quantity}`, M + 14, p.y - 37, 8, MUTED);
    const desc = [
      o.description,
      o.hotel && `Hotel: ${o.hotel}`,
      o.mealPlan && `Meal plan: ${o.mealPlan}`,
      o.notes,
    ]
      .filter(Boolean)
      .join(" | ");
    const lines = wrap(p, desc, W - M * 2 - 28, 8).slice(0, 2);
    lines.forEach((line, i) =>
      drawText(p, line, M + 14, p.y - 54 - i * 11, 8, INK),
    );
    p.y -= 94;
  }
  if (snapshot.content.optionalExtras.length) {
    heading(p, "Optional extras");
    for (const x of snapshot.content.optionalExtras)
      paragraph(
        p,
        `${x.name} - ${displayMinor(Number(x.priceMinor || 0), snapshot.content.currency)} (${x.priceBasis})${x.description ? `: ${x.description}` : ""}`,
        { indent: 10, gap: 4 },
      );
  }
  if (snapshot.content.itinerary.length) {
    heading(p, "Day-wise itinerary");
    for (const day of snapshot.content.itinerary) {
      ensure(p, 54);
      drawText(
        p,
        `DAY ${day.day}${day.date ? ` - ${day.date}` : ""}`,
        M,
        p.y,
        7,
        BLUE,
      );
      p.y -= 17;
      drawText(p, day.title || day.city || "Planned day", M, p.y, 11, NAVY);
      p.y -= 17;
      const details = [
        day.city && `Place: ${day.city}`,
        day.activities,
        day.transfers && `Transfers: ${day.transfers}`,
        day.stay && `Stay: ${day.stay}`,
        day.meals && `Meals: ${day.meals}`,
        day.notes,
      ]
        .filter(Boolean)
        .join(" | ");
      paragraph(p, details, { gap: 10 });
    }
  }
  if (snapshot.content.stays.length) {
    heading(p, "Accommodation");
    for (const stay of snapshot.content.stays)
      paragraph(
        p,
        `${stay.city}: ${stay.property} | ${stay.checkIn} to ${stay.checkOut} | ${stay.rooms} room(s), ${stay.roomType || "category to be confirmed"} | ${stay.mealPlan || "meal plan not specified"}${stay.notes ? ` | ${stay.notes}` : ""}`,
        { gap: 7 },
      );
  }
  if (snapshot.content.transport.length) {
    heading(p, "Transport and coordination");
    for (const leg of snapshot.content.transport)
      paragraph(
        p,
        `${leg.mode}: ${leg.from} to ${leg.to}${leg.date ? ` on ${leg.date}` : ""}${leg.time ? ` at ${leg.time}${leg.timeZone ? ` ${leg.timeZone}` : ""}` : ""} | ${leg.responsibility}${leg.responsibility === "Customer booked" ? " - not charged by agency" : ""}${leg.details ? ` | ${leg.details}` : ""}`,
        { gap: 7 },
      );
  }
  heading(p, "Package inclusions");
  list(p, snapshot.content.inclusions);
  heading(p, "Package exclusions");
  list(p, snapshot.content.exclusions);
  heading(p, "Payment schedule");
  paragraph(
    p,
    `Advance required: ${displayMinor(Number(snapshot.content.advanceAmountMinor || 0), snapshot.content.currency)}. ${snapshot.content.advanceDue}`,
  );
  paragraph(p, snapshot.content.balanceTerms);
  heading(p, "Cancellation terms");
  paragraph(p, snapshot.content.cancellationTerms);
  if (snapshot.content.customerNotes) {
    heading(p, "Important notes");
    paragraph(p, snapshot.content.customerNotes);
  }
  if (p.y > 62)
    drawText(
      p,
      `Approved ${snapshot.approvedAt.slice(0, 10)} by ${snapshot.approvedBy}`,
      M,
      p.y,
      7,
      MUTED,
    );
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
    const bytes = await buildQuotePdf(q.snapshot),
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
