"use client";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, CheckCircle2, CircleDollarSign, Download, RefreshCw, ShieldCheck, Wallet, X } from "lucide-react";
import { currencySchema, effectiveEntries, entryKinds } from "@/lib/settlement-domain";

type Row = Record<string, any>;
const money = (n = 0, currency = "INR") => new Intl.NumberFormat("en-IN", { style: "currency", currency }).format(n / 100);
const iso = (v: string) => v ? new Date(v).toISOString() : "";
const localNow = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };
const parents: Record<string, string> = { "Supplier payment": "Supplier bill", "Supplier credit": "Supplier bill", "Recovery received": "Recovery expected", "Recovery credit": "Recovery expected", "Refund paid": "Refund approved", "Expense paid": "Expense" };
const help: Record<string, string> = {
  "Supplier bill": "Record the supplier's final invoice, including any cancellation penalty. Add separate invoices only for separate charges.",
  "Supplier payment": "Record money actually paid against an approved supplier bill. Partial payments are welcome.",
  "Supplier credit": "Reduce an unpaid supplier bill using an agreed supplier credit note. This does not record incoming cash.",
  "Recovery expected": "Record money a supplier has agreed to return after being paid. Customer refunds are handled separately.",
  "Recovery received": "Record actual money received against an expected supplier recovery.",
  "Recovery credit": "Record recovery accepted as supplier credit. The credit reference stays in the history; it is not cash received.",
  "Refund approved": "Reserve customer credit for a refund. First apply the agreed cancellation or price adjustment.",
  "Refund paid": "Record an actual refund payment against an approved refund. You can record several instalments.",
  Expense: "Bring an approved driver expense into the financial settlement once.",
  "Expense paid": "Record reimbursement of an approved expense.",
  Reversal: "Correct a posted mistake without deleting history. Linked payments must be reversed before their original balance.",
};
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="settlement-field"><span>{label}</span>{children}</label>; }
async function fileData(file: File | undefined) {
  if (!file) return {};
  if (file.size > 1500000) throw new Error("Choose a file of 1.5 MB or less.");
  const base64 = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(",")[1]); reader.onerror = () => reject(new Error("Could not read attachment.")); reader.readAsDataURL(file); });
  return { evidenceBase64: base64, evidenceName: file.name, evidenceType: file.type };
}

