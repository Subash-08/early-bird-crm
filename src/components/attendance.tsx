"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AttendanceMap } from "./attendance-map";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
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
  const load = useCallback(async () => {
    try { setLoading(true); setData(await request(undefined, undefined, date, staffId)); }
    catch (error) { fail(error instanceof Error ? error.message : "Could not load attendance."); }
    finally { setLoading(false); }
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
  if (!data) return null;
  return role === "owner"
    ? <OwnerAttendance data={data} date={date} setDate={setDate} staffId={staffId} setStaffId={setStaffId} reload={load} busy={busy} setBusy={setBusy} fail={fail} />
    : <StaffAttendance data={data} busy={busy} notice={notice} action={action} reload={load} fail={fail} fix={fix} locationMessage={locationMessage} />;
}

function StaffAttendance({ data, busy, notice, action, reload, fail, fix, locationMessage }: {
  data: Data; busy: string; notice: string; action: (kind: "check-in" | "check-out" | "preview") => Promise<void>;
  reload: () => Promise<void>; fail: (message: string) => void;
  fix: Awaited<ReturnType<typeof locationNow>> | null; locationMessage: string;
}) {
  const current = data.current;
  const status = current?.displayStatus || "Not checked in";
  const canCheckIn = !current?.checkInAt;
  const canCheckOut = Boolean(current?.checkInAt && !current?.checkOutAt);
  const [reason, setReason] = useState("");
  const [workDate, setWorkDate] = useState(data.today);
  const [requestedCheckIn, setRequestedCheckIn] = useState("");
  const [requestedCheckOut, setRequestedCheckOut] = useState("");
  const [savingCorrection, setSavingCorrection] = useState(false);
  const submitCorrection = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      setSavingCorrection(true);
      await request("correction", { workDate, requestedCheckIn: requestedCheckIn ? new Date(requestedCheckIn).toISOString() : "", requestedCheckOut: requestedCheckOut ? new Date(requestedCheckOut).toISOString() : "", reason });
      setReason(""); setRequestedCheckIn(""); setRequestedCheckOut("");
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
        <h3>{canCheckIn ? "Ready to start?" : canCheckOut ? "Your day is in progress" : "Your attendance is complete"}</h3>
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
    <section className="panel attendance-history"><div className="panel-head"><div><h3>Recent attendance</h3><p>Your last 31 attendance records.</p></div></div><AttendanceHistory rows={data.history || []} /></section>
    <section className="panel attendance-correction"><div className="panel-head"><div><h3><FilePenLine /> Request a correction</h3><p>Use this if location, internet, or a missed check-out caused a genuine issue.</p></div></div>
      <form onSubmit={submitCorrection} className="attendance-correction-form">
        <label>Date<input type="date" value={workDate} max={data.today} onChange={(event) => setWorkDate(event.target.value)} required /></label>
        <label>Requested check-in <input type="datetime-local" value={requestedCheckIn} onChange={(event) => setRequestedCheckIn(event.target.value)} /></label>
        <label>Requested check-out <input type="datetime-local" value={requestedCheckOut} onChange={(event) => setRequestedCheckOut(event.target.value)} /></label>
        <label className="full">Reason<textarea value={reason} minLength={10} maxLength={1000} onChange={(event) => setReason(event.target.value)} placeholder="For example: GPS did not work when I left the office." required /></label>
        <button className="button secondary" disabled={savingCorrection}>{savingCorrection ? "Sending…" : "Send for Owner review"}</button>
      </form>
      {(data.exceptions || []).length > 0 && <div className="attendance-exceptions"><b>My requests</b>{data.exceptions.map((item) => <p key={item._id}><span>{item.workDate}</span><span className={`attendance-status small ${String(item.status).toLowerCase()}`}>{item.status}</span>{item.ownerNote && <small>{item.ownerNote}</small>}</p>)}</div>}
    </section>
  </div>;
}

function OwnerAttendance({ data, date, setDate, staffId, setStaffId, reload, busy, setBusy, fail }: { data: Data; date: string; setDate: (value: string) => void; staffId: string; setStaffId: (value: string) => void; reload: () => Promise<void>; busy: string; setBusy: (value: string) => void; fail: (message: string) => void }) {
  const [policy, setPolicy] = useState<Policy>(data.policy);
  useEffect(() => setPolicy(data.policy), [data.policy]);
  const staff = useMemo(() => data.staff || [], [data.staff]);
  const savePolicy = async (event: React.FormEvent) => {
    event.preventDefault();
    try { setBusy("policy"); await request("policy", policy); await reload(); }
    catch (error) { fail(error instanceof Error ? error.message : "Could not save attendance settings."); }
    finally { setBusy(""); }
  };
  const decide = async (id: string, decision: "Approved" | "Rejected") => {
    const note = decision === "Rejected" ? window.prompt("Explain why this request is rejected.") || "" : window.prompt("Optional note for the staff member.") || "";
    if (decision === "Rejected" && !note) return;
    try { setBusy(id); await request("correction-decision", { id, decision, note }); await reload(); }
    catch (error) { fail(error instanceof Error ? error.message : "Could not review this request."); }
    finally { setBusy(""); }
  };
  const download = () => {
    const lines = [["Date", "Staff", "Role", "Status", "Check in", "Check out", "Working minutes"], ...(data.attendance || []).map((row) => [date, row.name, row.role, row.displayStatus, row.checkInAt || "", row.checkOutAt || "", row.totalWorkingMinutes ?? ""])];
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
    <section className="attendance-hero panel"><div><p className="eyebrow">Attendance management</p><h2>Today’s team attendance</h2><p>You monitor attendance; the Owner does not check in or check out.</p></div><button className="button secondary" onClick={download}><Download /> Download CSV</button></section>
    <div className="attendance-metrics"><Metric icon={CheckCircle2} label="Present" value={summary.present} tone="success" /><Metric icon={Clock3} label="Late" value={summary.late} tone="warning" /><Metric icon={UsersRound} label="Not checked in" value={summary.absent} tone="muted" /><Metric icon={AlertTriangle} label="Missing checkout" value={summary.missingCheckout} tone="coral" /></div>
    <section className="panel attendance-owner-table"><div className="panel-head"><div><h3>Daily attendance</h3><p>Sales and Operations attendance only.</p></div><div className="attendance-filters"><input aria-label="Attendance date" type="date" value={date} onChange={(event) => setDate(event.target.value)} /><select aria-label="Filter staff" value={staffId} onChange={(event) => setStaffId(event.target.value)}><option value="">All active staff</option>{staff.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></div></div>
      <div className="responsive-table"><table><thead><tr><th>Staff</th><th>Role</th><th>Status</th><th>Check in</th><th>Check out</th><th>Working time</th></tr></thead><tbody>{(data.attendance || []).map((row) => <tr key={row.staffId}><td><b>{row.name}</b></td><td>{row.role === "sales" ? "Sales" : "Operations"}</td><td><span className={`attendance-status small ${String(row.displayStatus).toLowerCase().replaceAll(" ", "-")}`}>{row.displayStatus}</span></td><td>{dateTime(row.checkInAt)}</td><td>{dateTime(row.checkOutAt)}</td><td>{duration(row.totalWorkingMinutes)}</td></tr>)}{!(data.attendance || []).length && <tr><td colSpan={6}>No active Sales or Operations staff match this filter.</td></tr>}</tbody></table></div>
    </section>
    <section className="panel attendance-exception-queue"><div className="panel-head"><div><h3>Correction requests</h3><p>Original attendance events remain unchanged. Your decision is recorded separately.</p></div></div>{data.exceptions.length ? data.exceptions.map((item) => <article key={item._id}><div><b>{item.workDate} · {item.staffName}</b><p>{item.reason}</p><small>Requested: {dateTime(item.requestedCheckIn)} → {dateTime(item.requestedCheckOut)}</small></div><div><button className="button secondary" disabled={busy === item._id} onClick={() => void decide(item._id, "Rejected")}>Reject</button><button className="button primary" disabled={busy === item._id} onClick={() => void decide(item._id, "Approved")}>Approve</button></div></article>) : <p className="attendance-empty">No correction requests need review.</p>}</section>
    <section className="panel attendance-settings"><div className="panel-head"><div><h3><MapPin /> Office attendance rules</h3><p>Click or tap the office entrance to place the pin. Change the radius below to preview the boundary, then save your rules.</p></div></div>
      <AttendanceMap office={policy} radiusM={policy.radiusM} onPick={(point) => setPolicy((current) => ({ ...current, latitude: Number(point.latitude.toFixed(7)), longitude: Number(point.longitude.toFixed(7)) }))} />
      <form onSubmit={savePolicy} className="attendance-settings-form">
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
      <button className="button primary" disabled={busy === "policy"}><Save /> {busy === "policy" ? "Saving…" : "Save attendance rules"}</button>
    </form></section>
  </div>;
}

function Metric({ icon: Icon, label, value, tone }: { icon: any; label: string; value: number; tone: string }) {
  return <article className={`attendance-metric ${tone}`}><span><Icon /></span><small>{label}</small><strong>{value}</strong></article>;
}

function AttendanceHistory({ rows }: { rows: Row[] }) {
  return <div className="responsive-table"><table><thead><tr><th>Date</th><th>Status</th><th>Check in</th><th>Check out</th><th>Working time</th></tr></thead><tbody>{rows.map((row) => <tr key={row._id}><td>{row.workDate}</td><td><span className={`attendance-status small ${String(row.displayStatus).toLowerCase().replaceAll(" ", "-")}`}>{row.displayStatus}</span></td><td>{dateTime(row.checkInAt)}</td><td>{dateTime(row.checkOutAt)}</td><td>{duration(row.totalWorkingMinutes)}</td></tr>)}{!rows.length && <tr><td colSpan={5}>No attendance records yet.</td></tr>}</tbody></table></div>;
}
