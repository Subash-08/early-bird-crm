"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BarChart3, Download, RefreshCw, Search } from "lucide-react";
import { registerDates, registerSources, registerStages, registerStatuses } from "@/lib/customer-register";

const stages = ["", "New", "Contacting", "Gathering details", "Quote requested", "Quote sent", "Won", "On hold", "Lost"];
const sources = ["", "WhatsApp", "Phone", "Website", "Instagram", "Referral", "Walk-in", "Other"];
const money = (minor: number, currency: string) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 2 }).format(Number(minor || 0) / 100);

export function Reports({ s, fail }: { s: any; fail: (message: string) => void }) {
  const [view, setView] = useState(s.actor.role === "operations" ? "summary" : "register");
  return <>
    {s.actor.role !== "operations" && <nav className="quote-actions report-view-tabs" aria-label="Report sections">
      <button className={`button ${view === "register" ? "primary" : "secondary"}`} aria-pressed={view === "register"} onClick={() => setView("register")}>Customer &amp; trip register</button>
      <button className={`button ${view === "summary" ? "primary" : "secondary"}`} aria-pressed={view === "summary"} onClick={() => setView("summary")}>Summary reports</button>
    </nav>}
    {view === "register" && s.actor.role !== "operations" ? <CustomerRegister s={s} /> : <SummaryReports s={s} fail={fail} />}
  </>;
}

const emptyRegisterFilters = { from: "", to: "", stage: "", status: "", source: "", staffId: "", destination: "", q: "" };
type RegisterRow = Record<string, string | number | undefined>;
type RegisterPage = { rows: RegisterRow[]; page: number; pageSize: number; total: number };

