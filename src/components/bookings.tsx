"use client";

import { useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Banknote,
  BedDouble,
  Check,
  ClipboardCheck,
  Download,
  Copy,
  Calculator,
  FileCheck2,
  FileText,
  Plus,
  ReceiptText,
  ShieldCheck,
  Users,
  WalletCards,
  X,
} from "lucide-react";
import { calculateInvoice } from "@/lib/invoice-domain";

type Row = Record<string, any> & { _id: string; version: number };
const api = async (action: string, data: any = {}) => {
  const response = await fetch("/api/crm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, data }),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Request failed");
  return result.result;
};
const money = (minor = 0, currency = "INR") =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency }).format(
    Number(minor) / 100,
  );
const local = (value = "") =>
  value ? new Date(value).toISOString().slice(0, 16) : "";
const iso = (value = "") => (value ? new Date(value).toISOString() : "");

export function Bookings({
  s,
  q,
  reload,
  fail,
}: {
  s: any;
  q: string;
  reload: () => Promise<void>;
  fail: (message: string) => void;
}) {
  const [selected, setSelected] = useState<Row | null>(null);
  const [busy, setBusy] = useState(false);
  const converted = new Set(s.bookings.map((booking: Row) => booking.quoteId));
  const accepted =
    s.actor.role === "operations"
      ? []
      : s.quotes.filter(
          (quote: Row) =>
            quote.status === "Accepted" && !converted.has(quote._id),
        );
  const rows = s.bookings.filter((booking: Row) =>
    [booking.bookingNumber, booking.destination, booking.status]
      .join(" ")
      .toLowerCase()
      .includes(q.toLowerCase()),
  );
  async function run(action: string, data: any, close = true) {
    setBusy(true);
    try {
      await api(action, data);
      if (close) setSelected(null);
      await reload();
      return true;
    } catch (error) {
      fail((error as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="booking-hero">
        <div>
          <p className="eyebrow">Accepted trips</p>
          <h2>Verify the advance, then release clear work.</h2>
          <p>
            Money, booking and supplier confirmation stay separate so the team
            always knows what is truly complete.
          </p>
        </div>
        <span className="booking-lock">
          <ShieldCheck /> Owner verifies every payment
        </span>
      </div>
      {accepted.length > 0 && (
        <section className="panel conversion-panel">
          <div>
            <b>
              {accepted.length} accepted quotation
              {accepted.length === 1 ? " is" : "s are"} ready
            </b>
            <p>Create each booking once from its frozen accepted option.</p>
          </div>
          <div>
            {accepted.map((quote: Row) => (
              <button
                className="button primary"
                disabled={busy}
                key={quote._id}
                onClick={() =>
                  run("booking-create", { quoteId: quote._id }, false)
                }
              >
                <Plus /> Create {quote.quoteNumber}
              </button>
            ))}
          </div>
        </section>
      )}
      <div className="quote-metrics">
        <Metric
          label="Awaiting advance"
          value={
            rows.filter((row: Row) => row.status === "Awaiting advance").length
          }
        />
        <Metric
          label="Payment review"
          value={
            s.payments.filter(
              (row: Row) => row.status === "Pending verification",
            ).length
          }
        />
        <Metric
          label="Ready to release"
          value={
            rows.filter(
              (row: Row) => row.status === "Ready for operations release",
            ).length
          }
        />
        <Metric
          label="With operations"
          value={rows.filter((row: Row) => row.operationsReleased).length}
        />
      </div>
      <section className="panel booking-list">
        {rows.map((booking: Row) => (
          <button
            className="booking-card"
            key={booking._id}
            onClick={() => setSelected(booking)}
          >
            <span className="booking-icon">
              <ClipboardCheck />
            </span>
            <div>
              <b>{booking.bookingNumber}</b>
              <small>
                {booking.destination || "Destination not set"} ·{" "}
                {booking.serviceStart || "Dates pending"}
              </small>
            </div>
            <Status value={booking.status} />
            {s.actor.role !== "operations" && (
              <strong>{money(booking.totalMinor, booking.currency)}</strong>
            )}
            <ArrowRight />
          </button>
        ))}
        {!rows.length && (
          <div className="booking-empty">
            <ClipboardCheck />
            <b>No bookings yet</b>
            <p>An accepted quotation can be converted from this page.</p>
          </div>
        )}
      </section>
      {selected && (
        <BookingDetail
          key={`${selected._id}:${selected.version}`}
          s={s}
          booking={selected}
          busy={busy}
          close={() => setSelected(null)}
          run={run}
        />
      )}
    </>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <article>
      <span>{label}</span>
      <b>{value}</b>
    </article>
  );
}
function Status({ value }: { value: string }) {
  return (
    <span
      className={`badge ${String(value).toLowerCase().replaceAll(" ", "-")}`}
    >
      {value}
    </span>
  );
}

function BookingDetail({ s, booking, busy, close, run }: any) {
  const [tab, setTab] = useState<
    "summary" | "people" | "invoice" | "payments" | "operations"
  >("summary");
  const payments = s.payments.filter(
    (payment: Row) => payment.bookingId === booking._id,
  );
  const invoices = s.invoices.filter(
    (invoice: Row) => invoice.bookingId === booking._id,
  );
  const invoice =
    invoices.find((item: Row) => item.status === "Issued") || invoices[0];
  const operations = s.staff.filter(
    (person: Row) => person.role === "operations" && person.status === "active",
  );
  return (
    <Modal
      title={`${booking.bookingNumber} · ${booking.destination}`}
      close={close}
    >
      <div className="booking-detail-head">
        <div>
          <Status value={booking.status} />{" "}
          {booking.financialException && <Status value="Payment review" />}
        </div>
        <div className="booking-tabs">
          <button
            className={tab === "summary" ? "active" : ""}
            onClick={() => setTab("summary")}
          >
            <FileText /> Summary
          </button>
          <button
            className={tab === "people" ? "active" : ""}
            onClick={() => setTab("people")}
          >
            <Users /> People
          </button>
          {s.actor.role !== "operations" && (
            <button
              className={tab === "invoice" ? "active" : ""}
              onClick={() => setTab("invoice")}
            >
              <ReceiptText /> Invoice
            </button>
          )}
          {s.actor.role !== "operations" && (
            <button
              className={tab === "payments" ? "active" : ""}
              onClick={() => setTab("payments")}
            >
              <WalletCards /> Payments
            </button>
          )}
          <button
            className={tab === "operations" ? "active" : ""}
            onClick={() => setTab("operations")}
          >
            <ClipboardCheck /> Operations
          </button>
        </div>
      </div>
      {tab === "summary" && (
        <Summary
          s={s}
          booking={booking}
          invoice={invoice}
          busy={busy}
          run={run}
        />
      )}
      {tab === "people" && (
        <People s={s} booking={booking} busy={busy} run={run} />
      )}
      {tab === "invoice" && s.actor.role !== "operations" && (
        <InvoiceEditor s={s} booking={booking} invoice={invoice} busy={busy} run={run} />
      )}
      {tab === "payments" && s.actor.role !== "operations" && (
        <Payments
          s={s}
          booking={booking}
          rows={payments}
          busy={busy}
          run={run}
        />
      )}
      {tab === "operations" && (
        <Operations
          s={s}
          booking={booking}
          staff={operations}
          busy={busy}
          run={run}
        />
      )}
    </Modal>
  );
}

function Summary({ s, booking, invoice, busy, run }: any) {
  const [voidReason, setVoidReason] = useState("");
  const option = booking.agreementSnapshot?.selectedOption;
  return (
    <div className="booking-summary">
      <section className="booking-route">
        <div>
          <span>Service dates</span>
          <b>
            {booking.serviceStart || "Indicative"} →{" "}
            {booking.serviceEnd || "To be confirmed"}
          </b>
        </div>
        <div>
          <span>Accepted option</span>
          <b>{option?.name || "Approved package"}</b>
        </div>
        <div>
          <span>Lead traveller</span>
          <b>
            {booking.travellers?.find((person: Row) => person.lead)?.name ||
              "Needs details"}
          </b>
        </div>
      </section>
      {s.actor.role !== "operations" && (
        <>
          <div className="money-grid">
            <article>
              <span>Booking value</span>
              <b>{money(booking.totalMinor, booking.currency)}</b>
            </article>
            <article>
              <span>Required advance</span>
              <b>{money(booking.requiredAdvanceMinor, booking.currency)}</b>
            </article>
            <article>
              <span>Verified</span>
              <b>{money(booking.verifiedPaidMinor, booking.currency)}</b>
            </article>
            <article>
              <span>Outstanding</span>
              <b>{money(booking.outstandingMinor, booking.currency)}</b>
            </article>
          </div>
          {booking.unappliedCreditMinor > 0 && (
            <div className="warning-box">
              <b>Unapplied customer credit</b>
              <p>
                {money(booking.unappliedCreditMinor, booking.currency)} is above
                the booking value and needs Owner review.
              </p>
            </div>
          )}
          <section className="document-strip">
            <div>
              <ReceiptText />
              <span>
                <b>{invoice?.invoiceNumber || "Invoice draft"}</b>
                <small>{invoice?.status || "Draft"}</small>
              </span>
            </div>
            <div>
              {invoice?.documentId && (
                <a
                  className="button secondary"
                  href={`/api/documents/finance/${invoice.documentId}`}
                  target="_blank"
                >
                  <Download /> Open invoice
                </a>
              )}
              {s.actor.role === "owner" && invoice?.status === "Draft" && (
                <button
                  className="button primary"
                  disabled={busy}
                  onClick={() =>
                    run("invoice-issue", {
                      bookingId: booking._id,
                      bookingVersion: booking.version,
                    })
                  }
                >
                  <FileCheck2 /> Issue invoice
                </button>
              )}
            </div>
          </section>
          {s.actor.role === "owner" &&
            invoice?.status === "Issued" &&
            booking.verifiedPaidMinor === 0 && (
              <details className="payment-reverse">
                <summary>Void and create a correction invoice</summary>
                <div className="inline-action">
                  <input
                    value={voidReason}
                    onChange={(event) => setVoidReason(event.target.value)}
                    placeholder="Required correction reason"
                  />
                  <button
                    className="button secondary"
                    disabled={busy || voidReason.trim().length < 3}
                    onClick={() =>
                      run("invoice-void", {
                        invoiceId: invoice._id,
                        version: invoice.version,
                        reason: voidReason,
                      })
                    }
                  >
                    Void invoice
                  </button>
                </div>
              </details>
            )}
          <p className="truth-note">
            <ShieldCheck /> Accepted quote, verified cash and supplier
            confirmation are intentionally shown as separate facts.
          </p>
        </>
      )}
    </div>
  );
}

function People({ s, booking, busy, run }: any) {
  const [data, setData] = useState({
    payerName: booking.payer?.name || "",
    payerPhone: booking.payer?.phone || "",
    payerEmail: booking.payer?.email || "",
    billingAddress: booking.payer?.billingAddress || "",
    deliveryAddress: booking.payer?.deliveryAddress || "",
    taxId: booking.payer?.taxId || "",
    placeOfSupply: booking.payer?.placeOfSupply || "",
    buyerStateCode: booking.payer?.stateCode || "",
    travellers: booking.travellers || [],
    advanceDueAt: local(booking.advanceDueAt),
    balanceDueAt: local(booking.balanceDueAt),
    paymentNote: booking.paymentNote || "",
    coordinatorNotes: booking.coordinatorNotes || "",
  });
  if (s.actor.role === "operations") {
    const lead = booking.travellers?.find((person: Row) => person.lead);
    return (
      <div className="ops-contact">
        <Users />
        <div>
          <span>Lead traveller</span>
          <b>{lead?.name || "Not added"}</b>
          <p>{lead?.phone || "Contact through coordinator"}</p>
        </div>
      </div>
    );
  }
  function updateTraveller(index: number, patch: any) {
    setData({
      ...data,
      travellers: data.travellers.map((traveller: Row, item: number) =>
        item === index
          ? { ...traveller, ...patch }
          : patch.lead
            ? { ...traveller, lead: false }
            : traveller,
      ),
    });
  }
  return (
    <form
      className="form-grid booking-form"
      onSubmit={(event) => {
        event.preventDefault();
        run("booking-save", {
          bookingId: booking._id,
          version: booking.version,
          details: {
            ...data,
            advanceDueAt: iso(data.advanceDueAt),
            balanceDueAt: iso(data.balanceDueAt),
          },
        });
      }}
    >
      <h3 className="span">Payer and billing contact</h3>
      <Field
        label="Payer name"
        value={data.payerName}
        set={(value: string) => setData({ ...data, payerName: value })}
        required
      />
      <Field
        label="Phone"
        value={data.payerPhone}
        set={(value: string) => setData({ ...data, payerPhone: value })}
      />
      <Field
        label="Email"
        type="email"
        value={data.payerEmail}
        set={(value: string) => setData({ ...data, payerEmail: value })}
      />
      <Field
        label="Tax/GST ID (optional)"
        value={data.taxId}
        set={(value: string) => setData({ ...data, taxId: value })}
      />
      <Field
        label="Billing address"
        value={data.billingAddress}
        set={(value: string) => setData({ ...data, billingAddress: value })}
        area
        span
      />
      <Field
        label="Service / delivery address"
        value={data.deliveryAddress}
        set={(value: string) => setData({ ...data, deliveryAddress: value })}
        area
        span
      />
      <Field
        label="Place of supply"
        value={data.placeOfSupply}
        set={(value: string) => setData({ ...data, placeOfSupply: value })}
      />
      <Field
        label="Buyer state code"
        value={data.buyerStateCode}
        set={(value: string) => setData({ ...data, buyerStateCode: value })}
      />
      <h3 className="span">Travellers</h3>
      <p className="span helper">
        Expected: {booking.expectedTravellers?.adults || 0} adult(s),{" "}
        {booking.expectedTravellers?.childrenAges || "no children listed"},{" "}
        {booking.expectedTravellers?.infants || 0} infant(s). Add only known
        names; do not invent details.
      </p>
      <div className="traveller-list span">
        {data.travellers.map((traveller: Row, index: number) => (
          <div className="traveller-row" key={traveller.id}>
            <input
              value={traveller.name}
              onChange={(event) =>
                updateTraveller(index, { name: event.target.value })
              }
              placeholder="Traveller name"
            />
            <select
              value={traveller.type}
              onChange={(event) =>
                updateTraveller(index, { type: event.target.value })
              }
            >
              <option>Adult</option>
              <option>Child</option>
              <option>Infant</option>
            </select>
            <input
              value={traveller.phone}
              onChange={(event) =>
                updateTraveller(index, { phone: event.target.value })
              }
              placeholder="Phone (optional)"
            />
            <label>
              <input
                type="radio"
                name="lead"
                checked={traveller.lead}
                onChange={() => updateTraveller(index, { lead: true })}
              />{" "}
              Lead
            </label>
            {data.travellers.length > 1 && (
              <button
                type="button"
                onClick={() =>
                  setData({
                    ...data,
                    travellers: data.travellers.filter(
                      (_: Row, item: number) => item !== index,
                    ),
                  })
                }
              >
                <X />
              </button>
            )}
          </div>
        ))}
        <button
          className="text-button"
          type="button"
          onClick={() =>
            setData({
              ...data,
              travellers: [
                ...data.travellers,
                {
                  id: crypto.randomUUID(),
                  name: "",
                  type: "Adult",
                  lead: false,
                  dateOfBirth: "",
                  nationality: "",
                  phone: "",
                  notes: "",
                },
              ],
            })
          }
        >
          <Plus /> Add traveller
        </button>
      </div>
      <Field
        label="Advance due"
        type="datetime-local"
        value={data.advanceDueAt}
        set={(value: string) => setData({ ...data, advanceDueAt: value })}
      />
      <Field
        label="Balance due"
        type="datetime-local"
        value={data.balanceDueAt}
        set={(value: string) => setData({ ...data, balanceDueAt: value })}
      />
      <Field
        label="Coordinator notes"
        value={data.coordinatorNotes}
        set={(value: string) => setData({ ...data, coordinatorNotes: value })}
        area
        span
      />
      <Field
        label="Customer payment note (optional)"
        value={data.paymentNote}
        set={(value: string) => setData({ ...data, paymentNote: value })}
        area
        span
      />
      <Foot busy={busy} text="Save booking details" />
    </form>
  );
}

function InvoiceEditor({ s, booking, invoice, busy, run }: any) {
  const normalize = (line: Row) => line.kind ? {
    id: line.id || crypto.randomUUID(), kind: line.kind, hsnCode: line.hsnCode || "",
    description: line.description || "", quantity: line.quantityNumber ?? line.quantity ?? 1,
    unitPrice: line.unitPriceMinor !== undefined ? Number(line.unitPriceMinor) / 100 : line.unitPrice ?? Number(line.totalMinor || 0) / 100,
    gstRate: Number(line.gstRate || 0),
  } : {
    id: crypto.randomUUID(), kind: "Charge", hsnCode: "998552", description: line.description || "Travel services",
    quantity: 1, unitPrice: Number(line.totalMinor || booking.totalMinor) / 100, gstRate: 0,
  };
  const [data, setData] = useState({
    taxMode: invoice?.taxMode || "No GST",
    placeOfSupply: invoice?.placeOfSupply || booking.payer?.placeOfSupply || "",
    buyerStateCode: invoice?.buyerStateCode || booking.payer?.stateCode || "",
    dueDate: invoice?.dueDate || (booking.balanceDueAt ? String(booking.balanceDueAt).slice(0, 10) : ""),
    tcsRate: Number(invoice?.tcsRate || 0),
    copyLabels: (invoice?.copyLabels || s.invoiceTemplate?.copyLabels || ["Customer copy"]).join(", "),
    lines: (invoice?.lines || []).map(normalize),
  });
  const updateLine = (index: number, patch: any) => setData({ ...data, lines: data.lines.map((line: any, item: number) => item === index ? { ...line, ...patch } : line) });
  let totals: any = null;
  let calculationError = "";
  try { totals = calculateInvoice(data.lines, data.taxMode as any, data.tcsRate, s.invoiceTemplate?.roundTaxToRupee ?? true); }
  catch (error) { calculationError = (error as Error).message; }
  if (!invoice) return <div className="booking-empty"><ReceiptText /><b>Invoice draft is missing</b><p>Refresh the booking or contact the Owner.</p></div>;
  if (invoice.status !== "Draft") return (
    <div className="issued-invoice-card"><FileCheck2 /><div><b>{invoice.invoiceNumber}</b><p>This invoice is locked. It contains {invoice.snapshot?.copyLabels?.length || 1} labelled print copy/copies with the same invoice number.</p></div><a className="button secondary" href={`/api/documents/finance/${invoice.documentId}`} target="_blank"><Download /> Open printable PDF</a></div>
  );
  if (s.actor.role !== "owner") return <div className="warning-box"><b>Owner review required</b><p>Sales can complete payer and billing details. Only the Owner edits tax lines and issues the invoice.</p></div>;
  return (
    <form className="invoice-editor" onSubmit={(event) => {
      event.preventDefault();
      run("invoice-draft-save", {
        invoiceId: invoice._id, version: invoice.version, bookingId: booking._id,
        taxMode: data.taxMode, placeOfSupply: data.placeOfSupply, buyerStateCode: data.buyerStateCode,
        dueDate: data.dueDate, tcsRate: Number(data.tcsRate),
        copyLabels: data.copyLabels.split(",").map((item: string) => item.trim()).filter(Boolean).slice(0, 6),
        lines: data.lines.map((line: any) => ({ ...line, quantity: String(line.quantity), unitPrice: String(line.unitPrice), gstRate: Number(line.gstRate) })),
      });
    }}>
      <div className="invoice-editor-intro"><div><h3>Invoice draft</h3><p>Add charge rows for money and note rows for travel information. Save before issuing.</p></div><span><Calculator /> Must equal {money(booking.totalMinor, booking.currency)}</span></div>
      <div className="invoice-meta-grid">
        <label><span>Tax method</span><select value={data.taxMode} onChange={(event) => setData({ ...data, taxMode: event.target.value })}><option>CGST + SGST</option><option>IGST</option><option>No GST</option></select></label>
        <label><span>Place of supply</span><input value={data.placeOfSupply} onChange={(event) => setData({ ...data, placeOfSupply: event.target.value })} /></label>
        <label><span>State code</span><input value={data.buyerStateCode} onChange={(event) => setData({ ...data, buyerStateCode: event.target.value })} /></label>
        <label><span>Due date</span><input type="date" value={data.dueDate} onChange={(event) => setData({ ...data, dueDate: event.target.value })} /></label>
        <label><span>TCS %</span><input type="number" min="0" max="100" step="0.01" value={data.tcsRate} onChange={(event) => setData({ ...data, tcsRate: Number(event.target.value) })} /></label>
        <label className="copy-label-field"><span><Copy /> Print-copy labels</span><input value={data.copyLabels} onChange={(event) => setData({ ...data, copyLabels: event.target.value })} /><small>Comma separated. Same invoice number and data.</small></label>
      </div>
      <div className="invoice-line-head"><span>Type</span><span>HSN/SAC</span><span>Description</span><span>Qty</span><span>Unit price</span><span>GST %</span><span /></div>
      <div className="invoice-lines">
        {data.lines.map((line: any, index: number) => <div className={`invoice-line ${line.kind.toLowerCase()}`} key={line.id}>
          <select value={line.kind} onChange={(event) => updateLine(index, { kind: event.target.value })}><option>Charge</option><option>Note</option></select>
          <input disabled={line.kind === "Note"} value={line.hsnCode} onChange={(event) => updateLine(index, { hsnCode: event.target.value })} />
          <textarea required value={line.description} onChange={(event) => updateLine(index, { description: event.target.value })} />
          <input disabled={line.kind === "Note"} type="number" min="0.01" step="0.01" value={line.quantity} onChange={(event) => updateLine(index, { quantity: event.target.value })} />
          <input disabled={line.kind === "Note"} type="number" min="0" step="0.01" value={line.unitPrice} onChange={(event) => updateLine(index, { unitPrice: event.target.value })} />
          <input disabled={line.kind === "Note" || data.taxMode === "No GST"} type="number" min="0" max="100" step="0.01" value={line.gstRate} onChange={(event) => updateLine(index, { gstRate: Number(event.target.value) })} />
          <button type="button" aria-label="Remove invoice line" disabled={data.lines.length === 1} onClick={() => setData({ ...data, lines: data.lines.filter((_: any, item: number) => item !== index) })}><X /></button>
        </div>)}
      </div>
      <div className="invoice-add-actions"><button type="button" className="button secondary" onClick={() => setData({ ...data, lines: [...data.lines, { id: crypto.randomUUID(), kind: "Charge", hsnCode: "998552", description: "", quantity: 1, unitPrice: 0, gstRate: 0 }] })}><Plus /> Add charge</button><button type="button" className="button secondary" onClick={() => setData({ ...data, lines: [...data.lines, { id: crypto.randomUUID(), kind: "Note", hsnCode: "", description: "", quantity: 0, unitPrice: 0, gstRate: 0 }] })}><FileText /> Add note</button></div>
      {calculationError ? <div className="warning-box"><b>Check invoice rows</b><p>{calculationError}</p></div> : <div className="invoice-totals"><span>Taxable <b>{money(totals.taxableMinor, booking.currency)}</b></span><span>GST <b>{money(totals.totalGstMinor, booking.currency)}</b></span><span>TCS <b>{money(totals.tcsMinor, booking.currency)}</b></span><span className={totals.grandTotalMinor === booking.totalMinor ? "match" : "mismatch"}>Grand total <b>{money(totals.grandTotalMinor, booking.currency)}</b></span></div>}
      {totals && totals.grandTotalMinor !== booking.totalMinor && <div className="warning-box"><b>Total does not match booking</b><p>Adjust charge rows until the invoice equals {money(booking.totalMinor, booking.currency)}. If the agreed price changed, use the approved booking-change workflow.</p></div>}
      <div className="invoice-editor-foot"><button className="button primary" disabled={busy || !totals || totals.grandTotalMinor !== booking.totalMinor}><Check /> Save invoice draft</button><small>GST and TCS settings must be approved by your accountant before live use.</small></div>
    </form>
  );
}

function Payments({ s, booking, rows, busy, run }: any) {
  const [show, setShow] = useState(false);
  const [amend, setAmend] = useState(false);
  return (
    <div className="payment-workspace">
      <div className="section-actions">
        <p>
          Evidence is never treated as verified cash until Owner approves it.
        </p>
        <button className="button primary" onClick={() => setShow(!show)}>
          <Plus /> Record payment
        </button>
      </div>
      {show && (
        <PaymentForm
          booking={booking}
          busy={busy}
          submit={async (data: any) => {
            if (await run("payment-submit", data)) setShow(false);
          }}
        />
      )}
      <div className="payment-list">
        {rows.map((payment: Row) => (
          <PaymentRow
            key={payment._id}
            s={s}
            booking={booking}
            payment={payment}
            busy={busy}
            run={run}
          />
        ))}
        {!rows.length && (
          <div className="booking-empty">
            <Banknote />
            <b>No payment submitted</b>
            <p>The booking remains Awaiting advance.</p>
          </div>
        )}
      </div>
      {s.actor.role === "owner" && (
        <section className="advance-amend">
          <button className="text-button" onClick={() => setAmend(!amend)}>
            Amend required advance
          </button>
          {amend && (
            <AdvanceAmend
              booking={booking}
              busy={busy}
              submit={(data: any) => run("booking-advance-amend", data)}
            />
          )}
        </section>
      )}
    </div>
  );
}

function PaymentForm({ booking, busy, submit }: any) {
  const [data, setData] = useState({
    bookingId: booking._id,
    amount: "",
    currency: booking.currency,
    receivedAt: local(new Date().toISOString()),
    method: "Bank transfer",
    reference: "",
    payerName: booking.payer?.name || "",
    note: "",
    evidenceName: "",
    evidenceType: "",
    evidenceBase64: "",
  });
  async function file(file?: File) {
    if (!file) return;
    if (file.size > 1_500_000)
      throw new Error("Evidence file must be 1.5 MB or smaller.");
    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (let index = 0; index < bytes.length; index += 8192)
      binary += String.fromCharCode(...bytes.subarray(index, index + 8192));
    setData({
      ...data,
      evidenceName: file.name,
      evidenceType: file.type,
      evidenceBase64: btoa(binary),
    });
  }
  return (
    <form
      className="form-grid payment-form"
      onSubmit={(event) => {
        event.preventDefault();
        submit({ ...data, receivedAt: iso(data.receivedAt) });
      }}
    >
      <Field
        label="Amount"
        type="number"
        min="0.01"
        step="0.01"
        value={data.amount}
        set={(value: string) => setData({ ...data, amount: value })}
        required
      />
      <Field
        label="Currency"
        value={data.currency}
        set={(value: string) =>
          setData({ ...data, currency: value.toUpperCase() })
        }
        required
      />
      <Field
        label="Received date"
        type="datetime-local"
        value={data.receivedAt}
        set={(value: string) => setData({ ...data, receivedAt: value })}
        required
      />
      <Select
        label="Method"
        value={data.method}
        set={(value: string) => setData({ ...data, method: value })}
        options={["Bank transfer", "UPI", "Card", "Cash", "Cheque", "Other"]}
      />
      <Field
        label="Transaction reference"
        value={data.reference}
        set={(value: string) => setData({ ...data, reference: value })}
      />
      <Field
        label="Payer name"
        value={data.payerName}
        set={(value: string) => setData({ ...data, payerName: value })}
        required
      />
      <label className="field span">
        <span>Private evidence (optional, JPG/PNG/PDF, max 1.5 MB)</span>
        <input
          type="file"
          accept="image/jpeg,image/png,application/pdf"
          onChange={(event) =>
            file(event.target.files?.[0]).catch((error) => alert(error.message))
          }
        />
        <small>{data.evidenceName}</small>
      </label>
      <Field
        label="Payment note"
        value={data.note}
        set={(value: string) => setData({ ...data, note: value })}
        area
        span
      />
      <Foot busy={busy} text="Submit for verification" />
    </form>
  );
}

function PaymentRow({ s, booking, payment, busy, run }: any) {
  const [reason, setReason] = useState("");
  return (
    <article className="payment-row">
      <div className="payment-amount">
        <b>{money(payment.amountMinor, payment.currency)}</b>
        <small>
          {payment.method} ·{" "}
          {new Date(payment.receivedAt).toLocaleDateString("en-IN")}
        </small>
      </div>
      <div>
        <Status value={payment.status} />
        <small>{payment.reference || "Evidence attached"}</small>
      </div>
      <div className="payment-links">
        {payment.evidenceId && (
          <a
            href={`/api/documents/payment-evidence/${payment.evidenceId}`}
            target="_blank"
          >
            <Download /> Evidence
          </a>
        )}
        {payment.receiptDocumentId && (
          <a
            href={`/api/documents/finance/${payment.receiptDocumentId}`}
            target="_blank"
          >
            <ReceiptText /> Receipt
          </a>
        )}
      </div>
      {s.actor.role === "owner" &&
        payment.status === "Pending verification" && (
          <div className="payment-review">
            <input
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Reason required for rejection"
            />
            <button
              className="button primary"
              disabled={busy}
              onClick={() =>
                run("payment-decision", {
                  paymentId: payment._id,
                  version: payment.version,
                  decision: "Verified",
                  reason,
                })
              }
            >
              <Check /> Verify
            </button>
            <button
              className="button secondary"
              disabled={busy || !reason.trim()}
              onClick={() =>
                run("payment-decision", {
                  paymentId: payment._id,
                  version: payment.version,
                  decision: "Rejected",
                  reason,
                })
              }
            >
              <X /> Reject
            </button>
          </div>
        )}
      {s.actor.role === "owner" && payment.status === "Verified" && (
        <details className="payment-reverse">
          <summary>Reverse verified payment</summary>
          <input
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Required correction reason"
          />
          <button
            disabled={busy || reason.trim().length < 3}
            onClick={() =>
              run("payment-reverse", {
                paymentId: payment._id,
                version: payment.version,
                reason,
              })
            }
          >
            Record reversal
          </button>
        </details>
      )}
      {payment.status === "Rejected" && (
        <p className="rejection-note">{payment.verificationReason}</p>
      )}
      {payment.status === "Verified" && booking.unappliedCreditMinor > 0 && (
        <small>Booking has unapplied credit requiring Owner review.</small>
      )}
    </article>
  );
}

function AdvanceAmend({ booking, busy, submit }: any) {
  const [amount, setAmount] = useState(
    String(booking.requiredAdvanceMinor / 100),
  );
  const [reason, setReason] = useState("");
  return (
    <form
      className="inline-action"
      onSubmit={(event) => {
        event.preventDefault();
        submit({
          bookingId: booking._id,
          version: booking.version,
          amount,
          reason,
        });
      }}
    >
      <input
        type="number"
        min="0"
        step="0.01"
        value={amount}
        onChange={(event) => setAmount(event.target.value)}
      />
      <input
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        placeholder="Why terms changed"
      />
      <button
        className="button secondary"
        disabled={busy || reason.trim().length < 3}
      >
        Save amendment
      </button>
    </form>
  );
}

function Operations({ s, booking, staff, busy, run }: any) {
  const [selected, setSelected] = useState<string[]>(
    booking.operationsAssigneeIds || [],
  );
  const [reason, setReason] = useState("");
  if (booking.operationsReleased) {
    return (
      <div className="operations-board">
        <div className="release-banner">
          <Check />
          <div>
            <b>Operations released</b>
            <p>
              Inventory is still pending until each supplier/service is actually
              confirmed.
            </p>
          </div>
        </div>
        {booking.operationsChecklist.map((item: Row) => (
          <div className="checklist-row" key={item.id}>
            <span className="task-check">
              <Check />
            </span>
            <div>
              <b>{item.label}</b>
              <small>{item.status} · Confirmation not assumed</small>
            </div>
          </div>
        ))}
      </div>
    );
  }
  if (s.actor.role !== "owner")
    return (
      <div className="booking-empty">
        <ClipboardCheck />
        <b>Not released yet</b>
        <p>Owner will release work after invoice and advance review.</p>
      </div>
    );
  const advanceMet =
    booking.verifiedPaidMinor >= booking.requiredAdvanceMinor &&
    booking.requiredAdvanceMinor > 0;
  return (
    <form
      className="release-form"
      onSubmit={(event) => {
        event.preventDefault();
        run("booking-release", {
          bookingId: booking._id,
          version: booking.version,
          operationsAssigneeIds: selected,
          overrideReason: reason,
        });
      }}
    >
      <div className={advanceMet ? "release-ready" : "warning-box"}>
        {advanceMet ? <ShieldCheck /> : <AlertTriangle />}
        <div>
          <b>
            {advanceMet ? "Advance threshold met" : "Owner exception required"}
          </b>
          <p>
            {advanceMet
              ? "Choose the Operations staff who will receive the initial service checklist."
              : "Verified advance is insufficient or zero. Explain why work may start."}
          </p>
        </div>
      </div>
      <h3>Assign Operations staff</h3>
      <div className="staff-checks">
        {staff.map((person: Row) => (
          <label key={person._id}>
            <input
              type="checkbox"
              checked={selected.includes(person._id)}
              onChange={(event) =>
                setSelected(
                  event.target.checked
                    ? [...selected, person._id]
                    : selected.filter((id) => id !== person._id),
                )
              }
            />{" "}
            <span>
              <b>{person.name}</b>
              <small>Operations</small>
            </span>
          </label>
        ))}
      </div>
      {!advanceMet && (
        <Field
          label="Owner release reason"
          value={reason}
          set={setReason}
          area
          span
          required
        />
      )}
      <button
        className="button primary"
        disabled={
          busy || !selected.length || (!advanceMet && reason.trim().length < 3)
        }
      >
        <ClipboardCheck /> Release initial checklist
      </button>
    </form>
  );
}

function Modal({
  title,
  close,
  children,
}: {
  title: string;
  close: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="modal-wrap">
      <button className="modal-scrim" onClick={close} />
      <section className="quote-modal booking-modal">
        <header>
          <div>
            <p className="eyebrow">Phase 3 booking</p>
            <h2>{title}</h2>
          </div>
          <button className="icon-button" onClick={close}>
            <X />
          </button>
        </header>
        <div className="quote-modal-body">{children}</div>
      </section>
    </div>
  );
}
function Field({
  label,
  value,
  set,
  area = false,
  span = false,
  ...props
}: any) {
  return (
    <label className={span ? "field span" : "field"}>
      <span>{label}</span>
      {area ? (
        <textarea
          value={value ?? ""}
          onChange={(event) => set(event.target.value)}
          {...props}
        />
      ) : (
        <input
          value={value ?? ""}
          onChange={(event) => set(event.target.value)}
          {...props}
        />
      )}
    </label>
  );
}
function Select({ label, value, set, options }: any) {
  return (
    <label className="field">
      <span>{label}</span>
      <select value={value} onChange={(event) => set(event.target.value)}>
        {options.map((option: string) => (
          <option key={option}>{option}</option>
        ))}
      </select>
    </label>
  );
}
function Foot({ busy, text }: { busy: boolean; text: string }) {
  return (
    <div className="form-foot span">
      <span>Changes remain in the booking activity history.</span>
      <button className="button primary" disabled={busy}>
        {busy ? "Saving…" : text} <ArrowRight />
      </button>
    </div>
  );
}
