"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, CalendarDays, CheckSquare, ClipboardCheck, FileSpreadsheet, Mail, MapPin, Phone, ReceiptText, RefreshCw, UserRound } from "lucide-react";

type Row = Record<string, any> & { _id: string };
type Detail = {
  actor: { role: "owner" | "sales"; name: string };
  customer: Row;
  enquiries: Row[];
  quotes: Row[];
  bookings: Row[];
  tasks: Row[];
  invoices: Row[];
};
const when = (value?: string) => value ? new Date(value).toLocaleDateString("en-IN", { dateStyle: "medium" }) : "Not available";

export function CustomerDetailPage({ id, embedded = false, back }: { id: string; embedded?: boolean; back?: () => void }) {
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
        <section className="panel detail-section"><h2><UserRound /> Contact</h2><p><Phone /> {customer.phone || "No phone"}</p><p><Mail /> {customer.email || "No email"}</p><p><MapPin /> {customer.address || "No address"}</p><small>Language: {customer.language || "Not recorded"}</small>{customer.notes && <p className="detail-note">{customer.notes}</p>}</section>
        <DetailList title="Enquiries" icon={<CalendarDays />} rows={data.enquiries} empty="No enquiries yet." render={(row) => <><b>{row.destination || "Destination pending"}</b><span>{row.stage}</span><small>Updated {when(row.updatedAt)}</small></>} />
        <DetailList title="Quotations" icon={<FileSpreadsheet />} rows={data.quotes} empty="No quotations yet." render={(row) => <><b>{row.quoteNumber}</b><span>{row.status}</span><small>{row.content?.title || "Quotation"}</small></>} />
        <DetailList title="Bookings" icon={<ClipboardCheck />} rows={data.bookings} empty="No bookings yet." render={(row) => <><b>{row.bookingNumber}</b><span>{row.status}</span><small>{row.destination || "Destination pending"} · {when(row.serviceStart)}</small></>} />
        <DetailList title="Tasks" icon={<CheckSquare />} rows={data.tasks} empty="No linked tasks." render={(row) => <><b>{row.title}</b><span>{row.status}</span><small>Due {when(row.dueAt)}</small></>} />
        <section className="panel detail-section"><h2><ReceiptText /> Invoices</h2>{data.invoices.map((row) => row.documentId
          ? <a key={row._id} href={`/api/documents/finance/${row.documentId}`} download><b>{row.invoiceNumber || "Invoice"}</b><span>{row.status}</span><small>Download invoice</small></a>
          : <article key={row._id}><b>Invoice draft</b><span>{row.status}</span><small>The Owner can issue it from Bookings.</small></article>
        )}{!data.invoices.length && <p>No invoices yet.</p>}</section>
      </div>
    </>;
  return embedded ? <div className="customer-detail-embedded">{content}</div> : <main className="detail-page">{content}</main>;
}

function DetailList({ title, icon, rows, empty, render }: { title: string; icon: React.ReactNode; rows: Row[]; empty: string; render: (row: Row) => React.ReactNode }) {
  return <section className="panel detail-section"><h2>{icon}{title}</h2>{rows.map((row) => <article key={row._id}>{render(row)}</article>)}{!rows.length && <p>{empty}</p>}</section>;
}
