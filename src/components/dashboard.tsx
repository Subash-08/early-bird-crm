"use client";

import { ArrowRight, Bell, CalendarDays, CheckSquare, ClipboardCheck, Clock3, FileSpreadsheet, Inbox, Route, type LucideIcon } from "lucide-react";
import type { Actor } from "@/lib/domain";
import type { View } from "@/lib/workspace-access";
import { shortIndiaTime } from "@/lib/workspace-time";
import type { workspaceOverview } from "@/server/overview";

type OverviewData = Awaited<ReturnType<typeof workspaceOverview>>;
type QueueItem = { id: string; title: string; detail: string; action: () => void };

export function Dashboard({ overview, actor, staff, go, openAlert }: {
  overview: OverviewData;
  actor: Pick<Actor, "name" | "role">;
  staff: { _id: string; name?: string }[];
  go: (view: View, recordId?: string) => void;
  openAlert: (id: string, recordId: string) => Promise<void>;
}) {
  const isOwner = actor.role === "owner";
  const operations = actor.role === "operations";
  const bookingView = operations ? "operations" : "bookings";
  const bookingTitle = operations ? "My trips" : "Active bookings";
  const names = new Map(staff.map(person => [person._id, person.name]));
  const taskItems = (tasks: OverviewData["dueTasks"]): QueueItem[] => tasks.map(task => ({
    id: task.id, title: task.title,
    detail: [task.overdue ? "Overdue" : "", shortIndiaTime(task.dueAt) + " IST", task.status, isOwner ? names.get(task.assigneeId) : ""].filter(Boolean).join(" · "),
    action: () => go("tasks", task.id),
  }));
  return <>
    <div className="welcome">
      <div>
        <p className="eyebrow">Good to see you, {actor.name.split(" ")[0]}</p>
        <h2>{overview.dueCount ? `${overview.dueCount} task${overview.dueCount === 1 ? "" : "s"} due today or overdue.` : "No tasks due today."}</h2>
        <p>{isOwner ? "Review your team’s follow-ups, quotations and bookings." : operations ? "Check your tasks and assigned trips." : "Review your enquiries, follow-ups and bookings."}</p>
      </div>
      <button type="button" className="button light" onClick={() => go("tasks")}>Open tasks <ArrowRight /></button>
    </div>
    <div className="metrics overview-metrics">
      <OverviewMetric icon={Clock3} label="Due today or overdue" value={overview.dueCount} note={`${overview.overdueCount} overdue`}
        action={() => document.getElementById("overview-due")?.focus()} />
      <OverviewMetric icon={CheckSquare} label="Open tasks" value={overview.openTaskCount} action={() => go("tasks")} />
      {overview.crm && <OverviewMetric icon={Inbox} label="Open enquiries" value={overview.crm.enquiryCount} action={() => go("enquiries")} />}
      {overview.crm && <OverviewMetric icon={FileSpreadsheet} label="Open quotations" value={overview.crm.quoteCount} action={() => go("quotations")} />}
      <OverviewMetric icon={operations ? Route : ClipboardCheck} label={bookingTitle} value={overview.bookingCount} action={() => go(bookingView)} />
      <OverviewMetric icon={Bell} label="Unread alerts" value={overview.unreadCount} action={() => go("notifications")} />
    </div>
    <div className="dashboard-grid overview-grid">
      <Queue id="overview-due" title="Due today or overdue" summary="Earliest deadlines first · India time" icon={Clock3}
        items={taskItems(overview.dueTasks)} empty="No open tasks due today." viewAll={() => go("tasks")} />
      <Queue title="Upcoming tasks" summary="Open tasks due after today" icon={CheckSquare}
        items={taskItems(overview.upcomingTasks)} empty="No upcoming tasks." viewAll={() => go("tasks")} />
      {overview.crm && <>
        <Queue title="Open enquiries" summary="Recently updated" icon={Inbox} empty="No open enquiries."
          items={overview.crm.enquiries.map(row => ({
            id: row.id, title: row.customer || row.destination || "Enquiry",
            detail: [row.customer && row.destination, row.stage].filter(Boolean).join(" · "),
            action: () => go("enquiries", row.id),
          }))} viewAll={() => go("enquiries")} />
        <Queue title="Open quotations" summary="Recently updated" icon={FileSpreadsheet} empty="No open quotations."
          items={overview.crm.quotes.map(row => ({
            id: row.id, title: [row.number, row.title].filter(Boolean).join(" · ") || "Quotation",
            detail: row.status === "Accepted" ? "Accepted · Awaiting booking" : row.pdfStatus === "Failed" ? `${row.status} · PDF needs attention` : row.status,
            action: () => go("quotations", row.id),
          }))} viewAll={() => go("quotations")} />
      </>}
      <Queue title={bookingTitle} summary={operations ? "Trips assigned to you" : "Recently updated bookings that are still open"} icon={operations ? Route : ClipboardCheck}
        empty={operations ? "No active trips assigned to you." : "No active bookings."}
        items={overview.bookings.map(row => ({
          id: row.id, title: [row.number, row.destination].filter(Boolean).join(" · ") || bookingTitle,
          detail: [row.status, tripDates(row.startDate, row.endDate)].filter(Boolean).join(" · "),
          action: () => go(bookingView, row.id),
        }))} viewAll={() => go(bookingView)} />
      <Queue title="Unread alerts" summary="Your latest in-app updates" icon={Bell} empty="You’re up to date."
        items={overview.alerts.map(row => ({
          id: row.id, title: row.title, detail: shortIndiaTime(row.createdAt),
          action: () => void openAlert(row.id, row.recordId),
        }))} viewAll={() => go("notifications")} />
      <div className="overview-shortcuts">
        <button type="button" className="button secondary" onClick={() => go("attendance")}><CalendarDays /> {isOwner ? "Team attendance" : "My attendance"}</button>
        <button type="button" className="button secondary" onClick={() => go("reports")}>Reports <ArrowRight /></button>
      </div>
    </div>
  </>;
}

