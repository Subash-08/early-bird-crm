"use client";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { usePathname, useRouter } from "next/navigation";
import { canOpenWorkspace, workspaceViews as routeViews, type View } from "@/lib/workspace-access";
import { authClient } from "@/lib/auth-client";
import { Login } from "./login";
import { CustomerDetailPage } from "./customer-detail-page";
import { formatFollowUpEvent, indiaInput, indiaIso, shortIndiaTime } from "@/lib/workspace-time";
import { activeQuoteStatuses, quoteRequestBlock } from "@/lib/quote-request-state";
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
  Wallet,
} from "lucide-react";
const RouteLoading = () => <section className="panel route-loading"><RefreshCw className="spin" /> Loading this workspace…</section>;
const Quotations = dynamic(() => import("./quotations").then((module) => module.Quotations), { loading: RouteLoading });
const LinkedQuote = dynamic(() => import("./quotations").then((module) => module.LinkedQuote), { loading: RouteLoading });
const PackageTemplates = dynamic(() => import("./quotations").then((module) => module.PackageTemplates), { loading: RouteLoading });
const Bookings = dynamic(() => import("./bookings").then((module) => module.Bookings), { loading: RouteLoading });
const Operations = dynamic(() => import("./operations").then((module) => module.Operations), { loading: RouteLoading });
const Settlements = dynamic(() => import("./settlements").then((module) => module.Settlements), { loading: RouteLoading });
const Reports = dynamic(() => import("./reports").then((module) => module.Reports), { loading: RouteLoading });
const InvoiceSettings = dynamic(() => import("./invoice-settings").then((module) => module.InvoiceSettings), { loading: RouteLoading });
const Attendance = dynamic(() => import("./attendance").then((module) => module.Attendance), { loading: RouteLoading });
const TeamActivity = dynamic(() => import("./activity-panel").then((module) => module.ActivityPanel), { loading: RouteLoading });

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
  notificationUnread?: number;
  scope?: string;
  pagination?: { page: number; pageSize: number; total: number; totalPages: number };
  limited?: boolean;
};
type ListFilters = { page: number; pageSize: number; status: string; assigneeId: string; from: string; to: string };
const defaultListFilters: ListFilters = { page: 1, pageSize: 20, status: "", assigneeId: "", from: "", to: "" };
export type { View } from "@/lib/workspace-access";
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
const iso = indiaIso;
const local = indiaInput;
const moneyDate = shortIndiaTime;
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

const navGroups: { title: string; views: View[] }[] = [
  { title: "Travel desk", views: ["dashboard", "enquiries", "customers", "quotations", "bookings", "operations", "settlements"] },
  { title: "Daily work", views: ["tasks", "attendance", "notifications", "reports"] },
  { title: "Agency setup", views: ["package-templates", "invoice-settings", "staff", "imports"] },
];