function CustomerRegister({ s }: { s: any }) {
  const [filters, setFilters] = useState(emptyRegisterFilters);
  const [applied, setApplied] = useState(emptyRegisterFilters);
  const [period, setPeriod] = useState("all");
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<RegisterPage | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [exportScope, setExportScope] = useState("filtered");
  const query = useMemo(() => new URLSearchParams({ view: "register", ...applied }).toString(), [applied]);
  useEffect(() => {
    let active = true;
    fetch(`/api/reports?${query}&page=${page}`, { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "Could not load the register.");
        if (active) setResult(body);
      })
      .catch((reason) => { if (active) setError(reason.message); });
    return () => { active = false; };
  }, [query, page, retry]);
  const update = (field: keyof typeof filters, value: string) => setFilters({ ...filters, [field]: value });
  const apply = (next: typeof filters) => {
    if (JSON.stringify(applied) === JSON.stringify(next) && page === 1 && result) return;
    if (JSON.stringify(applied) === JSON.stringify(next) && page === 1) setRetry((value) => value + 1);
    setError(""); setResult(null); setPage(1); setApplied(next);
  };
  const download = (format: string) => `/api/reports?${exportScope === "all" ? "view=register" : query}&scope=${exportScope}&format=${format}`;
  const hasNext = Boolean(result && result.page * result.pageSize < result.total);
  const select = (label: string, field: "stage" | "status" | "source", options: string[]) => <label><span>{label}</span>
    <select value={filters[field]} onChange={(event) => update(field, event.target.value)}>
      <option value="">All</option>{options.map((option) => <option value={option} key={option}>{field === "stage" && option === "Won" ? "Accepted" : option}</option>)}
    </select>
  </label>;
  return <div className="reports-page">
    <section className="panel report-filter-panel">
      <div><h2>Customer &amp; trip register</h2><p>One row per enquiry. Customers without a visible enquiry also appear. Dates use when the record was created in India time.</p></div>
      <form onSubmit={(event) => { event.preventDefault(); apply(filters); }}>
        <label><span>Created</span><select value={period} onChange={(event) => {
          const value = event.target.value;
          setPeriod(value);
          if (value === "all") setFilters({ ...filters, from: "", to: "" });
          else if (value !== "custom") setFilters({ ...filters, ...registerDates(Number(value)) });
        }}>
          <option value="all">All time</option><option value="1">Today</option><option value="7">Last 7 days</option>
          <option value="30">Last 30 days</option><option value="custom">Custom dates</option>
        </select></label>
        {period === "custom" && <>
          <label><span>From</span><input type="date" value={filters.from} onChange={(event) => update("from", event.target.value)} /></label>
          <label><span>To</span><input type="date" value={filters.to} min={filters.from || undefined} onChange={(event) => update("to", event.target.value)} /></label>
        </>}
        {select("Enquiry stage", "stage", registerStages)}
        {select("Quote or booking status", "status", registerStatuses)}
        {select("Source", "source", registerSources)}
        {s.actor.role === "owner" && <label><span>Lead</span><select value={filters.staffId} onChange={(event) => update("staffId", event.target.value)}>
          <option value="">All leads</option>{s.staff.filter((person: any) => person.role !== "operations").map((person: any) => <option value={person._id} key={person._id}>{person.name}</option>)}
        </select></label>}
        <label><span>Destination</span><input maxLength={100} value={filters.destination} onChange={(event) => update("destination", event.target.value)} /></label>
        <label><span>Search</span><input maxLength={100} value={filters.q} placeholder="Customer, contact or reference" onChange={(event) => update("q", event.target.value)} /></label>
        <div className="report-filter-actions"><button className="button primary">Apply filters</button>
          <button type="button" className="button secondary" onClick={() => { setPeriod("all"); setFilters(emptyRegisterFilters); apply(emptyRegisterFilters); }}>Clear filters</button></div>
      </form>
    </section>
    <div className="report-toolbar register-toolbar">
      <p aria-live="polite">{result ? `${result.total} matching record${result.total === 1 ? "" : "s"}` : ""}</p>
      <div><label className="field"><span>Export</span><select value={exportScope} onChange={(event) => setExportScope(event.target.value)}>
        <option value="filtered">Filtered records</option><option value="all">All records I can access</option>
      </select></label>
      {(result || exportScope === "all") && <><a className="button secondary" href={download("csv")} download><Download /> CSV</a>
        <a className="button secondary" href={download("xlsx")} download><Download /> Excel</a></>}</div>
    </div>
    {error ? <p className="form-error" role="alert">{error}</p> : !result ? <div className="panel report-loading" role="status"><RefreshCw className="spin" /> Loading customer records…</div> :
      <section className="panel register-list">
        {!result.rows.length && <p>No records match the applied filters.</p>}
        {result.rows.map((row) => <details className="register-row" key={`${row.enquiryId || "customer"}:${row.customerId}`}>
          <summary><b>{row.customer}</b><span>{row.destination || "Destination pending"}</span><span>{row.stage}</span><span>{row.status}</span></summary>
          <dl>{[
            ["Contact", [row.phone, row.email].filter(Boolean).join(" · ")], ["Address", row.address], ["Language", row.language],
            ["Lead", row.lead], ["Source", row.source], ["Created", row.createdAt],
            ["Travel dates", [row.departure, row.returnDate].filter(Boolean).join(" to ") || row.travelPreference],
            ["Travellers", [row.adults != null && `${row.adults} adult(s)`, row.childrenAges && `Children: ${row.childrenAges}`, row.infants != null && `${row.infants} infant(s)`].filter(Boolean).join(" · ")],
            ["Budget", [row.budget, row.budgetBasis].filter(Boolean).join(" · ")],
            ["Services", [row.services, row.serviceResponsibility].filter(Boolean).join(" · ")],
            ["Stay", [row.hotelPreference, row.rooms].filter(Boolean).join(" · ")],
            ["Pickup and drop-off", [row.pickup, row.dropoff].filter(Boolean).join(" → ")], ["Special requirements", row.specialRequirements],
            ["Last call outcome", row.contactOutcome], ["First contact", row.firstContactAt], ["Next action", row.nextAction], ["Follow-up", row.nextFollowUp], ["Latest activity", row.lastActivityAt],
            ["Last updated", row.updatedAt], ["Quote", [row.quoteNumber, row.quoteTitle, row.quoteStatus].filter(Boolean).join(" · ")],
            ["Booking", [row.bookingNumber, row.bookingStatus].filter(Boolean).join(" · ")],
          ].filter(([, value]) => Boolean(value)).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
          <a className="button secondary" href={row.enquiryId ? `/enquiries/${encodeURIComponent(row.enquiryId)}` : `/customers/${encodeURIComponent(row.customerId || "")}`}>{row.enquiryId ? "Open enquiry" : "Open customer"}</a>
        </details>)}
        {(page > 1 || hasNext) && <div className="quote-actions">
          <button className="button secondary" disabled={page <= 1} onClick={() => { setResult(null); setPage(page - 1); }}>Previous</button>
          <span>Page {page}</span>
          <button className="button secondary" disabled={!hasNext} onClick={() => { setResult(null); setPage(page + 1); }}>Next</button>
        </div>}
      </section>}
  </div>;
}

