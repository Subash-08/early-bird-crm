import { describe, expect, it } from "vitest";
import { loginFeedback } from "../src/lib/login-feedback";
describe("Sign-in error feedback", () => {
  it("does not label a database outage as a bad password", () => {
    expect(loginFeedback({ status: 503, message: "Service unavailable" })).toContain("password has not been checked");
    expect(loginFeedback({ status: 401 })).toContain("Email or password is incorrect");
    expect(loginFeedback({ status: 429 })).toContain("Wait a minute");
  });
});
