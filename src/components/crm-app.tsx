"use client";
import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { authClient } from "@/lib/auth-client";
import { Login } from "./login";
import {
  LayoutDashboard,
  Users,
  Inbox,
  CheckSquare,
  Bell,
  UserCog,
  Upload,
  Plane,
  Search,
  Plus,
  LogOut,
  X,
  ArrowRight,
  Phone,
  MapPin,
  Clock3,
  CalendarDays,
  RefreshCw,
  AlertCircle,
  Check,
  ChevronLeft,
  ChevronRight,
  FileSpreadsheet,
  Copy,
  Settings2,
  ClipboardCheck,
  Route,
  Ellipsis,
  UserRound,
  BarChart3,
  Download,
  ReceiptText,
} from "lucide-react";
import { Quotations } from "./quotations";
import { Bookings } from "./bookings";
import { Operations } from "./operations";
import { Settlements } from "./settlements";
import { Reports } from "./reports";
import { InvoiceSettings } from "./invoice-settings";

type Row = Record<string, any> & { _id: string; version: number };
type Snap = {
  actor: { id: string; name: string; role: "owner" | "sales" | "operations" };
  customers: Row[];
  enquiries: Row[];
  quotes: Row[];
  quoteTemplates: Row[];
  bookings: Row[];
  payments: Row[];
  invoices: Row[];
  suppliers: Row[];
  vehicles: Row[];
  arrangements: Row[];
  tripSegments: Row[];
  readinessItems: Row[];
  incidents: Row[];
  collectionReports: Row[];
  operationsDocuments: Row[];
  travelDocuments: Row[];
  operationsRequests: Row[];
  tasks: Row[];
  staff: Row[];
  notifications: Row[];
  activity: Row[];
  imports: Row[];
  settings?: Row;
  invoiceTemplate?: Row;
  limited?: boolean;
};
type View =
  | "dashboard"
  | "enquiries"
  | "customers"
  | "quotations"
  | "bookings"
  | "operations"
  | "settlements"
  | "tasks"
  | "notifications"
  | "reports"
  | "imports"
  | "invoice-settings"
  | "staff";
const emptyCustomer = {
  name: "",
  phone: "",
  email: "",
  language: "",
  address: "",
  notes: "",
  duplicateConfirmed: false,
  reviewNeeded: false,
};
const iso = (value = "") => (value ? new Date(value).toISOString() : "");
const local = (value = "") =>
  value ? new Date(value).toISOString().slice(0, 16) : "";
const moneyDate = (v: string) =>
  v
    ? new Intl.DateTimeFormat("en-IN", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(v))
    : "Not scheduled";
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