export function Settlements({ s, q, reload, fail }: { s: Row; q: string; reload: () => Promise<void>; fail: (message: string) => void }) {
  const [selectedId, setSelectedId] = useState(""), [data, setData] = useState<Row | null>(null), [busy, setBusy] = useState(false), [loading, setLoading] = useState(false), [notice, setNotice] = useState("");
  const [tab, setTab] = useState("Overview"), [form, setForm] = useState<"money" | "change" | "">("");
  const [reason, setReason] = useState("");
  const load = useCallback(async () => {
    if (!selectedId) return;
    setLoading(true);
    try { const r = await fetch(`/api/settlements/${selectedId}`, { cache: "no-store" }); const j = await r.json(); if (!r.ok) throw new Error(j.error); setData(j); }
    catch (e) { setData(null); fail((e as Error).message); } finally { setLoading(false); }
  }, [selectedId, fail]);
  useEffect(() => { void load(); }, [load]);
  const run = async (action: string, payload: Row) => {
    setBusy(true); setNotice("");
    try { const r = await fetch("/api/crm", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, data: payload }) }); const j = await r.json(); if (!r.ok) throw new Error(j.error); await reload(); await load(); setNotice("Saved successfully."); setForm(""); return true; }
    catch (e) { fail((e as Error).message); return false; } finally { setBusy(false); }
  };
  const owner = s.actor.role === "owner";
  const canSubmit = !owner || s.staff.some((p: Row) => p.role === "owner" && p.status === "active" && p._id !== s.actor.id);
  if (!selectedId) return <section>
    <div className="operations-hero"><div><p className="eyebrow">Money & changes</p><h2>Finish every trip with clear balances.</h2><p>Supplier bills, refunds and booking changes, all linked to the right booking.</p></div><Wallet size={38}/></div>
    <div className="settlement-bookings">{s.bookings.filter((b: Row) => `${b.bookingNumber} ${b.destination}`.toLowerCase().includes(q.toLowerCase())).map((b: Row) => <button className="panel settlement-booking" key={b._id} onClick={() => { setData(null); setSelectedId(b._id); }}><div><strong>{b.bookingNumber}</strong><p>{b.destination}</p></div><span className="badge">{b.financialClosed ? "Financially closed" : b.status}</span><span>{money(b.totalMinor, b.currency)}</span></button>)}</div>
    {!s.bookings.length && <div className="empty-state"><Wallet/><h3>No bookings yet</h3><p>Accept a quotation and create its booking first.</p></div>}
  </section>;
  const b = data?.booking, t = data?.totals;
  return <section>
    <button className="button secondary" onClick={() => { setSelectedId(""); setForm(""); }}><ArrowLeft size={16}/> All bookings</button>
    {loading && <p role="status">Refreshing settlement…</p>}
    {!data || !b ? <button className="button secondary" onClick={load}>Retry loading</button> : <>
      <div className="section-title"><div><p className="eyebrow">{b.bookingNumber}</p><h2>{b.destination || "Booking settlement"}</h2><p>{b.financialClosed ? "Financially closed" : "Settlement open"} · {b.currency}</p></div><button className="button secondary" onClick={load} disabled={busy || loading}><RefreshCw size={16}/> Refresh</button></div>
      {notice && <p className="settlement-notice" role="status"><CheckCircle2 size={18}/>{notice}</p>}
      <div className="settlement-metrics">{[["Customer paid", t.receivedMinor], ["Still to collect", t.outstandingMinor], ["Refund still to pay", t.refundPendingMinor], ["Customer credit", t.customerCreditMinor]].map(([label, value]) => <article className="panel" key={String(label)}><small>{label}</small><strong>{money(Number(value), b.currency)}</strong></article>)}</div>
      <nav className="settlement-tabs" aria-label="Settlement sections">{["Overview", "Transactions", "Booking changes"].map(name => <button key={name} className={tab === name ? "button primary" : "button secondary"} onClick={() => { setTab(name); setForm(""); }}>{name}</button>)}</nav>
      {!canSubmit && <p className="settlement-help"><ShieldCheck size={18}/> With one Owner, ask Sales to submit financial entries and booking changes. You then approve or reject them here.</p>}
      {tab === "Overview" && <>
        <div className="panel settlement-section"><h3>What needs attention</h3>{data.blockers.length ? <ul>{data.blockers.map((item: string) => <li key={item}>{item}</li>)}</ul> : <p>All balances and required checks are resolved.</p>}
          {owner && <div className="settlement-actions"><Field label={b.financialClosed ? "Reason to reopen" : "Closing note"}><input value={reason} onChange={e => setReason(e.target.value)} placeholder="Explain the final review"/></Field><button className="button primary" disabled={busy || reason.trim().length < 3 || (!b.financialClosed && !!data.blockers.length)} onClick={() => run("settlement-close", { bookingId: b._id, version: b.version, reopen: !!b.financialClosed, reason })}>{b.financialClosed ? "Reopen settlement" : "Close financial settlement"}</button></div>}
        </div>
        <div className="panel settlement-section"><h3>Supplier, refund and expense balances</h3><p>Amounts below keep their original currency. Different currencies are never added together.</p>{t.obligations.length ? t.obligations.map((r: Row) => <div className="settlement-row" key={r._id}><div><strong>{r.kind}</strong><p>{r.reference}</p><small>{r.dueAt ? `Due ${new Date(r.dueAt).toLocaleDateString()}` : "No due date"}{r.dueAt && r.dueAt < new Date().toISOString() && r.remainingMinor > 0 ? " · Overdue" : ""}</small></div><span>{money(r.remainingMinor, r.currency)} remaining</span></div>) : <p>No approved balances yet.</p>}</div>
        {owner && <div className="panel settlement-section"><h3>{b.financialClosed ? "Final result" : "Estimated result — settlement still open"}</h3><p>Estimated margin: {money(t.estimatedMarginMinor, b.currency)}</p><p>Recorded net cost: {money(t.actualCostMinor, b.currency)}</p><p>Rate / settlement difference: {money(t.exchangeDifferenceMinor, b.currency)}</p>{b.financialClosed && <strong>Final profit: {money(t.finalProfitMinor, b.currency)}</strong>}<p className="muted">Accepted supplier recovery credits reduce cost but are not cash receipts. Credits remain traceable in Transactions.</p></div>}
      </>}
      {tab === "Transactions" && <>
        {!b.financialClosed && canSubmit && <button className="button primary" onClick={() => setForm("money")}><CircleDollarSign size={16}/> Record a financial entry</button>}
        {form === "money" && <MoneyForm key={b._id} b={b} s={s} entries={data.entries} busy={busy} run={run} fail={fail} close={() => setForm("")}/>}
        {!data.entries.length && <div className="empty-state"><Wallet/><h3>No financial entries yet</h3><p>Start with a supplier bill or an approved driver expense.</p></div>}
        {data.entries.map((e: Row) => <article className="panel settlement-section" key={e._id}><div className="section-title"><div><h3>{e.kind} · {money(e.amountMinor, e.currency)}</h3><p>{e.reference} · {new Date(e.occurredAt).toLocaleDateString()} · {e.status}</p></div>{e.evidenceName && <a className="button secondary" href={`/api/documents/settlement/${encodeURIComponent(e._id)}`} target="_blank" rel="noreferrer"><Download size={16}/> Evidence</a>}</div><p>{e.reason}</p><small>Submitted by {e.submittedByName}{e.reviewedByName ? ` · Reviewed by ${e.reviewedByName}` : ""}</small>{e.decisionReason && <p>{e.decisionReason}</p>}{owner && e.status === "Pending review" && e.submittedById !== s.actor.id && <Review busy={busy} approve="Approve & record" submit={(decision, reason) => run("settlement-decide", { id: e._id, version: e.version, decision: decision ? "Posted" : "Rejected", reason })}/>}</article>)}
      </>}
      {tab === "Booking changes" && <>
        {!b.financialClosed && b.status !== "Cancelled" && canSubmit && <button className="button primary" onClick={() => setForm("change")}>Request a change or cancellation</button>}
        {form === "change" && <ChangeForm b={b} s={s} busy={busy} run={run} close={() => setForm("")}/>}
        {!data.changes.length && <div className="empty-state"><ShieldCheck/><h3>No changes requested</h3><p>The accepted quotation remains the original agreement.</p></div>}
        {data.changes.map((c: Row) => <article className="panel settlement-section" key={c._id}><h3>{c.kind} · {c.status}</h3><p>{c.description}</p><p>{money(c.previousTotalMinor, b.currency)} → {money(c.newTotalMinor, b.currency)}</p><p>Used services / deductions: {c.serviceUsage}</p><p>Supplier impact: {c.supplierImpact}</p><p>Reason: {c.reason}</p>{c.decisionReason && <p>Owner review: {c.decisionReason}</p>}
          {owner && c.status === "Pending review" && c.submittedById !== s.actor.id && <Review busy={busy} approve="Approve change" submit={(yes, reason) => run("change-decide", { id: c._id, version: c.version, decision: yes ? "Approved" : "Rejected", reason })}/>}
          {c.status === "Awaiting customer" && <Review busy={busy} approve="Customer accepted" reject="Customer declined" placeholder="Customer message or call reference" submit={(yes, reference) => run("change-confirm", { id: c._id, version: c.version, accepted: yes, reference, confirmedAt: new Date().toISOString() })}/>}
          {c.status === "Applied" && <a className="button secondary" href={`/api/documents/adjustment/${encodeURIComponent(c._id)}`} target="_blank" rel="noreferrer"><Download size={16}/> Open printable adjustment</a>}
        </article>)}
      </>}
    </>}
  </section>;
}

