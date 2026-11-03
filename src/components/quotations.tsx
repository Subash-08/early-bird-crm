"use client";
import { useMemo, useState } from "react";
import {
  AlertCircle,
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
const local = (v = "") => (v ? new Date(v).toISOString().slice(0, 16) : "");
const iso = (v = "") => (v ? new Date(v).toISOString() : "");
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
function money(value: string | number, currency = "INR") {
  const n = typeof value === "number" ? value / 100 : Number(value || 0);
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(n);
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
    [selected, setSelected] = useState<Row | null>(null),
    [busy, setBusy] = useState(false);
  const customers = Object.fromEntries(s.customers.map((x: Row) => [x._id, x]));
  const enqs = Object.fromEntries(s.enquiries.map((x: Row) => [x._id, x]));
  const rows = s.quotes.filter((x: Row) =>
    [x.quoteNumber, x.content?.title, customers[x.customerId]?.name, x.status]
      .join(" ")
      .toLowerCase()
      .includes(q.toLowerCase()),
  );
  async function run(fn: () => Promise<any>, close = false) {
    setBusy(true);
    try {
      await fn();
      if (close) setSelected(null);
      await reload();
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
            Owner prepares and approves. Sales shares only the frozen PDF and
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
              onClick={() => setSelected(r)}
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
            if (await run(() => api("quote-request", data), false))
              setRequest(false);
          }}
        />
      )}{" "}
      {selected && (
        <QuoteDetail
          key={`${selected._id}:${selected.version}`}
          s={s}
          q={selected}
          customer={customers[selected.customerId]}
          enquiry={enqs[selected.enquiryId]}
          close={() => setSelected(null)}
          busy={busy}
          run={run}
        />
      )}
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

