"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AttendanceMap } from "./attendance-map";
import { ActivityPanel } from "./activity-panel";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  ChevronLeft,
  ChevronRight,
  Download,
  FilePenLine,
  LoaderCircle,
  LogIn,
  LogOut,
  MapPin,
  Save,
  ShieldCheck,
  UsersRound,
} from "lucide-react";

type Row = Record<string, any>;
type Policy = {
  officeName: string; latitude: number; longitude: number; radiusM: number;
  maximumAccuracyM: number; maximumLocationAgeSeconds: number; timezone: "Asia/Kolkata";
  workStart: string; workEnd: string; graceMinutes: number; workingDays: number[];
};
type Data = {
  role: "owner" | "staff"; date: string; today: string; policy: Policy;
  dayType?: "Workday" | "Holiday" | "Day off"; holiday?: { name: string } | null;
  current?: Row | null; history?: Row[]; exceptions: Row[];
  attendance?: Row[]; summary?: { present: number; late: number; absent: number; missingCheckout: number };
  staff?: { id: string; name: string }[];
};

const dateTime = (value?: string) => value ? new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "—";
const duration = (minutes?: number) => {
  if (minutes === undefined || minutes === null) return "—";
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
};
const dateInput = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const displayDate = (date: string) => new Intl.DateTimeFormat("en-IN", { timeZone: "UTC", dateStyle: "full" }).format(new Date(`${date}T12:00:00Z`));
const shiftDate = (date: string, days: number) => new Date(Date.parse(`${date}T12:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
const indiaTime = (date: string, time: string) => time ? new Date(`${date}T${time}:00+05:30`).toISOString() : "";

async function request(action?: string, data?: unknown, date?: string, staffId?: string) {
  if (!action) {
    const params = new URLSearchParams();
    if (date) params.set("date", date);
    if (staffId) params.set("staffId", staffId);
    const response = await fetch(`/api/attendance?${params}`, { cache: "no-store" });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "Could not load attendance.");
    return body as Data;
  }
  const response = await fetch("/api/attendance", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, data }) });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || "Could not save attendance.");
  return body.result;
}

function locationNow(): Promise<{ latitude: number; longitude: number; accuracyM: number; capturedAt: string }> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) { reject(new Error("This browser does not support location. Use a current browser on your phone or computer.")); return; }
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({ latitude: position.coords.latitude, longitude: position.coords.longitude, accuracyM: position.coords.accuracy, capturedAt: new Date(position.timestamp).toISOString() }),
      (error) => {
        const messages: Record<number, string> = {
          1: "Location permission was denied. Allow location in the browser, then try again.",
          2: "Your location could not be determined. Move to an open area and try again.",
          3: "Location request timed out. Check GPS and try again.",
        };
        reject(new Error(messages[error.code] || "Could not get your current location."));
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20_000 },
    );
  });
}

export function Attendance({ role, fail }: { role: "owner" | "sales" | "operations"; fail: (message: string) => void }) {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [date, setDate] = useState(dateInput());
  const [staffId, setStaffId] = useState("");
  const [notice, setNotice] = useState("");
  const [fix, setFix] = useState<Awaited<ReturnType<typeof locationNow>> | null>(null);
  const [locationMessage, setLocationMessage] = useState("");
  const [loadFailed, setLoadFailed] = useState(false);
  const loadId = useRef(0);
  const load = useCallback(async () => {
    const id = ++loadId.current;
    try {
      setLoading(true);
      setLoadFailed(false);
      const result = await request(undefined, undefined, date, staffId);
      if (id === loadId.current) setData(result);
    } catch (error) { if (id === loadId.current) { setLoadFailed(true); fail(error instanceof Error ? error.message : "Could not load attendance."); } }
    finally { if (id === loadId.current) setLoading(false); }
  }, [date, fail, staffId]);
  useEffect(() => { void load(); }, [load]);
  const action = async (kind: "check-in" | "check-out" | "preview") => {
    try {
      setBusy(kind); setNotice(""); setLocationMessage("Getting your current location…");
      const location = await locationNow();
      setFix(location);
      setLocationMessage("");
      if (kind === "preview") return;
      setNotice("Verifying your location with the office…");
      await request(kind, { commandId: crypto.randomUUID(), location });
      setNotice(kind === "check-in" ? "Check-in recorded." : "Check-out recorded.");
      await load();
    } catch (error) {
      setNotice("");
      setLocationMessage(error instanceof Error ? error.message : "Could not verify your location.");
    }
    finally { setBusy(""); }
  };
  if (loading && !data) return <section className="panel route-loading"><LoaderCircle className="spin" /> Loading attendance…</section>;
  if (!data) return <section className="panel"><button className="button secondary" onClick={() => void load()}>Retry attendance</button></section>;
  return role === "owner"
    ? <OwnerAttendance data={data} date={date} setDate={setDate} staffId={staffId} setStaffId={setStaffId} reload={load} busy={busy} setBusy={setBusy} loading={loading} loadFailed={loadFailed} fail={fail} />
    : <StaffAttendance data={data} busy={busy} notice={notice} action={action} reload={load} fail={fail} fix={fix} locationMessage={locationMessage} />;
}

function StaffAttendance({ data, busy, notice, action, reload, fail, fix, locationMessage }: {
  data: Data; busy: string; notice: string; action: (kind: "check-in" | "check-out" | "preview") => Promise<void>;
  reload: () => Promise<void>; fail: (message: string) => void;
  fix: Awaited<ReturnType<typeof locationNow>> | null; locationMessage: string;
}) {
  const current = data.current;
  const dayOff = data.dayType === "Holiday" || data.dayType === "Day off";
  const status = current?.displayStatus || (dayOff ? data.dayType : "Not checked in");
  const canCheckIn = !current?.checkInAt && !dayOff;
  const canCheckOut = Boolean(current?.checkInAt && !current?.checkOutAt);
  const [reason, setReason] = useState("");
  const [workDate, setWorkDate] = useState(data.today);
  const [requestedCheckIn, setRequestedCheckIn] = useState("");
  const [requestedCheckOut, setRequestedCheckOut] = useState("");
  const [savingCorrection, setSavingCorrection] = useState(false);
  const [requestKind, setRequestKind] = useState<"correction" | "offsite">("correction");
  const [place, setPlace] = useState("");
  const [reference, setReference] = useState("");
  const [requestNotice, setRequestNotice] = useState("");
  const offsite = requestKind === "offsite";
  const submitCorrection = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      setSavingCorrection(true); setRequestNotice("");
      await request(requestKind, offsite
        ? { workDate, start: requestedCheckIn, end: requestedCheckOut, reason, place, reference }
        : { workDate, requestedCheckIn: indiaTime(workDate, requestedCheckIn), requestedCheckOut: indiaTime(workDate, requestedCheckOut), reason });
      setReason(""); setRequestedCheckIn(""); setRequestedCheckOut("");
      setPlace(""); setReference(""); setRequestNotice("Request sent to the Owner for review.");
      await reload();
    } catch (error) { fail(error instanceof Error ? error.message : "Could not request a correction."); }
    finally { setSavingCorrection(false); }
  };
  return <div className="attendance-page">
    <section className="attendance-hero panel">
      <div>
        <p className="eyebrow">My attendance</p>
        <h2>{status}</h2>
        <p>Location is requested when you choose Show my location, Check in or Check out.</p>
      </div>
      <span className={`attendance-status ${String(status).toLowerCase().replaceAll(" ", "-")}`}><ShieldCheck /> {status}</span>
    </section>
    <div className="attendance-staff-grid">
      <section className="panel attendance-clock-card">
        <span className="attendance-orbit"><Clock3 /></span>
        <p>{data.policy.officeName}</p>
        <h3>{canCheckIn ? "Ready to start?" : canCheckOut ? "Your day is in progress" : dayOff && !current?.checkInAt ? data.holiday?.name || "Scheduled day off" : "Your attendance is complete"}</h3>
        {dayOff && !current?.checkInAt && <p>If you worked today, submit an attendance request below.</p>}
        <small>Office radius {data.policy.radiusM} m · Location accuracy up to {data.policy.maximumAccuracyM} m</small>
        <div className="attendance-actions">
          <button className="button primary" disabled={!canCheckIn || Boolean(busy)} onClick={() => void action("check-in")}><LogIn /> {busy === "check-in" ? "Checking in…" : "Check in"}</button>
          <button className="button secondary" disabled={!canCheckOut || Boolean(busy)} onClick={() => void action("check-out")}><LogOut /> {busy === "check-out" ? "Checking out…" : "Check out"}</button>
        </div>
        {(notice || locationMessage) && <p className="attendance-notice" role="status">{busy && <LoaderCircle className="spin" />} {notice || locationMessage}</p>}
      </section>
      <section className="panel attendance-timeline">
        <h3>Today</h3>
        <div><span><LogIn /></span><p><b>Check in</b><small>{dateTime(current?.checkInAt)}</small></p></div>
        <div><span><LogOut /></span><p><b>Check out</b><small>{dateTime(current?.checkOutAt)}</small></p></div>
        <div><span><Clock3 /></span><p><b>Working time</b><small>{current?.checkOutAt ? duration(current.totalWorkingMinutes) : "Calculated after check-out"}</small></p></div>
        {current && approvalLabel(current) && <div><span><CheckCircle2 /></span><p><b>{approvalLabel(current)}</b><small>The times above include the approved changes.</small></p></div>}
      </section>
    </div>
    <section className="panel attendance-settings">
      <div className="panel-head"><div><h3><MapPin /> Office and your location</h3><p>Preview your location without recording attendance. Check-in and check-out each request a fresh reading.</p></div>
        <button type="button" className="button secondary" disabled={Boolean(busy)} onClick={() => void action("preview")}><MapPin /> {busy === "preview" ? "Finding location…" : fix ? "Refresh my location" : "Show my location"}</button>
      </div>
      <AttendanceMap office={data.policy} radiusM={data.policy.radiusM} fix={fix} accuracyLimit={data.policy.maximumAccuracyM} />
      {fix && <p className="attendance-notice">Last reading: {dateTime(fix.capturedAt)}</p>}
      {locationMessage && <p className="attendance-notice">{locationMessage}</p>}
    </section>
    <section className="panel attendance-history"><ActivityPanel revision={`${data.today}:${current?.version || 0}`} /></section>
    <section className="panel attendance-correction"><div className="panel-head"><div><h3><FilePenLine /> Attendance requests</h3><p>Fix a missed entry or request attendance for company work away from the office.</p></div></div>
      <form onSubmit={submitCorrection} className="attendance-correction-form">
        <label className="full">Request type<select value={requestKind} disabled={savingCorrection} onChange={(event) => {
          setRequestKind(event.target.value === "offsite" ? "offsite" : "correction");
          setReason(""); setRequestedCheckIn(""); setRequestedCheckOut(""); setRequestNotice("");
        }}><option value="correction">Request a correction</option><option value="offsite">Request off-site attendance</option></select></label>
        <label>Date<input type="date" value={workDate} max={data.today} onChange={(event) => setWorkDate(event.target.value)} required /></label>
        <label>{offsite ? "Work start" : "Requested check-in"} (IST)<input type="time" value={requestedCheckIn} onChange={(event) => setRequestedCheckIn(event.target.value)} required={offsite} /></label>
        <label>{offsite ? "Work end" : "Requested check-out"} (IST)<input type="time" value={requestedCheckOut} onChange={(event) => setRequestedCheckOut(event.target.value)} required={offsite} /></label>
        {offsite && <><label>Work location<input value={place} onChange={(event) => setPlace(event.target.value)} minLength={2} maxLength={160} required /></label>
          <label>Booking or task reference (optional)<input value={reference} onChange={(event) => setReference(event.target.value)} maxLength={120} /></label></>}
        <label className="full">{offsite ? "What company work did you do?" : "Reason"}<textarea value={reason} minLength={10} maxLength={1000} onChange={(event) => setReason(event.target.value)} placeholder={offsite ? "For example: Met the transport supplier to confirm vehicles for a booking." : "For example: GPS did not work when I left the office."} required /></label>
        <button className="button secondary" disabled={savingCorrection}>{savingCorrection ? "Sending…" : "Send for Owner review"}</button>
      </form>
      {requestNotice && <p role="status">{requestNotice}</p>}
      {(data.exceptions || []).length > 0 && <div className="attendance-exceptions"><b>My requests</b>{data.exceptions.map((item) => <p key={item._id}><span>{item.workDate} · {item.kind === "offsite" ? "Off-site" : "Correction"}</span><span className={`attendance-status small ${String(item.status).toLowerCase()}`}>{item.status}</span>{item.ownerNote && <small>{item.ownerNote}</small>}</p>)}</div>}
    </section>
  </div>;
}

function OwnerAttendance({ data, date, setDate, staffId, setStaffId, reload, busy, setBusy, loading, loadFailed, fail }: { data: Data; date: string; setDate: (value: string) => void; staffId: string; setStaffId: (value: string) => void; reload: () => Promise<void>; busy: string; setBusy: (value: string) => void; loading: boolean; loadFailed: boolean; fail: (message: string) => void }) {
  const [policy, setPolicy] = useState<Policy>(data.policy);
  const [holidayName, setHolidayName] = useState(data.holiday?.name || "");
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [policyEdited, setPolicyEdited] = useState(false);
  const editPolicy: typeof setPolicy = (next) => { setPolicyEdited(true); setPolicy(next); };
  useEffect(() => { if (!policyEdited) setPolicy(data.policy); }, [data.policy, policyEdited]);
  useEffect(() => setHolidayName(data.holiday?.name || ""), [data.date, data.holiday?.name]);
  const staff = useMemo(() => data.staff || [], [data.staff]);
  const overviewBusy = loading || loadFailed || date !== data.date;
  const changeDate = (next: string) => { if (/^\d{4}-\d{2}-\d{2}$/.test(next) && Number.isFinite(Date.parse(next))) { setMessage(""); setDate(next); } };
  const savePolicy = async (event: React.FormEvent) => {
    event.preventDefault();
    try { setBusy("policy"); await request("policy", policy); await reload(); setPolicyEdited(false); }
    catch (error) { fail(error instanceof Error ? error.message : "Could not save attendance settings."); }
    finally { setBusy(""); }
  };
  const decide = async (id: string, decision: "Approved" | "Rejected") => {
    const note = reviewNotes[id]?.trim() || "";
    if (decision === "Rejected" && !note) { fail("Enter a review note before rejecting this request."); return; }
    try { setBusy(id); setMessage(""); await request("correction-decision", { id, decision, note }); await reload(); setMessage(`Request ${decision.toLowerCase()}.`); }
    catch (error) { fail(error instanceof Error ? error.message : "Could not review this request."); }
    finally { setBusy(""); }
  };
  const updateHoliday = async (remove: boolean) => {
    try {
      setBusy("holiday"); setMessage("");
      await request(remove ? "holiday-remove" : "holiday-save", remove ? data.date : { workDate: data.date, name: holidayName });
      await reload();
      setMessage(remove ? "Holiday removed." : "Holiday saved.");
    } catch (error) { fail(error instanceof Error ? error.message : "Could not update the holiday."); }
    finally { setBusy(""); }
  };
  const download = () => {
    const lines = [["Date", "Staff", "Role", "Status", "Check in", "Check out", "Working minutes", "Attendance type", "Day type", "Holiday", "Approval"], ...(data.attendance || []).map((row) => [data.date, row.name, row.role, row.displayStatus, row.checkInAt || "", row.checkOutAt || "", row.totalWorkingMinutes ?? "", row.attendanceKind === "offsite" ? "Off-site" : row.checkInAt ? "Office" : "", data.dayType, data.holiday?.name || "", approvalLabel(row)])];
    const cell = (value: unknown) => {
      const text = String(value ?? "");
      const safe = /^[=+@\-\t\r]/.test(text) ? `'${text}` : text;
      return `"${safe.replaceAll('"', '""')}"`;
    };
    const csv = lines.map((row) => row.map(cell).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = `attendance-${date}.csv`; anchor.click(); URL.revokeObjectURL(url);
  };
  const summary = data.summary || { present: 0, late: 0, absent: 0, missingCheckout: 0 };
  return <div className="attendance-page">
    <section className="attendance-hero panel"><div><p className="eyebrow">Attendance management</p><h2>Team attendance</h2><p>Choose a date to see its overview or manage a holiday.</p></div><button className="button secondary" onClick={download} disabled={overviewBusy}><Download /> Download CSV</button></section>
    <section className="panel attendance-calendar" aria-label="Attendance calendar">
      <div className="panel-head"><div><h3>{displayDate(date)}</h3><p role="status">{loadFailed ? "Could not load this overview." : overviewBusy ? "Loading overview…" : data.holiday ? `Holiday · ${data.holiday.name}` : data.dayType || "Workday"}</p></div>
        {loadFailed && <button className="button secondary" onClick={() => void reload()}>Retry overview</button>}</div>
      <div className="attendance-date-controls">
        <button type="button" className="button secondary" aria-label="Previous day" disabled={Boolean(busy)} onClick={() => changeDate(shiftDate(date, -1))}><ChevronLeft /></button>
        <input aria-label="Attendance date" type="date" value={date} disabled={Boolean(busy)} onChange={(event) => changeDate(event.target.value)} />
        <button type="button" className="button secondary" aria-label="Next day" disabled={Boolean(busy)} onClick={() => changeDate(shiftDate(date, 1))}><ChevronRight /></button>
        <button type="button" className="button secondary" disabled={Boolean(busy) || date === data.today} onClick={() => changeDate(data.today)}>Today</button>
      </div>
      <form className="attendance-holiday-form" onSubmit={(event) => { event.preventDefault(); void updateHoliday(false); }}>
        <label>Holiday name<input value={holidayName} onChange={(event) => setHolidayName(event.target.value)} placeholder="For example: Diwali" maxLength={100} required disabled={overviewBusy || Boolean(busy)} /></label>
        <button className="button secondary" disabled={overviewBusy || Boolean(busy)}>{data.holiday ? "Update holiday" : "Mark as holiday"}</button>
        {data.holiday && <button type="button" className="button secondary" disabled={overviewBusy || Boolean(busy)} onClick={() => void updateHoliday(true)}>Remove holiday</button>}
      </form>
      <p className="attendance-helper">Holidays pause normal check-ins for that date. Existing attendance stays on record.</p>
      {message && <p role="status">{message}</p>}
    </section>
    {!overviewBusy && <div className="attendance-metrics"><Metric icon={CheckCircle2} label="Present" value={summary.present} tone="success" /><Metric icon={Clock3} label="Late" value={summary.late} tone="warning" /><Metric icon={UsersRound} label={date < data.today ? "Absent" : "Not checked in"} value={summary.absent} tone="muted" /><Metric icon={AlertTriangle} label="Missing checkout" value={summary.missingCheckout} tone="coral" /></div>}
    <section className="panel attendance-owner-table" aria-busy={overviewBusy}><div className="panel-head"><div><h3>Daily attendance</h3><p>Sales and Operations attendance for the selected date.</p></div><div className="attendance-filters"><select aria-label="Filter staff" value={staffId} onChange={(event) => setStaffId(event.target.value)} disabled={Boolean(busy)}><option value="">All staff</option>{staff.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></div></div>
      {overviewBusy ? <p role="status">{loadFailed ? "Daily attendance is unavailable." : "Loading daily attendance…"}</p> : <div className="responsive-table" tabIndex={0} role="region" aria-label="Daily attendance table"><table><thead><tr><th>Staff</th><th>Role</th><th>Status</th><th>Check in</th><th>Check out</th><th>Working time</th></tr></thead><tbody>{(data.attendance || []).map((row) => <tr key={row.staffId}><td><b>{row.name}</b></td><td>{row.role === "sales" ? "Sales" : row.role === "owner" ? "Owner" : "Operations"}</td><td><AttendanceBadge row={row} /></td><td>{dateTime(row.checkInAt)}</td><td>{dateTime(row.checkOutAt)}</td><td>{duration(row.totalWorkingMinutes)}</td></tr>)}{!(data.attendance || []).length && <tr><td colSpan={6}>No staff match this date and filter.</td></tr>}</tbody></table></div>}
    </section>
    <section className="panel attendance-exception-queue"><div className="panel-head"><div><h3>Requests to review</h3><p>Pending requests across all dates. Approval keeps original clock records in the history.</p></div></div>{data.exceptions.length ? data.exceptions.map((item) => <article key={item._id}>
      <div><b>{item.workDate} · {item.staffName}</b><p><strong>{item.kind === "offsite" ? "Off-site attendance" : "Correction"}</strong></p>
        {item.place && <p>Work location: {item.place}</p>}{item.reference && <p>Reference: {item.reference}</p>}
        <p>{item.reason}</p><small>Requested: {dateTime(item.requestedCheckIn)} → {dateTime(item.requestedCheckOut)}</small></div>
      <div className="attendance-review-actions"><label>Review note (required to reject)<textarea value={reviewNotes[item._id] || ""} maxLength={1000} rows={2} onChange={(event) => setReviewNotes({ ...reviewNotes, [item._id]: event.target.value })} /></label>
        <div><button className="button secondary" disabled={Boolean(busy)} onClick={() => void decide(item._id, "Rejected")}>Reject</button><button className="button primary" disabled={Boolean(busy)} onClick={() => void decide(item._id, "Approved")}>Approve</button></div></div>
    </article>) : <p className="attendance-empty">No attendance requests need review.</p>}</section>
    <section className="panel attendance-settings"><div className="panel-head"><div><h3><MapPin /> Office attendance rules</h3><p>Click or tap the office entrance to place the pin. Change the radius below to preview the boundary, then save your rules.</p></div></div>
      <AttendanceMap office={policy} radiusM={policy.radiusM} onPick={(point) => editPolicy((current) => ({ ...current, latitude: Number(point.latitude.toFixed(7)), longitude: Number(point.longitude.toFixed(7)) }))} />
      <form onSubmit={savePolicy} onChange={() => setPolicyEdited(true)} className="attendance-settings-form">
      <label>Office name<input value={policy.officeName} onChange={(event) => setPolicy({ ...policy, officeName: event.target.value })} required /></label>
      <label>Latitude<input type="number" step="any" value={policy.latitude} onChange={(event) => setPolicy({ ...policy, latitude: Number(event.target.value) })} required /></label>
      <label>Longitude<input type="number" step="any" value={policy.longitude} onChange={(event) => setPolicy({ ...policy, longitude: Number(event.target.value) })} required /></label>
      <label>Office radius (m)<input type="number" min={25} max={1000} value={policy.radiusM} onChange={(event) => setPolicy({ ...policy, radiusM: Number(event.target.value) })} required /></label>
      <label>Maximum GPS accuracy (m)<input type="number" min={10} max={250} value={policy.maximumAccuracyM} onChange={(event) => setPolicy({ ...policy, maximumAccuracyM: Number(event.target.value) })} required /></label>
      <label>Maximum location age (seconds)<input type="number" min={15} max={300} value={policy.maximumLocationAgeSeconds} onChange={(event) => setPolicy({ ...policy, maximumLocationAgeSeconds: Number(event.target.value) })} required /></label>
      <label>Work starts<input type="time" value={policy.workStart} onChange={(event) => setPolicy({ ...policy, workStart: event.target.value })} required /></label>
      <label>Work ends<input type="time" value={policy.workEnd} onChange={(event) => setPolicy({ ...policy, workEnd: event.target.value })} required /></label>
      <label>Grace minutes<input type="number" min={0} max={120} value={policy.graceMinutes} onChange={(event) => setPolicy({ ...policy, graceMinutes: Number(event.target.value) })} required /></label>
      <fieldset><legend>Working days</legend>{dayNames.map((name, index) => <label key={name}><input type="checkbox" checked={policy.workingDays.includes(index)} onChange={(event) => setPolicy({ ...policy, workingDays: event.target.checked ? [...policy.workingDays, index].sort() : policy.workingDays.filter((day) => day !== index) })} /> {name}</label>)}</fieldset>
      <button className="button primary" disabled={Boolean(busy)}><Save /> {busy === "policy" ? "Saving…" : "Save attendance rules"}</button>
    </form></section>
  </div>;
}

function Metric({ icon: Icon, label, value, tone }: { icon: any; label: string; value: number; tone: string }) {
  return <article className={`attendance-metric ${tone}`}><span><Icon /></span><small>{label}</small><strong>{value}</strong></article>;
}

function approvalLabel(row: Row) {
  return row.correctionId ? (row.attendanceKind === "offsite" ? "Request approved" : "Correction approved") : "";
}

function AttendanceBadge({ row }: { row: Row }) {
  const approval = approvalLabel(row);
  return <div className="attendance-status-stack">
    <span className={`attendance-status small ${String(row.displayStatus).toLowerCase().replaceAll(" ", "-")}`}>{row.displayStatus}{row.attendanceKind === "offsite" ? " · Off-site" : ""}</span>
    {approval && <span className="attendance-status small"><CheckCircle2 aria-hidden="true" />{approval}</span>}
  </div>;
}

