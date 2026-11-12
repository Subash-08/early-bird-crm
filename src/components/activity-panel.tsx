"use client";

import { useEffect, useState } from "react";
import { activityDateBounds, activityPresets, presetActivityDates, type ActivityPreset } from "@/lib/activity-range";

type AttendanceRow = {
  _id: string; workDate: string; displayStatus: string; checkInAt: string | null; checkOutAt: string | null;
  totalWorkingMinutes: number | null; attendanceKind?: string; correctionId?: string;
};
type Summary = { present: number; late: number; missed: number; offsite: number; minutes: number; rows: AttendanceRow[] };
type WorkRow = { _id: string; title: string; status: string };
type Data = {
  attendance: Summary;
  member?: { name: string; role: string };
  work?: {
    dueCount: number; overdue: number; completed: number; connected: number; attempts: number; tripCount: number;
    dueRows: (WorkRow & { dueAt: string })[];
    tripRows: (WorkRow & { startAt: string; endAt: string })[];
    recentEvents: { _id: string; label?: string; kind: string; outcome?: string; occurredAt: string; customerName?: string }[];
  };
};
type Dates = { from: string; to: string };
const dateFormat = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric" });
const timeFormat = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" });
const showTime = (value?: string | null) => value ? timeFormat.format(new Date(value)) : "—";
const showDate = (value: string) => dateFormat.format(new Date(`${value}T12:00:00Z`));
const hours = (value: number) => `${Math.floor(value / 60)}h ${value % 60}m`;

