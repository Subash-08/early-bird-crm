"use client";

import { useState } from "react";
import { IdCard } from "lucide-react";

type SavedNumbers = { panOnFile: boolean; passportOnFile: boolean };
type DraftNumbers = { pan: string; passportNumber: string; version: number };

export function CustomerDocumentNumbers({ customerId, saved, readOnly = false }: {
  customerId: string;
  saved?: SavedNumbers;
  readOnly?: boolean;
}) {
  const [onFile, setOnFile] = useState(saved);
  const [draft, setDraft] = useState<DraftNumbers | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  async function edit() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch(`/api/crm?resource=customer-numbers&id=${encodeURIComponent(customerId)}`, { cache: "no-store" });
      if (response.status === 403) throw new Error("The Owner or a Sales lead for this customer can edit these numbers.");
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not load document numbers.");
      setDraft(body);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load document numbers.");
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    if (!draft || busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/crm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "customer-numbers", data: { customerId, ...draft } }),
      });
      const body = await response.json();
      if (response.status === 409 || response.status === 403) setDraft(null);
      if (response.status === 409) throw new Error("This customer changed. Reopen the document numbers to try again.");
      if (response.status === 403) throw new Error("You no longer have permission to edit these numbers.");
      if (!response.ok) throw new Error(body.error || "Could not save document numbers.");
      setOnFile(body.result);
      setDraft(null);
      setMessage("Document numbers saved.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save document numbers.");
    } finally {
      setBusy(false);
    }
  }

  return <fieldset className="customer-numbers span" disabled={busy} onKeyDown={(event) => {
    if (event.key === "Enter" && event.target instanceof HTMLInputElement) event.preventDefault();
  }}>
    <legend><IdCard aria-hidden="true" /> Customer document numbers</legend>
    {onFile && <p>PAN {onFile.panOnFile ? "on file" : "not recorded"} · Passport {onFile.passportOnFile ? "on file" : "not recorded"}</p>}
    {draft ? <>
      <div className="customer-number-fields">
        <label className="field">PAN (optional)<input autoComplete="off" maxLength={10} value={draft.pan}
          onChange={(event) => setDraft({ ...draft, pan: event.target.value })} /></label>
        <label className="field">Passport number (optional)<input autoComplete="off" maxLength={24} value={draft.passportNumber}
          onChange={(event) => setDraft({ ...draft, passportNumber: event.target.value })} /></label>
      </div>
      <p>Save these numbers to the customer profile. Leave a field blank to clear it.</p>
      <div className="customer-number-actions">
        <button type="button" className="button secondary" onClick={() => { setDraft(null); setError(""); }}>Cancel</button>
        <button type="button" className="button primary" onClick={() => void save()}>{busy ? "Saving…" : "Save document numbers"}</button>
      </div>
    </> : !readOnly && <button type="button" className="button secondary" onClick={() => void edit()}>{busy ? "Loading…" : "Edit document numbers"}</button>}
    {error && <p className="form-error" role="alert">{error}</p>}
    {message && <p role="status">{message}</p>}
  </fieldset>;
}