function QuoteDetail({ s, q, customer, enquiry, close, busy, run }: any) {
  const editable =
    s.actor.role === "owner" &&
    ["Requested", "Needs information", "Draft"].includes(q.status);
  const [content, setContent] = useState<any>({
    ...defaultContent(),
    ...q.content,
  });
  const [panel, setPanel] = useState<
    "editor" | "preview" | "share" | "decision" | "return" | "revise"
  >(editable ? "editor" : "preview");
  const [template, setTemplate] = useState(
    s.quoteTemplates?.find((x: Row) => x.active)?._id || "",
  );
  const total = content.options.reduce(
    (n: number, x: any) =>
      n +
      (Number(x.unitPrice || 0) * Number(x.quantity || 0) -
        Number(x.discount || 0) +
        Number(x.taxAmount || 0)),
    0,
  );
  async function save() {
    await run(
      () => api("quote-save", content, { id: q._id, version: q.version }),
      true,
    );
  }
  async function action(name: string, data: any, closeAfter = true) {
    await run(() => api(name, data), closeAfter);
  }
  return (
    <Modal
      title={`${q.quoteNumber} · Version ${q.quoteVersion}`}
      close={close}
      wide
    >
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
        />
      )}{" "}
      {panel === "preview" && (
        <QuotePreview
          q={q}
          content={q.snapshot?.content || content}
          total={total}
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
          q={q}
          busy={busy}
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
        {s.actor.role !== "operations" && q.status === "Needs information" && (
          <ResubmitButton q={q} busy={busy} run={run} />
        )}{" "}
        {q.pdfStatus === "Ready" && (
          <a
            className="button secondary"
            href={`/api/documents/quote/${q._id}`}
            target="_blank"
            rel="noreferrer"
          >
            <Download /> Open approved PDF
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
        {["Approved", "Sent"].includes(q.status) && q.pdfStatus === "Ready" && (
          <button className="button primary" onClick={() => setPanel("share")}>
            <Send /> Record sharing
          </button>
        )}
        {q.status === "Sent" && (
          <button
            className="button primary"
            onClick={() => setPanel("decision")}
          >
            <Check /> Customer decision
          </button>
        )}
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
              <Copy /> Create revision
            </button>
          )}
      </div>
    </Modal>
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
}: any) {
  const [templateName, setTemplateName] = useState("");
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
      <section className="editor-section">
        <div className="editor-title">
          <div>
            <b>Package templates</b>
            <small>
              To create one, complete the quotation below, enter a clear
              template name, then save the current quote. Templates are only
              starting points—verify rates and availability every time.
            </small>
          </div>
        </div>
        <div className="template-line">
          <select
            value={template}
            onChange={(e) => setTemplate(e.target.value)}
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
            disabled={!template || busy}
            onClick={() =>
              action("quote-template-apply", {
                quoteId: q._id,
                version: q.version,
                templateId: template,
              })
            }
          >
            Apply
          </button>
          <input
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
                false,
              );
              setTemplateName("");
            }}
          >
            Save current quote
          </button>
        </div>
      </section>
      <section className="editor-section">
        <SectionTitle n="01" title="Package overview" />
        <div className="form-grid">
          <Field
            label="Quotation title"
            value={content.title}
            set={(v: string) => upd("title", v)}
            span
          />
          <Field
            label="Destination(s)"
            value={content.destinations}
            set={(v: string) => upd("destinations", v)}
          />
          <Select
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
          />
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
            <Field
              label="Date"
              type="date"
              value={x.date}
              set={(v: string) => change("itinerary", i, "date", v)}
            />
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
      <section className="editor-section">
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
            <Field
              label="Check-in"
              type="date"
              value={x.checkIn}
              set={(v: string) => change("stays", i, "checkIn", v)}
            />
            <Field
              label="Check-out"
              type="date"
              value={x.checkOut}
              set={(v: string) => change("stays", i, "checkOut", v)}
            />
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
            <Field
              label="Notes / extra bed"
              value={[x.extraBed, x.notes].filter(Boolean).join(" · ")}
              set={(v: string) => change("stays", i, "notes", v)}
            />
          </ArrayCard>
        ))}
      </section>
      <section className="editor-section">
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
            <Field
              label="Date"
              type="date"
              value={x.date}
              set={(v: string) => change("transport", i, "date", v)}
            />
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
              label="Provider / reference"
              value={[x.provider, x.reference].filter(Boolean).join(" / ")}
              set={(v: string) => change("transport", i, "reference", v)}
            />
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
      <section className="editor-section">
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
        {content.options.map((x: any, i: number) => {
          const final =
            Number(x.unitPrice || 0) * Number(x.quantity || 0) -
            Number(x.discount || 0) +
            Number(x.taxAmount || 0);
          return (
            <ArrayCard
              key={x.id}
              title={`${x.name} · ${money(final, content.currency)}`}
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
              <Field
                label="Internal supplier cost"
                type="number"
                step="0.01"
                value={x.internalCost}
                set={(v: string) => change("options", i, "internalCost", v)}
              />
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
          );
        })}
        <div className="price-total">
          <span>Visible option total preview</span>
          <b>{money(totalFromOptions(content.options), content.currency)}</b>
          <small>
            Internal costs and margin never appear in the customer PDF or Sales
            response.
          </small>
        </div>
      </section>
      <section className="editor-section">
        <SectionTitle n="06" title="Inclusions, payment and terms" />
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
          <Field
            label="Advance amount"
            type="number"
            step="0.01"
            value={content.advanceAmount}
            set={(v: string) => upd("advanceAmount", v)}
          />
          <Field
            label="Advance timing"
            value={content.advanceDue}
            set={(v: string) => upd("advanceDue", v)}
            placeholder="Within 2 days of acceptance"
          />
          <Field
            label="Valid until"
            type="date"
            value={content.validUntil}
            set={(v: string) => upd("validUntil", v)}
          />
          <Field
            label="Balance payment terms"
            value={content.balanceTerms}
            set={(v: string) => upd("balanceTerms", v)}
            area
            span
          />
          <Field
            label="Cancellation terms"
            value={content.cancellationTerms}
            set={(v: string) => upd("cancellationTerms", v)}
            area
            span
          />
          <Field
            label="Customer-facing notes"
            value={content.customerNotes}
            set={(v: string) => upd("customerNotes", v)}
            area
          />
          <Field
            label="Owner-only internal notes"
            value={content.internalNotes}
            set={(v: string) => upd("internalNotes", v)}
            area
          />
        </div>
      </section>
      <div className="sticky-save">
        <span>
          Drafts can be incomplete. Approval runs the full business-rule check.
        </span>
        <button className="button secondary" disabled={busy} onClick={save}>
          Save draft
        </button>
        {q.status === "Draft" && (
          <button
            className="button primary"
            disabled={busy}
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

function QuotePreview({ q, content, total }: any) {
  return (
    <div className="quote-preview">
      <header>
        <div>
          <span>EARLYBIRD TRAVEL</span>
          <h2>{content.title || "Untitled quotation"}</h2>
          <p>
            {q.quoteNumber} · Version {q.quoteVersion}
          </p>
        </div>
        <Status value={q.status} />
      </header>
      <section className="preview-facts">
        <div>
          <small>Destination</small>
          <b>{content.destinations || "Not set"}</b>
        </div>
        <div>
          <small>Travel</small>
          <b>
            {content.dateScope === "Exact"
              ? `${content.startDate} - ${content.endDate}`
              : content.dateLabel || "Indicative"}
          </b>
        </div>
        <div>
          <small>Travellers</small>
          <b>
            {content.adults} adult(s)
            {content.childrenAges ? ` · ${content.childrenAges}` : ""}
          </b>
        </div>
      </section>
      {content.summary && <p className="lead-copy">{content.summary}</p>}
      <PreviewSection title="Package options">
        {content.options.map((x: any) => (
          <div className="preview-option" key={x.id}>
            <div>
              <b>{x.name}</b>
              <p>{x.description || x.hotel || "Package option"}</p>
            </div>
            <strong>
              {x.totalMinor !== undefined
                ? money(x.totalMinor, content.currency)
                : money(
                    Number(x.unitPrice || 0) * Number(x.quantity || 0) -
                      Number(x.discount || 0) +
                      Number(x.taxAmount || 0),
                    content.currency,
                  )}
            </strong>
          </div>
        ))}
      </PreviewSection>
      {content.itinerary.length > 0 && (
        <PreviewSection title="Day-wise itinerary">
          {content.itinerary.map((x: any) => (
            <div className="preview-day" key={x.id}>
              <span>{x.day}</span>
              <div>
                <b>{x.title || x.city}</b>
                <p>
                  {[x.activities, x.transfers, x.stay, x.meals]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
            </div>
          ))}
        </PreviewSection>
      )}
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
      <PreviewSection title="Payment and cancellation">
        <p>
          <b>Advance:</b>{" "}
          {content.advanceAmountMinor !== undefined
            ? money(content.advanceAmountMinor, content.currency)
            : money(content.advanceAmount, content.currency)}{" "}
          · {content.advanceDue}
        </p>
        <p>{content.balanceTerms}</p>
        <p>{content.cancellationTerms}</p>
      </PreviewSection>
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
    </div>
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
function Decision({ q, busy, submit }: any) {
  const [data, setData] = useState({
    quoteId: q._id,
    version: q.version,
    decision: "Accepted",
    selectedOptionId: q.snapshot?.content?.options?.[0]?.id || "",
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
        submit({ ...data, decidedAt: iso(data.decidedAt) });
      }}
    >
      <h3 className="span">Customer decision</h3>
      <Select
        label="Decision"
        value={data.decision}
        set={(v: string) => setData({ ...data, decision: v })}
        options={["Accepted", "Rejected", "Changes requested"]}
      />
      {data.decision === "Accepted" && (
        <Select
          label="Exact accepted option"
          value={data.selectedOptionId}
          set={(v: string) => setData({ ...data, selectedOptionId: v })}
          options={(q.snapshot?.content?.options || []).map((x: any) => [
            x.id,
            x.name,
          ])}
        />
      )}
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
            : "Reason / requested changes"
        }
        value={data.reason}
        set={(v: string) => setData({ ...data, reason: v })}
        area
        span
      />
      <Foot busy={busy} text="Save decision" />
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
  const [reason, setReason] = useState("");
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
            true,
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
function totalFromOptions(options: any[]) {
  return options.reduce(
    (n, x) =>
      n +
      (Number(x.unitPrice || 0) * Number(x.quantity || 0) -
        Number(x.discount || 0) +
        Number(x.taxAmount || 0)),
    0,
  );
}
