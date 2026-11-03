import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";

const PAGE = { width: 595.28, height: 841.89 };
const MARGIN = 46;
const NAVY = rgb(0.06, 0.16, 0.25);
const BLUE = rgb(0.08, 0.47, 0.65);
const INK = rgb(0.1, 0.17, 0.23);
const MUTED = rgb(0.39, 0.47, 0.52);
const LINE = rgb(0.86, 0.9, 0.91);
const SAND = rgb(0.97, 0.95, 0.91);

type Ctx = { doc: PDFDocument; page: PDFPage; font: PDFFont; y: number };
const dateTime = (value: string, timeZone = "Asia/Kolkata") =>
  value
    ? new Intl.DateTimeFormat("en-IN", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone,
      }).format(new Date(value))
    : "Not scheduled";

function draw(
  ctx: Ctx,
  value: unknown,
  x: number,
  y: number,
  size = 9,
  color = INK,
) {
  ctx.page.drawText(String(value || "-"), {
    x,
    y,
    size,
    font: ctx.font,
    color,
  });
}
function lines(ctx: Ctx, value: unknown, width: number, size = 9) {
  const words = String(value || "-").split(/\s+/);
  const result: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (current && ctx.font.widthOfTextAtSize(next, size) > width) {
      result.push(current);
      current = word;
    } else current = next;
  }
  if (current) result.push(current);
  return result;
}
function paragraph(
  ctx: Ctx,
  value: unknown,
  x: number,
  width: number,
  size = 9,
  color = INK,
) {
  for (const line of lines(ctx, value, width, size)) {
    draw(ctx, line, x, ctx.y, size, color);
    ctx.y -= size + 4;
  }
}
function heading(ctx: Ctx, value: string) {
  ctx.y -= 8;
  draw(ctx, value, MARGIN, ctx.y, 12, NAVY);
  ctx.y -= 15;
  ctx.page.drawLine({
    start: { x: MARGIN, y: ctx.y },
    end: { x: PAGE.width - MARGIN, y: ctx.y },
    thickness: 1,
    color: LINE,
  });
  ctx.y -= 18;
}
function ensure(ctx: Ctx, needed = 100) {
  if (ctx.y > needed) return;
  ctx.page = ctx.doc.addPage([PAGE.width, PAGE.height]);
  ctx.y = PAGE.height - 58;
}
function footer(ctx: Ctx, bookingNumber: string) {
  for (const page of ctx.doc.getPages()) {
    page.drawText("EarlyBird Travel CRM", {
      x: MARGIN,
      y: 26,
      size: 8,
      font: ctx.font,
      color: MUTED,
    });
    const label = `${bookingNumber}  |  Operational document`;
    page.drawText(label, {
      x: PAGE.width - MARGIN - ctx.font.widthOfTextAtSize(label, 8),
      y: 26,
      size: 8,
      font: ctx.font,
      color: MUTED,
    });
  }
}

