import { ZodError } from "zod";

const OUTDATED_FORM_MESSAGE =
  "This form contains outdated data. Refresh the page and try again.";

export function publicErrorMessage(error: unknown) {
  if (error instanceof ZodError) {
    const messages = error.issues.map((issue) =>
      issue.code === "unrecognized_keys" ? OUTDATED_FORM_MESSAGE : issue.message,
    );
    return [...new Set(messages)].join(" ") || "Check the form fields and try again.";
  }
  return error instanceof Error ? error.message : "Request failed";
}
