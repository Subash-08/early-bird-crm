import { actor } from "@/server/auth";
import { reportCsv, reportData, reportXlsx } from "@/server/reports";
import { customerRegister, exportCustomerRegister } from "@/server/customer-register";
import { indiaInput } from "@/lib/workspace-time";
import { Readable } from "node:stream";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const failure = (error: unknown) => {
  const message = error instanceof Error ? error.message : "Report failed";
  const status = Number(message.match(/^(401|403|404|429):/)?.[1] || 400);
  return Response.json({ error: message }, { status });
};

export async function GET(request: Request) {
  try {
    const user = await actor(request.headers);
    const url = new URL(request.url);
    if (url.searchParams.get("view") === "register") {
      const filters = Object.fromEntries(url.searchParams);
      const format = filters.format || "json";
      const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
      if (format === "json") return Response.json(await customerRegister(user, filters), { headers });
      if (format !== "xlsx" && format !== "csv") throw new Error("Choose CSV or Excel.");
      if (filters.scope && !["all", "filtered"].includes(filters.scope)) throw new Error("Choose filtered or all records.");
      const stream = await exportCustomerRegister(user, filters, filters.scope === "all", format);
      const stamp = indiaInput(new Date().toISOString()).slice(0, 10);
      return new Response(Readable.toWeb(stream) as ReadableStream, { headers: {
        ...headers,
        "Content-Type": format === "csv" ? "text/csv; charset=utf-8" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="earlybird-customer-register-${stamp}.${format}"`,
      } });
    }
    const report = await reportData(user, {
      from: url.searchParams.get("from") || "",
      to: url.searchParams.get("to") || "",
      staffId: url.searchParams.get("staffId") || "",
      stage: url.searchParams.get("stage") || "",
      source: url.searchParams.get("source") || "",
      destination: url.searchParams.get("destination") || "",
    });
    const format = url.searchParams.get("format") || "json";
    const stamp = new Date().toISOString().slice(0, 10);
    if (format === "csv")
      return new Response(reportCsv(report), {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="earlybird-report-${stamp}.csv"`,
          "Cache-Control": "private, no-store",
        },
      });
    if (format === "xlsx")
      return new Response(await reportXlsx(report), {
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="earlybird-report-${stamp}.xlsx"`,
          "Cache-Control": "private, no-store",
        },
      });
    return Response.json(report, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return failure(error);
  }
}