function Review({ busy, approve, reject = "Reject", placeholder = "Reason for this decision", submit }: { busy: boolean; approve: string; reject?: string; placeholder?: string; submit: (yes: boolean, reason: string) => Promise<boolean> }) {
  const [reason, setReason] = useState("");
  return <div className="settlement-actions"><Field label={placeholder}><input value={reason} onChange={e => setReason(e.target.value)}/></Field><button className="button secondary" disabled={busy || reason.trim().length < 3} onClick={() => submit(false, reason)}>{reject}</button><button className="button primary" disabled={busy || reason.trim().length < 3} onClick={() => submit(true, reason)}>{approve}</button></div>;
}
function MoneyForm({ b, s, entries, busy, run, close, fail }: { b: Row; s: Row; entries: Row[]; busy: boolean; run: (action: string, data: Row) => Promise<boolean>; close: () => void; fail: (message: string) => void }) {
  const [p, setP] = useState<Row>({ bookingId: b._id, commandId: crypto.randomUUID(), kind: "Supplier bill", amount: "", currency: b.currency, targetId: "", arrangementId: "", expenseRequestId: "", reference: "", reason: "", occurredAt: localNow(), dueAt: "", method: "Bank transfer", rate: "1", rateSource: "", rateDate: "" });
  const [file, setFile] = useState<File>();
  const change = (key: string, value: any) => setP(v => ({ ...v, [key]: value }));
  const live = effectiveEntries(entries), targets = live.filter(e => p.kind === "Reversal" || e.kind === parents[p.kind]);
  const expenses = s.operationsRequests.filter((e: Row) => e.bookingId === b._id && e.type === "Expense" && e.status === "Approved");
  return <form className="panel settlement-section" onSubmit={async event => { event.preventDefault(); try { await run("settlement-submit", { ...p, occurredAt: iso(p.occurredAt), dueAt: iso(p.dueAt), ...await fileData(file) }); } catch (e) { fail((e as Error).message); } }}>
    <div className="section-title"><h3>Record a financial entry</h3><button type="button" className="icon-button" aria-label="Close form" onClick={close}><X/></button></div>
    <Field label="What would you like to record?"><select value={p.kind} onChange={e => setP(v => ({ ...v, kind: e.target.value, targetId: "", arrangementId: "", expenseRequestId: "", amount: "" }))}>{entryKinds.map(k => <option key={k}>{k}</option>)}</select></Field><p className="settlement-help">{help[p.kind]}</p>
    <div className="settlement-form-grid">
      {(parents[p.kind] || p.kind === "Reversal") && <Field label="Original approved entry"><select required value={p.targetId} onChange={event => { const target = targets.find(e => e._id === event.target.value); setP(v => ({ ...v, targetId: event.target.value, currency: target?.currency || b.currency, rate: target?.rate || "1", rateDate: target?.rateDate || "", rateSource: target?.rateSource || "", ...(p.kind === "Reversal" ? { amount: String((target?.amountMinor || 0) / 100) } : {}) })); }}><option value="">Choose an entry</option>{targets.map(e => <option value={e._id} key={e._id}>{e.kind}: {e.reference} · {money(e.amountMinor, e.currency)}</option>)}</select></Field>}
      {["Supplier bill", "Recovery expected"].includes(p.kind) && <Field label="Supplier service"><select required value={p.arrangementId} onChange={e => change("arrangementId", e.target.value)}><option value="">Choose a service</option>{s.arrangements.filter((a: Row) => a.bookingId === b._id && a.responsibility === "Agency arranged" && a.supplierId).map((a: Row) => <option key={a._id} value={a._id}>{a.title || a.type || a.serviceType} · {a.currency}</option>)}</select></Field>}
      {p.kind === "Expense" && <Field label="Approved driver expense"><select required value={p.expenseRequestId} onChange={event => { const e = expenses.find((x: Row) => x._id === event.target.value); setP(v => ({ ...v, expenseRequestId: event.target.value, amount: String((e?.amountMinor || 0) / 100), currency: e?.currency || b.currency })); }}><option value="">Choose an expense</option>{expenses.map((e: Row) => <option key={e._id} value={e._id}>{e.description} · {money(e.amountMinor, e.currency)}</option>)}</select></Field>}
      <Field label="Amount"><input required inputMode="decimal" value={p.amount} onChange={e => change("amount", e.target.value)} placeholder="0.00"/></Field>
      <Field label="Currency"><select value={p.currency} onChange={e => change("currency", e.target.value)}>{currencySchema.options.map(c => <option key={c}>{c}</option>)}</select></Field>
      <Field label="Invoice / transaction / credit reference"><input required value={p.reference} onChange={e => change("reference", e.target.value)}/></Field>
      <Field label="Recorded transaction date"><input required type="datetime-local" value={p.occurredAt} onChange={e => change("occurredAt", e.target.value)}/></Field>
      <Field label="Follow-up due date (optional)"><input type="datetime-local" value={p.dueAt} onChange={e => change("dueAt", e.target.value)}/></Field>
      <Field label="Payment method"><select value={p.method} onChange={e => change("method", e.target.value)}>{["Bank transfer", "UPI", "Cash", "Card", "Cheque", "Supplier credit", "Other"].map(m => <option key={m}>{m}</option>)}</select></Field>
      {p.currency !== b.currency && <><Field label={`1 ${p.currency} equals how many ${b.currency}?`}><input required inputMode="decimal" value={p.rate} onChange={e => change("rate", e.target.value)}/></Field><Field label="Rate source"><input required value={p.rateSource} onChange={e => change("rateSource", e.target.value)} placeholder="Bank statement / agreed rate"/></Field><Field label="Rate date"><input required type="date" value={p.rateDate} onChange={e => change("rateDate", e.target.value)}/></Field></>}
      <Field label="Private evidence (optional, JPG / PNG / PDF, max 1.5 MB)"><input type="file" accept="image/jpeg,image/png,application/pdf" onChange={e => setFile(e.target.files?.[0])}/></Field>
    </div>
    <Field label="Reason or notes"><textarea required minLength={3} value={p.reason} onChange={e => change("reason", e.target.value)}/></Field><button className="button primary" disabled={busy}>{busy ? "Saving…" : "Send to Owner for review"}</button>
  </form>;
}
function ChangeForm({ b, s, busy, run, close }: { b: Row; s: Row; busy: boolean; run: (action: string, data: Row) => Promise<boolean>; close: () => void }) {
  const [p, setP] = useState<Row>({ bookingId: b._id, commandId: crypto.randomUUID(), kind: "Amendment", reason: "", description: "", newTotal: String(b.totalMinor / 100), effectiveDate: localNow().slice(0,10), arrangementIds: [], segmentIds: [], travellerIds: [], serviceUsage: "", supplierImpact: "", newStart: "", newEnd: "" });
  const change = (key: string, value: any) => setP(v => ({ ...v, [key]: value }));
  return <form className="panel settlement-section" onSubmit={e => { e.preventDefault(); void run("change-submit", p); }}><div className="section-title"><h3>Request a booking change</h3><button type="button" className="icon-button" aria-label="Close form" onClick={close}><X/></button></div><p>Owner approval comes first, then customer confirmation. The original quotation and invoice stay in history.</p><div className="settlement-form-grid">
    <Field label="Change type"><select value={p.kind} onChange={e => change("kind", e.target.value)}>{["Amendment", "Partial cancellation", "Full cancellation"].map(k => <option key={k}>{k}</option>)}</select></Field>
    <Field label={`Revised customer total (${b.currency}), after deductions`}><input required inputMode="decimal" value={p.newTotal} onChange={e => change("newTotal", e.target.value)}/></Field>
    <Field label="Effective date"><input required type="date" value={p.effectiveDate} onChange={e => change("effectiveDate", e.target.value)}/></Field>
    {p.kind === "Amendment" && <><Field label="New start date (optional)"><input type="date" value={p.newStart} onChange={e => change("newStart", e.target.value)}/></Field><Field label="New end date (optional)"><input type="date" value={p.newEnd} onChange={e => change("newEnd", e.target.value)}/></Field></>}
  </div>
  {[["arrangementIds", "Affected supplier services", s.arrangements.filter((r: Row) => r.bookingId === b._id).map((r: Row) => ({ id: r._id, label: r.title || r.type || r.serviceType }))], ["segmentIds", "Affected trip legs", s.tripSegments.filter((r: Row) => r.bookingId === b._id).map((r: Row) => ({ id: r._id, label: r.title || `${r.from} to ${r.to}` }))], ["travellerIds", "Affected travellers", (b.travellers || []).filter((r: Row) => !r.cancelled).map((r: Row) => ({ id: r.id, label: r.name }))]].map(([key, label, rows]) => <fieldset key={String(key)} className="settlement-checks"><legend>{String(label)}</legend>{(rows as Row[]).length ? (rows as Row[]).map(r => <label key={r.id}><input type="checkbox" checked={p[String(key)].includes(r.id)} onChange={e => change(String(key), e.target.checked ? [...p[String(key)], r.id] : p[String(key)].filter((id: string) => id !== r.id))}/>{r.label}</label>) : <small>No items recorded.</small>}</fieldset>)}
  {[ ["description", "What changes? (customer-facing)"], ["reason", "Why is this change needed?"], ["serviceUsage", "Services already used and customer deductions"], ["supplierImpact", "Supplier penalties / recovery expected / confirmation needed"] ].map(([key, label]) => <Field key={key} label={label}><textarea required minLength={3} value={p[key]} onChange={e => change(key, e.target.value)}/></Field>)}
  <button className="button primary" disabled={busy}>{busy ? "Saving…" : "Send change to Owner"}</button></form>;
}
