export function loginFeedback(error: { status?: number; message?: string } | null | undefined) {
  if (!error) return "";
  if (error.status === 429) return "Too many sign-in attempts. Wait a minute, then try again.";
  if ((error.status || 0) >= 500 || /unavailable|network|fetch|timed? ?out|server selection/i.test(error.message || "")) return "The server could not reach the database. Your password has not been checked. Wait a moment and try again; if this continues, ask the Owner to check the connection.";
  return "Email or password is incorrect, or the account is inactive.";
}