function tripDates(start: string, end: string) {
  const formatter = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short" });
  const format = (value: string) => value && Number.isFinite(Date.parse(value)) ? formatter.format(new Date(value)) : "";
  const from = format(start), to = format(end);
  return from ? (to && start !== end ? `${from} to ${to}` : from) : "Dates pending";
}

function OverviewMetric({ icon: Icon, label, value, note, action }: {
  icon: LucideIcon; label: string; value: number; note?: string; action: () => void;
}) {
  return <button type="button" className="metric" onClick={action}>
    <span className="metric-icon"><Icon aria-hidden="true" /></span>
    <small>{label}</small><strong>{value}</strong>
    {note && <span className="overview-metric-note">{note}</span>}
  </button>;
}

function Queue({ id, title, summary, icon: Icon, items, empty, viewAll }: {
  id?: string; title: string; summary: string; icon: LucideIcon; items: QueueItem[]; empty: string; viewAll: () => void;
}) {
  return <section className="panel overview-panel" id={id} tabIndex={id ? -1 : undefined} aria-label={title}>
    <div className="panel-head">
      <div><h3><Icon aria-hidden="true" />{title}</h3><p>{summary}</p></div>
      <button type="button" className="text-button" aria-label={`View all ${title.toLowerCase()}`} onClick={viewAll}>View all <ArrowRight aria-hidden="true" /></button>
    </div>
    {items.length ? <ul>{items.map(item => <li key={item.id}>
      <button type="button" className="overview-row" onClick={item.action}>
        <span><b>{item.title}</b><small>{item.detail}</small></span><ArrowRight aria-hidden="true" />
      </button>
    </li>)}</ul> : <p className="overview-empty">{empty}</p>}
  </section>;
}