export function CrmApp() {
  const [snap, setSnap] = useState<Snap | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [view, setView] = useState<View>("dashboard"),
    [moreOpen, setMoreOpen] = useState(false),
    [mobileSearch, setMobileSearch] = useState(false),
    [installPrompt, setInstallPrompt] = useState<any>(null),
    [offline, setOffline] = useState(false),
    [search, setSearch] = useState("");
  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/crm", { cache: "no-store" });
      if (r.status === 401) {
        setSnap(null);
        return;
      }
      if (r.status === 403) { setSnap(null); setError("Your access changed. Please sign in again or contact the Owner."); return; }
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setSnap(j);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load workspace");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    load();
    const refresh = () => { if (document.visibilityState === "visible") void load(); };
    const timer = window.setInterval(refresh, 30000);
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    const connection = () => setOffline(!navigator.onLine);
    connection();
    window.addEventListener("online", connection);
    window.addEventListener("offline", connection);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", refresh); window.removeEventListener("online", refresh); window.removeEventListener("online", connection); window.removeEventListener("offline", connection); };
  }, [load]);
  useEffect(() => {
    if (!moreOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMoreOpen(false);
    };
    window.addEventListener("keydown", close);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", close);
    };
  }, [moreOpen]);
  useEffect(() => {
    const available = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event);
    };
    const installed = () => setInstallPrompt(null);
    window.addEventListener("beforeinstallprompt", available);
    window.addEventListener("appinstalled", installed);
    return () => {
      window.removeEventListener("beforeinstallprompt", available);
      window.removeEventListener("appinstalled", installed);
    };
  }, []);
  if (loading)
    return (
      <div className="skeleton-shell">
        <div />
        <div>
          <i />
          <i />
          <i />
        </div>
      </div>
    );
  if (!snap) return <Login />;
  const role = snap.actor.role,
    nav = [
      ["dashboard", "Today", LayoutDashboard],
      ...(role === "operations"
        ? [["operations", "My trips", Route]]
        : [
            ["enquiries", "Enquiries", Inbox],
            ["customers", "Customers", Users],
            ["quotations", "Quotations", FileSpreadsheet],
            ["bookings", "Bookings", ClipboardCheck],
            ["operations", "Operations", Route],
            ["settlements", "Money & changes", ClipboardCheck],
          ]),
      ["tasks", "Tasks", CheckSquare],
      ["notifications", "Notifications", Bell],
      ["reports", "Reports", BarChart3],
      ...(role === "owner"
        ? [
            ["imports", "Import data", Upload],
            ["invoice-settings", "Invoice template", ReceiptText],
            ["staff", "Team & setup", UserCog],
          ]
        : []),
    ] as [View, string, any][];
  const unread = snap.notifications.filter((x) => !x.read).length;
  const mobilePrimary = (role === "operations"
    ? [
        ["dashboard", "Today", LayoutDashboard],
        ["operations", "Trips", Route],
        ["tasks", "Tasks", CheckSquare],
        ["notifications", "Alerts", Bell],
      ]
    : [
        ["dashboard", "Today", LayoutDashboard],
        ["enquiries", "Leads", Inbox],
        ["tasks", "Tasks", CheckSquare],
        ["bookings", "Bookings", ClipboardCheck],
      ]) as [View, string, any][];
  const mobilePrimaryIds = new Set(mobilePrimary.map(([id]) => id));
  const mobileSecondary = nav.filter(([id]) => !mobilePrimaryIds.has(id));
  const secondaryActive = mobileSecondary.some(([id]) => id === view);
  const openView = (next: View) => {
    setView(next);
    setMoreOpen(false);
    setMobileSearch(false);
    window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "smooth" }));
  };
  const signOut = async () => {
    await authClient.signOut();
    location.reload();
  };
  return (
    <div className="app-shell">
      {offline && <div className="connection-banner" role="alert">You are offline. Changes cannot be saved. Reconnect or call your coordinator.</div>}
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">
            <Plane />
          </span>
          <span>EarlyBird</span>
        </div>
        <nav>
          {nav.map(([id, label, Icon]) => (
            <button
              key={id}
              className={view === id ? "active" : ""}
              onClick={() => openView(id)}
            >
              <Icon />
              {label}
              {id === "notifications" && unread > 0 && <em>{unread}</em>}
            </button>
          ))}
        </nav>
        <div className="sidebar-foot">
          <div className="agency-chip">
            <div className="agency-identity">
              <span>{snap.actor.name.slice(0, 1).toUpperCase()}</span>
              <div className="agency-user-copy">
                <b>{snap.actor.name}</b>
                <small className="agency-role">
                  {role === "owner"
                    ? "Agency owner"
                    : role === "sales"
                      ? "Sales staff"
                      : "Operations staff"}
                </small>
              </div>
              <button
                className="sidebar-signout"
                onClick={signOut}
                aria-label="Sign out"
                title="Sign out"
              >
                <LogOut />
              </button>
            </div>
          </div>
        </div>
      </aside>
      <main className="workspace">
        <header className="topbar">
          <span className="mobile-brand-mark"><Plane /></span>
          <div>
            <p className="eyebrow">
              {new Date().toLocaleDateString("en-IN", {
                weekday: "long",
                day: "numeric",
                month: "long",
              })}
            </p>
            <h1>{nav.find((x) => x[0] === view)?.[1]}</h1>
          </div>
          <div className="top-actions">
            <label className="search">
              <Search />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search this page"
              />
            </label>
            <button
              className="icon-button mobile-search-trigger"
              aria-label="Search this screen"
              aria-expanded={mobileSearch}
              onClick={() => setMobileSearch((value) => !value)}
            >
              {mobileSearch ? <X /> : <Search />}
            </button>
            <button
              className="icon-button notify"
              aria-label={unread ? `${unread} unread alerts` : "Open alerts"}
              onClick={() => openView("notifications")}
            >
              <Bell />
              {unread > 0 && <i />}
            </button>
          </div>
        </header>
        {mobileSearch && (
          <div className="mobile-search-panel">
            <Search />
            <input
              autoFocus
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={`Search ${nav.find((item) => item[0] === view)?.[1]?.toLowerCase() || "this screen"}`}
            />
            {search && <button aria-label="Clear search" onClick={() => setSearch("")}><X /></button>}
          </div>
        )}
        {error && (
          <div className="toast error">
            <AlertCircle />
            {error}
            <button onClick={() => setError("")}>
              <X />
            </button>
          </div>
        )}
        <section className="content">
          {snap.limited && (
            <div className="banner">
              Large workspace: the newest 1,000 records are shown. Use search
              and filters to narrow the list.
            </div>
          )}
          {view === "dashboard" && <Dashboard s={snap} go={setView} />}{" "}
          {view === "enquiries" && (
            <Enquiries s={snap} q={search} reload={load} fail={setError} />
          )}{" "}
          {view === "customers" && (
            <Customers s={snap} q={search} reload={load} fail={setError} />
          )}{" "}
          {view === "quotations" && (
            <Quotations s={snap} q={search} reload={load} fail={setError} />
          )}{" "}
          {view === "bookings" && (
            <Bookings s={snap} q={search} reload={load} fail={setError} />
          )}{" "}
          {view === "operations" && (
            <Operations s={snap} q={search} reload={load} fail={setError} />
          )}{" "}
          {view === "settlements" && <Settlements s={snap} q={search} reload={load} fail={setError} />}
          {view === "tasks" && (
            <Tasks s={snap} q={search} reload={load} fail={setError} />
          )}{" "}
          {view === "notifications" && (
            <Notifications
              s={snap}
              reload={load}
              go={setView}
              fail={setError}
            />
          )}{" "}
          {view === "reports" && <Reports s={snap} fail={setError} />}{" "}
          {view === "imports" && (
            <Imports s={snap} reload={load} fail={setError} />
          )}{" "}
          {view === "invoice-settings" && (
            <InvoiceSettings s={snap} reload={load} fail={setError} />
          )}{" "}
          {view === "staff" && <Staff s={snap} reload={load} fail={setError} />}
        </section>
      </main>
      <nav className="mobile-bottom-nav" aria-label="Primary mobile navigation">
        {mobilePrimary.map(([id, label, Icon]) => (
          <button
            type="button"
            key={id}
            className={view === id ? "active" : ""}
            aria-current={view === id ? "page" : undefined}
            onClick={() => openView(id)}
          >
            <span><Icon />{id === "notifications" && unread > 0 && <em>{unread > 9 ? "9+" : unread}</em>}</span>
            <small>{label}</small>
          </button>
        ))}
        <button
          type="button"
          className={moreOpen || secondaryActive ? "active" : ""}
          aria-expanded={moreOpen}
          onClick={() => { setMobileSearch(false); setMoreOpen(true); }}
        >
          <span><Ellipsis />{role !== "operations" && unread > 0 && <em>{unread > 9 ? "9+" : unread}</em>}</span>
          <small>More</small>
        </button>
      </nav>
      {moreOpen && (
        <div className="mobile-more-wrap" role="dialog" aria-modal="true" aria-label="More navigation">
          <button className="mobile-more-scrim" aria-label="Close more navigation" onClick={() => setMoreOpen(false)} />
          <section className="mobile-more-sheet">
            <div className="sheet-handle" />
            <header>
              <div className="mobile-profile-icon"><UserRound /></div>
              <div><strong>{snap.actor.name}</strong><small>{role === "operations" ? "Operations staff" : role === "sales" ? "Sales staff" : "Agency owner"}</small></div>
              <button className="icon-button" aria-label="Close" onClick={() => setMoreOpen(false)}><X /></button>
            </header>
            {mobileSecondary.length > 0 && (
              <div className="mobile-more-grid">
                {mobileSecondary.map(([id, label, Icon]) => (
                  <button type="button" key={id} className={view === id ? "active" : ""} onClick={() => openView(id)}>
                    <span><Icon />{id === "notifications" && unread > 0 && <em>{unread}</em>}</span>
                    <b>{label}</b>
                  </button>
                ))}
              </div>
            )}
            <div className="mobile-account-actions">
              <div><small>Workspace</small><b>EarlyBird Travel CRM</b></div>
              {installPrompt && <button className="button secondary" onClick={async () => { await installPrompt.prompt(); setInstallPrompt(null); }}><Download /> Install app</button>}
              <button className="button secondary" onClick={signOut}><LogOut /> Sign out</button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function Dashboard({ s, go }: { s: Snap; go: (v: View) => void }) {
  const today = new Date().toISOString().slice(0, 10),
    open = s.tasks.filter((t) => !["Done", "Cancelled"].includes(t.status)),
    due = open.filter((t) => String(t.dueAt).slice(0, 10) <= today),
    newLeads = s.enquiries.filter((e) => e.stage === "New"),
    unread = s.notifications.filter((n) => !n.read);
  return (
    <>
      <div className="welcome">
        <div>
          <p className="eyebrow">
            Good to see you, {s.actor.name.split(" ")[0]}
          </p>
          <h2>
            {due.length
              ? `${due.length} action${due.length === 1 ? "" : "s"} need attention today.`
              : "You are clear for today."}
          </h2>
          <p>
            Keep each customer moving with one visible owner and one clear next
            action.
          </p>
        </div>
        <button
          className="button light"
          onClick={() =>
            go(s.actor.role === "operations" ? "tasks" : "enquiries")
          }
        >
          Open work queue <ArrowRight />
        </button>
      </div>
      <div className="metrics">
        <Metric
          icon={Inbox}
          label="Open enquiries"
          value={s.enquiries.filter((x) => x.stage !== "Lost").length}
          note={`${newLeads.length} new`}
        />
        <Metric
          icon={Clock3}
          label="Due or overdue"
          value={due.length}
          note="Needs action"
          tone="coral"
        />
        <Metric
          icon={CheckSquare}
          label="Open tasks"
          value={open.length}
          note={`${open.filter((x) => x.status === "Waiting").length} waiting`}
        />
        <Metric
          icon={Bell}
          label="Unread updates"
          value={unread.length}
          note="In-app notices"
        />
      </div>
      <div className="dashboard-grid">
        <section className="panel">
          <PanelHead
            title="Today's route"
            sub="Your next actions, ordered by time"
            action={
              <button className="text-button" onClick={() => go("tasks")}>
                View all <ArrowRight />
              </button>
            }
          />
          <div className="timeline">
            {open.slice(0, 6).map((t, i) => (
              <div className="timeline-row" key={t._id}>
                <span
                  className={
                    String(t.dueAt) < new Date().toISOString()
                      ? "dot overdue"
                      : "dot"
                  }
                >
                  {i + 1}
                </span>
                <div>
                  <b>{t.title}</b>
                  <small>
                    {moneyDate(t.dueAt)} · {t.status}
                  </small>
                </div>
              </div>
            ))}
            {!open.length && (
              <Empty
                icon={Check}
                title="Nothing pending"
                text="New assignments and follow-ups will appear here."
              />
            )}
          </div>
        </section>
        <section className="panel">
          <PanelHead
            title="Enquiry pulse"
            sub="Where active conversations stand"
          />
          <div className="stage-bars">
            {["New", "Contacting", "Gathering details", "On hold"].map(
              (stage, i) => {
                const n = s.enquiries.filter((e) => e.stage === stage).length,
                  max = Math.max(1, s.enquiries.length);
                return (
                  <div key={stage}>
                    <span>
                      {stage}
                      <b>{n}</b>
                    </span>
                    <i>
                      <em
                        style={{ width: `${(n / max) * 100}%` }}
                        className={`bar-${i}`}
                      />
                    </i>
                  </div>
                );
              },
            )}
          </div>
          <button
            className="button secondary wide"
            onClick={() =>
              go(s.actor.role === "operations" ? "tasks" : "enquiries")
            }
          >
            Review workspace
          </button>
        </section>
      </div>
    </>
  );
}
function Metric({ icon: Icon, label, value, note, tone = "blue" }: any) {
  return (
    <article className={`metric ${tone}`}>
      <span className="metric-icon">
        <Icon />
      </span>
      <small>{label}</small>
      <strong>{value}</strong>
      <p>{note}</p>
    </article>
  );
}
function PanelHead({
  title,
  sub,
  action,
}: {
  title: string;
  sub: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="panel-head">
      <div>
        <h3>{title}</h3>
        <p>{sub}</p>
      </div>
      {action}
    </div>
  );
}
function Empty({
  icon: Icon,
  title,
  text,
}: {
  icon: any;
  title: string;
  text: string;
}) {
  return (
    <div className="empty">
      <span>
        <Icon />
      </span>
      <b>{title}</b>
      <p>{text}</p>
    </div>
  );
}

function Customers({
  s,
  q,
  reload,
  fail,
}: {
  s: Snap;
  q: string;
  reload: () => Promise<void>;
  fail: (x: string) => void;
}) {
  const [open, setOpen] = useState(false),
    [edit, setEdit] = useState<Row | null>(null),
    [data, setData] = useState<any>(emptyCustomer),
    [busy, setBusy] = useState(false),
    [printing, setPrinting] = useState(""),
    [copyLabels, setCopyLabels] = useState<Record<string, string>>({});
  const rows = s.customers.filter((x) =>
    [x.name, x.phone, x.email]
      .join(" ")
      .toLowerCase()
      .includes(q.toLowerCase()),
  );
  function start(r?: Row) {
    setEdit(r || null);
    setData(r ? { ...emptyCustomer, ...r } : emptyCustomer);
    setOpen(true);
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api("customer", data, { id: edit?._id, version: edit?.version });
      setOpen(false);
      await reload();
    } catch (e) {
      fail((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="section-actions">
        <p>
          {rows.length} customer{rows.length === 1 ? "" : "s"} visible
        </p>
        <button className="button primary" onClick={() => start()}>
          <Plus /> New customer
        </button>
      </div>
      <section className="panel table-panel">
        <div className="cards-list">
          {rows.map((r) => (
            <button
              className="record-card"
              key={r._id}
              onClick={() => start(r)}
            >
              <span className="avatar">{r.name.slice(0, 2).toUpperCase()}</span>
              <div className="record-main">
                <b>{r.name}</b>
                <small>{r.phone || r.email || "Contact needs review"}</small>
              </div>
              <Badge value={r.reviewNeeded ? "Needs review" : "Customer"} />
              <ArrowRight />
            </button>
          ))}
          {!rows.length && (
            <Empty
              icon={Users}
              title="No customers found"
              text="Add the first customer or change your search."
            />
          )}
        </div>
      </section>
      {open && (
        <Drawer
          title={edit ? "Edit customer" : "Add customer"}
          close={() => setOpen(false)}
        >
          <form className="form-grid" onSubmit={save}>
            <Field
              label="Full name"
              value={data.name}
              set={(v: any) => setData({ ...data, name: v })}
              required
            />
            <Field
              label="Phone with country code"
              value={data.phone}
              set={(v: any) => setData({ ...data, phone: v })}
              placeholder="+91 98765 43210"
            />
            <Field
              label="Email"
              type="email"
              value={data.email}
              set={(v: any) => setData({ ...data, email: v })}
            />
            <Field
              label="Preferred language"
              value={data.language}
              set={(v: any) => setData({ ...data, language: v })}
            />
            <Field
              label="Address"
              value={data.address}
              set={(v: any) => setData({ ...data, address: v })}
              span
            />
            <Field
              label="Notes"
              value={data.notes}
              set={(v: any) => setData({ ...data, notes: v })}
              area
              span
            />
            <label className="check span">
              <input
                type="checkbox"
                checked={data.duplicateConfirmed}
                onChange={(e) =>
                  setData({ ...data, duplicateConfirmed: e.target.checked })
                }
              />
              <span>
                <b>This is a separate customer</b>
                <small>Use only after reviewing a duplicate warning.</small>
              </span>
            </label>
            <FormFoot busy={busy} />
          </form>
          {edit && (
            <section className="customer-invoice-history">
              <h3>Invoice history</h3>
              <p>Issued invoices from this customer&apos;s bookings. Print-copy labels use the same invoice number and locked data.</p>
              {s.invoices
                .filter((invoice: Row) => {
                  const booking = s.bookings.find((item: Row) => item._id === invoice.bookingId);
                  return booking?.customerId === edit._id && ["Issued", "Void"].includes(invoice.status);
                })
                .map((invoice: Row) => (
                  <div className="customer-invoice-item" key={invoice._id}>
                    <a href={`/api/documents/finance/${invoice.documentId}`} target="_blank" rel="noreferrer">
                      <ReceiptText /><span><b>{invoice.invoiceNumber}</b><small>{invoice.status} · {invoice.issuedAt ? new Date(invoice.issuedAt).toLocaleDateString("en-IN") : "Date unavailable"} · {invoice.snapshot?.currency || invoice.currency} {Number(invoice.totalMinor || 0) / 100}</small></span><ArrowRight />
                    </a>
                    {s.actor.role === "owner" && invoice.status === "Issued" && <details><summary>Prepare renamed print copies</summary><div className="invoice-copy-action"><input value={copyLabels[invoice._id] ?? (invoice.snapshot?.copyLabels || ["Customer copy", "Office copy"]).join(", ")} onChange={(event) => setCopyLabels({ ...copyLabels, [invoice._id]: event.target.value })} placeholder="Customer copy, Office copy" /><button type="button" className="button secondary" disabled={printing === invoice._id} onClick={async () => {
                      const labels = (copyLabels[invoice._id] ?? (invoice.snapshot?.copyLabels || ["Customer copy", "Office copy"]).join(", ")).split(",").map((item) => item.trim()).filter(Boolean).slice(0, 6);
                      if (!labels.length) { fail("Add at least one print-copy label."); return; }
                      const tab = window.open("", "_blank"); setPrinting(invoice._id);
                      try { const result = await api("invoice-print-copies", { invoiceId: invoice._id, copyLabels: labels }); const url = `/api/documents/finance/${result.documentId}`; if (tab) tab.location.href = url; else { const link = document.createElement("a"); link.href = url; link.target = "_blank"; link.click(); } }
                      catch (error) { tab?.close(); fail((error as Error).message); } finally { setPrinting(""); }
                    }}><Copy /> {printing === invoice._id ? "Preparing..." : "Create printable PDF"}</button></div><small>This does not create a new invoice or change the issued data.</small></details>}
                  </div>
                ))}
              {!s.invoices.some((invoice: Row) => {
                const booking = s.bookings.find((item: Row) => item._id === invoice.bookingId);
                return booking?.customerId === edit._id && ["Issued", "Void"].includes(invoice.status);
              }) && <div className="customer-invoice-empty">No issued invoices yet.</div>}
            </section>
          )}
        </Drawer>
      )}
    </>
  );
}

function Enquiries({
  s,
  q,
  reload,
  fail,
}: {
  s: Snap;
  q: string;
  reload: () => Promise<void>;
  fail: (x: string) => void;
}) {
  const [open, setOpen] = useState(false),
    [edit, setEdit] = useState<Row | null>(null),
    [busy, setBusy] = useState(false);
  const defaultData = () => ({
    customerId: "",
    destination: "",
    source: "WhatsApp",
    assigneeId:
      s.actor.role === "owner"
        ? s.staff.find((x) => x.role !== "operations" && x.status === "active")
            ?._id || s.actor.id
        : s.actor.id,
    stage: "New",
    firstContactAt: local(new Date().toISOString()),
    dateMode: "Unknown",
    departure: "",
    returnDate: "",
    travelPreference: "",
    adults: null,
    childrenAges: "",
    infants: 0,
    budget: "",
    budgetBasis: "Unknown",
    services: "",
    serviceResponsibility: "",
    hotelPreference: "",
    rooms: "",
    pickup: "",
    dropoff: "",
    specialRequirements: "",
    notes: "",
    reason: "",
    nextAction: "",
    nextFollowUp: "",
    contactOutcome: "Not contacted",
    reviewNeeded: false,
  });
  const [data, setData] = useState<any>(defaultData());
  const customers = Object.fromEntries(s.customers.map((x) => [x._id, x]));
  const rows = s.enquiries.filter((x) =>
    [customers[x.customerId]?.name, x.destination, x.stage]
      .join(" ")
      .toLowerCase()
      .includes(q.toLowerCase()),
  );
  function start(r?: Row) {
    setEdit(r || null);
    setData(
      r
        ? {
            ...defaultData(),
            ...r,
            firstContactAt: local(r.firstContactAt),
            nextFollowUp: local(r.nextFollowUp),
          }
        : defaultData(),
    );
    setOpen(true);
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!data.customerId) {
      fail("Search for a customer and choose an exact result.");
      return;
    }
    setBusy(true);
    try {
      const payload = {
        ...data,
        firstContactAt: iso(data.firstContactAt),
        nextFollowUp: iso(data.nextFollowUp),
        adults: data.adults === "" ? null : Number(data.adults),
        infants: Number(data.infants || 0),
      };
      await api("enquiry", payload, { id: edit?._id, version: edit?.version });
      setOpen(false);
      await reload();
    } catch (e) {
      fail((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="section-actions">
        <div className="filter-pills">
          {[
            "All",
            "New",
            "Contacting",
            "Gathering details",
            "Quote requested",
            "Quote sent",
            "Won",
            "On hold",
            "Lost",
          ].map((x) => (
            <span key={x}>
              {x === "All"
                ? rows.length
                : rows.filter((r) => r.stage === x).length}{" "}
              {x}
            </span>
          ))}
        </div>
        <button
          className="button primary"
          onClick={() => start()}
          disabled={!s.customers.length}
        >
          <Plus /> New enquiry
        </button>
      </div>
      {!s.customers.length && (
        <div className="banner">Add a customer before creating an enquiry.</div>
      )}
      <section className="panel table-panel">
        <div className="data-table">
          <div className="table-row table-head">
            <span>Customer</span>
            <span>Destination</span>
            <span>Stage</span>
            <span>Next action</span>
            <span>Owner</span>
            <span />
          </div>
          {rows.map((r) => (
            <button className="table-row" key={r._id} onClick={() => start(r)}>
              <span>
                <b>{customers[r.customerId]?.name || "Unknown"}</b>
                <small>{r.source}</small>
              </span>
              <span>
                {r.destination || r.travelPreference || "Not decided"}
              </span>
              <span>
                <Badge value={r.reviewNeeded ? "Needs review" : r.stage} />
              </span>
              <span>
                {r.nextFollowUp ? moneyDate(r.nextFollowUp) : "Not scheduled"}
              </span>
              <span>
                {s.staff.find((x) => x._id === r.assigneeId)?.name ||
                  "Unassigned"}
              </span>
              <ArrowRight />
            </button>
          ))}
          {!rows.length && (
            <Empty
              icon={Inbox}
              title="No enquiries found"
              text="Create an enquiry or change your search."
            />
          )}
        </div>
      </section>
      {open && (
        <Drawer
          title={edit ? "Edit enquiry" : "Capture enquiry"}
          close={() => setOpen(false)}
          wide
        >
          <form className="form-grid" onSubmit={save}>
            <CustomerSearch
              value={data.customerId}
              set={(v: any) => setData({ ...data, customerId: v })}
              selected={customers[data.customerId]}
            />
            <Select
              label="Source"
              value={data.source}
              set={(v: any) => setData({ ...data, source: v })}
              options={[
                "WhatsApp",
                "Phone",
                "Website",
                "Instagram",
                "Referral",
                "Walk-in",
                "Other",
              ]}
            />
            <Field
              label="Destination or place"
              value={data.destination}
              set={(v: any) => setData({ ...data, destination: v })}
            />
            <Select
              label="Assigned to"
              value={data.assigneeId}
              set={(v: any) => setData({ ...data, assigneeId: v })}
              options={s.staff
                .filter((x) => x.status === "active" && x.role !== "operations")
                .map((x) => [x._id, x.name])}
              disabled={s.actor.role !== "owner"}
            />
            <Select
              label="Stage"
              value={data.stage}
              set={(v: any) => setData({ ...data, stage: v })}
              options={[
                "New",
                "Contacting",
                "Gathering details",
                "Quote requested",
                "Quote sent",
                "Won",
                "On hold",
                "Lost",
              ]}
            />
            <Select
              label="Call outcome"
              value={data.contactOutcome}
              set={(v: any) => setData({ ...data, contactOutcome: v })}
              options={["Not contacted", "Connected", "No answer", "Call back"]}
            />
            <Field
              label="First contact"
              type="datetime-local"
              value={data.firstContactAt}
              set={(v: any) => setData({ ...data, firstContactAt: v })}
              required
            />
            <Select
              label="Travel date type"
              value={data.dateMode}
              set={(v: any) => setData({ ...data, dateMode: v })}
              options={["Unknown", "Exact", "Flexible", "Month"]}
            />
            {data.dateMode === "Exact" ? (
              <>
                <Field
                  label="Departure"
                  type="date"
                  value={data.departure}
                  set={(v: any) => setData({ ...data, departure: v })}
                />
                <Field
                  label="Return"
                  type="date"
                  value={data.returnDate}
                  set={(v: any) => setData({ ...data, returnDate: v })}
                />
              </>
            ) : (
              <Field
                label="Travel preference"
                value={data.travelPreference}
                set={(v: any) => setData({ ...data, travelPreference: v })}
                placeholder="December, flexible by 2 days…"
                span
              />
            )}
            <Field
              label="Adults"
              type="number"
              value={data.adults ?? ""}
              set={(v: any) => setData({ ...data, adults: v })}
            />
            <Field
              label="Children and ages"
              value={data.childrenAges}
              set={(v: any) => setData({ ...data, childrenAges: v })}
              placeholder="2 children: 5, 9"
            />
            <Field
              label="Budget"
              value={data.budget}
              set={(v: any) => setData({ ...data, budget: v })}
            />
            <Select
              label="Budget basis"
              value={data.budgetBasis}
              set={(v: any) => setData({ ...data, budgetBasis: v })}
              options={["Unknown", "Total", "Per person", "Per couple"]}
            />
            <Field
              label="Services needed"
              value={data.services}
              set={(v: any) => setData({ ...data, services: v })}
              placeholder="Hotel, car, train help…"
              span
            />
            <Field
              label="Hotel preference"
              value={data.hotelPreference}
              set={(v: any) => setData({ ...data, hotelPreference: v })}
            />
            <Field
              label="Pickup / arrival"
              value={data.pickup}
              set={(v: any) => setData({ ...data, pickup: v })}
            />
            <Field
              label="Next action"
              value={data.nextAction}
              set={(v: any) => setData({ ...data, nextAction: v })}
              placeholder="Call to confirm hotel category"
            />
            <Field
              label="Next follow-up"
              type="datetime-local"
              value={data.nextFollowUp}
              set={(v: any) => setData({ ...data, nextFollowUp: v })}
            />
            {["Lost", "On hold"].includes(data.stage) && (
              <Field
                label={`${data.stage} reason`}
                value={data.reason}
                set={(v: any) => setData({ ...data, reason: v })}
                span
                required
              />
            )}
            <Field
              label="Special requirements"
              value={data.specialRequirements}
              set={(v: any) => setData({ ...data, specialRequirements: v })}
              area
              span
            />
            <Field
              label="Internal notes"
              value={data.notes}
              set={(v: any) => setData({ ...data, notes: v })}
              area
              span
            />
            <FormFoot busy={busy} />
          </form>
        </Drawer>
      )}
    </>
  );
}

function Tasks({
  s,
  q,
  reload,
  fail,
}: {
  s: Snap;
  q: string;
  reload: () => Promise<void>;
  fail: (x: string) => void;
}) {
  const [open, setOpen] = useState(false),
    [edit, setEdit] = useState<Row | null>(null),
    [month, setMonth] = useState(new Date());
  const [data, setData] = useState<any>({
    title: "",
    assigneeId: s.actor.id,
    dueAt: local(new Date().toISOString()),
    status: "To do",
    note: "",
    enquiryId: "",
    customerId: "",
  });
  const [busy, setBusy] = useState(false);
  const rows = s.tasks.filter((x) =>
    [x.title, x.status].join(" ").toLowerCase().includes(q.toLowerCase()),
  );
  function start(r?: Row) {
    setEdit(r || null);
    setData(
      r
        ? { ...r, dueAt: local(r.dueAt) }
        : {
            title: "",
            assigneeId: s.actor.id,
            dueAt: local(new Date().toISOString()),
            status: "To do",
            note: "",
            enquiryId: "",
            customerId: "",
          },
    );
    setOpen(true);
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api(
        "task",
        { ...data, dueAt: iso(data.dueAt) },
        { id: edit?._id, version: edit?.version },
      );
      setOpen(false);
      await reload();
    } catch (e) {
      fail((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const days = calendarDays(month);
  return (
    <>
      <div className="section-actions">
        <div className="month-switch">
          <button
            onClick={() =>
              setMonth(new Date(month.getFullYear(), month.getMonth() - 1))
            }
          >
            <ChevronLeft />
          </button>
          <b>
            {month.toLocaleDateString("en-IN", {
              month: "long",
              year: "numeric",
            })}
          </b>
          <button
            onClick={() =>
              setMonth(new Date(month.getFullYear(), month.getMonth() + 1))
            }
          >
            <ChevronRight />
          </button>
        </div>
        <button className="button primary" onClick={() => start()}>
          <Plus /> New task
        </button>
      </div>
      <div className="task-layout">
        <section className="panel calendar">
          <div className="weekdays">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((x) => (
              <b key={x}>{x}</b>
            ))}
          </div>
          <div className="calendar-grid">
            {days.map((d, i) => {
              const items = rows.filter(
                (t) => String(t.dueAt).slice(0, 10) === d.iso,
              );
              return (
                <div
                  key={i}
                  className={`${d.other ? "other " : ""}${d.iso === new Date().toISOString().slice(0, 10) ? "today" : ""}`}
                >
                  <span>{d.day}</span>
                  {items.slice(0, 3).map((t) => (
                    <button key={t._id} onClick={() => start(t)}>
                      {t.title}
                    </button>
                  ))}
                  {items.length > 3 && <small>+{items.length - 3} more</small>}
                </div>
              );
            })}
          </div>
        </section>
        <section className="panel task-list">
          <PanelHead title="Work queue" sub="Due soonest first" />
          <div>
            {rows.slice(0, 12).map((t) => (
              <button className="task-row" key={t._id} onClick={() => start(t)}>
                <span
                  className={`task-check ${t.status === "Done" ? "done" : ""}`}
                >
                  <Check />
                </span>
                <div>
                  <b>{t.title}</b>
                  <small>
                    {moneyDate(t.dueAt)} · {t.status}
                  </small>
                </div>
                <ArrowRight />
              </button>
            ))}
            {!rows.length && (
              <Empty
                icon={CheckSquare}
                title="No tasks found"
                text="Add a task or change your search."
              />
            )}
          </div>
        </section>
      </div>
      {open && (
        <Drawer
          title={edit ? "Update task" : "Add task"}
          close={() => setOpen(false)}
        >
          <form className="form-grid" onSubmit={save}>
            <Field
              label="Task"
              value={data.title}
              set={(v: any) => setData({ ...data, title: v })}
              span
              required
            />
            <Select
              label="Assigned to"
              value={data.assigneeId}
              set={(v: any) => setData({ ...data, assigneeId: v })}
              options={s.staff
                .filter((x) => x.status === "active")
                .map((x) => [x._id, x.name])}
              disabled={s.actor.role !== "owner"}
            />
            <Field
              label="Due date & time"
              type="datetime-local"
              value={data.dueAt}
              set={(v: any) => setData({ ...data, dueAt: v })}
              required
            />
            <Select
              label="Status"
              value={data.status}
              set={(v: any) => setData({ ...data, status: v })}
              options={["To do", "In progress", "Waiting", "Done", "Cancelled"]}
            />
            <Field
              label="Work note"
              value={data.note}
              set={(v: any) => setData({ ...data, note: v })}
              area
              span
              placeholder="Required when completing, waiting or rescheduling"
            />
            <FormFoot busy={busy} />
          </form>
        </Drawer>
      )}
    </>
  );
}

function Notifications({
  s,
  reload,
  go,
  fail,
}: {
  s: Snap;
  reload: () => Promise<void>;
  go: (v: View) => void;
  fail: (x: string) => void;
}) {
  async function read(n: Row) {
    try {
      await api("read", {}, { id: n._id });
      await reload();
      go(
        s.actor.role === "operations"
          ? s.bookings.some((x) => x._id === n.recordId)
            ? "operations"
            : "tasks"
          : s.bookings.some((x) => x._id === n.recordId)
            ? /^(finance-|settlement-|change-|customer-change:)/.test(n._id) ? "settlements" : "bookings"
            : s.quotes.some((x) => x._id === n.recordId)
              ? "quotations"
              : n.recordId?.startsWith("follow:")
                ? "tasks"
                : "enquiries",
      );
    } catch (e) {
      fail((e as Error).message);
    }
  }
  return (
    <section className="panel notification-list">
      <PanelHead
        title="Updates"
        sub="Assignments, reminders and changes that concern you"
      />
      {s.notifications.map((n) => (
        <button
          key={n._id}
          className={n.read ? "notification" : "notification unread"}
          onClick={() => read(n)}
        >
          <span>
            <Bell />
          </span>
          <div>
            <b>{n.title}</b>
            <small>{moneyDate(n.createdAt)}</small>
          </div>
          <ArrowRight />
        </button>
      ))}
      {!s.notifications.length && (
        <Empty
          icon={Bell}
          title="No notifications"
          text="Relevant assignment and reminder updates will appear here."
        />
      )}
    </section>
  );
}

function Staff({
  s,
  reload,
  fail,
}: {
  s: Snap;
  reload: () => Promise<void>;
  fail: (x: string) => void;
}) {
  const [open, setOpen] = useState(false),
    [edit, setEdit] = useState<Row | null>(null),
    [link, setLink] = useState(""),
    [busy, setBusy] = useState(false),
    [data, setData] = useState<any>({
      name: "",
      email: "",
      role: "sales",
      status: "invited",
      replacementId: "",
      capabilities: [],
      reset: false,
    });
  function start(r?: Row) {
    setEdit(r || null);
    setData(
      r
        ? { ...r, replacementId: "", reset: false }
        : {
            name: "",
            email: "",
            role: "sales",
            status: "invited",
            replacementId: "",
            capabilities: [],
            reset: false,
          },
    );
    setLink("");
    setOpen(true);
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const result = await api("staff", {
        id: edit?._id,
        version: edit?.version,
        name: data.name,
        email: data.email,
        role: data.role,
        status: data.status,
        replacementId: data.replacementId || "",
        capabilities: Array.isArray(data.capabilities) ? data.capabilities : [],
        reset: Boolean(data.reset),
      });
      if (result?.url) setLink(result.url);
      else {
        setOpen(false);
        await reload();
      }
    } catch (e) {
      fail((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const needsReplacement = Boolean(
    edit &&
      edit.status === "active" &&
      ((edit.role === "operations" &&
        (data.role !== "operations" || data.status === "inactive")) ||
        (edit.role !== "operations" &&
          (data.role === "operations" || data.status === "inactive"))),
  );
  const replacementOptions = edit
    ? s.staff
        .filter(
          (person) =>
            person._id !== edit._id &&
            person.status === "active" &&
            (edit.role === "operations"
              ? person.role === "operations"
              : person.role !== "operations"),
        )
        .map((person) => [person._id, `${person.name} · ${person.role}`])
    : [];
  return (
    <>
      <div className="section-actions">
        <p>Review account requests, assign roles and control access</p>
        <button className="button primary" onClick={() => start()}>
          <Plus /> Invite team member
        </button>
      </div>
      <section className="panel">
        <div className="cards-list">
          {s.staff.map((r) => (
            <button
              className="record-card"
              key={r._id}
              onClick={() => start(r)}
            >
              <span className="avatar">{r.name.slice(0, 2).toUpperCase()}</span>
              <div className="record-main">
                <b>{r.name}</b>
                <small>{r.email}</small>
              </div>
              <Badge value={r.status} />
              <span className="role-label">{r.role}</span>
              <ArrowRight />
            </button>
          ))}
        </div>
      </section>
      <section className="panel settings-panel">
        <PanelHead
          title="Follow-up rules"
          sub="When the system should flag untouched work"
        />
        <RuleSettings s={s} reload={reload} fail={fail} />
      </section>
      {open && (
        <Drawer
          title={edit ? "Team account" : "Invite team member"}
          close={() => setOpen(false)}
        >
          <form className="form-grid" onSubmit={save}>
            {link ? (
              <div className="activation-box span">
                <Check />
                <h3>Activation link created</h3>
                <p>
                  Copy this link and send it privately to the team member. It
                  expires in 24 hours and works once.
                </p>
                <code>{link}</code>
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => navigator.clipboard.writeText(link)}
                >
                  <Copy /> Copy link
                </button>
                <button
                  type="button"
                  className="text-button"
                  onClick={async () => {
                    setOpen(false);
                    await reload();
                  }}
                >
                  Done
                </button>
              </div>
            ) : (
              <>
                <Field
                  label="Name"
                  value={data.name}
                  set={(v: any) => setData({ ...data, name: v })}
                  required
                />
                <Field
                  label="Email"
                  type="email"
                  value={data.email}
                  set={(v: any) => setData({ ...data, email: v })}
                  disabled={!!edit}
                  required
                />
                <Select
                  label="Role"
                  value={data.role}
                  set={(v: any) =>
                    setData({ ...data, role: v, replacementId: "" })
                  }
                  options={["owner", "sales", "operations"]}
                  disabled={edit?._id === s.actor.id}
                />
                <Select
                  label="Status"
                  value={data.status}
                  set={(v: any) => setData({ ...data, status: v })}
                  options={
                    edit?.status === "pending"
                      ? ["pending", "active", "inactive"]
                      : edit?.status === "invited"
                        ? ["invited", "inactive"]
                        : ["active", "inactive"]
                  }
                  disabled={!edit || edit?._id === s.actor.id}
                />
                {edit?.status === "pending" && (
                  <div className="banner span">
                    <b>Account request awaiting review.</b> Confirm this person,
                    choose the correct role, then change Status to active. Until
                    then, they cannot access CRM data.
                  </div>
                )}
                {needsReplacement && (
                  <Select
                    label={
                      edit?.role === "operations"
                        ? "Move active trips to"
                        : "Move customers and open work to"
                    }
                    value={data.replacementId}
                    set={(v: any) => setData({ ...data, replacementId: v })}
                    options={[["", "Choose replacement"], ...replacementOptions]}
                  />
                )}{" "}
                {data.role === "operations" && (
                  <fieldset className="capability-box span">
                    <legend>Optional Operations permissions</legend>
                    {[
                      ["trip-notes", "Edit trip notes"],
                      ["trip-times", "Update trip timings"],
                      ["expense-evidence", "Attach expense evidence"],
                      ["logistics-request", "Submit logistics requests"],
                    ].map(([capability, label]) => (
                      <label className="check" key={capability}>
                        <input
                          type="checkbox"
                          checked={data.capabilities.includes(capability)}
                          onChange={(event) =>
                            setData({
                              ...data,
                              capabilities: event.target.checked
                                ? [...data.capabilities, capability]
                                : data.capabilities.filter(
                                    (item: string) => item !== capability,
                                  ),
                            })
                          }
                        />
                        <span><b>{label}</b></span>
                      </label>
                    ))}
                  </fieldset>
                )}
                {edit?.role === "owner" && edit._id !== s.actor.id && (
                  <div className="banner span">
                    The last active Owner cannot be demoted or deactivated.
                    Role changes immediately revoke that user&apos;s sessions.
                  </div>
                )}
                {edit && edit.status !== "pending" && (
                  <label className="check span">
                    <input
                      type="checkbox"
                      checked={data.reset}
                      onChange={(e) =>
                        setData({ ...data, reset: e.target.checked })
                      }
                    />
                    <span>
                      <b>Create password-reset link</b>
                      <small>The link expires after 24 hours.</small>
                    </span>
                  </label>
                )}
                <FormFoot busy={busy} />
              </>
            )}
          </form>
        </Drawer>
      )}
    </>
  );
}
function RuleSettings({ s, reload, fail }: any) {
  const [data, setData] = useState({
    contactHours: Number(s.settings?.contactHours || 4),
    escalateHours: Number(s.settings?.escalateHours || 24),
  });
  return (
    <form
      className="rule-form"
      onSubmit={async (e) => {
        e.preventDefault();
        try {
          await api("settings", data);
          await reload();
        } catch (x) {
          fail((x as Error).message);
        }
      }}
    >
      <Field
        label="Contact within (hours)"
        type="number"
        value={data.contactHours}
        set={(v: any) => setData({ ...data, contactHours: Number(v) })}
      />
      <Field
        label="Escalate overdue after (hours)"
        type="number"
        value={data.escalateHours}
        set={(v: any) => setData({ ...data, escalateHours: Number(v) })}
      />
      <button className="button secondary">
        <Settings2 /> Save rules
      </button>
    </form>
  );
}

function Imports({
  s,
  reload,
  fail,
}: {
  s: Snap;
  reload: () => Promise<void>;
  fail: (x: string) => void;
}) {
  const [upload, setUpload] = useState<any>(null),
    [sheet, setSheet] = useState(""),
    [type, setType] = useState("enquiries"),
    [countryCode, setCountry] = useState("+91"),
    [mapping, setMapping] = useState<Record<string, number>>({}),
    [batch, setBatch] = useState<any>(null),
    [busy, setBusy] = useState(false);
  const fields = [
    "name",
    "phone",
    "email",
    "destination",
    "nights",
    "pax",
    "travelDate",
    "staff",
    "remarks",
    "extraNotes",
    "enquiryDate",
  ];
  async function send(file: File) {
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await fetch("/api/crm", { method: "POST", body: fd });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setUpload(j);
      setSheet(j.sheets[0]?.name || "");
      const headers = (j.sheets[0]?.rows?.[0] || []).map((x: string) =>
        x.toLowerCase(),
      );
      const aliases: any = {
        name: ["name", "customer", "lead name"],
        phone: ["phone", "mobile", "contact no"],
        email: ["email"],
        destination: ["destination", "place"],
        nights: ["nights"],
        pax: ["pax", "persons"],
        travelDate: ["travel date", "date of travel"],
        staff: ["staff", "executive", "assigned"],
        remarks: ["remarks", "remark"],
        extraNotes: ["extra notes", "notes"],
        enquiryDate: ["enquiry date", "date"],
      };
      setMapping(
        Object.fromEntries(
          fields.map((f) => [
            f,
            headers.findIndex((h: string) =>
              aliases[f].some((a: string) => h.includes(a)),
            ),
          ]),
        ),
      );
    } catch (e) {
      fail((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function showPreview() {
    setBusy(true);
    try {
      setBatch(
        await api("preview", {
          uploadId: upload.id,
          sheet,
          mapping,
          countryCode,
          type,
        }),
      );
    } catch (e) {
      fail((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function commit() {
    setBusy(true);
    try {
      const choices = batch.rows.map((r: any) => ({
        row: r.row,
        action: r.name ? "create" : "skip",
        customerId: "",
        assigneeId: r.assigneeId,
      }));
      await api("commit", { batchId: batch.id, choices });
      setBatch(null);
      setUpload(null);
      await reload();
    } catch (e) {
      fail((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="import-grid">
      <section className="panel">
        <PanelHead
          title="Import legacy data"
          sub="CSV or XLSX · maximum 500 rows and 2 MB"
        />
        {!upload ? (
          <label className="dropzone">
            <FileSpreadsheet />
            <b>Choose an Excel or CSV file</b>
            <span>Your file is staged for preview; nothing is added yet.</span>
            <input
              type="file"
              accept=".csv,.xlsx"
              onChange={(e) => e.target.files?.[0] && send(e.target.files[0])}
            />
          </label>
        ) : !batch ? (
          <div className="form-grid">
            <Select
              label="Sheet"
              value={sheet}
              set={setSheet}
              options={upload.sheets.map((x: any) => x.name)}
            />
            <Select
              label="Import as"
              value={type}
              set={setType}
              options={[
                ["enquiries", "Customers + enquiries"],
                ["customers", "Customers only"],
              ]}
            />
            <Field
              label="Default country code"
              value={countryCode}
              set={setCountry}
            />
            <div className="span mapping">
              <h3>Match columns</h3>
              {fields.map((f) => (
                <label key={f}>
                  <span>{f}</span>
                  <select
                    value={mapping[f] ?? -1}
                    onChange={(e) =>
                      setMapping({ ...mapping, [f]: Number(e.target.value) })
                    }
                  >
                    <option value={-1}>Not mapped</option>
                    {(
                      upload.sheets.find((x: any) => x.name === sheet)
                        ?.rows?.[0] || []
                    ).map((h: string, i: number) => (
                      <option value={i} key={i}>
                        {h || `Column ${i + 1}`}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
            <button
              className="button primary span"
              disabled={busy || mapping.name < 0}
              onClick={showPreview}
              type="button"
            >
              Preview import <ArrowRight />
            </button>
          </div>
        ) : (
          <div>
            <div className="preview-summary">
              <b>{batch.rows.length} rows ready for review</b>
              <span>
                {batch.rows.filter((x: any) => x.warnings.length).length}{" "}
                contain warnings
              </span>
            </div>
            <div className="preview-list">
              {batch.rows.slice(0, 100).map((r: any) => (
                <div key={r.row}>
                  <b>
                    Row {r.row}: {r.name || "Missing name"}
                  </b>
                  <span>
                    {r.phone || r.email || "No usable contact"} ·{" "}
                    {r.destination || "No destination"}
                  </span>
                  {r.warnings.map((w: string) => (
                    <small key={w}>
                      <AlertCircle /> {w}
                    </small>
                  ))}
                </div>
              ))}
            </div>
            <button
              className="button primary wide"
              disabled={busy}
              onClick={commit}
            >
              Import valid rows for review
            </button>
          </div>
        )}
      </section>
      <section className="panel">
        <PanelHead
          title="Import history"
          sub="Committed rows are protected from accidental double import"
        />
        <div className="history-list">
          {s.imports.map((x) => (
            <div key={x._id}>
              <FileSpreadsheet />
              <span>
                <b>{x.filename}</b>
                <small>
                  {x.imported || 0} of {x.count || 0} imported
                </small>
              </span>
              <Badge value={x.status} />
            </div>
          ))}
          {!s.imports.length && (
            <Empty
              icon={Upload}
              title="No imports yet"
              text="Your import batches will appear here."
            />
          )}
        </div>
      </section>
    </div>
  );
}

function Drawer({
  title,
  close,
  children,
  wide = false,
}: {
  title: string;
  close: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="drawer-wrap">
      <button className="drawer-scrim" aria-label="Close panel" onClick={close} />
      <aside className={wide ? "drawer wide" : "drawer"}>
        <header>
          <div>
            <p className="eyebrow">EarlyBird workspace</p>
            <h2>{title}</h2>
          </div>
          <button className="icon-button" aria-label="Close panel" onClick={close}>
            <X />
          </button>
        </header>
        <div className="drawer-body">{children}</div>
      </aside>
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
  ...props
}: any) {
  return (
    <label className={span ? "field span" : "field"}>
      <span>{label}</span>
      {area ? (
        <textarea
          value={value ?? ""}
          onChange={(e) => set(e.target.value)}
          {...props}
        />
      ) : (
        <input
          type={type}
          value={value ?? ""}
          onChange={(e) => set(e.target.value)}
          {...props}
        />
      )}
    </label>
  );
}
function CustomerSearch({ value, set, selected }: any) {
  const listId = useId();
  const [text, setText] = useState(selected?.name || "");
  const [results, setResults] = useState<Row[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setText(selected?.name || "");
  }, [value, selected?.name]);

  useEffect(() => {
    const query = text.trim();
    if (!open || query.length < 2 || (value && query === selected?.name)) {
      setResults([]);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const response = await fetch(
          `/api/crm?resource=customer-search&q=${encodeURIComponent(query)}&limit=20`,
          { cache: "no-store", signal: controller.signal },
        );
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "Customer search failed");
        setResults(body.results || []);
      } catch (error) {
        if ((error as Error).name !== "AbortError") setResults([]);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 300);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [open, selected?.name, text, value]);

  const choose = (customer: Row) => {
    set(customer._id);
    setText(customer.name);
    setResults([]);
    setOpen(false);
  };

  return (
    <label className="field customer-search">
      <span>Customer</span>
      <div className="customer-search-control">
        <Search aria-hidden="true" />
        <input
          role="combobox"
          aria-expanded={open && text.trim().length >= 2}
          aria-controls={listId}
          aria-autocomplete="list"
          autoComplete="off"
          placeholder="Search by name, phone or email"
          value={text}
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
          onChange={(event) => {
            setText(event.target.value);
            set("");
            setOpen(true);
          }}
        />
        {loading && <RefreshCw className="customer-search-spinner" aria-label="Searching" />}
      </div>
      {open && text.trim().length >= 2 && !value && (
        <div className="customer-search-results" id={listId} role="listbox">
          {!loading && results.length === 0 && (
            <p>No permitted customer found. Try a name, phone or email.</p>
          )}
          {results.map((customer) => (
            <button
              type="button"
              role="option"
              aria-selected="false"
              key={customer._id}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(customer)}
            >
              <span className="avatar">{customer.name.slice(0, 2).toUpperCase()}</span>
              <span>
                <b>{customer.name}</b>
                <small>{customer.phone || customer.email || "Contact needs review"}</small>
              </span>
            </button>
          ))}
        </div>
      )}
      <small className={value ? "customer-search-selected" : ""}>
        {value ? "Customer selected" : "Type at least 2 characters, then choose a result."}
      </small>
    </label>
  );
}
function Select({ label, value, set, options, disabled = false }: any) {
  return (
    <label className="field">
      <span>{label}</span>
      <select
        value={value}
        onChange={(e) => set(e.target.value)}
        disabled={disabled}
      >
        {options.map((x: any) => {
          const [v, l] = Array.isArray(x) ? x : [x, x];
          return (
            <option value={v} key={v}>
              {l}
            </option>
          );
        })}
      </select>
    </label>
  );
}
function FormFoot({ busy }: { busy: boolean }) {
  return (
    <div className="form-foot span">
      <span>Changes are saved to the activity history.</span>
      <button className="button primary" disabled={busy}>
        {busy ? "Saving…" : "Save changes"} <ArrowRight />
      </button>
    </div>
  );
}
function Badge({ value }: { value: string }) {
  return (
    <span className={`badge ${value.toLowerCase().replaceAll(" ", "-")}`}>
      {value}
    </span>
  );
}
function calendarDays(month: Date) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1),
    start = (first.getDay() + 6) % 7,
    last = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate(),
    prev = new Date(month.getFullYear(), month.getMonth(), 0).getDate();
  return Array.from({ length: 42 }, (_, i) => {
    const n = i - start + 1;
    const date =
      n < 1
        ? new Date(month.getFullYear(), month.getMonth() - 1, prev + n)
        : n > last
          ? new Date(month.getFullYear(), month.getMonth() + 1, n - last)
          : new Date(month.getFullYear(), month.getMonth(), n);
    return {
      day: date.getDate(),
      iso: [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, "0"),
        String(date.getDate()).padStart(2, "0"),
      ].join("-"),
      other: n < 1 || n > last,
    };
  });
}