export function CrmApp({ initialView = "dashboard", customerId = "" }: { initialView?: View; customerId?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const enquirySegment = pathname.match(/^\/enquiries\/([^/]+)\/?$/)?.[1];
  let enquiryId = enquirySegment || "";
  try { enquiryId = decodeURIComponent(enquiryId); } catch { /* Show the not-found state. */ }
  const quoteSegment = pathname.match(/^\/quotations\/([^/]+)\/?$/)?.[1];
  let quoteId = quoteSegment || "";
  try { quoteId = decodeURIComponent(quoteId); } catch { /* Show the not-found state. */ }
  const activitySegment = pathname.match(/^\/staff\/activity\/([^/]+)\/?$/)?.[1];
  let activityMemberId = activitySegment || "";
  if (activitySegment) {
    try { activityMemberId = decodeURIComponent(activitySegment); } catch { /* Invalid IDs show the not-found state. */ }
  }
  const requestId = useRef(0);
  const [snap, setSnap] = useState<Snap | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [view, setView] = useState<View>(initialView),
    [moreOpen, setMoreOpen] = useState(false),
    [mobileSearch, setMobileSearch] = useState(false),
    [installPrompt, setInstallPrompt] = useState<any>(null),
    [offline, setOffline] = useState(false),
    [search, setSearch] = useState(""),
    [debouncedSearch, setDebouncedSearch] = useState(""),
    [listFilters, setListFilters] = useState<ListFilters>(defaultListFilters),
    [activeCustomerId, setActiveCustomerId] = useState(customerId);
  const scope = activeCustomerId || quoteId || view === "package-templates" ? "shell" : view;
  const load = useCallback(async () => {
    const currentRequest = ++requestId.current;
    try {
      const params = new URLSearchParams({
        scope,
        page: String(listFilters.page),
        pageSize: String(listFilters.pageSize),
        q: debouncedSearch,
        status: listFilters.status,
        assigneeId: listFilters.assigneeId,
        from: listFilters.from,
        to: listFilters.to,
      });
      const r = await fetch(`/api/crm?${params}`, { cache: "no-store" });
      if (currentRequest !== requestId.current) return;
      if (r.status === 401) {
        setSnap(null);
        return;
      }
      if (r.status === 403) {
        setError("That page is not available for your role.");
        if (view !== "dashboard") {
          router.replace("/dashboard");
          return;
        }
        setSnap(null);
        return;
      }
      const j = await r.json();
      if (currentRequest !== requestId.current) return;
      if (!r.ok) throw new Error(j.error);
      setSnap(j);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load workspace");
    } finally {
      if (currentRequest === requestId.current) setLoading(false);
    }
  }, [debouncedSearch, listFilters, router, scope, view]);
  useEffect(() => {
    if (search.trim() === debouncedSearch) return;
    const timer = window.setTimeout(() => {
      setListFilters((current) => ({ ...current, page: 1 }));
      setDebouncedSearch(search.trim());
      setLoading(true);
    }, 350);
    return () => window.clearTimeout(timer);
  }, [debouncedSearch, search]);
  useEffect(() => {
    const segments = pathname.split("/").filter(Boolean);
    const segment = segments[0] as View | undefined;
    const next = segment && routeViews.includes(segment) ? segment : initialView;
    let routeCustomerId = "";
    if (segment === "customers" && segments[1]) {
      try { routeCustomerId = decodeURIComponent(segments[1]); }
      catch { routeCustomerId = segments[1]; }
    }
    setActiveCustomerId((current) => {
      if (current === routeCustomerId) return current;
      setLoading(true);
      return routeCustomerId;
    });
    if (next !== view) {
      setLoading(true);
      setSearch("");
      setDebouncedSearch("");
      setListFilters(defaultListFilters);
      setView(next);
    }
  }, [initialView, pathname]);
  useEffect(() => {
    load();
    const refresh = () => { if (document.visibilityState === "visible") void load(); };
    const liveViews: View[] = ["dashboard", "operations", "tasks", "notifications"];
    const timer = window.setInterval(refresh, liveViews.includes(view) ? 30000 : 120000);
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    const connection = () => setOffline(!navigator.onLine);
    connection();
    window.addEventListener("online", connection);
    window.addEventListener("offline", connection);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", refresh); window.removeEventListener("online", refresh); window.removeEventListener("online", connection); window.removeEventListener("offline", connection); };
  }, [load, view]);
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
    if (!snap) return;
    if (!canOpenWorkspace(snap.actor.role, view)) {
      setView("dashboard");
      router.replace("/dashboard");
    }
  }, [router, snap, view]);
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
  if (loading && !snap)
    return (
      <div className="skeleton-shell" role="status" aria-label="Loading workspace">
        <div className="skeleton-sidebar" aria-hidden="true" />
        <div className="skeleton-body" aria-hidden="true">
          <div className="skeleton-mobile-header"><i /><i /></div>
          <i />
          <i />
          <i />
        </div>
        <div className="skeleton-mobile-nav" aria-hidden="true">
          {Array.from({ length: 5 }, (_, index) => <i key={index} />)}
        </div>
      </div>
    );
  if (!snap) return <Login />;
  const role = snap.actor.role;
  const nav = ([
      ["dashboard", "Overview", LayoutDashboard],
            ["enquiries", "Enquiries", Inbox],
            ["customers", "Customers", Users],
            ["quotations", "Quotations", FileSpreadsheet],
            ["bookings", "Bookings", ClipboardCheck],
            ["operations", role === "operations" ? "My trips" : "Operations", Route],
            ["settlements", "Booking changes", Wallet],
      ["tasks", "Tasks", CheckSquare],
      ["attendance", "Attendance", Clock3],
      ["notifications", "Notifications", Bell],
      ["reports", "Reports", BarChart3],
            ["imports", "Import data", Upload],
            ["invoice-settings", "Invoice template", ReceiptText],
            ["package-templates", "Package templates", Copy],
            ["staff", "Team & setup", UserCog],
    ] as [View, string, any][]).filter(([id]) => canOpenWorkspace(role, id));
  const unread = Number(snap.notificationUnread ?? snap.notifications.filter((x) => !x.read).length);
  const mobilePrimary = (role === "operations"
    ? [
        ["dashboard", "Overview", LayoutDashboard],
        ["operations", "Trips", Route],
        ["tasks", "Tasks", CheckSquare],
        ["notifications", "Alerts", Bell],
      ]
    : [
        ["dashboard", "Overview", LayoutDashboard],
        ["enquiries", "Leads", Inbox],
        ["tasks", "Tasks", CheckSquare],
        ["bookings", "Bookings", ClipboardCheck],
      ]) as [View, string, any][];
  const mobilePrimaryIds = new Set(mobilePrimary.map(([id]) => id));
  const mobileSecondary = nav.filter(([id]) => !mobilePrimaryIds.has(id));
  const secondaryActive = mobileSecondary.some(([id]) => id === view);
  const openView = (next: View, recordId?: string) => {
    if (!canOpenWorkspace(role, next)) return;
    setMoreOpen(false);
    setMobileSearch(false);
    if (recordId && (next === "quotations" || next === "enquiries")) {
      window.history.pushState(null, "", `/${next}/${encodeURIComponent(recordId)}`);
      window.scrollTo(0, 0);
      return;
    }
    if (next === view && ((next === "staff" && activityMemberId) || (next === "enquiries" && enquiryId) || (next === "quotations" && quoteId))) {
      if (next === "quotations") setLoading(true);
      window.history.pushState(null, "", `/${next}`);
      return;
    }
    if (next !== view || activeCustomerId) {
      setLoading(true);
      setSearch("");
      setDebouncedSearch("");
      setListFilters(defaultListFilters);
      setActiveCustomerId("");
      window.history.pushState(null, "", `/${next}`);
      setView(next);
    }
  };
  const signOut = async () => {
    await authClient.signOut();
    location.reload();
  };
  return (
    <div className="app-shell" data-view={view}>
      {offline && <div className="connection-banner" role="alert">You are offline. Changes cannot be saved. Reconnect or call your coordinator.</div>}
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">
            <Plane />
          </span>
          <span>EarlyBird</span>
        </div>
        <nav aria-label="Workspace navigation">
          {navGroups.map(({ title, views }) => {
            const items = views.flatMap((id) => nav.filter(([candidate]) => candidate === id));
            return items.length > 0 && <div className="nav-group" key={title}>
            <span className="nav-group-title">{title}</span>
            {items.map(([id, label, Icon]) => (
            <button
              key={id}
              className={view === id ? "active" : ""}
              aria-current={view === id ? "page" : undefined}
              onClick={() => openView(id)}
              onMouseEnter={() => router.prefetch(`/${id}`)}
            >
              <Icon />
              {label}
              {id === "notifications" && unread > 0 && <em>{unread}</em>}
            </button>
            ))}
            </div>;
          })}
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
            <h1>{view === "staff" && activityMemberId ? "Team activity" : nav.find((x) => x[0] === view)?.[1]}</h1>
          </div>
          <div className="top-actions">
            {!activeCustomerId && !quoteId && view !== "package-templates" && <label className="search">
              <Search />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search this page"
              />
            </label>}
            {!quoteId && view !== "package-templates" && <button
              className="icon-button mobile-search-trigger"
              aria-label="Search this screen"
              aria-expanded={mobileSearch}
              onClick={() => setMobileSearch((value) => !value)}
            >
              {mobileSearch ? <X /> : <Search />}
            </button>}
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
        {mobileSearch && !quoteId && view !== "package-templates" && (
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
        <section className={`content${loading ? " content-loading" : ""}`} aria-busy={loading}>
          {loading ? (
            <RouteLoading />
          ) : (
            <>
          {isPagedView(view) && !activeCustomerId && !enquiryId && !quoteId && (
            <ListFiltersBar
              view={view}
              role={role}
              staff={snap.staff}
              value={listFilters}
              change={(next) => {
                setLoading(true);
                setListFilters({ ...next, page: 1 });
              }}
            />
          )}
          {snap.limited && (
            <div className="banner">
              Large workspace: the newest 1,000 records are shown. Use search
              and filters to narrow the list.
            </div>
          )}
          {view === "dashboard" && <Dashboard s={snap} go={openView} />}{" "}
          {view === "enquiries" && (
            <Enquiries key={enquiryId || "enquiry-list"} detailId={enquiryId} s={snap} q={search} reload={load} fail={setError} />
          )}{" "}
          {view === "customers" && activeCustomerId && <CustomerDetailPage id={activeCustomerId} embedded back={() => { window.history.pushState(null, "", "/customers"); setActiveCustomerId(""); setLoading(true); }} />}
          {view === "customers" && !activeCustomerId && (
            <Customers s={snap} q={search} reload={load} fail={setError} openDetail={(id) => { window.history.pushState(null, "", `/customers/${encodeURIComponent(id)}`); setActiveCustomerId(id); setLoading(true); }} />
          )}{" "}
          {view === "quotations" && (quoteId
            ? <LinkedQuote key={quoteId} quoteId={quoteId} actor={snap.actor} />
            : snap.scope === "quotations" && <Quotations s={snap} q={search} reload={load} fail={setError} />)}{" "}
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
              go={openView}
              fail={setError}
            />
          )}{" "}
          {view === "reports" && <Reports s={snap} fail={setError} />}{" "}
          {view === "attendance" && <Attendance role={role} fail={setError} />}{" "}
          {view === "imports" && (
            <Imports s={snap} reload={load} fail={setError} />
          )}{" "}
          {view === "invoice-settings" && (
            <InvoiceSettings s={snap} reload={load} fail={setError} />
          )}{" "}
          {view === "package-templates" && role === "owner" && <PackageTemplates actor={snap.actor} />}
          {view === "staff" && snap.actor.role === "owner" && (activityMemberId
            ? <StaffActivityDetail key={activityMemberId} s={snap} memberId={activityMemberId} back={() => openView("staff")} />
            : <Staff s={snap} reload={load} fail={setError} viewActivity={(id) => {
              setMobileSearch(false);
              window.history.pushState(null, "", `/staff/activity/${encodeURIComponent(id)}`);
              window.scrollTo(0, 0);
            }} />)}
          {isPagedView(view) && !activeCustomerId && !enquiryId && !quoteId && snap.pagination && (
            <PaginationBar
              value={snap.pagination}
              change={(page) => {
                setLoading(true);
                setListFilters((current) => ({ ...current, page }));
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
            />
          )}
            </>
          )}
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
            onMouseEnter={() => router.prefetch(`/${id}`)}
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
                  <button type="button" key={id} className={view === id ? "active" : ""} onMouseEnter={() => router.prefetch(`/${id}`)} onClick={() => openView(id)}>
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
  const today = indiaInput(new Date().toISOString()).slice(0, 10),
    open = s.tasks.filter((t) => !["Done", "Cancelled"].includes(t.status)),
    due = open.filter((t) => t.dueAt && indiaInput(t.dueAt).slice(0, 10) <= today)
      .sort((a, b) => String(a.dueAt).localeCompare(String(b.dueAt))),
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
        {s.actor.role !== "operations" && <Metric
          icon={Inbox}
          label="Open enquiries"
          value={s.enquiries.filter((x) => x.stage !== "Lost").length}
          note={`${newLeads.length} new`}
        />}
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
            title="Due today or overdue"
            sub="Open tasks, earliest due first"
            action={
              <button className="text-button" onClick={() => go("tasks")}>
                View all <ArrowRight />
              </button>
            }
          />
          <div className="timeline">
            {due.slice(0, 6).map((t, i) => (
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
            {!due.length && (
              <Empty
                icon={Check}
                title="Nothing due today"
                text="Open Tasks to see upcoming work."
              />
            )}
          </div>
        </section>
        {s.actor.role === "operations" ? <section className="panel">
          <PanelHead title="My trips" sub="Open your assigned trips, pickup details and trip updates." />
          <button className="button secondary" onClick={() => go("operations")}>View my trips <ArrowRight /></button>
        </section> : <section className="panel">
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
        </section>}
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

const pagedViews: View[] = [
  "customers", "enquiries", "quotations", "bookings", "operations",
  "settlements", "tasks", "notifications",
];
const isPagedView = (view: View) => pagedViews.includes(view);
const filterStatuses: Partial<Record<View, string[]>> = {
  customers: ["Ready", "Needs review"],
  enquiries: ["New", "Contacting", "Gathering details", "Quote requested", "Quote sent", "Won", "On hold", "Lost"],
  quotations: ["Requested", "Draft", "Needs information", "Pending approval", "Approved", "Accepted", "Rejected", "Expired", "Superseded"],
  bookings: ["Ready for coordination", "Awaiting advance", "Ready for operations release", "Pending confirmation", "Trip completed", "Cancelled"],
  operations: ["Operations released", "In progress", "Trip completed", "Cancelled"],
  settlements: ["Operations released", "Trip completed", "Cancelled"],
  tasks: ["To do", "In progress", "Waiting", "Done", "Cancelled"],
  notifications: ["Unread", "Read"],
};

function ListFiltersBar({
  view,
  role,
  staff,
  value,
  change,
}: {
  view: View;
  role: Snap["actor"]["role"];
  staff: Row[];
  value: ListFilters;
  change: (value: ListFilters) => void;
}) {
  const update = (key: keyof ListFilters, next: string | number) =>
    change({ ...value, [key]: next });
  const showAssignee = role === "owner" && !["customers", "notifications"].includes(view);
  return (
    <section className="list-filters" aria-label="List filters">
      <label>
        <span>Status</span>
        <select value={value.status} onChange={(event) => update("status", event.target.value)}>
          <option value="">All statuses</option>
          {(filterStatuses[view] || []).map((item) => <option key={item} value={item}>{view === "enquiries" && item === "Won" ? "Accepted" : item}</option>)}
        </select>
      </label>
      {showAssignee && (
        <label>
          <span>Assigned to</span>
          <select value={value.assigneeId} onChange={(event) => update("assigneeId", event.target.value)}>
            <option value="">All staff</option>
            {staff.filter((person) => person.status === "active").map((person) => (
              <option key={person._id} value={person._id}>{person.name}</option>
            ))}
          </select>
        </label>
      )}
      <label><span>From</span><input type="date" value={value.from} onChange={(event) => update("from", event.target.value)} /></label>
      <label><span>To</span><input type="date" value={value.to} min={value.from} onChange={(event) => update("to", event.target.value)} /></label>
      <label>
        <span>Rows</span>
        <select value={value.pageSize} onChange={(event) => update("pageSize", Number(event.target.value))}>
          {[10, 20, 50].map((size) => <option key={size} value={size}>{size}</option>)}
        </select>
      </label>
      {(value.status || value.assigneeId || value.from || value.to) && (
        <button type="button" className="button secondary" onClick={() => change({ ...defaultListFilters, pageSize: value.pageSize })}>Clear filters</button>
      )}
    </section>
  );
}

function PaginationBar({
  value,
  change,
}: {
  value: NonNullable<Snap["pagination"]>;
  change: (page: number) => void;
}) {
  const first = value.total ? (value.page - 1) * value.pageSize + 1 : 0;
  const last = Math.min(value.total, value.page * value.pageSize);
  return (
    <nav className="pagination" aria-label="List pages">
      <span>{first}–{last} of {value.total}</span>
      <div>
        <button className="button secondary" disabled={value.page <= 1} onClick={() => change(value.page - 1)}><ChevronLeft /> Previous</button>
        <b>Page {value.page} of {value.totalPages}</b>
        <button className="button secondary" disabled={value.page >= value.totalPages} onClick={() => change(value.page + 1)}>Next <ChevronRight /></button>
      </div>
    </nav>
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
  openDetail,
}: {
  s: Snap;
  q: string;
  reload: () => Promise<void>;
  fail: (x: string) => void;
  openDetail: (id: string) => void;
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
            <div className="record-card customer-record-card" key={r._id}>
              <button className="customer-record-main" onClick={() => openDetail(r._id)}>
                <span className="avatar">{r.name.slice(0, 2).toUpperCase()}</span>
                <div className="record-main">
                  <b>{r.name}</b>
                  <small>{r.phone || r.email || "Contact needs review"}</small>
                </div>
                <Badge value={r.reviewNeeded ? "Needs review" : "Customer"} />
                <ArrowRight />
              </button>
              <button className="customer-edit-button" onClick={() => start(r)}>Edit</button>
            </div>
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
              label="Phone number"
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
                    {invoice.documentId && <a href={`/api/documents/finance/${invoice.documentId}`} download>
                      <ReceiptText /><span><b>{invoice.invoiceNumber}</b><small>{invoice.status} · Download invoice</small></span><Download />
                    </a>}
                    {s.actor.role === "owner" && invoice.status === "Issued" && <details><summary>Prepare renamed print copies</summary><div className="invoice-copy-action"><input value={copyLabels[invoice._id] ?? (invoice.snapshot?.copyLabels || ["Customer copy", "Office copy"]).join(", ")} onChange={(event) => setCopyLabels({ ...copyLabels, [invoice._id]: event.target.value })} placeholder="Customer copy, Office copy" /><button type="button" className="button secondary" disabled={printing === invoice._id} onClick={async () => {
                      const labels = (copyLabels[invoice._id] ?? (invoice.snapshot?.copyLabels || ["Customer copy", "Office copy"]).join(", ")).split(",").map((item) => item.trim()).filter(Boolean).slice(0, 6);
                      if (!labels.length) { fail("Add at least one print-copy label."); return; }
                      setPrinting(invoice._id);
                      try { const result = await api("invoice-print-copies", { invoiceId: invoice._id, copyLabels: labels }); const link = document.createElement("a"); link.href = `/api/documents/finance/${result.documentId}`; link.download = ""; link.click(); }
                      catch (error) { fail((error as Error).message); } finally { setPrinting(""); }
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
  detailId,
}: {
  s: Snap;
  q: string;
  reload: () => Promise<void>;
  fail: (x: string) => void;
  detailId: string;
}) {
  const [open, setOpen] = useState(false),
    [edit, setEdit] = useState<Row | null>(null),
    [busy, setBusy] = useState(false);
  const [pickedCustomer, setPickedCustomer] = useState<Row | null>(null);
  const [quickCustomer, setQuickCustomer] = useState(false);
  const [customerDraft, setCustomerDraft] = useState({ name: "", phone: "", email: "" });
  const [customerError, setCustomerError] = useState("");
  const [savingCustomer, setSavingCustomer] = useState(false);
  const customerWrite = useRef(false);
  const [section, setSection] = useState<"start" | "trip" | "activity" | "quote">("start");
  const [activity, setActivity] = useState<{ events: Row[]; followUp?: Row; quotes?: Row[]; booking?: Row; quoteGaps?: string[] } | null>(null);
  const [activityError, setActivityError] = useState("");
  const [teamChoice, setTeamChoice] = useState("");
  const [checkedAt, setCheckedAt] = useState(0);
  const [revision, setRevision] = useState(0);
  const [quoteBusy, setQuoteBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [quoteError, setQuoteError] = useState("");
  const [quoteDue, setQuoteDue] = useState(() => indiaInput(new Date(Date.now() + 86_400_000).toISOString()));
  const [quoteNote, setQuoteNote] = useState("");
  const [baseline, setBaseline] = useState("");
  const activityId = detailId || (open ? edit?._id : undefined);
  useEffect(() => {
    if (!activityId) return;
    let active = true;
    const timer = window.setInterval(() => setCheckedAt(Date.now()), 30_000);
    fetch(`/api/crm?resource=enquiry-activity&id=${encodeURIComponent(activityId)}`, { cache: "no-store" }).then(async (response) => {
      if (!response.ok) throw new Error(response.status === 404 ? "This enquiry is missing or you no longer have access." : "Could not load enquiry details.");
      const result = await response.json();
      if (!active) return;
      if (detailId && result.enquiry) {
        start(result.enquiry, revision !== 0);
        setPickedCustomer(result.customer || null);
      }
      setActivity(result);
      setActivityError("");
    }).catch((error) => { if (active) setActivityError(error.message || "Could not load enquiry details."); });
    return () => { active = false; window.clearInterval(timer); };
  }, [activityId, detailId, revision]);
  const defaultData = () => ({
    customerId: "",
    collaboratorIds: [] as string[],
    destination: "",
    source: "WhatsApp",
    assigneeId:
      s.actor.role === "owner"
        ? s.staff.find((x) => x.role === "sales" && x.status === "active")
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
  function start(r?: Row, keepSection = false) {
    setEdit(r || null);
    setCheckedAt(Date.now());
    if (!keepSection) setSection("start");
    setActivity(null);
    setActivityError("");
    setTeamChoice("");
    setPickedCustomer(null);
    setQuickCustomer(false);
    setCustomerDraft({ name: "", phone: "", email: "" });
    setCustomerError("");
    const draft = r
        ? {
            ...defaultData(),
            ...r,
            firstContactAt: local(r.firstContactAt || new Date().toISOString()),
            nextFollowUp: local(r.nextFollowUp),
          }
        : defaultData();
    setBaseline(JSON.stringify(draft));
    setData(draft);
    setOpen(true);
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (quickCustomer || customerWrite.current || busy || quoteBusy) return;
    if (!data.customerId) {
      setSection("start");
      fail("Search for a customer and choose an exact result.");
      return;
    }
    if (data.nextFollowUp && !String(data.nextAction || "").trim()) {
      setSection("activity");
      fail("Enter the next action before scheduling a follow-up.");
      return;
    }
    if (data.dateMode === "Exact" && (!data.departure || !data.returnDate || data.returnDate < data.departure)) {
      setSection("trip");
      fail("Choose valid start and end dates in order, or change Travel dates if they aren't confirmed.");
      return;
    }
    if (data.stage === "On hold" && !data.nextFollowUp) {
      setSection("activity"); fail("Choose when to follow up on this enquiry."); return;
    }
    if (!data.firstContactAt) { setSection("activity"); fail("Enter when the contact clock starts."); return; }
    if (["Lost", "On hold"].includes(data.stage) && !String(data.reason || "").trim()) {
      setSection("activity"); fail("Enter a reason for this status."); return;
    }
    setBusy(true);
    try {
      const payload = {
        customerId: data.customerId,
        destination: data.destination || "",
        source: data.source,
        assigneeId: data.assigneeId,
        collaboratorIds: (data.collaboratorIds || []).filter((person: string) => person !== data.assigneeId),
        stage: data.stage,
        firstContactAt: iso(data.firstContactAt, edit?.firstContactAt),
        dateMode: data.dateMode,
        departure: data.departure || "",
        returnDate: data.returnDate || "",
        travelPreference: data.travelPreference || "",
        nextFollowUp: iso(data.nextFollowUp, edit?.nextFollowUp),
        nextAction: data.nextAction || "",
        adults: data.adults === "" ? null : Number(data.adults),
        childrenAges: data.childrenAges || "",
        infants: Number(data.infants || 0),
        budget: data.budget || "",
        budgetBasis: data.budgetBasis,
        services: data.services || "",
        serviceResponsibility: data.serviceResponsibility || "",
        hotelPreference: data.hotelPreference || "",
        rooms: data.rooms || "",
        pickup: data.pickup || "",
        dropoff: data.dropoff || "",
        specialRequirements: data.specialRequirements || "",
        notes: data.notes || "",
        reason: data.reason || "",
        contactOutcome: data.contactOutcome,
        reviewNeeded: Boolean(data.reviewNeeded),
      };
      await api("enquiry", payload, { id: edit?._id, version: edit?.version, logContact: data.logContact === true });
      if (detailId) { setFeedback("Enquiry saved."); setRevision((value) => value + 1); }
      else setOpen(false);
      await reload();
    } catch (e) {
      fail((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function addCustomer() {
    if (customerWrite.current || busy) return;
    const name = customerDraft.name.trim();
    const phone = customerDraft.phone.trim();
    const email = customerDraft.email.trim();
    if (name.length < 2) { setCustomerError("Enter the customer's name."); return; }
    if (!phone && !email) { setCustomerError("Enter a phone number or email."); return; }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setCustomerError("Enter a valid email address."); return; }
    customerWrite.current = true;
    setSavingCustomer(true);
    setCustomerError("");
    try {
      const id = await api("customer", { ...emptyCustomer, name, phone, email });
      if (typeof id !== "string" || !id) throw new Error("Could not select the saved customer. Search for their name before trying again.");
      setPickedCustomer({ _id: id, version: 1, name, phone, email });
      setData((draft: any) => ({ ...draft, customerId: id }));
      setQuickCustomer(false);
      setCustomerDraft({ name: "", phone: "", email: "" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not add the customer. Try again.";
      setCustomerError(message.startsWith("A possible duplicate")
        ? "That phone or email may already belong to a customer. Cancel and search for the existing record. If you can't see it, ask the Owner to check."
        : message);
    } finally {
      customerWrite.current = false;
      setSavingCustomer(false);
    }
  }
  const canChangeLead = !edit || s.actor.role === "owner" || edit.createdById === s.actor.id;
  const team: string[] = data.collaboratorIds || [];
  const staffOptions = s.staff.filter((person) => person.status === "active" && person.role !== "operations");
  const leadOptions = staffOptions.map((person) => [person._id, person._id === s.actor.id ? `${person.name} (you)` : person.name]);
  if (data.assigneeId && !staffOptions.some((person) => person._id === data.assigneeId))
    leadOptions.unshift([data.assigneeId, "Current lead (unavailable)"]);
  const eligibleTeammates = staffOptions.filter((person) => person._id !== s.actor.id && person._id !== data.assigneeId && !team.includes(person._id));
  const enquiryStage = (value: string) => value === "Won" ? "Accepted" : value;
  const trackStatus = activity?.booking?.status === "Trip completed" ? "Trip completed" : enquiryStage(edit?.stage);
  const openQuote = (id: string) => {
    window.history.pushState(null, "", `/quotations/${encodeURIComponent(id)}`);
    window.scrollTo(0, 0);
  };
  const followUp = activity?.followUp;
  const followUpOpen = followUp && ["To do", "In progress", "Waiting"].includes(followUp.status);
  const dirty = Boolean(detailId && edit && baseline !== JSON.stringify(data));
  const linked = activity?.quotes || [];
  const activeQuote = linked.find((quote) => activeQuoteStatuses.includes(quote.status));
  const requestBlocked = quoteRequestBlock({ stage: edit?.stage, reviewNeeded: edit?.reviewNeeded });
  const quoteGaps = activity?.quoteGaps || [];
  async function makeQuote() {
    if (!detailId || !activity || dirty || activeQuote || requestBlocked || !quoteDue || quoteGaps.length || quoteBusy) return;
    setQuoteBusy(true);
    setQuoteError("");
    try {
      const id = await api("quote-request", { enquiryId: detailId, requestedDueAt: indiaIso(quoteDue), requestNote: quoteNote.trim() });
      setRevision((value) => value + 1);
      setQuoteNote("");
      setFeedback("Quote requested.");
      if (typeof id === "string") openQuote(id);
    } catch (error) {
      setQuoteError(error instanceof Error ? error.message : "Could not request the quote.");
      if (error instanceof Error && error.message.includes("active quotation")) setRevision((value) => value + 1);
    } finally { setQuoteBusy(false); }
  }
  const back = () => { if (!customerWrite.current) window.history.pushState(null, "", "/enquiries"); };
  const Frame = detailId ? EnquiryPageFrame : Drawer;
  return (
    <>
      {!detailId && <>
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
              {enquiryStage(x)}
            </span>
          ))}
        </div>
        <button
          className="button primary"
          onClick={() => start()}
        >
          <Plus /> New enquiry
        </button>
      </div>
      <section className="panel table-panel">
        <div className="data-table">
          <div className="table-row table-head">
            <span>Customer</span>
            <span>Destination</span>
            <span>Stage</span>
            <span>Next action</span>
            <span>Assigned to</span>
            <span />
          </div>
          {rows.map((r) => (
            <button className="table-row" key={r._id} onClick={() => { window.history.pushState(null, "", `/enquiries/${encodeURIComponent(r._id)}`); window.scrollTo(0, 0); }}>
              <span>
                <b>{customers[r.customerId]?.name || "Unknown"}</b>
                <small>{r.source}</small>
              </span>
              <span>
                {r.destination || r.travelPreference || "Not decided"}
              </span>
              <span>
                <Badge value={r.reviewNeeded ? "Needs review" : enquiryStage(r.stage)} />
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
      </>}
      {detailId && !open && <section className="panel">
        <button type="button" className="button secondary" onClick={back}><ChevronLeft /> Back to enquiries</button>
        <p role={activityError ? "alert" : "status"}>{activityError || "Loading enquiry…"}</p>
      </section>}
      {open && (
        <Frame
          title={edit ? "Edit enquiry" : "Capture enquiry"}
          close={detailId ? back : () => { if (!customerWrite.current) setOpen(false); }}
          wide
        >
          <form className="form-grid" onSubmit={save}>
            <p className="form-guidance span">
              Save the basics now or switch sections to add details during the call.
            </p>
            {feedback && <p className="enquiry-feedback span" role="status">{feedback}</p>}
            {edit && <div className="enquiry-summary span">
              <h3>{pickedCustomer?.name || customers[edit.customerId]?.name || "Customer"}{edit.destination ? ` · ${edit.destination}` : ""}</h3>
              <b>{trackStatus} · Lead: {s.staff.find((person) => person._id === edit.assigneeId)?.name || "Team member"}</b>
              <p>{followUpOpen ? `${Date.parse(followUp.dueAt) < checkedAt ? "Overdue" : "Due"}: ${followUp.title} · ${moneyDate(followUp.dueAt)} IST` : activity ? "No open follow-up." : ""}</p>
              {followUpOpen && <button type="button" className="button secondary" onClick={() => setSection("activity")}>Update follow-up</button>}
            </div>}
            <div className="enquiry-step-nav span" aria-label="Enquiry sections">
              {(["start", "trip", "activity", ...(detailId ? ["quote"] as const : [])] as const).map((step) => <button key={step} type="button" className={`button ${section === step ? "primary" : "secondary"}`}
                aria-pressed={section === step} disabled={savingCustomer || busy} onClick={() => setSection(step)}>{step === "start" ? "Start" : step === "trip" ? "Trip" : step === "activity" ? "Activity" : "Quote & package"}</button>)}
            </div>
            {section === "quote" && <section className="enquiry-quote-box span">
              <h3>Quote &amp; package</h3>
              <p>Build the quote and itinerary here. Only the Owner can approve it for sharing.</p>
              {dirty && <p className="enquiry-feedback">Save your enquiry changes before working on a quote.</p>}
              {activityError && <p role="alert">{activityError}</p>}
              {activeQuote ? <p>Quotation {activeQuote.quoteNumber} already exists. Open it below to continue.</p> : requestBlocked ? <p>{requestBlocked}</p> : <>
                {!activity && !activityError && <p role="status">Checking the saved enquiry…</p>}
                {quoteGaps.length > 0 ? <>
                  <p>Before requesting a quotation, add {quoteGaps.join(", ")}.</p>
                  <button type="button" className="button secondary" onClick={() => setSection(quoteGaps.includes("destination") ? "start" : "trip")}>Complete enquiry details</button>
                </> : <>
                  <label className="field">Quote due (IST)<input type="datetime-local" value={quoteDue} onChange={(event) => setQuoteDue(event.target.value)} /></label>
                  <label className="field">Note for reviewer (optional)<textarea value={quoteNote} onChange={(event) => setQuoteNote(event.target.value)} maxLength={1000} /></label>
                </>}
                <button type="button" className="button primary" onClick={() => void makeQuote()} disabled={dirty || !activity || quoteBusy || busy || !quoteDue || quoteGaps.length > 0}>{quoteBusy ? "Requesting…" : "Request quotation"}</button>
              </>}
              {quoteError && <p role="alert" className="form-error">{quoteError}</p>}
              {linked.length > 0 && <ul>{linked.map((quote) => <li key={quote._id}>
                <span><b>{quote.quoteNumber} · v{quote.quoteVersion}</b><small>{quote.status} · PDF {quote.pdfStatus || "not started"}</small></span>
                <button type="button" className="button secondary" disabled={dirty || busy || quoteBusy} onClick={() => openQuote(quote._id)}>Open quote</button>
              </li>)}</ul>}
            </section>}
            {section === "start" && <>
            <div className="span enquiry-customer">
              <CustomerSearch value={data.customerId} disabled={savingCustomer}
                set={(value: string) => setData((draft: any) => ({ ...draft, customerId: value }))}
                onChoose={setPickedCustomer}
                selected={pickedCustomer && pickedCustomer._id === data.customerId ? pickedCustomer : customers[data.customerId]} />
              {!quickCustomer && <button type="button" className="button secondary" disabled={busy} onClick={() => {
                setCustomerError(""); setQuickCustomer(true);
              }}><Plus aria-hidden="true" /> Add customer</button>}
            </div>
            {quickCustomer && <fieldset className="span enquiry-quick-customer" disabled={savingCustomer}
              onKeyDown={(event) => {
                if (event.key === "Enter" && event.target instanceof HTMLInputElement) { event.preventDefault(); void addCustomer(); }
              }}>
              <legend>New customer</legend>
              <p>Enter a name and at least one contact detail. Saving creates the customer and selects them here.</p>
              <div className="enquiry-customer-fields">
                <label className="field">Customer name <input autoFocus autoComplete="off" maxLength={160} value={customerDraft.name} onChange={(event) => setCustomerDraft({ ...customerDraft, name: event.target.value })} /></label>
                <label className="field">Phone number <input type="tel" maxLength={40} value={customerDraft.phone} onChange={(event) => setCustomerDraft({ ...customerDraft, phone: event.target.value })} /></label>
                <label className="field">Email <input type="email" maxLength={254} value={customerDraft.email} onChange={(event) => setCustomerDraft({ ...customerDraft, email: event.target.value })} /></label>
              </div>
              {customerError && <p role="alert" className="form-error">{customerError}</p>}
              <div className="enquiry-customer-buttons">
                <button type="button" className="button secondary" onClick={() => { setQuickCustomer(false); setCustomerDraft({ name: "", phone: "", email: "" }); setCustomerError(""); }}>Cancel</button>
                <button type="button" className="button primary" onClick={() => void addCustomer()}>{savingCustomer ? "Adding customer…" : "Save and select customer"}</button>
              </div>
            </fieldset>}
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
              required
            />
            <Field
              label="Destination or place"
              value={data.destination}
              set={(v: any) => setData({ ...data, destination: v })}
            />
            <Select
              label="Lead"
              value={data.assigneeId}
              set={(v: any) => setData({ ...data, assigneeId: v })}
              options={leadOptions}
              disabled={!canChangeLead}
              required
              hint="This person is responsible for the next follow-up. The Owner can always see this enquiry."
            />
            <div className="span enquiry-team">
              <span>Team members (optional)</span>
              <div className="enquiry-team-members">{team.filter((person) => person !== data.assigneeId).map((person) => {
                const name = s.staff.find((item) => item._id === person)?.name || "Inactive team member";
                return <span className="badge" key={person}>{name}{canChangeLead && <button type="button" aria-label={`Remove ${name}`} onClick={() => setData({ ...data, collaboratorIds: team.filter((id) => id !== person) })}><X aria-hidden="true" /></button>}</span>;
              })}</div>
              {eligibleTeammates.length > 0 ? <div className="enquiry-team-picker"><select aria-label="Choose team member" value={eligibleTeammates.some((person) => person._id === teamChoice) ? teamChoice : ""} onChange={(event) => setTeamChoice(event.target.value)}>
                <option value="">Choose a team member</option>
                {eligibleTeammates.map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}
              </select><button type="button" className="button secondary" disabled={team.length >= 20 || !eligibleTeammates.some((person) => person._id === teamChoice)} onClick={() => { setData({ ...data, collaboratorIds: [...team, teamChoice] }); setTeamChoice(""); }}>Add team member</button></div> : <small>No other active team members to add.</small>}
            </div>
            </>}
            {section === "activity" && <>
            <Select
              label="Status"
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
              ].filter((stage) => !["Quote requested", "Quote sent", "Won"].includes(stage) || stage === edit?.stage).map((stage) => [stage, enquiryStage(stage)])}
              required
            />
            {detailId && <div className="enquiry-status-action">
              {activeQuote || !requestBlocked ? <>
                <button type="button" className="button secondary" onClick={() => setSection("quote")}>
                  <FileSpreadsheet /> {activeQuote ? "View quotation" : "Request quotation"}
                </button>
                {!activeQuote && <small className="field-hint">The status changes to Quote requested when the request is saved.</small>}
              </> : <small className="field-hint">{requestBlocked}</small>}
            </div>}
            <Select
              label="Call outcome"
              value={data.contactOutcome}
              set={(v: any) => setData({ ...data, contactOutcome: v, logContact: v === "Not contacted" ? false : data.logContact })}
              options={["Not contacted", "Connected", "No answer", "Call back"]}
            />
            {data.contactOutcome !== "Not contacted" && !data.reviewNeeded && <label className="check-row span">
              <input type="checkbox" checked={data.logContact === true} onChange={(event) => setData({ ...data, logContact: event.target.checked })} /> Log this contact attempt and complete the current follow-up
            </label>}
            <Field
              label="Contact clock starts (IST)"
              type="datetime-local"
              value={data.firstContactAt}
              set={(v: any) => setData({ ...data, firstContactAt: v })}
              required
            />
            </>}
            {section === "trip" && <>
            <Select
              label="Travel dates"
              value={data.dateMode}
              set={(v: any) => setData({ ...data, dateMode: v })}
              options={["Unknown", "Exact", "Flexible", ["Month", "Month only"]]}
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
            ) : data.dateMode === "Month" ? (
              <>
                <Field label="Travel month" type="month" value={/^\d{4}-\d{2}$/.test(data.travelPreference) ? data.travelPreference : ""}
                  set={(v: string) => setData({ ...data, travelPreference: v })} />
                {data.travelPreference && !/^\d{4}-\d{2}$/.test(data.travelPreference) && <p className="form-guidance span">Previous preference: {data.travelPreference}</p>}
              </>
            ) : data.dateMode === "Flexible" ? (
              <Field
                label="Travel preference"
                value={data.travelPreference}
                set={(v: any) => setData({ ...data, travelPreference: v })}
                placeholder="December, flexible by 2 days…"
                span
              />
            ) : null}
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
            <Field label="Drop-off / departure" value={data.dropoff} set={(v: string) => setData({ ...data, dropoff: v })} />
            <Field label="Rooms needed" value={data.rooms} set={(v: string) => setData({ ...data, rooms: v })} />
            <Field label="Special requirements" value={data.specialRequirements} set={(v: string) => setData({ ...data, specialRequirements: v })} area span />
            </>}
            {section === "activity" && <>
            <Field
              label="Next action"
              value={data.nextAction}
              set={(v: any) => setData({ ...data, nextAction: v })}
              placeholder="Call to confirm hotel category"
              required={Boolean(data.nextFollowUp)}
            />
            <Field
              label="Next follow-up (IST, optional)"
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
              label="Internal notes"
              value={data.notes}
              set={(v: any) => setData({ ...data, notes: v })}
              area
              span
            />
            {edit && <section className="enquiry-timeline span" aria-label="Recent changes">
              <h3>Recent changes</h3>
              {activityError ? <p role="alert">{activityError}</p> : !activity ? <p role="status">Loading activity…</p> : activity.events.length ? <ul>
                {activity.events.map((event) => <li key={event._id}><b>{formatFollowUpEvent(event.event)}</b><small>{event.actor} · {moneyDate(event.createdAt)} IST</small></li>)}
              </ul> : <p>No changes recorded yet.</p>}
            </section>}
            </>}
            <FormFoot busy={busy} disabled={quickCustomer} />
          </form>
        </Frame>
      )}
    </>
  );
}

function EnquiryPageFrame({ children, title, close }: { children: React.ReactNode; title: string; close: () => void; wide?: boolean }) {
  return <section className="panel enquiry-page-frame">
    <header className="panel-head">
      <div><p>Enquiries</p><h2>{title}</h2></div>
      <button className="button secondary" type="button" onClick={close}><ChevronLeft /> Back to enquiries</button>
    </header>
    {children}
  </section>;
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
  const noteRequired = Boolean(
    edit &&
      (local(edit.dueAt) !== data.dueAt ||
        ["Waiting", "Done", "Cancelled"].includes(data.status)),
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
        {
          title: data.title,
          assigneeId: data.assigneeId,
          dueAt: iso(data.dueAt, edit?.dueAt),
          status: data.status,
          note: data.note || "",
          enquiryId: data.enquiryId || "",
          customerId: data.customerId || "",
        },
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
              placeholder="Required when completing, cancelling, waiting or rescheduling"
              required={noteRequired}
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
  go: (v: View, recordId?: string) => void;
  fail: (x: string) => void;
}) {
  const [opening, setOpening] = useState("");
  async function read(n: Row) {
    if (opening) return;
    setOpening(n._id);
    try {
      if (!n.read) await api("read", {}, { id: n._id });
      const key = String(n._id || "");
      if (key.startsWith("attendance-")) go("attendance");
      else if (/^(trip:|operations-|incident:|collection:|handover:|readiness:)/.test(key)) go("operations");
      else if (s.actor.role !== "operations" && /^(settlement-|change-|customer-change:)/.test(key)) go("settlements");
      else if (s.actor.role !== "operations" && /^(booking:|invoice:|payment:|finance-|feedback:)/.test(key)) go("bookings");
      else if (s.actor.role !== "operations" && /^quote/.test(key)) go("quotations", n.recordId);
      else if (s.actor.role !== "operations" && /^enquiry-team:/.test(key)) go("enquiries", n.recordId);
      else if (/^(task:|due:|overdue:|follow:|reassign:)/.test(key)) go("tasks");
      else go(s.actor.role === "operations" ? "tasks" : "enquiries");
    } catch (e) {
      fail((e as Error).message);
      await reload();
    } finally {
      setOpening("");
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
          disabled={Boolean(opening)}
          onClick={() => read(n)}
        >
          <span>
            <Bell />
          </span>
          <div>
            <b>{n.title}</b>
            <small>{!n.read && "Unread · "}{moneyDate(n.createdAt)}</small>
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

function StaffActivityDetail({ s, memberId, back }: { s: Snap; memberId: string; back: () => void }) {
  const member = s.staff.find((person) => person._id === memberId);
  return <div className="staff-activity-detail">
    <button type="button" className="button secondary" onClick={back}><ChevronLeft /> Back to team</button>
    <section className="panel">
      {member ? <TeamActivity memberId={memberId} memberName={String(member.name)} /> : <p>Team member not found.</p>}
    </section>
  </div>;
}

function Staff({
  s,
  reload,
  fail,
  viewActivity,
}: {
  s: Snap;
  reload: () => Promise<void>;
  fail: (x: string) => void;
  viewActivity: (id: string) => void;
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
        ? { ...r, capabilities: Array.isArray(r.capabilities) ? r.capabilities : [], replacementId: "", reset: false }
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
            <div className="staff-account-row" key={r._id}>
            <button className="record-card" onClick={() => start(r)} aria-label={`Manage account for ${r.name}`}>
              <span className="avatar">{r.name.slice(0, 2).toUpperCase()}</span>
              <div className="record-main">
                <b>{r.name}</b>
                <small>{r.email}</small>
              </div>
              <Badge value={r.status} />
              <span className="role-label">{r.role}</span>
              <ArrowRight />
            </button>
            {!["pending", "invited"].includes(r.status) && <button type="button" className="button secondary staff-activity-button" onClick={() => viewActivity(r._id)} aria-label={`View activity for ${r.name}`}><BarChart3 /> View activity</button>}
            </div>
          ))}
        </div>
      </section>
      <section className="panel settings-panel">
        <PanelHead
          title="Follow-up rules"
          sub="Set the default contact deadline for new enquiries and when the Owner is alerted about overdue tasks."
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
      <span>{label}{props.required ? " *" : ""}</span>
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
function CustomerSearch({ value, set, selected, onChoose, disabled }: {
  value: string; set: (value: string) => void; selected?: Row; onChoose: (customer: Row) => void; disabled: boolean;
}) {
  const listId = useId();
  const [text, setText] = useState(selected?.name || "");
  const [results, setResults] = useState<Row[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (selected?.name) setText(selected.name);
  }, [value, selected?.name]);

  useEffect(() => {
    const query = text.trim();
    if (!open || query.length < 2 || (value && query === selected?.name)) {
      setResults([]);
      setLoading(false);
      return;
    }
    let active = true;
    setResults([]);
    setLoading(true);
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const response = await fetch(
          `/api/crm?resource=customer-search&q=${encodeURIComponent(query)}&limit=20`,
          { cache: "no-store" },
        );
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "Customer search failed");
        if (active) setResults(body.results || []);
      } catch {
        if (active) setResults([]);
      } finally {
        if (active) setLoading(false);
      }
    }, 300);
    return () => {
      window.clearTimeout(timer);
      active = false;
    };
  }, [open, selected?.name, text, value]);

  const choose = (customer: Row) => {
    if (disabled) return;
    onChoose(customer);
    set(customer._id);
    setText(customer.name);
    setResults([]);
    setOpen(false);
  };

  return (
    <label className="field customer-search">
      <span>Customer *</span>
      <div className="customer-search-control">
        <Search aria-hidden="true" />
        <input
          role="combobox"
          aria-label="Customer"
          aria-required="true"
          aria-expanded={open && text.trim().length >= 2}
          aria-controls={listId}
          aria-autocomplete="list"
          autoComplete="off"
          disabled={disabled}
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
        {value
          ? `Selected: ${selected?.name || text || "customer"}`
          : "Type at least 2 characters, then choose a result."}
      </small>
    </label>
  );
}
function Select({ label, value, set, options, disabled = false, required = false, hint = "" }: any) {
  return (
    <label className="field">
      <span>{label}{required ? " *" : ""}</span>
      <select
        value={value}
        onChange={(e) => set(e.target.value)}
        disabled={disabled}
        required={required}
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
      {hint && <small className="field-hint">{hint}</small>}
    </label>
  );
}
function FormFoot({ busy, disabled = false }: { busy: boolean; disabled?: boolean }) {
  return (
    <div className="form-foot span">
      <span>Changes are saved to the activity history.</span>
      <button className="button primary" disabled={busy || disabled}>
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
