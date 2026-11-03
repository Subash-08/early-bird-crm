"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BarChart3, Download, RefreshCw, Search } from "lucide-react";

const stages = ["", "New", "Contacting", "Gathering details", "Quote requested", "Quote sent", "Won", "On hold", "Lost"];
const sources = ["", "WhatsApp", "Phone", "Website", "Instagram", "Referral", "Walk-in", "Other"];
const money = (minor: number, currency: string) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 2 }).format(Number(minor || 0) / 100);

export function Reports({ s, fail }: { s: any; fail: (message: string) => void }) {
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
