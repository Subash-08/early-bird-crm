"use client";
import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { indiaInput, indiaIso } from "@/lib/workspace-time";
import { displayMinor, quoteApprovalIssues, quoteContentSchema, quoteOptionPrice } from "@/lib/quote-domain";
import { packageDocument } from "@/lib/package-document";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  Copy,
  Download,
  FileCheck2,
  FileClock,
  FilePenLine,
  FileText,
  Plus,
  RefreshCw,
  Send,
  Trash2,
  X,
} from "lucide-react";

type Row = Record<string, any> & { _id: string; version: number };
function openQuotation(id: string) {
  window.history.pushState(null, "", `/quotations/${encodeURIComponent(id)}`);
  window.scrollTo(0, 0);
}
const services = [
  "Accommodation",
  "Car / transfer",
  "Flight coordination",
  "Train coordination",
  "Bus coordination",
  "Ferry / boat",
  "Activities",
  "Visa / permit assistance",
  "Other",
];
const uid = () => crypto.randomUUID();
const local = indiaInput;
const iso = indiaIso;
async function api(action: string, data: any = {}, more: any = {}) {
  const r = await fetch("/api/crm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, data, ...more }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || "Request failed");
  return j.result;
}
function defaultContent() {
  return {
    title: "",
    summary: "",
    destinations: "",
    dateScope: "Indicative",
    startDate: "",
    endDate: "",
    dateLabel: "",
    adults: 2,
    childrenAges: "",
    infants: 0,
    services: [],
    itinerary: [],
    stays: [],
    transport: [],
    options: [],
    optionalExtras: [],
    inclusions: [],
    exclusions: [],
    currency: "INR",
    advanceAmount: "0",
    advanceDue: "",
    balanceTerms: "",
    validUntil: "",
    cancellationTerms: "",
    customerNotes: "",
    internalNotes: "",
  };
}
function optionPrice(option: Parameters<typeof quoteOptionPrice>[0] & { totalMinor?: number }, currency: string) {
  try {
    const total = option.totalMinor ?? quoteOptionPrice(option).totalMinor;
    return Number.isFinite(total) ? displayMinor(total, currency) : "Check price";
  } catch {
    return "Check price";
  }
}


function packageDate(value?: string) {
  if (!value) return "";
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(date)
    : value;
}

export function Quotations({
  s,
  q,
  reload,
  fail,
}: {
  s: any;
  q: string;
  reload: () => Promise<void>;
  fail: (x: string) => void;
}) {
  const [request, setRequest] = useState(false),
    [busy, setBusy] = useState(false);
  const customers = Object.fromEntries(s.customers.map((x: Row) => [x._id, x]));
  const rows = s.quotes.filter((x: Row) =>
    [x.quoteNumber, x.content?.title, customers[x.customerId]?.name, x.status]
      .join(" ")
      .toLowerCase()
      .includes(q.toLowerCase()),
  );
  async function run(fn: () => Promise<any>) {
    setBusy(true);
    try {
      const id = await fn();
      if (typeof id === "string") openQuotation(id);
      else await reload();
      return true;
    } catch (e) {
      fail((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="quote-hero">
        <div>
          <p className="eyebrow">Customer proposals</p>
          <h2>From requirements to one approved version.</h2>
          <p>
            The enquiry team prepares drafts. The Owner approves, and Sales shares the approved PDF and
            records the customer decision.
          </p>
        </div>
        <button className="button light" onClick={() => setRequest(true)}>
          <Plus /> Request quotation
        </button>
      </div>
      <div className="quote-metrics">
        <SmallMetric
          label="Waiting for owner"
          value={
            rows.filter((x: Row) => ["Requested", "Draft"].includes(x.status))
              .length
          }
        />
        <SmallMetric
          label="Needs information"
          value={
            rows.filter((x: Row) => x.status === "Needs information").length
          }
        />
        <SmallMetric
          label="Ready to send"
          value={
            rows.filter(
              (x: Row) => x.status === "Approved" && x.pdfStatus === "Ready",
            ).length
          }
        />
        <SmallMetric
          label="Customer accepted"
          value={rows.filter((x: Row) => x.status === "Accepted").length}
        />
      </div>
      <section className="panel table-panel">
        <div className="quote-table">
          <div className="quote-row quote-head">
            <span>Quotation</span>
            <span>Customer</span>
            <span>Status</span>
            <span>PDF</span>
            <span>Valid until</span>
            <span />
          </div>
          {rows.map((r: Row) => (
            <button
              className="quote-row"
              key={r._id}
              onClick={() => openQuotation(r._id)}
            >
              <span>
                <b>{r.quoteNumber}</b>
                <small>
                  Version {r.quoteVersion} · {r.content?.title}
                </small>
              </span>
              <span>{customers[r.customerId]?.name || "Customer"}</span>
              <span>
                <Status value={r.status} />
              </span>
              <span>
                <Status value={r.pdfStatus} />
              </span>
              <span>
                {r.snapshot?.content?.validUntil ||
                  r.content?.validUntil ||
                  "Not set"}
              </span>
              <ArrowRight />
            </button>
          ))}
          {!rows.length && <Empty />}
        </div>
      </section>
      {request && (
        <RequestQuote
          s={s}
          close={() => setRequest(false)}
          busy={busy}
          submit={async (data: any) => {
            if (await run(() => api("quote-request", data)))
              setRequest(false);
          }}
        />
      )}{" "}
    </>
  );
}
function SmallMetric({ label, value }: { label: string; value: number }) {
  return (
    <article>
      <span>{label}</span>
      <b>{value}</b>
    </article>
  );
}
function Empty() {
  return (
    <div className="quote-empty">
      <FileText />
      <b>No quotations found</b>
      <p>Request a quotation from a completed enquiry.</p>
    </div>
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

function RequestQuote({ s, close, busy, submit }: any) {
  const active = new Set(
    s.quotes
      .filter(
        (x: Row) => !["Rejected", "Expired", "Superseded"].includes(x.status),
      )
      .map((x: Row) => x.enquiryId),
  );
  const eligible = s.enquiries.filter(
    (x: Row) =>
      !active.has(x._id) &&
      !x.reviewNeeded &&
      !["Lost", "Won"].includes(x.stage),
  );
  const [data, setData] = useState({
    enquiryId: eligible[0]?._id || "",
    requestNote: "",
    requestedDueAt: local(
      new Date(new Date().getTime() + 24 * 3600000).toISOString(),
    ),
  });
  return (
    <Modal title="Request quotation" close={close}>
      <form
        className="form-grid"
        onSubmit={(e) => {
          e.preventDefault();
          submit({ ...data, requestedDueAt: iso(data.requestedDueAt) });
        }}
      >
        <Select
          label="Enquiry"
          value={data.enquiryId}
          set={(v: string) => setData({ ...data, enquiryId: v })}
          options={eligible.map((x: Row) => [
            x._id,
            `${s.customers.find((c: Row) => c._id === x.customerId)?.name || "Customer"} - ${x.destination || x.travelPreference}`,
          ])}
        />
        <Field
          label="Owner due date"
          type="datetime-local"
          value={data.requestedDueAt}
          set={(v: string) => setData({ ...data, requestedDueAt: v })}
        />
        <Field
          label="Request note"
          value={data.requestNote}
          set={(v: string) => setData({ ...data, requestNote: v })}
          area
          span
          placeholder="What should the owner consider?"
        />
        <div className="info-note span">
          <AlertCircle />
          The CRM checks dates, travellers and service-specific details before
          creating the request.
        </div>
        <Foot busy={busy} text="Send request" disabled={!data.enquiryId} />
      </form>
    </Modal>
  );
}

export function LinkedQuote({ quoteId, actor }: {
  quoteId: string; actor: { id: string; role: string };
}) {
  const [details, setDetails] = useState<{ quote: Row; customer: Row | null; enquiry: Row | null; quoteTemplates: Row[]; booking: Row | null } | null>(null);
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    fetch(`/api/crm?resource=enquiry-quote&id=${encodeURIComponent(quoteId)}`, { cache: "no-store" }).then(async (response) => {
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not open the quote.");
      if (active) { setDetails(body); setBusy(false); }
    }).catch((reason) => {
      if (active) {
        setDetails(null);
        setError(reason.message || "Could not open the quote.");
        setBusy(false);
      }
    });
    return () => { active = false; };
  }, [quoteId, revision]);
  return <section className="panel enquiry-page-frame quotation-page-frame">
    <header className="panel-head">
      <div><p>Quotation workspace</p><h2>{details ? `${details.quote.quoteNumber} · Version ${details.quote.quoteVersion}` : "Quotation"}</h2></div>
      <button type="button" className="button secondary" onClick={() => {
        window.history.pushState(null, "", "/quotations");
        window.scrollTo(0, 0);
      }}><ArrowLeft /> Back to quotations</button>
    </header>
    {!details ? <p role={error ? "alert" : "status"}>{error || "Loading quotation…"}</p> :
      <QuoteDetail key={details.quote.version} s={{ actor, quoteTemplates: details.quoteTemplates }}
        q={details.quote} customer={details.customer} enquiry={details.enquiry} booking={details.booking} busy={busy} error={error}
        run={async (action: () => Promise<unknown>, openResult = false) => {
          setBusy(true); setError("");
          try {
            const result = await action();
            if (openResult && typeof result === "string") openQuotation(result);
            else setRevision((value) => value + 1);
            return true;
          } catch (reason) {
            setError(reason instanceof Error ? reason.message : "Could not save the quote.");
            setBusy(false);
            return false;
          }
        }} />}
  </section>;
}

export function PackageTemplates({ actor }: { actor: { role: string } }) {
  const [list, setList] = useState<{ templates: Row[]; hasMore: boolean } | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [revision, setRevision] = useState(0);
  const [editor, setEditor] = useState<{ row?: Row; name: string; active: boolean; content: any } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  useEffect(() => {
    let active = true;
    const params = new URLSearchParams({ resource: "package-templates", page: String(page), q: query });
    fetch(`/api/crm?${params}`, { cache: "no-store" }).then(async (response) => {
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not load package templates.");
      if (active) setList(body);
    }).catch((reason) => { if (active) setError(reason.message); });
    return () => { active = false; };
  }, [page, query, revision]);
  async function open(row?: Row) {
    setError(""); setNotice("");
    if (!row) {
      setEditor({ name: "", active: true, content: { ...defaultContent(), adults: 0 } });
      window.scrollTo(0, 0);
      return;
    }
    setBusy(true);
    try {
      const response = await fetch(`/api/crm?resource=package-templates&id=${encodeURIComponent(row._id)}`, { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not open the template.");
      const template = body.template;
      setEditor({ row: template, name: template.name, active: template.active,
        content: { ...defaultContent(), ...template.content, destinations: template.content?.destinations || template.destination || "" } });
      window.scrollTo(0, 0);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not open the template.");
    } finally { setBusy(false); }
  }
  async function save() {
    if (!editor || busy) return;
    if (editor.name.trim().length < 2) { setError("Enter a template name with at least two characters."); return; }
    setBusy(true); setError("");
    try {
      await api("quote-template", {
        id: editor.row?._id, version: editor.row?.version, name: editor.name,
        destination: editor.content.destinations, active: editor.active, content: editor.content,
      });
      setNotice(editor.row ? "Package template updated." : "Package template created.");
      setList(null); setRevision((value) => value + 1); setEditor(null);
      window.scrollTo(0, 0);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save the package template.");
    } finally { setBusy(false); }
  }
  return <section className="panel enquiry-page-frame quotation-page-frame">
    <header className="panel-head">
      <div><h2>{editor ? (editor.row ? "Edit package template" : "New package template") : "Package templates"}</h2>
        <p>Reuse itinerary, stays, transport and pricing in new quotations.</p></div>
      <button className={editor ? "button secondary" : "button primary"} disabled={busy} onClick={() => {
        if (editor) { setEditor(null); setError(""); } else void open();
      }}>{editor ? <><ArrowLeft /> Back to templates</> : <><Plus /> New template</>}</button>
    </header>
    {error && <p className="form-error" role="alert">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    {editor ? <>
      <div className="form-grid">
        <Field label="Template name" value={editor.name} maxLength={160} set={(name: string) => setEditor({ ...editor, name })} placeholder="Kerala honeymoon · 5 days" />
        <label className="check"><input type="checkbox" checked={editor.active} onChange={(event) => setEditor({ ...editor, active: event.target.checked })} /> Available in quotations</label>
      </div>
      <QuoteEditor templateMode q={{ status: "Template" }} s={{ actor }}
        content={editor.content} setContent={(content: any) => setEditor({ ...editor, content })}
        busy={busy} save={save} />
    </> : <>
      <form className="package-template-search" onSubmit={(event) => {
        event.preventDefault();
        if (page === 1 && query === search.trim()) return;
        setError(""); setPage(1); setQuery(search.trim()); setList(null);
      }}>
        <label className="field">Search templates<input value={search} onChange={(event) => setSearch(event.target.value)} maxLength={100} placeholder="Name or destination" /></label>
        <button className="button secondary">Search</button>
      </form>
      {!list ? (!error && <p role="status"><RefreshCw className="spin" /> Loading templates…</p>) : <>
        {!list.templates.length && <p>No package templates found.</p>}
        <ul className="package-template-list">
          {list.templates.map((row) => <li key={row._id}>
            <div><b>{row.name}</b><small>{row.destination || "Any destination"}</small></div>
            <Status value={row.active ? "Active" : "Inactive"} />
            <button className="button secondary" disabled={busy} onClick={() => void open(row)} aria-label={`Edit ${row.name}`}>Edit <ArrowRight /></button>
          </li>)}
        </ul>
        {(page > 1 || list.hasMore) && <div className="quote-actions">
          <button className="button secondary" disabled={page === 1 || busy} onClick={() => { setList(null); setPage(page - 1); }}>Previous</button>
          <span>Page {page}</span>
          <button className="button secondary" disabled={!list.hasMore || busy} onClick={() => { setList(null); setPage(page + 1); }}>Next</button>
        </div>}
      </>}
    </>}
  </section>;
}

function QuoteDetail({ s, q, customer, enquiry, booking, busy, run, error }: any) {
  const editable =
    s.actor.role !== "operations" &&
    ["Requested", "Needs information", "Draft"].includes(q.status);
  const canShare = s.actor.role === "owner" || q.assigneeId === s.actor.id;
  const [content, setContent] = useState<any>({
    ...defaultContent(),
    ...q.content,
  });
  const [panel, setPanel] = useState<
    "editor" | "preview" | "share" | "decision" | "return" | "revise"
  >(editable ? "editor" : "preview");
  const [decisionType, setDecisionType] = useState("Accepted");
  const [template, setTemplate] = useState(
    s.quoteTemplates?.find((x: Row) => x.active)?._id || "",
  );
  const dirty = JSON.stringify(content) !== JSON.stringify({ ...defaultContent(), ...q.content });
  const save = () => run(() => api("quote-save", content, { id: q._id, version: q.version }));
  const action = (name: string, data: any) => run(() => api(name, data), name === "quote-revise");
  return (
    <>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="quote-detail-head">
        <div>
          <Status value={q.status} /> <Status value={q.pdfStatus} />
          <p>
            {customer?.name} · {enquiry?.destination || content.destinations}
          </p>
        </div>
        <div className="quote-tabs">
          <button
            className={panel === "preview" ? "active" : ""}
            onClick={() => setPanel("preview")}
          >
            <FileText /> Preview
          </button>
          {editable && (
            <button
              className={panel === "editor" ? "active" : ""}
              onClick={() => setPanel("editor")}
            >
              <FilePenLine /> Edit
            </button>
          )}
        </div>
      </div>
      {q.status === "Accepted" && <section className="info-note quotation-booking" aria-label="Trip status">
        <div><b>{booking ? `${booking.bookingNumber} · ${booking.status}` : "Customer accepted"}</b>
          <p>{booking?.status === "Trip completed" ? "The trip has been marked complete in Operations." : booking ? "Follow the booking for the next step." : "Next step: create the booking for the accepted option."}</p>
        </div>
        {booking ? <div className="quote-actions">
          {booking.invoice?.documentId && <a className="button secondary" href={`/api/documents/finance/${encodeURIComponent(booking.invoice.documentId)}`} download><Download /> Download invoice</a>}
          {booking.canOpen && <button className="button secondary" onClick={() => window.history.pushState(null, "", `/bookings/${encodeURIComponent(booking._id)}`)}>Open booking</button>}
          {canShare && <button className="button secondary" onClick={() => window.history.pushState(null, "", "/settlements")}>Booking changes</button>}
        </div> :
          canShare && <button className="button primary" disabled={busy} onClick={() => action("booking-create", { quoteId: q._id })}>Create booking</button>}
      </section>}
      {(q.status === "Changes requested" || q.customerDecision === "Changes requested") && <div className="info-note">
        <div><b>Customer requested changes</b><p>{q.decisionReason}</p>{q.decisionReference && <p>Reference · {q.decisionReference}</p>}</div>
      </div>}
      {q.status === "Needs information" && (
        <div className="warning-box">
          <b>Owner needs more information</b>
          <p>{q.missingInformation}</p>
        </div>
      )}
      {panel === "editor" && editable && (
        <QuoteEditor
          s={s}
          q={q}
          content={content}
          setContent={setContent}
          template={template}
          setTemplate={setTemplate}
          busy={busy}
          save={save}
          action={action}
          dirty={dirty}
        />
      )}{" "}
      {panel === "preview" && (
        <QuotePreview
          q={q}
          content={q.snapshot?.content || content}
          customer={customer?.name || q.snapshot?.customer?.name}
        />
      )}{" "}
      {panel === "share" && (
        <Share
          q={q}
          busy={busy}
          submit={(data: any) => action("quote-share", data)}
        />
      )}{" "}
      {panel === "decision" && (
        <Decision
          key={decisionType}
          q={q}
          busy={busy}
          initialDecision={decisionType}
          submit={(data: any) => action("quote-decision", data)}
        />
      )}{" "}
      {panel === "return" && (
        <ReturnInfo
          q={q}
          busy={busy}
          submit={(data: any) => action("quote-return", data)}
        />
      )}{" "}
      {panel === "revise" && (
        <Revise
          q={q}
          busy={busy}
          submit={(data: any) => action("quote-revise", data)}
        />
      )}
      <div className="quote-actions">
        {s.actor.role === "owner" &&
          ["Requested", "Draft"].includes(q.status) && (
            <button
              className="button secondary"
              onClick={() => setPanel("return")}
            >
              Return for information
            </button>
          )}
        {canShare && q.status === "Needs information" && (
          <ResubmitButton q={q} busy={busy} run={run} />
        )}{" "}
        {canShare && q.pdfStatus === "Ready" && (
          <a
            className="button secondary"
            href={`/api/documents/quote/${encodeURIComponent(q._id)}`}
            download
          >
            <Download /> Download quotation
          </a>
        )}
        {canShare && q.pdfStatus === "Ready" && (
          <a className="button secondary" href={`/api/documents/quote/${encodeURIComponent(q._id)}/package`} download>
            <Download /> Download detailed package
          </a>
        )}
        {s.actor.role === "owner" && q.pdfStatus === "Failed" && (
          <button
            className="button secondary"
            disabled={busy}
            onClick={() => action("quote-pdf-retry", { quoteId: q._id })}
          >
            <RefreshCw /> Retry PDF
          </button>
        )}
        {canShare && ["Approved", "Sent"].includes(q.status) && q.pdfStatus === "Ready" && (
          <button className="button primary" onClick={() => setPanel("share")}>
            <Send /> Record sharing
          </button>
        )}
        {canShare && q.status === "Sent" && (
          <button
            className="button primary"
            onClick={() => { setDecisionType("Accepted"); setPanel("decision"); }}
          >
            <Check /> Record customer reply
          </button>
        )}
        {canShare && q.status === "Sent" && <button className="button secondary" onClick={() => { setDecisionType("Changes requested"); setPanel("decision"); }}>
          <FilePenLine /> Customer asked for changes
        </button>}
        {s.actor.role === "owner" &&
          [
            "Approved",
            "Sent",
            "Accepted",
            "Rejected",
            "Changes requested",
            "Expired",
            "Superseded",
          ].includes(q.status) && (
            <button
              className="button secondary"
              onClick={() => setPanel("revise")}
            >
              <Copy /> Create revised quote
            </button>
          )}
      </div>
    </>
  );
}

function QuoteEditor({
  s,
  q,
  content,
  setContent,
  template,
  setTemplate,
  busy,
  save,
  action,
  dirty = false,
  templateMode = false,
}: any) {
  const [templateName, setTemplateName] = useState("");
  const [replaceTemplate, setReplaceTemplate] = useState(false);
  const canApprove = !templateMode && s.actor.role === "owner" && q.status === "Draft";
  const parsed = canApprove ? quoteContentSchema.safeParse(content) : null;
  const readiness = parsed?.success ? quoteApprovalIssues(parsed.data) : [];
  const hasPackageWork = ["itinerary", "stays", "transport", "options", "optionalExtras", "inclusions", "exclusions"].some((key) => content[key]?.length);
  const upd = (key: string, value: any) =>
    setContent({ ...content, [key]: value });
  const add = (key: string, value: any) => upd(key, [...content[key], value]);
  const change = (key: string, index: number, field: string, value: any) =>
    upd(
      key,
      content[key].map((x: any, i: number) =>
        i === index ? { ...x, [field]: value } : x,
      ),
    );
  const remove = (key: string, index: number) =>
    upd(
      key,
      content[key].filter((_: any, i: number) => i !== index),
    );
  return (
    <div className="quote-editor">
      {canApprove && (readiness.length > 0 || parsed?.success === false) && (
        <aside className="warning-box quote-approval-checklist" aria-label="Approval checklist">
          <b>Before approving this quotation</b>
          {readiness.length > 0 ? <ul>{readiness.map((issue) => (
            <li key={issue.message}><a href={`#quote-${issue.section}`}>{issue.message}</a></li>
          ))}</ul> : <p>{parsed?.error?.issues[0]?.message || "Review the draft fields."}</p>}
        </aside>
      )}
      {!templateMode && <section className="editor-section">
        <div className="editor-title">
          <div>
            <b>Package templates</b>
            <small>
              Use a template as a starting point, then check dates, rates and availability. Edits stay on this quote.
            </small>
          </div>
        </div>
        <div className="template-line">
          <select
            value={template}
            aria-label="Package template"
            onChange={(e) => { setTemplate(e.target.value); setReplaceTemplate(false); }}
          >
            <option value="">Choose a template</option>
            {s.quoteTemplates
              .filter((x: Row) => x.active)
              .map((x: Row) => (
                <option key={x._id} value={x._id}>
                  {x.name}
                </option>
              ))}
          </select>
          <button
            className="button secondary"
            disabled={!template || busy || (hasPackageWork && !replaceTemplate)}
            onClick={() =>
              action("quote-template-apply", {
                quoteId: q._id,
                version: q.version,
                templateId: template,
                replace: replaceTemplate,
              })
            }
          >
            Use template
          </button>
          {s.actor.role === "owner" && <><input
            value={templateName}
            onChange={(e) => setTemplateName(e.target.value)}
            aria-label="New package template name"
            placeholder="e.g. Kerala honeymoon · 5 days"
          />
          <button
            className="button secondary"
            disabled={!templateName || busy}
            onClick={async () => {
              await action(
                "quote-template",
                {
                  name: templateName,
                  destination: content.destinations,
                  active: true,
                  content,
                },
              );
              setTemplateName("");
            }}
          >
            Save as template
          </button></>}
        </div>
        {hasPackageWork && template && <label className="check"><input type="checkbox" checked={replaceTemplate} onChange={(event) => setReplaceTemplate(event.target.checked)} /> Replace the current package sections</label>}
        {s.actor.role === "owner" && <small>Before saving a template, remove any customer names or private information from free-text fields.</small>}
      </section>}
      <section className="editor-section" id="quote-overview">
        <SectionTitle n="01" title="Package overview" />
        <div className="form-grid">
          <Field
            label={templateMode ? "Package title" : "Quotation title"}
            value={content.title}
            set={(v: string) => upd("title", v)}
            span
          />
          <Field
            label="Destination(s)"
            value={content.destinations}
            set={(v: string) => upd("destinations", v)}
          />
          {!templateMode && <><Select
            label="Date scope"
            value={content.dateScope}
            set={(v: string) => upd("dateScope", v)}
            options={["Exact", "Indicative"]}
          />
          {content.dateScope === "Exact" ? (
            <>
              <Field
                label="Start date"
                type="date"
                value={content.startDate}
                set={(v: string) => upd("startDate", v)}
              />
              <Field
                label="End date"
                type="date"
                value={content.endDate}
                set={(v: string) => upd("endDate", v)}
              />
            </>
          ) : (
            <Field
              label="Indicative dates"
              value={content.dateLabel}
              set={(v: string) => upd("dateLabel", v)}
              span
              placeholder="December 2026, flexible by two days"
            />
          )}
          <Field
            label="Adults"
            type="number"
            value={content.adults}
            set={(v: string) => upd("adults", Number(v))}
          />
          <Field
            label="Children and ages"
            value={content.childrenAges}
            set={(v: string) => upd("childrenAges", v)}
          />
          <Field
            label="Infants"
            type="number"
            value={content.infants}
            set={(v: string) => upd("infants", Number(v))}
          /></>}
          <Field
            label="Customer-facing summary"
            value={content.summary}
            set={(v: string) => upd("summary", v)}
            area
            span
          />
        </div>
        <div className="service-checks">
          {services.map((x) => (
            <label key={x}>
              <input
                type="checkbox"
                checked={content.services.includes(x)}
                onChange={(e) =>
                  upd(
                    "services",
                    e.target.checked
                      ? [...content.services, x]
                      : content.services.filter((y: string) => y !== x),
                  )
                }
              />
              <span>{x}</span>
            </label>
          ))}
        </div>
      </section>
      <section className="editor-section">
        <SectionTitle
          n="02"
          title="Day-wise itinerary"
          action={
            <button
              className="text-button"
              onClick={() =>
                add("itinerary", {
                  id: uid(),
                  day: content.itinerary.length + 1,
                  date: "",
                  title: "",
                  city: "",
                  activities: "",
                  transfers: "",
                  stay: "",
                  meals: "",
                  notes: "",
                })
              }
            >
              <Plus /> Add day
            </button>
          }
        />
        {content.itinerary.map((x: any, i: number) => (
          <ArrayCard
            key={x.id}
            title={`Day ${x.day}`}
            remove={() => remove("itinerary", i)}
          >
            <Field
              label="Day"
              type="number"
              value={x.day}
              set={(v: string) => change("itinerary", i, "day", Number(v))}
            />
            {!templateMode && <Field
              label="Date"
              type="date"
              value={x.date}
              set={(v: string) => change("itinerary", i, "date", v)}
            />}
            <Field
              label="Title"
              value={x.title}
              set={(v: string) => change("itinerary", i, "title", v)}
            />
            <Field
              label="City"
              value={x.city}
              set={(v: string) => change("itinerary", i, "city", v)}
            />
            <Field
              label="Activities"
              value={x.activities}
              set={(v: string) => change("itinerary", i, "activities", v)}
              area
              span
            />
            <Field
              label="Transfers"
              value={x.transfers}
              set={(v: string) => change("itinerary", i, "transfers", v)}
            />
            <Field
              label="Stay"
              value={x.stay}
              set={(v: string) => change("itinerary", i, "stay", v)}
            />
            <Field
              label="Meals"
              value={x.meals}
              set={(v: string) => change("itinerary", i, "meals", v)}
            />
            <Field
              label="Notes"
              value={x.notes}
              set={(v: string) => change("itinerary", i, "notes", v)}
              span
            />
          </ArrayCard>
        ))}
        {!content.itinerary.length && (
          <MiniEmpty text="Add days only when a day-wise plan is useful. Hotel-only quotes can remain simple." />
        )}
      </section>
      <section className="editor-section" id="quote-stays">
        <SectionTitle
          n="03"
          title="Stays and rooms"
          action={
            <button
              className="text-button"
              onClick={() =>
                add("stays", {
                  id: uid(),
                  optionId: "",
                  city: "",
                  property: "",
                  checkIn: "",
                  checkOut: "",
                  roomType: "",
                  rooms: 1,
                  occupancy: "",
                  mealPlan: "",
                  extraBed: "",
                  notes: "",
                })
              }
            >
              <Plus /> Add stay
            </button>
          }
        />
        {content.stays.map((x: any, i: number) => (
          <ArrayCard
            key={x.id}
            title={x.property || `Stay ${i + 1}`}
            remove={() => remove("stays", i)}
          >
            <Field
              label="City"
              value={x.city}
              set={(v: string) => change("stays", i, "city", v)}
            />
            <Field
              label="Hotel / houseboat"
              value={x.property}
              set={(v: string) => change("stays", i, "property", v)}
            />
            {!templateMode && <><Field
              label="Check-in date"
              type="date"
              value={x.checkIn}
              set={(v: string) => change("stays", i, "checkIn", v)}
            />
            <Field
              label="Check-out date"
              type="date"
              value={x.checkOut}
              set={(v: string) => change("stays", i, "checkOut", v)}
            /></>}
            <Field
              label="Room category"
              value={x.roomType}
              set={(v: string) => change("stays", i, "roomType", v)}
            />
            <Field
              label="Rooms"
              type="number"
              value={x.rooms}
              set={(v: string) => change("stays", i, "rooms", Number(v))}
            />
            <Field
              label="Occupancy"
              value={x.occupancy}
              set={(v: string) => change("stays", i, "occupancy", v)}
            />
            <Field
              label="Meal plan"
              value={x.mealPlan}
              set={(v: string) => change("stays", i, "mealPlan", v)}
            />
            <Select
              label="Package option"
              value={x.optionId}
              set={(v: string) => change("stays", i, "optionId", v)}
              options={[
                ["", "All options"],
                ...content.options.map((o: any) => [o.id, o.name]),
              ]}
            />
            <Field label="Extra bed" value={x.extraBed} set={(v: string) => change("stays", i, "extraBed", v)} />
            <Field label="Stay notes" value={x.notes} set={(v: string) => change("stays", i, "notes", v)} span />
          </ArrayCard>
        ))}
      </section>
      <section className="editor-section" id="quote-transport">
        <SectionTitle
          n="04"
          title="Transport and customer-held tickets"
          action={
            <button
              className="text-button"
              onClick={() =>
                add("transport", {
                  id: uid(),
                  optionId: "",
                  mode: "Car",
                  responsibility: "Agency arranged",
                  from: "",
                  to: "",
                  date: "",
                  time: "",
                  timeZone: "Asia/Kolkata",
                  provider: "",
                  reference: "",
                  passengers: "",
                  details: "",
                  chargeIncluded: true,
                })
              }
            >
              <Plus /> Add leg
            </button>
          }
        />
        {content.transport.map((x: any, i: number) => (
          <ArrayCard
            key={x.id}
            title={`${x.mode}: ${x.from || "?"} → ${x.to || "?"}`}
            remove={() => remove("transport", i)}
          >
            <Select
              label="Mode"
              value={x.mode}
              set={(v: string) => change("transport", i, "mode", v)}
              options={[
                "Car",
                "Flight",
                "Train",
                "Bus",
                "Ferry / boat",
                "Other",
              ]}
            />
            <Select
              label="Responsibility"
              value={x.responsibility}
              set={(v: string) => {
                change("transport", i, "responsibility", v);
                if (v === "Customer booked")
                  setContent({
                    ...content,
                    transport: content.transport.map((y: any, n: number) =>
                      n === i
                        ? { ...y, responsibility: v, chargeIncluded: false }
                        : y,
                    ),
                  });
              }}
              options={[
                "Agency arranged",
                "Customer booked",
                "Third-party arranged",
                "Not required",
              ]}
            />
            <Field
              label="From"
              value={x.from}
              set={(v: string) => change("transport", i, "from", v)}
            />
            <Field
              label="To"
              value={x.to}
              set={(v: string) => change("transport", i, "to", v)}
            />
            {!templateMode && <Field
              label="Date"
              type="date"
              value={x.date}
              set={(v: string) => change("transport", i, "date", v)}
            />}
            <Field
              label="Local time"
              value={x.time}
              set={(v: string) => change("transport", i, "time", v)}
              placeholder="09:30"
            />
            <Field
              label="Time zone"
              value={x.timeZone}
              set={(v: string) => change("transport", i, "timeZone", v)}
            />
            <Field
              label="Provider"
              value={x.provider}
              set={(v: string) => change("transport", i, "provider", v)}
            />
            {!templateMode && <Field label="Booking reference" value={x.reference}
              set={(v: string) => change("transport", i, "reference", v)} />}
            <Field
              label="Details"
              value={x.details}
              set={(v: string) => change("transport", i, "details", v)}
              area
              span
            />
            <label className="check span">
              <input
                type="checkbox"
                checked={x.chargeIncluded}
                disabled={x.responsibility === "Customer booked"}
                onChange={(e) =>
                  change("transport", i, "chargeIncluded", e.target.checked)
                }
              />
              <span>
                <b>Included in agency package price</b>
                <small>Customer-booked services must stay unchecked.</small>
              </span>
            </label>
          </ArrayCard>
        ))}
      </section>
      <section className="editor-section" id="quote-pricing">
        <SectionTitle
          n="05"
          title="Package options and pricing"
          action={
            <button
              className="text-button"
              onClick={() =>
                add("options", {
                  id: uid(),
                  name: `Option ${content.options.length + 1}`,
                  description: "",
                  hotel: "",
                  mealPlan: "",
                  priceBasis: "Total package",
                  quantity: 1,
                  unitPrice: "0",
                  discount: "0",
                  taxLabel: "",
                  taxAmount: "0",
                  internalCost: "0",
                  notes: "",
                })
              }
            >
              <Plus /> Add option
            </button>
          }
        />
        {content.options.map((x: any, i: number) => (
            <ArrayCard
              key={x.id}
              title={`${x.name} · ${optionPrice(x, content.currency)}`}
              remove={() => remove("options", i)}
            >
              <Field
                label="Option name"
                value={x.name}
                set={(v: string) => change("options", i, "name", v)}
              />
              <Select
                label="Price basis"
                value={x.priceBasis}
                set={(v: string) => change("options", i, "priceBasis", v)}
                options={["Total package", "Per person", "Per couple"]}
              />
              <Field
                label="Quantity"
                type="number"
                step="0.01"
                value={x.quantity}
                set={(v: string) => change("options", i, "quantity", Number(v))}
              />
              <Field
                label="Unit selling price"
                type="number"
                step="0.01"
                value={x.unitPrice}
                set={(v: string) => change("options", i, "unitPrice", v)}
              />
              <Field
                label="Discount"
                type="number"
                step="0.01"
                value={x.discount}
                set={(v: string) => change("options", i, "discount", v)}
              />
              <Field
                label="Tax label"
                value={x.taxLabel}
                set={(v: string) => change("options", i, "taxLabel", v)}
                placeholder="Only approved tax wording"
              />
              <Field
                label="Tax amount"
                type="number"
                step="0.01"
                value={x.taxAmount}
                set={(v: string) => change("options", i, "taxAmount", v)}
              />
              {s.actor.role === "owner" && <Field
                label="Internal supplier cost"
                type="number"
                step="0.01"
                value={x.internalCost}
                set={(v: string) => change("options", i, "internalCost", v)}
              />}
              <Field
                label="Hotel alternative"
                value={x.hotel}
                set={(v: string) => change("options", i, "hotel", v)}
              />
              <Field
                label="Meal plan"
                value={x.mealPlan}
                set={(v: string) => change("options", i, "mealPlan", v)}
              />
              <Field
                label="Customer description"
                value={x.description}
                set={(v: string) => change("options", i, "description", v)}
                area
                span
              />
              <Field
                label="Owner notes"
                value={x.notes}
                set={(v: string) => change("options", i, "notes", v)}
                span
              />
            </ArrayCard>
        ))}
        <div className="price-total">
          {content.options.length === 1
            ? <><span>Option total</span><b>{optionPrice(content.options[0], content.currency)}</b></>
            : <span>{content.options.length ? "Each option is priced separately." : "Add a priced option before approving."}</span>}
          <small>
            Internal costs and margin never appear in the customer PDF or Sales
            response.
          </small>
        </div>
      </section>
      <section className="editor-section" id="quote-terms">
        <SectionTitle n="06" title="Inclusions and terms" />
        <div className="form-grid">
          <Field
            label="Inclusions (one per line)"
            value={content.inclusions.join("\n")}
            set={(v: string) => upd("inclusions", lines(v))}
            area
          />
          <Field
            label="Exclusions (one per line)"
            value={content.exclusions.join("\n")}
            set={(v: string) => upd("exclusions", lines(v))}
            area
          />
          <Field
            label="Currency"
            value={content.currency}
            maxLength={3}
            set={(v: string) => upd("currency", v.toUpperCase())}
          />
          {!templateMode && <Field
            label="Quotation valid until"
            type="date"
            value={content.validUntil}
            set={(v: string) => upd("validUntil", v)}
          />}
          <Field
            label="Cancellation terms"
            value={content.cancellationTerms}
            set={(v: string) => upd("cancellationTerms", v)}
            area
            span
          />
          {!templateMode && <Field
            label="Customer-facing notes"
            value={content.customerNotes}
            set={(v: string) => upd("customerNotes", v)}
            area
          />}
          {!templateMode && s.actor.role === "owner" && <Field
            label="Owner-only internal notes"
            value={content.internalNotes}
            set={(v: string) => upd("internalNotes", v)}
            area
          />}
        </div>
      </section>
      <div className="sticky-save">
        <span>
          {templateMode ? "Dates and traveller counts are added on each quotation." : dirty ? "Save your changes before approving." : "Save the draft before sending it for approval."}
        </span>
        <button className="button secondary" disabled={busy} onClick={save}>
          {templateMode ? "Save package template" : "Save draft"}
        </button>
        {canApprove && (
          <button
            className="button primary"
            disabled={busy || dirty || !parsed?.success || readiness.length > 0}
            onClick={() =>
              action("quote-approve", { quoteId: q._id, version: q.version })
            }
          >
            <FileCheck2 /> Approve & generate PDF
          </button>
        )}
      </div>
    </div>
  );
}

function QuotePreview({ q, content: rawContent, customer }: any) {
  const content = packageDocument(rawContent);
  const optionNames = new Map<string, string>(content.options.map((option: any) => [option.id, option.name]));
  const travel = content.dateScope === "Exact"
    ? [packageDate(content.startDate), packageDate(content.endDate)].filter(Boolean).join(" – ")
    : content.dateLabel;
  const facts = [
    ["Prepared for", customer],
    ["Destination", content.destinations],
    ["Travel dates", travel || "To be confirmed"],
    ["Travellers", [content.adults > 0 && `${content.adults} ${content.adults === 1 ? "adult" : "adults"}`, content.childrenAges && `Children: ${content.childrenAges}`, content.infants > 0 && `${content.infants} ${content.infants === 1 ? "infant" : "infants"}`].filter(Boolean).join(" · ") || "To be confirmed"],
    ["Valid until", packageDate(content.validUntil)],
  ].filter(([, value]) => Boolean(value));
  return (
    <article className="quote-preview package-preview">
      <header>
        <div>
          <Image src="/earlybird-vacations-logo.png" width={186} height={62} alt="Early Bird Vacations" className="package-logo" />
          <h2>{content.title || "Untitled quotation"}</h2>
          <p>
            {q.quoteNumber} · Version {q.quoteVersion}
          </p>
        </div>
        <Status value={q.status} />
      </header>
      <dl className="preview-facts">
        {facts.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
      </dl>
      {content.summary && <p className="lead-copy">{content.summary}</p>}
      {content.services.length > 0 && <PreviewSection title="Services covered">
        <p>{content.services.join(" · ")}</p>
      </PreviewSection>}
      {content.options.length > 0 && <PreviewSection title="Package options">
        {content.options.map((x: any) => (
          <div className="preview-option" key={x.id}>
            <div>
              <b>{x.name}</b>
              {x.description && <p>{x.description}</p>}
              {x.hotel && <p>Stay · {x.hotel}</p>}
              {x.mealPlan && <p>Meal plan · {x.mealPlan}</p>}
            </div>
          </div>
        ))}
      </PreviewSection>}
      {content.stays.length > 0 && <PreviewSection title="Accommodation and meal plan">
        <div className="package-detail-list">
          {content.stays.map((stay: any) => <div className="package-detail-row" key={stay.id}>
            <div><b>{stay.property || "Stay to be confirmed"}</b><p>{[stay.city, optionNames.get(stay.optionId)].filter(Boolean).join(" · ")}</p></div>
            <div><b>{[packageDate(stay.checkIn), packageDate(stay.checkOut)].filter(Boolean).join(" → ") || "Stay dates to be confirmed"}</b>
              <p>{[stay.rooms > 0 && `${stay.rooms} ${stay.rooms === 1 ? "room" : "rooms"}`, stay.roomType, stay.occupancy, stay.extraBed].filter(Boolean).join(" · ")}</p>
              {stay.mealPlan && <p>Meal plan · {stay.mealPlan}</p>}
              {stay.notes && <p>{stay.notes}</p>}
            </div>
          </div>)}
        </div>
      </PreviewSection>}
      {content.transport.length > 0 && <PreviewSection title="Transport and transfers">
        <div className="package-detail-list">
          {content.transport.map((leg: any) => <div className="package-detail-row" key={leg.id}>
            <div><b>{leg.mode}{leg.from || leg.to ? ` · ${[leg.from, leg.to].filter(Boolean).join(" → ")}` : ""}</b>
              <p>{[leg.responsibility, optionNames.get(leg.optionId)].filter(Boolean).join(" · ")}</p></div>
            <div>
              {[packageDate(leg.date), leg.time, leg.time ? leg.timeZone : ""].some(Boolean) && <b>{[packageDate(leg.date), leg.time, leg.time ? leg.timeZone : ""].filter(Boolean).join(" · ")}</b>}
              {leg.provider && <p>{leg.provider}</p>}
              {leg.passengers && <p>Passengers · {leg.passengers}</p>}
              {leg.details && <p>{leg.details}</p>}
              {leg.responsibility === "Customer booked" && <p>Customer booked · outside the agency package price</p>}
            </div>
          </div>)}
        </div>
      </PreviewSection>}
      {content.itinerary.length > 0 && (
        <PreviewSection title="Day-wise itinerary">
          {content.itinerary.map((x) => (
            <div className="preview-day" key={x.id}>
              <span>{x.day}</span>
              <div>
                <small>{[x.city, packageDate(x.date)].filter(Boolean).join(" · ")}</small>
                <b>{x.title || x.city || `Day ${x.day}`}</b>
                {x.activities && <p>{x.activities}</p>}
                {x.transfers && <p><strong>Transfers</strong> · {x.transfers}</p>}
                {x.stay && <p><strong>Stay</strong> · {x.stay}</p>}
                {x.meals && <p><strong>Meals</strong> · {x.meals}</p>}
                {x.notes && <p>{x.notes}</p>}
              </div>
            </div>
          ))}
        </PreviewSection>
      )}
      {content.optionalExtras.length > 0 && <PreviewSection title="Optional extras">
        <div className="package-detail-list">
          {content.optionalExtras.map((extra: any) => <div className="package-detail-row" key={extra.id}>
            <div><b>{extra.name}</b>{extra.description && <p>{extra.description}</p>}</div>
            <div><b>{extra.included ? "Included" : "Optional"}</b>
            </div>
          </div>)}
        </div>
      </PreviewSection>}
      <div className="preview-columns">
        <PreviewSection title="Inclusions">
          <ul>
            {content.inclusions.map((x: string) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </PreviewSection>
        <PreviewSection title="Exclusions">
          <ul>
            {content.exclusions.map((x: string) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </PreviewSection>
      </div>
      {content.cancellationTerms && <PreviewSection title="Cancellation terms">
        <p>{content.cancellationTerms}</p>
      </PreviewSection>}
      {content.customerNotes && <PreviewSection title="Useful information"><p>{content.customerNotes}</p></PreviewSection>}
      {q.pdfStatus === "Queued" && (
        <div className="info-note">
          <FileClock />
          Approved snapshot is safe. The PDF job is queued.
        </div>
      )}
      {q.pdfStatus === "Failed" && (
        <div className="warning-box">
          <b>PDF generation failed</b>
          <p>The approved snapshot is unchanged. Owner can retry.</p>
        </div>
      )}
    </article>
  );
}
function PreviewSection({ title, children }: any) {
  return (
    <section className="preview-section">
      <h3>{title}</h3>
      {children}
    </section>
  );
}

function Share({ q, busy, submit }: any) {
  const [data, setData] = useState({
    quoteId: q._id,
    version: q.version,
    channel: "WhatsApp",
    sharedAt: local(new Date().toISOString()),
    reference: "",
    followUpAt: local(
      new Date(new Date().getTime() + 48 * 3600000).toISOString(),
    ),
    note: "",
  });
  return (
    <form
      className="form-grid action-form"
      onSubmit={(e) => {
        e.preventDefault();
        submit({
          ...data,
          sharedAt: iso(data.sharedAt),
          followUpAt: iso(data.followUpAt),
        });
      }}
    >
      <h3 className="span">Record manual sharing</h3>
      <Select
        label="Channel"
        value={data.channel}
        set={(v: string) => setData({ ...data, channel: v })}
        options={["WhatsApp", "Email", "Printed", "Other"]}
      />
      <Field
        label="Shared at"
        type="datetime-local"
        value={data.sharedAt}
        set={(v: string) => setData({ ...data, sharedAt: v })}
      />
      <Field
        label="Message/reference"
        value={data.reference}
        set={(v: string) => setData({ ...data, reference: v })}
      />
      <Field
        label="Follow-up date"
        type="datetime-local"
        value={data.followUpAt}
        set={(v: string) => setData({ ...data, followUpAt: v })}
      />
      <Field
        label="Internal note"
        value={data.note}
        set={(v: string) => setData({ ...data, note: v })}
        area
        span
      />
      <div className="info-note span">
        <AlertCircle />
        This records staff action only. It does not claim WhatsApp or email
        delivery/read status.
      </div>
      <Foot busy={busy} text="Mark as shared" />
    </form>
  );
}
function Decision({ q, busy, submit, initialDecision }: any) {
  const options = q.snapshot?.content?.options || [];
  const [data, setData] = useState({
    quoteId: q._id,
    version: q.version,
    decision: initialDecision,
    selectedOptionId: options.length === 1 ? options[0].id : "",
    decidedAt: local(new Date().toISOString()),
    channel: "WhatsApp",
    reference: "",
    reason: "",
  });
  return (
    <form
      className="form-grid action-form"
      onSubmit={(e) => {
        e.preventDefault();
        submit({ ...data, selectedOptionId: data.decision === "Accepted" ? data.selectedOptionId : "", decidedAt: iso(data.decidedAt) });
      }}
    >
      <h3 className="span">{data.decision === "Changes requested" ? "What should change?" : "Customer reply"}</h3>
      <Select
        label="Decision"
        value={data.decision}
        set={(v: string) => setData({ ...data, decision: v })}
        options={["Accepted", "Rejected", "Changes requested"]}
      />
      {data.decision === "Accepted" && options.length > 1 && (
        <Select
          label="Package the customer chose"
          value={data.selectedOptionId}
          set={(v: string) => setData({ ...data, selectedOptionId: v })}
          options={[["", "Choose a package"], ...options.map((x: any) => [
            x.id,
            x.name,
          ])]}
        />
      )}
      {data.decision === "Accepted" && options.length === 1 && <p className="span">Package accepted · {options[0].name}</p>}
      {data.decision === "Changes requested" && <p className="span">Save what the customer asked for. The Owner can then create a revised quote.</p>}
      <Field
        label="Decision time"
        type="datetime-local"
        value={data.decidedAt}
        set={(v: string) => setData({ ...data, decidedAt: v })}
      />
      <Select
        label="Channel"
        value={data.channel}
        set={(v: string) => setData({ ...data, channel: v })}
        options={["WhatsApp", "Phone", "Email", "In person", "Other"]}
      />
      <Field
        label="Message/reference"
        value={data.reference}
        set={(v: string) => setData({ ...data, reference: v })}
        span
      />
      <Field
        label={
          data.decision === "Accepted"
            ? "Acceptance note"
            : data.decision === "Changes requested" ? "Changes requested by the customer" : "Why the customer declined"
        }
        value={data.reason}
        set={(v: string) => setData({ ...data, reason: v })}
        area
        span
      />
      <Foot busy={busy} text={data.decision === "Changes requested" ? "Save change request" : "Save reply"} disabled={data.decision === "Accepted" ? !data.selectedOptionId || (!data.reference.trim() && !data.reason.trim()) : !data.reason.trim()} />
    </form>
  );
}
function ReturnInfo({ q, busy, submit }: any) {
  const [data, setData] = useState({
    quoteId: q._id,
    version: q.version,
    reason: "",
    dueAt: local(new Date(new Date().getTime() + 24 * 3600000).toISOString()),
  });
  return (
    <form
      className="form-grid action-form"
      onSubmit={(e) => {
        e.preventDefault();
        submit({ ...data, dueAt: iso(data.dueAt) });
      }}
    >
      <h3 className="span">Return to Sales</h3>
      <Field
        label="Information needed"
        value={data.reason}
        set={(v: string) => setData({ ...data, reason: v })}
        area
        span
      />
      <Field
        label="Sales due date"
        type="datetime-local"
        value={data.dueAt}
        set={(v: string) => setData({ ...data, dueAt: v })}
      />
      <Foot busy={busy} text="Return request" />
    </form>
  );
}
function Revise({ q, busy, submit }: any) {
  const [reason, setReason] = useState(q.status === "Changes requested" ? q.decisionReason || "" : "");
  return (
    <form
      className="form-grid action-form"
      onSubmit={(e) => {
        e.preventDefault();
        submit({ quoteId: q._id, reason });
      }}
    >
      <h3 className="span">Create a new version</h3>
      <p className="span">
        The approved PDF and customer decision remain unchanged. A separate
        editable version will be created.
      </p>
      <Field label="Revision reason" value={reason} set={setReason} area span />
      <Foot busy={busy} text="Create revision" />
    </form>
  );
}
function ResubmitButton({ q, busy, run }: any) {
  const [open, setOpen] = useState(false),
    [note, setNote] = useState("Information updated in the enquiry."),
    [due, setDue] = useState(
      local(new Date(new Date().getTime() + 24 * 3600000).toISOString()),
    );
  return open ? (
    <div className="resubmit-box">
      <input value={note} onChange={(e) => setNote(e.target.value)} />
      <input
        type="datetime-local"
        value={due}
        onChange={(e) => setDue(e.target.value)}
      />
      <button
        className="button primary"
        disabled={busy}
        onClick={() =>
          run(
            () =>
              api("quote-resubmit", {
                quoteId: q._id,
                version: q.version,
                note,
                dueAt: iso(due),
              }),
          )
        }
      >
        Resubmit
      </button>
    </div>
  ) : (
    <button className="button primary" onClick={() => setOpen(true)}>
      Resubmit information
    </button>
  );
}

function Modal({ title, close, children, wide = false }: any) {
  return (
    <div className="drawer-wrap">
      <button className="drawer-scrim" onClick={close} />
      <aside
        className={wide ? "drawer quote-drawer wide" : "drawer quote-drawer"}
      >
        <header>
          <div>
            <p className="eyebrow">Quotation workspace</p>
            <h2>{title}</h2>
          </div>
          <button className="icon-button" onClick={close}>
            <X />
          </button>
        </header>
        <div className="drawer-body">{children}</div>
      </aside>
    </div>
  );
}
function SectionTitle({ n, title, action }: any) {
  return (
    <div className="editor-title">
      <div>
        <span>{n}</span>
        <b>{title}</b>
      </div>
      {action}
    </div>
  );
}
function ArrayCard({ title, remove, children }: any) {
  return (
    <div className="array-card">
      <header>
        <b>{title}</b>
        <button onClick={remove} aria-label="Remove">
          <Trash2 />
        </button>
      </header>
      <div className="form-grid">{children}</div>
    </div>
  );
}
function Field({
  label,
  value,
  set,
  type = "text",
  area = false,
  span = false,
  ...rest
}: any) {
  return (
    <label className={span ? "field span" : "field"}>
      <span>{label}</span>
      {area ? (
        <textarea
          value={value ?? ""}
          onChange={(e) => set(e.target.value)}
          {...rest}
        />
      ) : (
        <input
          type={type}
          value={value ?? ""}
          onChange={(e) => set(e.target.value)}
          {...rest}
        />
      )}
    </label>
  );
}
function Select({ label, value, set, options }: any) {
  return (
    <label className="field">
      <span>{label}</span>
      <select value={value} onChange={(e) => set(e.target.value)}>
        {options.map((x: any) => {
          const [v, l] = Array.isArray(x) ? x : [x, x];
          return (
            <option key={v} value={v}>
              {l}
            </option>
          );
        })}
      </select>
    </label>
  );
}
function Foot({ busy, text, disabled = false }: any) {
  return (
    <div className="form-foot span">
      <span>Every action is recorded in activity history.</span>
      <button className="button primary" disabled={busy || disabled}>
        {busy ? "Working…" : text}
        <ArrowRight />
      </button>
    </div>
  );
}
function MiniEmpty({ text }: { text: string }) {
  return <div className="mini-empty">{text}</div>;
}
function lines(v: string) {
  return v
    .split(/\r?\n/)
    .map((x) => x.trim())
    .filter(Boolean);
}
