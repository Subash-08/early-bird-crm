"use client";
import { useState } from "react";
import { ArrowLeft, ArrowRight, Compass, Plane, UserPlus } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { loginFeedback } from "@/lib/login-feedback";

type Mode = "signin" | "request";

export function Login() {
  const [mode, setMode] = useState<Mode>("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  function changeMode(next: Mode) {
    setMode(next);
    setError("");
    setMessage("");
    setPassword("");
    setConfirm("");
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      if (mode === "request") {
        if (password !== confirm) throw new Error("Passwords do not match.");
        const response = await fetch("/api/crm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "request-access",
            data: { name, email, password },
          }),
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || "Request failed.");
        setMessage(
          "Request sent. Your Owner must choose your role and activate the account before you can sign in.",
        );
        setPassword("");
        setConfirm("");
        return;
      }

      const result = await authClient.signIn.email({
        email,
        password,
        // Make the intent explicit: use the persistent session cookie rather
        // than a browser-session-only cookie.
        rememberMe: true,
      });
      if (result.error) {
        setError(loginFeedback(result.error));
        return;
      }
      // CRM authorization remains a separate required gate after the password check.
      const access = await fetch("/api/crm", { cache: "no-store" });
      if (access.status === 403) {
        await authClient.signOut();
        setError(
          "Your account is waiting for Owner approval or has been made inactive.",
        );
        return;
      }
      if (!access.ok) {
        await authClient.signOut();
        const detail = await access.json().catch(() => ({}));
        throw new Error(detail.error || "Authentication is unavailable.");
      }
      location.reload();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Cannot reach the server. Check your internet connection and try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-art">
        <div className="brand">
          <span className="brand-mark"><Plane /></span><span>EarlyBird</span>
        </div>
        <div>
          <p className="eyebrow">Travel CRM</p>
          <h1>Turn every enquiry<br />into a clear next step.</h1>
          <p>A focused workspace for owners, sales teams and operations staff.</p>
        </div>
        <div className="route-line"><i /><i /><i /></div>
      </section>
      <section className="auth-panel">
        <form className="auth-card" onSubmit={submit}>
          <span className="icon-tile">
            {mode === "signin" ? <Compass /> : <UserPlus />}
          </span>
          <p className="eyebrow">
            {mode === "signin" ? "Welcome back" : "Team access"}
          </p>
          <h2>{mode === "signin" ? "Sign in to your workspace" : "Request an account"}</h2>
          <p>
            {mode === "signin"
              ? "Use the account activated by your agency owner."
              : "Create your password now. The Owner will review your request, assign your role and activate access."}
          </p>
          {mode === "request" && (
            <label>
              Full name
              <input autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} minLength={2} maxLength={160} required />
            </label>
          )}
          <label>
            Email
            <input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
          </label>
          <label>
            Password
            <input type="password" autoComplete={mode === "signin" ? "current-password" : "new-password"} value={password} onChange={(event) => setPassword(event.target.value)} minLength={mode === "request" ? 12 : undefined} maxLength={128} required />
          </label>
          {mode === "request" && (
            <label>
              Confirm password
              <input type="password" autoComplete="new-password" value={confirm} onChange={(event) => setConfirm(event.target.value)} minLength={12} maxLength={128} required />
            </label>
          )}
          {error && <p className="form-error" role="alert">{error}</p>}
          {message && <p className="form-success" role="status">{message}</p>}
          <button className="button primary wide" disabled={busy || Boolean(message)}>
            {busy
              ? mode === "signin" ? "Signing in…" : "Sending request…"
              : mode === "signin" ? "Sign in" : "Request access"}
            <ArrowRight />
          </button>
          <button type="button" className="auth-switch" onClick={() => changeMode(mode === "signin" ? "request" : "signin")}>
            {mode === "signin" ? <UserPlus /> : <ArrowLeft />}
            {mode === "signin" ? "New team member? Request an account" : "Back to sign in"}
          </button>
        </form>
      </section>
    </main>
  );
}
