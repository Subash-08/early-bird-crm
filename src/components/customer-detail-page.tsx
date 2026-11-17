"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { shortIndiaTime } from "@/lib/workspace-time";
import { CustomerDocumentNumbers } from "./customer-document-numbers";
import { ArrowLeft, CalendarDays, CheckSquare, ClipboardCheck, FileSpreadsheet, Mail, MapPin, Phone, ReceiptText, RefreshCw, UserRound } from "lucide-react";

type Row = Record<string, any> & { _id: string };
type Detail = {
  actor: { role: "owner" | "sales"; name: string };
  customer: Row;
  canEditNumbers: boolean;
  enquiries: Row[];
  quotes: Row[];
  bookings: Row[];
  tasks: Row[];
  invoices: Row[];
};
const indiaDate = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium" });
const when = (value?: string) => value && Number.isFinite(Date.parse(value)) ? indiaDate.format(new Date(value)) : "Not recorded";
const period = (start?: string, end?: string) => start ? (end && end !== start ? `${when(start)} to ${when(end)}` : when(start)) : "Dates pending";
const status = (stage: string) => stage === "Won" ? "Accepted" : stage;

export function CustomerDetailPage({ id, embedded = false, back, openBooking }: {
  id: string;
  embedded?: boolean;
  back?: () => void;
  openBooking?: (id: string) => void;
}) {
  const [data, setData] = useState<Detail | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    fetch(`/api/crm?resource=customer-detail&id=${encodeURIComponent(id)}`, { cache: "no-store" })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Could not load customer.");
        if (active) setData(result);
      })
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : "Could not load customer."); });
    return () => { active = false; };
  }, [id]);
  const backControl = back ? <button className="button secondary" onClick={back}><ArrowLeft /> Customers</button> : <Link className="button secondary" href="/customers"><ArrowLeft /> Customers</Link>;
  if (error) return <div className={embedded ? "customer-detail-embedded" : "detail-page"}>{backControl}<section className="panel detail-error"><h1>Customer unavailable</h1><p>{error}</p></section></div>;
  if (!data) return <div className={embedded ? "detail-loading embedded" : "detail-loading"}><RefreshCw className="spin" /> Loading customer…</div>;
  const { customer } = data;
  const content = <>
      <header className="detail-topbar">{backControl}{!embedded && <span>EarlyBird CRM · Customer details</span>}</header>
      <section className="detail-hero panel"><span className="detail-avatar">{String(customer.name).slice(0, 2).toUpperCase()}</span><div><p className="eyebrow">Customer</p><h1>{customer.name}</h1><p>{customer.reviewNeeded ? "Needs owner review" : "Active customer record"}</p></div></section>
      <div className="detail-grid">
        <section className="panel detail-section">
          <h2><UserRound /> Contact</h2>
          <p><Phone /> {customer.phone || "No phone"}</p>
          <p><Mail /> {customer.email || "No email"}</p>
          <p><MapPin /> {customer.address || "No address"}</p>
          <p>Language: {customer.language || "Not recorded"}</p>
          {customer.notes && <p className="detail-note">{customer.notes}</p>}
          <CustomerDocumentNumbers key={customer._id} customerId={customer._id} readOnly={!data.canEditNumbers}
            saved={{ panOnFile: Boolean(customer.panOnFile), passportOnFile: Boolean(customer.passportOnFile) }} />
        </section>
        <DetailList title="Enquiries" icon={<CalendarDays />} rows={data.enquiries} empty="No enquiries yet." render={(row) => <EnquirySummary row={row} />} />
        <DetailList title="Quotations" icon={<FileSpreadsheet />} rows={data.quotes} empty="No quotations yet." render={(row) => <>
          <Link href={`/quotations/${encodeURIComponent(row._id)}`} prefetch={false}>{row.quoteNumber || "Open quotation"}</Link>
          <span>{row.status}</span>
          <small>{row.content?.title || "Quotation"}{row.quoteVersion ? ` · Version ${row.quoteVersion}` : ""}</small>
        </>} />
        <DetailList title="Bookings" icon={<ClipboardCheck />} rows={data.bookings} empty="No bookings yet." render={(row) => <>
          <Link href={`/bookings/${encodeURIComponent(row._id)}`} prefetch={false} onNavigate={openBooking ? event => {
            event.preventDefault();
            openBooking(row._id);
          } : undefined}>{row.bookingNumber || "Open booking"}</Link><span>{row.status}</span>
          <small>{row.destination || "Destination pending"} · {period(row.serviceStart, row.serviceEnd)}</small>
        </>} />
        <DetailList title="Tasks" icon={<CheckSquare />} rows={data.tasks} empty="No linked tasks." render={(row) => <>
          <b>{row.title}</b><span>{row.status}</span><small>{row.dueAt ? `Due ${shortIndiaTime(row.dueAt)} IST` : "No due date"}</small>
        </>} />
        <section className="panel detail-section"><h2><ReceiptText /> Invoices</h2>{data.invoices.map((row) => row.documentId
          ? <a key={row._id} href={`/api/documents/finance/${row.documentId}`} download><b>{row.invoiceNumber || "Invoice"}</b><span>{row.status}</span><small>Download invoice</small></a>
          : <article key={row._id}><b>Invoice draft</b><span>{row.status}</span><small>The Owner can issue it from Bookings.</small></article>
        )}{!data.invoices.length && <p>No invoices yet.</p>}</section>
      </div>
    </>;
  return embedded ? <div className="customer-detail-embedded">{content}</div> : <main className="detail-page">{content}</main>;
}

function EnquirySummary({ row }: { row: Row }) {
  const dates = row.dateMode === "Exact" ? period(row.departure, row.returnDate) : row.travelPreference || "Dates pending";
  const travellers = [
    row.adults != null ? `Adults: ${row.adults}` : "",
    row.childrenAges ? `Children: ${row.childrenAges}` : "",
    row.infants ? `Infants: ${row.infants}` : "",
  ].filter(Boolean).join(" · ");
  const fields: [string, string][] = [
    ["Travel dates", dates],
    ["Travellers", travellers],
    ["Budget", row.budget ? [row.budget, row.budgetBasis === "Unknown" ? "" : row.budgetBasis].filter(Boolean).join(" · ") : ""],
    ["Source", row.source],
    ["Services", row.services],
    ["Who arranges services", row.serviceResponsibility],
    ["Stay", [row.hotelPreference, row.rooms].filter(Boolean).join(" · ")],
    ["Pickup / arrival", row.pickup],
    ["Drop-off / departure", row.dropoff],
    ["Special requirements", row.specialRequirements],
    ["Last call", row.contactOutcome],
    ["Next follow-up", row.nextFollowUp ? `${shortIndiaTime(row.nextFollowUp)} IST` : ""],
    ["Next action", row.nextAction],
  ];
  return <>
    <Link href={`/enquiries/${encodeURIComponent(row._id)}`} prefetch={false}>{row.destination || "Open enquiry"}</Link>
    <span>{row.reviewNeeded ? "Needs review" : status(row.stage)}</span>
    <small>Updated {when(row.updatedAt)}</small>
    <dl className="detail-trip-fields">{fields.filter(([, value]) => Boolean(value)).map(([label, value]) =>
      <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
  </>;
}

function DetailList({ title, icon, rows, empty, render }: { title: string; icon: React.ReactNode; rows: Row[]; empty: string; render: (row: Row) => React.ReactNode }) {
  return <section className="panel detail-section"><h2>{icon}{title}</h2>{rows.map((row) => <article key={row._id}>{render(row)}</article>)}{!rows.length && <p>{empty}</p>}</section>;
}