export async function buildOperationsPdf(snapshot: any) {
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
  const page = doc.addPage([PAGE.width, PAGE.height]);
  const ctx: Ctx = { doc, page, font, y: PAGE.height - 52 };
  page.drawRectangle({
    x: 0,
    y: PAGE.height - 154,
    width: PAGE.width,
    height: 154,
    color: NAVY,
  });
  draw(ctx, "EARLYBIRD", MARGIN, PAGE.height - 48, 10, rgb(0.45, 0.78, 0.88));
  draw(ctx, snapshot.kind, MARGIN, PAGE.height - 82, 24, rgb(1, 1, 1));
  draw(
    ctx,
    snapshot.bookingNumber,
    MARGIN,
    PAGE.height - 108,
    11,
    rgb(0.82, 0.88, 0.92),
  );
  page.drawRectangle({
    x: PAGE.width - MARGIN - 118,
    y: PAGE.height - 96,
    width: 118,
    height: 31,
    color: BLUE,
  });
  draw(
    ctx,
    String(snapshot.status || "READY").toUpperCase(),
    PAGE.width - MARGIN - 100,
    PAGE.height - 85,
    8,
    rgb(1, 1, 1),
  );
  ctx.y = PAGE.height - 188;

  draw(ctx, "TRAVELLER / CUSTOMER", MARGIN, ctx.y, 7, MUTED);
  ctx.y -= 18;
  paragraph(ctx, snapshot.customerName, MARGIN, 220, 11);
  paragraph(ctx, snapshot.customerContact, MARGIN, 220, 8, MUTED);
  const rightY = PAGE.height - 188;
  draw(ctx, "DESTINATION", 350, rightY, 7, MUTED);
  draw(ctx, snapshot.destination, 350, rightY - 16, 10);
  draw(ctx, "TRAVEL DATES", 350, rightY - 43, 7, MUTED);
  draw(
    ctx,
    `${snapshot.serviceStart || "Pending"} to ${snapshot.serviceEnd || "Pending"}`,
    350,
    rightY - 59,
    9,
  );
  ctx.y = Math.min(ctx.y, PAGE.height - 282);

  if (snapshot.kind === "Driver trip sheet") {
    heading(ctx, "Assigned route");
    for (const segment of snapshot.segments || []) {
      ensure(ctx, 150);
      ctx.page.drawRectangle({
        x: MARGIN,
        y: ctx.y - 82,
        width: PAGE.width - MARGIN * 2,
        height: 96,
        color: SAND,
      });
      draw(ctx, segment.title, MARGIN + 16, ctx.y - 10, 11, NAVY);
      draw(
        ctx,
        `${segment.from || "Pickup"} to ${segment.to || "Drop"}`,
        MARGIN + 16,
        ctx.y - 31,
        9,
      );
      draw(
        ctx,
        dateTime(segment.startAt, segment.timeZone),
        MARGIN + 16,
        ctx.y - 50,
        8,
        MUTED,
      );
      draw(
        ctx,
        `${segment.vehicle || "Vehicle pending"} | ${segment.driver || "Driver pending"}`,
        MARGIN + 16,
        ctx.y - 69,
        8,
        MUTED,
      );
      ctx.y -= 112;
    }
    heading(ctx, "Assistance notes");
    paragraph(
      ctx,
      snapshot.notes || "No special assistance notes.",
      MARGIN,
      PAGE.width - MARGIN * 2,
      9,
    );
  } else if (snapshot.kind === "Passenger manifest") {
    heading(ctx, "Passenger list");
    (snapshot.travellers || []).forEach((traveller: any, index: number) => {
      ensure(ctx, 95);
      draw(ctx, `${index + 1}. ${traveller.name}`, MARGIN, ctx.y, 10, NAVY);
      draw(
        ctx,
        `${traveller.type}${traveller.lead ? " | Lead traveller" : ""}`,
        310,
        ctx.y,
        8,
        MUTED,
      );
      ctx.y -= 22;
    });
  } else {
    heading(
      ctx,
      snapshot.kind === "Hotel / supplier voucher"
        ? "Confirmed service"
        : "Day-wise operations plan",
    );
    for (const arrangement of snapshot.arrangements || []) {
      ensure(ctx, 120);
      draw(ctx, arrangement.title, MARGIN, ctx.y, 10, NAVY);
      draw(
        ctx,
        `${arrangement.type} | ${arrangement.confirmationStatus}`,
        330,
        ctx.y,
        8,
        MUTED,
      );
      ctx.y -= 18;
      paragraph(
        ctx,
        arrangement.details ||
          arrangement.location ||
          "Details recorded in CRM.",
        MARGIN,
        PAGE.width - MARGIN * 2,
        8,
        MUTED,
      );
      if (arrangement.confirmationReference) {
        draw(
          ctx,
          `Confirmation: ${arrangement.confirmationReference}`,
          MARGIN,
          ctx.y,
          8,
        );
        ctx.y -= 18;
      }
      ctx.y -= 8;
    }
  }

  ensure(ctx, 120);
  heading(ctx, "Important");
  paragraph(
    ctx,
    "Only services explicitly marked Confirmed are confirmed. Times may change due to local conditions; contact the assigned coordinator for any exception. This document contains no supplier cost or customer billing information.",
    MARGIN,
    PAGE.width - MARGIN * 2,
    8,
    MUTED,
  );
  footer(ctx, snapshot.bookingNumber);
  doc.setTitle(`${snapshot.kind} ${snapshot.bookingNumber}`);
  doc.setAuthor("EarlyBird Travel CRM");
  doc.setCreationDate(new Date(snapshot.createdAt || Date.now()));
  return doc.save();
}
