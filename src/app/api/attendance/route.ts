import { actor, limit } from "@/server/auth";
import { attendanceOverview, checkIn, checkOut, decideAttendanceCorrection, requestAttendanceCorrection, saveAttendancePolicy } from "@/server/attendance";
import { publicErrorMessage } from "@/lib/public-error";
import { removeAttendanceHoliday, requestOffsiteAttendance, saveAttendanceHoliday } from "@/server/attendance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function failure(error: unknown) {
  const message = publicErrorMessage(error);
  const status = Number(message.match(/^(401|403|404|409|429):/)?.[1] || 400);
  if (message.includes("E11000")) return Response.json({ error: "This attendance action was already saved. Refresh the page." }, { status: 409 });
  return Response.json({ error: message.replace(/^\d{3}:\s*/, "") }, { status });
}

export async function GET(request: Request) {
  try {
    const a = await actor(request.headers);
    const url = new URL(request.url);
    return Response.json(await attendanceOverview(a, { date: url.searchParams.get("date") || "", staffId: url.searchParams.get("staffId") || "" }), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return failure(error); }
}

export async function POST(request: Request) {
  try {
    if (request.headers.get("origin") !== new URL(process.env.BETTER_AUTH_URL || request.url).origin) throw new Error("403: Invalid request origin.");
    const a = await actor(request.headers);
    const body = await request.json();
    let result: unknown;
    switch (body.action) {
      case "check-in": await limit(`attendance:${a.id}`); result = await checkIn(a, body.data); break;
      case "check-out": await limit(`attendance:${a.id}`); result = await checkOut(a, body.data); break;
      case "correction": result = await requestAttendanceCorrection(a, body.data); break;
      case "offsite": result = await requestOffsiteAttendance(a, body.data); break;
      case "holiday-save": result = await saveAttendanceHoliday(a, body.data); break;
      case "holiday-remove": result = await removeAttendanceHoliday(a, body.data); break;
      case "correction-decision": result = await decideAttendanceCorrection(a, body.data); break;
      case "policy": result = await saveAttendancePolicy(a, body.data); break;
      default: throw new Error("Unknown attendance action.");
    }
    return Response.json({ ok: true, result });
  } catch (error) { return failure(error); }
}
