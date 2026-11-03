import { auth } from "@/server/auth";
const allowed = new Set(["sign-in/email", "sign-out", "get-session", "change-password"]);
async function handler(req: Request) {
  const path = new URL(req.url).pathname.replace("/api/auth/", "");
  if (!allowed.has(path)) return Response.json({ error: "Not available. Ask the owner for an activation link." }, { status: 403 });
  try {
    const configured = await auth();
    const response = await configured.handler(req);
    if (response.status < 500) return response;
  } catch { /* Return safe wording; never return a connection string. */ }
  return Response.json({ message: "Sign-in is temporarily unavailable because the server cannot complete the database request. Please try again shortly.", code: "SERVICE_UNAVAILABLE" }, { status: 503, headers: { "Retry-After": "10", "Cache-Control": "no-store" } });
}
export const GET = handler;
export const POST = handler;