export function ActivityPanel({ memberId, memberName, revision }: { memberId?: string; memberName?: string; revision?: string }) {
  const team = Boolean(memberId);
  const [preset, setPreset] = useState<ActivityPreset>(team ? "Today" : "This month");
  const [range, setRange] = useState(() => presetActivityDates(team ? "Today" : "This month"));
  const [draft, setDraft] = useState<Dates>(range);
  const [validation, setValidation] = useState("");
  const [retry, setRetry] = useState(0);
  const [result, setResult] = useState<{ key: string; data?: Data; error?: string }>();
  const params = new URLSearchParams({ ...range, ...(memberId ? { staffId: memberId } : {}) }).toString();
  const key = `${params}:${retry}:${revision || ""}`;
  useEffect(() => {
    // Ignore responses from a previous filter or a panel that has closed.
    let active = true;
    (async () => {
      try {
        const response = await fetch(`/api/team-activity?${params}`, { cache: "no-store" });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not load activity.");
        if (active) setResult({ key, data });
      } catch (error) {
        if (active) setResult({ key, error: error instanceof Error ? error.message : "Could not load activity." });
      }
    })();
    return () => { active = false; };
  }, [key, params]);
  const current = result?.key === key ? result : undefined;
  const data = current?.data;
  const work = data?.work;
  return <div className="activity-panel">
    <div className="panel-head"><div><h3>{team ? memberName || "Team activity" : "My attendance"}</h3><p>{team ? "Work and attendance for the selected period." : "See your recorded days and working hours for a selected period."}</p></div></div>
    <form className="activity-filters" onSubmit={(event) => {
      event.preventDefault();
      try { activityDateBounds(draft.from, draft.to); setRange(draft); setValidation(""); }
      catch (error) { setValidation(error instanceof Error ? error.message : "Choose valid dates."); }
    }}>
      <label>Period<select value={preset} onChange={(event) => {
        const value = event.target.value as ActivityPreset;
        setPreset(value); setValidation("");
        if (value === "Custom dates") setDraft(range);
        else { const dates = presetActivityDates(value); setRange(dates); setDraft(dates); }
      }}>{activityPresets.map((value) => <option key={value}>{value}</option>)}</select></label>
      {preset === "Custom dates" && <>
        <label>From<input type="date" value={draft.from} onChange={(event) => setDraft({ ...draft, from: event.target.value })} required /></label>
        <label>To<input type="date" min={draft.from || undefined} value={draft.to} onChange={(event) => setDraft({ ...draft, to: event.target.value })} required /></label>
        <button className="button primary">Apply dates</button>
      </>}
      <button type="button" className="button secondary" onClick={() => setRetry((count) => count + 1)}>Refresh activity</button>
    </form>
    {validation && <p role="alert" className="form-error">{validation}</p>}
    {!current && <p role="status">Loading activity…</p>}
    {current?.error && <p role="alert">{current.error} <button className="button secondary" onClick={() => setRetry(retry + 1)}>Retry</button></p>}
    {data && <>
      <p className="activity-period">{showDate(range.from)}{range.to !== range.from && ` – ${showDate(range.to)}`} (IST)</p>
      {work && <>
        <div className="activity-metrics">
          <Stat label="Tasks due" value={work.dueCount} /><Stat label="Still overdue" value={work.overdue} />
          <Stat label="Tasks completed" value={work.completed} /><Stat label="Contact attempts" value={work.attempts} />
          <Stat label="Connected calls" value={work.connected} /><Stat label="Driver assignments" value={work.tripCount} />
        </div>
        <p className="attendance-helper">Tasks due use the due date. Completions and calls use the date they were logged. Older calls and completions were not backfilled.</p>
        <div className="activity-details">
          <details><summary>Tasks and follow-ups</summary><ul>{work.dueRows.map((item) => <li key={item._id}><b>{item.title}</b><span>{item.status} · Due {showTime(item.dueAt)}</span></li>)}</ul>
            {!work.dueRows.length && <p>No tasks due in this period.</p>}{work.dueCount > work.dueRows.length && <p>Showing the first {work.dueRows.length}. Narrow the dates to see more.</p>}</details>
          <details><summary>Contact attempts and completed tasks</summary><ul>{work.recentEvents.map((item) => <li key={item._id}><b>{item.kind === "contact" ? item.customerName || item.label || "Customer contact" : item.label || "Task completed"}</b><span>{item.kind === "contact" ? item.outcome : "Completed"} · {showTime(item.occurredAt)}</span></li>)}</ul>
            {!work.recentEvents.length && <p>No activity logged in this period.</p>}{work.completed + work.attempts > work.recentEvents.length && <p>Showing the latest {work.recentEvents.length}. Narrow the dates to see more.</p>}</details>
          {work.tripCount > 0 && <details><summary>Assigned trips</summary><ul>{work.tripRows.map((item) => <li key={item._id}><b>{item.title}</b><span>{showTime(item.startAt)} → {showTime(item.endAt)}{item.status ? ` · ${item.status}` : ""}</span></li>)}</ul>
            {work.tripCount > work.tripRows.length && <p>Showing the first {work.tripRows.length}. Narrow the dates to see more.</p>}</details>}
        </div>
        <h4>Attendance</h4>
      </>}
      <div className="activity-metrics">
        <Stat label="Days present" value={data.attendance.present} /><Stat label="Late days" value={data.attendance.late} />
        <Stat label="Missed check-outs" value={data.attendance.missed} /><Stat label="Approved off-site days" value={data.attendance.offsite} />
        <Stat label="Recorded hours" value={hours(data.attendance.minutes)} />
      </div>
      {!data.attendance.rows.length ? <p className="attendance-empty">No attendance recorded in this period.</p> :
        <div className="responsive-table" tabIndex={0} role="region" aria-label="Attendance for selected period">
          <table><thead><tr><th>Date</th><th>Status</th><th>Check in</th><th>Check out</th><th>Working time</th></tr></thead>
            <tbody>{data.attendance.rows.map((row) => <tr key={row._id}><td>{showDate(row.workDate)}</td>
              <td><div className="attendance-status-stack"><span className={`attendance-status small ${row.displayStatus.toLowerCase().replaceAll(" ", "-")}`}>{row.displayStatus}{row.attendanceKind === "offsite" ? " · Off-site" : ""}</span>
                {row.correctionId && <span className="attendance-status small">{row.attendanceKind === "offsite" ? "Request approved" : "Correction approved"}</span>}</div></td>
              <td>{showTime(row.checkInAt)}</td><td>{showTime(row.checkOutAt)}</td><td>{row.totalWorkingMinutes === null ? "—" : hours(row.totalWorkingMinutes)}</td></tr>)}</tbody>
          </table>
        </div>}
    </>}
  </div>;
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return <div><small>{label}</small><strong>{value}</strong></div>;
}