function SummaryReports({ s, fail }: { s: any; fail: (message: string) => void }) {
  const [filters, setFilters] = useState({ from: "", to: "", staffId: "", stage: "", source: "", destination: "" });
  const [applied, setApplied] = useState(filters);
  const [report, setReport] = useState<any>(null);
  const [busy, setBusy] = useState(true);
  const query = useMemo(() => new URLSearchParams(Object.entries(applied).filter(([, value]) => value)).toString(), [applied]);
  const load = useCallback(async () => {
    setBusy(true);
    try {
      const response = await fetch(`/api/reports?${query}`, { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Report could not be loaded");
      setReport(body);
    } catch (error) {
      fail(error instanceof Error ? error.message : "Report could not be loaded");
    } finally {
      setBusy(false);
    }
  }, [fail, query]);
  useEffect(() => { void load(); }, [load]);
  const maxStage = Math.max(1, ...(report?.pipeline?.byStage || []).map((item: any) => item.count));
  const conversion = report?.pipeline?.total ? Math.round((report.pipeline.won / report.pipeline.total) * 1000) / 10 : 0;
  const download = (format: string) => `/api/reports?${query}${query ? "&" : ""}format=${format}`;
  return (
    <div className="reports-page">
      <section className="panel report-filter-panel">
        <div>
          <p className="eyebrow">Permission-aware reporting</p>
          <h2>Filter once, review and export the same data</h2>
          <p>Money stays separated by currency. Operations never receives commercial totals.</p>
        </div>
        <form onSubmit={(event) => { event.preventDefault(); setApplied({ ...filters }); }}>
          <label><span>From</span><input type="date" value={filters.from} onChange={(event) => setFilters({ ...filters, from: event.target.value })} /></label>
          <label><span>To</span><input type="date" value={filters.to} onChange={(event) => setFilters({ ...filters, to: event.target.value })} /></label>
          {s.actor.role === "owner" && <label><span>Staff</span><select value={filters.staffId} onChange={(event) => setFilters({ ...filters, staffId: event.target.value })}><option value="">All permitted staff</option>{s.staff.filter((person: any) => person.role !== "operations").map((person: any) => <option value={person._id} key={person._id}>{person.name}</option>)}</select></label>}
          {s.actor.role !== "operations" && <label><span>Stage</span><select value={filters.stage} onChange={(event) => setFilters({ ...filters, stage: event.target.value })}>{stages.map((stage) => <option value={stage} key={stage}>{stage || "All stages"}</option>)}</select></label>}
          {s.actor.role !== "operations" && <label><span>Source</span><select value={filters.source} onChange={(event) => setFilters({ ...filters, source: event.target.value })}>{sources.map((source) => <option value={source} key={source}>{source || "All sources"}</option>)}</select></label>}
          <label><span>Destination</span><div className="report-search"><Search /><input value={filters.destination} onChange={(event) => setFilters({ ...filters, destination: event.target.value })} placeholder="e.g. Kerala" /></div></label>
          <div className="report-filter-actions">
            <button className="button primary" disabled={busy}>{busy ? <RefreshCw className="spin" /> : <BarChart3 />} Apply filters</button>
            <button type="button" className="button secondary" onClick={() => { const empty = { from: "", to: "", staffId: "", stage: "", source: "", destination: "" }; setFilters(empty); setApplied(empty); }}>Clear</button>
          </div>
        </form>
      </section>
      {busy && !report ? <section className="panel report-loading"><RefreshCw className="spin" /> Calculating authorized records…</section> : report && <>
        <div className="report-toolbar">
          <p>Generated {new Date(report.generatedAt).toLocaleString("en-IN")}</p>
          <div><a className="button secondary" href={download("csv")}><Download /> CSV</a><a className="button secondary" href={download("xlsx")}><Download /> Excel</a></div>
        </div>
        <div className="report-kpis">
          <article className="panel"><small>Filtered enquiries</small><strong>{report.pipeline.total}</strong><span>{conversion}% won in this cohort</span></article>
          <article className="panel"><small>Open tasks</small><strong>{report.workload.openTasks}</strong><span>{report.workload.overdueTasks} overdue</span></article>
          <article className="panel"><small>Upcoming departures</small><strong>{report.departures.length}</strong><span>Next 30 days</span></article>
          <article className="panel"><small>Quote turnaround</small><strong>{report.pipeline.averageQuoteTurnaroundHours == null ? "—" : `${report.pipeline.averageQuoteTurnaroundHours}h`}</strong><span>Request to approval</span></article>
        </div>
        <div className="report-grid">
          {s.actor.role !== "operations" && <section className="panel report-section"><header><div><p className="eyebrow">Pipeline</p><h3>Enquiries by stage</h3></div></header><div className="report-bars">{report.pipeline.byStage.map((item: any) => <div key={item.label}><span>{item.label}</span><i><b style={{ width: `${(item.count / maxStage) * 100}%` }} /></i><strong>{item.count}</strong></div>)}{!report.pipeline.byStage.length && <p>No enquiries match these filters.</p>}</div></section>}
          <section className="panel report-section"><header><div><p className="eyebrow">Delivery pressure</p><h3>Workload and readiness</h3></div></header><dl className="report-definition-list"><div><dt>Overdue tasks</dt><dd>{report.workload.overdueTasks}</dd></div><div><dt>Readiness pending</dt><dd>{report.workload.readinessPending}</dd></div><div><dt>Open incidents</dt><dd>{report.workload.openIncidents}</dd></div></dl></section>
        </div>
        {s.actor.role === "owner" && <section className="panel report-section"><header><div><p className="eyebrow">Money</p><h3>Separated financial positions</h3><p>Booked value, cash, obligations and refunds are deliberately not combined.</p></div></header><div className="finance-report-grid">{(report.finance || []).map((item: any) => <article key={item.currency}><b>{item.currency}</b><dl><div><dt>Booked</dt><dd>{money(item.bookedMinor, item.currency)}</dd></div><div><dt>Invoiced</dt><dd>{money(item.invoicedMinor, item.currency)}</dd></div><div><dt>Verified cash</dt><dd>{money(item.collectedMinor, item.currency)}</dd></div><div><dt>Customer balance</dt><dd>{money(item.outstandingMinor, item.currency)}</dd></div><div><dt>Supplier payable</dt><dd>{money(item.supplierPayableMinor, item.currency)}</dd></div><div><dt>Refund pending</dt><dd>{money(item.refundsPendingMinor, item.currency)}</dd></div><div><dt>Recovery pending</dt><dd>{money(item.recoveriesPendingMinor, item.currency)}</dd></div></dl></article>)}{!report.finance?.length && <p>No booking money matches these filters.</p>}</div></section>}
        <section className="panel report-section"><header><div><p className="eyebrow">Next 30 days</p><h3>Upcoming departures</h3></div></header><div className="data-table report-departures"><div className="table-row table-head"><span>Booking</span><span>Destination</span><span>Start</span><span>Status</span><span>Owner</span></div>{report.departures.map((item: any) => <div className="table-row" key={item.bookingNumber}><span><b>{item.bookingNumber}</b></span><span>{item.destination || "Not set"}</span><span>{item.start || "Not set"}</span><span>{item.status}</span><span>{item.owner}</span></div>)}{!report.departures.length && <p>No departure is scheduled in the next 30 days.</p>}</div></section>
        <details className="panel report-definitions"><summary>How these numbers are defined</summary>{Object.entries(report.definitions).map(([key, value]) => <p key={key}><b>{key}:</b> {String(value)}</p>)}</details>
      </>}
    </div>
  );
}
