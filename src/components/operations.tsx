"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  BusFront,
  Check,
  ClipboardCheck,
  Download,
  FileText,
  Flag,
  Hotel,
  MapPin,
  Plus,
  ReceiptText,
  Route,
  ShieldCheck,
  Truck,
  UserRound,
  Users,
  WalletCards,
  X,
} from "lucide-react";

type Row = Record<string, any> & { _id: string; version: number };
const money = (minor = 0, currency = "INR") =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency }).format(
    Number(minor) / 100,
  );
const local = (value = "") =>
  value ? new Date(value).toISOString().slice(0, 16) : "";
const iso = (value = "") => (value ? new Date(value).toISOString() : "");
const displayTime = (value = "") =>
  value
    ? new Intl.DateTimeFormat("en-IN", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(value))
    : "Not scheduled";

async function api(action: string, data: any = {}) {
  const response = await fetch("/api/crm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, data }),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Request failed");
  return result.result;
}
const fileToBase64 = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      resolve(String(reader.result || "").split(",")[1] || "");
    reader.onerror = () =>
      reject(new Error("Could not read the selected file."));
    reader.readAsDataURL(file);
  });

export function Operations({
  s,
  q,
  reload,
  fail,
}: {
  s: any;
  q: string;
  reload: () => Promise<void>;
  fail: (message: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [selectedId, setSelectedId] = useState("");
  const selected = s.bookings.find(
    (booking: Row) => booking._id === selectedId,
  );
  const [tab, setTab] = useState<
    "bookings" | "suppliers" | "vehicles" | "incidents"
  >("bookings");
  async function run(action: string, data: any) {
    setBusy(true);
    try {
      await api(action, data);
      await reload();
      return true;
    } catch (error) {
      fail((error as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  if (s.actor.role === "operations")
    return <MyTrips s={s} q={q} busy={busy} run={run} />;

  const bookings = s.bookings.filter(
    (booking: Row) =>
      booking.operationsReleased &&
      [booking.bookingNumber, booking.destination, booking.status]
        .join(" ")
        .toLowerCase()
        .includes(q.toLowerCase()),
  );
  const openIncidents = s.incidents.filter(
    (incident: Row) => incident.status === "Open",
  );
  return (
    <>
      <div className="operations-hero">
        <div>
          <p className="eyebrow">Trip operations</p>
          <h2>Confirm each service. Assign one clear trip at a time.</h2>
          <p>
            Supplier confirmation, customer payment and trip completion remain
            separate, so the team never promises work that is still pending.
          </p>
        </div>
        <span className="booking-lock">
          <ShieldCheck /> Commercial approval stays with Owner
        </span>
      </div>
      <div className="quote-metrics">
        <Metric label="Released bookings" value={bookings.length} />
        <Metric
          label="Services to confirm"
          value={
            s.arrangements.filter((x: Row) =>
              ["Draft", "On hold"].includes(x.confirmationStatus),
            ).length
          }
        />
        <Metric
          label="Upcoming trips"
          value={
            s.tripSegments.filter((x: Row) => x.status === "Scheduled").length
          }
        />
        <Metric
          label="Open incidents"
          value={openIncidents.length}
          alert={openIncidents.length > 0}
        />
      </div>
      <div className="ops-tabs">
        {[
          ["bookings", "Bookings", ClipboardCheck],
          ["suppliers", "Suppliers", Building2],
          ["vehicles", "Vehicles", BusFront],
          ["incidents", "Incidents", AlertTriangle],
        ].map(([id, label, Icon]: any) => (
          <button
            key={id}
            className={tab === id ? "active" : ""}
            onClick={() => setTab(id)}
          >
            <Icon /> {label}
          </button>
        ))}
      </div>
      {tab === "bookings" && (
        <section className="panel booking-list">
          {bookings.map((booking: Row) => {
            const arrangements = s.arrangements.filter(
              (x: Row) => x.bookingId === booking._id,
            );
            const confirmed = arrangements.filter(
              (x: Row) => x.confirmationStatus === "Confirmed",
            ).length;
            return (
              <button
                className="booking-card"
                key={booking._id}
                onClick={() => setSelectedId(booking._id)}
              >
                <span className="booking-icon">
                  <Route />
                </span>
                <div>
                  <b>{booking.bookingNumber}</b>
                  <small>
                    {booking.destination || "Destination pending"} ·{" "}
                    {booking.serviceStart || "Dates pending"}
                  </small>
                </div>
                <span className="badge">
                  {confirmed}/{arrangements.length} confirmed
                </span>
                <strong>{booking.status}</strong>
                <ArrowRight />
              </button>
            );
          })}
          {!bookings.length && (
            <Empty
              icon={Route}
              title="No released bookings"
              text="Phase 3 releases will appear here."
            />
          )}
        </section>
      )}
      {tab === "suppliers" && <Suppliers s={s} busy={busy} run={run} />}
      {tab === "vehicles" && <Vehicles s={s} busy={busy} run={run} />}
      {tab === "incidents" && <Incidents s={s} busy={busy} run={run} />}
      {selected && (
        <BookingOperations
          key={`${selected._id}:${selected.version}`}
          s={s}
          booking={selected}
          busy={busy}
          run={run}
          close={() => setSelectedId("")}
        />
      )}
    </>
  );
}

function Metric({
  label,
  value,
  alert = false,
}: {
  label: string;
  value: number;
  alert?: boolean;
}) {
  return (
    <article className={alert ? "metric-alert" : ""}>
      <span>{label}</span>
      <b>{value}</b>
    </article>
  );
}

function Empty({ icon: Icon, title, text }: any) {
  return (
    <div className="booking-empty">
      <Icon />
      <b>{title}</b>
      <p>{text}</p>
    </div>
  );
}

function Suppliers({ s, busy, run }: any) {
  const [editing, setEditing] = useState<Row | null>(null);
  const [form, setForm] = useState<any>({
    name: "",
    type: "Hotel",
    contactName: "",
    phone: "",
    email: "",
    location: "",
    notes: "",
    status: "Active",
  });
  const edit = (row?: Row) => {
    setEditing(row || null);
    setForm(
      row
        ? {
            name: row.name,
            type: row.type,
            contactName: row.contactName || "",
            phone: row.phone || "",
            email: row.email || "",
            location: row.location || "",
            notes: row.notes || "",
            status: row.status,
          }
        : {
            name: "",
            type: "Hotel",
            contactName: "",
            phone: "",
            email: "",
            location: "",
            notes: "",
            status: "Active",
          },
    );
  };
  return (
    <div className="ops-grid">
      <section className="panel ops-list-panel">
        <div className="section-title">
          <div>
            <h3>Supplier directory</h3>
            <p>Hotels, transport providers and activity partners.</p>
          </div>
          <button className="button primary" onClick={() => edit()}>
            <Plus /> Add supplier
          </button>
        </div>
        {s.suppliers.map((row: Row) => (
          <button
            className="simple-row"
            key={row._id}
            onClick={() => edit(row)}
          >
            <Building2 />
            <div>
              <b>{row.name}</b>
              <small>
                {row.type} · {row.location || "Location not set"}
              </small>
            </div>
            <span className={`badge ${row.status.toLowerCase()}`}>
              {row.status}
            </span>
            <ArrowRight />
          </button>
        ))}
        {!s.suppliers.length && (
          <Empty
            icon={Building2}
            title="No suppliers yet"
            text="Add only suppliers your agency actually works with."
          />
        )}
      </section>
      <section className="panel compact-form">
        <div className="section-title">
          <div>
            <h3>{editing ? "Edit supplier" : "New supplier"}</h3>
            <p>Phone or email is required.</p>
          </div>
        </div>
        <Field label="Supplier name">
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </Field>
        <div className="form-grid two">
          <Field label="Type">
            <select
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value })}
            >
              {[
                "Hotel",
                "Transport",
                "Activity",
                "Guide",
                "Permit / visa",
                "Other",
              ].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </Field>
          <Field label="Status">
            <select
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value })}
            >
              <option>Active</option>
              <option>Inactive</option>
            </select>
          </Field>
        </div>
        <Field label="Contact person">
          <input
            value={form.contactName}
            onChange={(e) => setForm({ ...form, contactName: e.target.value })}
          />
        </Field>
        <div className="form-grid two">
          <Field label="Phone">
            <input
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
          </Field>
          <Field label="Email">
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </Field>
        </div>
        <Field label="Location">
          <input
            value={form.location}
            onChange={(e) => setForm({ ...form, location: e.target.value })}
          />
        </Field>
        <Field label="Internal notes">
          <textarea
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />
        </Field>
        <button
          className="button primary wide"
          disabled={busy}
          onClick={async () => {
            if (
              await run("supplier-save", {
                id: editing?._id,
                version: editing?.version,
                data: form,
              })
            )
              edit();
          }}
        >
          <Check /> Save supplier
        </button>
      </section>
    </div>
  );
}

function Vehicles({ s, busy, run }: any) {
  const empty = {
    label: "",
    registration: "",
    ownership: "Agency",
    supplierId: "",
    seats: 4,
    luggage: 2,
    vehicleType: "Sedan",
    notes: "",
    status: "Available",
  };
  const [editing, setEditing] = useState<Row | null>(null);
  const [form, setForm] = useState<any>(empty);
  const edit = (row?: Row) => {
    setEditing(row || null);
    setForm(
      row
        ? {
            label: row.label,
            registration: row.registration,
            ownership: row.ownership,
            supplierId: row.supplierId || "",
            seats: row.seats,
            luggage: row.luggage,
            vehicleType: row.vehicleType,
            notes: row.notes || "",
            status: row.status,
          }
        : empty,
    );
  };
  return (
    <div className="ops-grid">
      <section className="panel ops-list-panel">
        <div className="section-title">
          <div>
            <h3>Vehicle directory</h3>
            <p>Agency and supplier vehicles with capacity.</p>
          </div>
          <button className="button primary" onClick={() => edit()}>
            <Plus /> Add vehicle
          </button>
        </div>
        {s.vehicles.map((row: Row) => (
          <button
            className="simple-row"
            key={row._id}
            onClick={() => edit(row)}
          >
            <BusFront />
            <div>
              <b>{row.label}</b>
              <small>
                {row.registration} · {row.seats} seats · {row.luggage} bags
              </small>
            </div>
            <span className={`badge ${row.status.toLowerCase()}`}>
              {row.status}
            </span>
            <ArrowRight />
          </button>
        ))}
        {!s.vehicles.length && (
          <Empty
            icon={BusFront}
            title="No vehicles yet"
            text="Add a vehicle before assigning a car trip."
          />
        )}
      </section>
      <section className="panel compact-form">
        <div className="section-title">
          <div>
            <h3>{editing ? "Edit vehicle" : "New vehicle"}</h3>
            <p>Capacity is checked during assignment.</p>
          </div>
        </div>
        <div className="form-grid two">
          <Field label="Display name">
            <input
              value={form.label}
              onChange={(e) => setForm({ ...form, label: e.target.value })}
            />
          </Field>
          <Field label="Registration">
            <input
              value={form.registration}
              onChange={(e) =>
                setForm({ ...form, registration: e.target.value })
              }
            />
          </Field>
        </div>
        <div className="form-grid two">
          <Field label="Ownership">
            <select
              value={form.ownership}
              onChange={(e) =>
                setForm({
                  ...form,
                  ownership: e.target.value,
                  supplierId:
                    e.target.value === "Agency" ? "" : form.supplierId,
                })
              }
            >
              <option>Agency</option>
              <option>Supplier</option>
            </select>
          </Field>
          <Field label="Supplier">
            <select
              disabled={form.ownership === "Agency"}
              value={form.supplierId}
              onChange={(e) => setForm({ ...form, supplierId: e.target.value })}
            >
              <option value="">Choose supplier</option>
              {s.suppliers
                .filter((x: Row) => x.status === "Active")
                .map((x: Row) => (
                  <option value={x._id} key={x._id}>
                    {x.name}
                  </option>
                ))}
            </select>
          </Field>
        </div>
        <div className="form-grid three">
          <Field label="Type">
            <select
              value={form.vehicleType}
              onChange={(e) =>
                setForm({ ...form, vehicleType: e.target.value })
              }
            >
              {["Sedan", "SUV", "Tempo traveller", "Van", "Bus", "Other"].map(
                (x) => (
                  <option key={x}>{x}</option>
                ),
              )}
            </select>
          </Field>
          <Field label="Seats">
            <input
              type="number"
              min="1"
              value={form.seats}
              onChange={(e) =>
                setForm({ ...form, seats: Number(e.target.value) })
              }
            />
          </Field>
          <Field label="Luggage">
            <input
              type="number"
              min="0"
              value={form.luggage}
              onChange={(e) =>
                setForm({ ...form, luggage: Number(e.target.value) })
              }
            />
          </Field>
        </div>
        <Field label="Status">
          <select
            value={form.status}
            onChange={(e) => setForm({ ...form, status: e.target.value })}
          >
            <option>Available</option>
            <option>Maintenance</option>
            <option>Inactive</option>
          </select>
        </Field>
        <Field label="Notes">
          <textarea
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />
        </Field>
        <button
          className="button primary wide"
          disabled={busy}
          onClick={async () => {
            if (
              await run("vehicle-save", {
                id: editing?._id,
                version: editing?.version,
                data: form,
              })
            )
              edit();
          }}
        >
          <Check /> Save vehicle
        </button>
      </section>
    </div>
  );
}

function BookingOperations({ s, booking, busy, run, close }: any) {
  const arrangements = s.arrangements.filter(
    (x: Row) => x.bookingId === booking._id,
  );
  const trips = s.tripSegments.filter((x: Row) => x.bookingId === booking._id);
  const readiness = s.readinessItems.filter(
    (x: Row) => x.bookingId === booking._id,
  );
  const documents = s.operationsDocuments.filter(
    (x: Row) => x.bookingId === booking._id,
  );
  const travelDocuments = s.travelDocuments.filter(
    (x: Row) => x.bookingId === booking._id,
  );
  const operationsStaff = s.staff.filter(
    (x: Row) => x.role === "operations" && x.status === "active",
  );
  const [section, setSection] = useState<
    "services" | "trips" | "ready" | "documents"
  >("services");
  return (
    <div className="drawer-scrim">
      <aside className="detail-drawer ops-drawer">
        <div className="drawer-head">
          <div>
            <p className="eyebrow">{booking.bookingNumber}</p>
            <h2>{booking.destination || "Trip operations"}</h2>
            <small>{booking.status}</small>
          </div>
          <button className="icon-button" onClick={close}>
            <X />
          </button>
        </div>
        <div className="drawer-tabs">
          {[
            ["services", "Services"],
            ["trips", "Trip plan"],
            ["ready", "Readiness"],
            ["documents", "Documents"],
          ].map(([id, label]) => (
            <button
              key={id}
              className={section === id ? "active" : ""}
              onClick={() => setSection(id as any)}
            >
              {label}
            </button>
          ))}
        </div>
        {!readiness.length && (
          <div className="banner action-banner">
            <span>Start the simple readiness checklist for this booking.</span>
            <button
              className="button primary"
              disabled={busy}
              onClick={() =>
                run("operations-initialize", { bookingId: booking._id })
              }
            >
              <ClipboardCheck /> Start setup
            </button>
          </div>
        )}
        {section === "services" && (
          <ArrangementSection
            s={s}
            booking={booking}
            rows={arrangements}
            busy={busy}
            run={run}
          />
        )}
        {section === "trips" && (
          <TripSection
            s={s}
            booking={booking}
            rows={trips}
            staff={operationsStaff}
            busy={busy}
            run={run}
          />
        )}
        {section === "ready" && (
          <ReadinessSection
            booking={booking}
            rows={readiness}
            busy={busy}
            run={run}
          />
        )}
        {section === "documents" && (
          <DocumentsSection
            booking={booking}
            arrangements={arrangements}
            documents={documents}
            travelDocuments={travelDocuments}
            busy={busy}
            run={run}
          />
        )}
        <div className="completion-card">
          <div>
            <b>Finish the trip</b>
            <p>
              Available only after services, trip segments, readiness and
              incidents are complete. Settlement stays open for Phase 5.
            </p>
          </div>
          <button
            className="button primary"
            disabled={busy || booking.status === "Trip completed"}
            onClick={() =>
              run("trip-complete", {
                bookingId: booking._id,
                version: booking.version,
              })
            }
          >
            <Flag /> Mark trip completed
          </button>
        </div>
      </aside>
    </div>
  );
}

function ArrangementSection({ s, booking, rows, busy, run }: any) {
  const blank = {
    bookingId: booking._id,
    type: "Hotel",
    title: "",
    supplierId: "",
    responsibility: "Agency arranged",
    startAt: "",
    endAt: "",
    location: "",
    details: "",
    confirmationStatus: "Draft",
    confirmationReference: "",
    holdUntil: "",
    cost: "0",
    currency: booking.currency || "INR",
    dueAt: "",
  };
  const [editing, setEditing] = useState<Row | null>(null);
  const [form, setForm] = useState<any>(blank);
  const edit = (row?: Row) => {
    setEditing(row || null);
    setForm(
      row
        ? {
            bookingId: booking._id,
            type: row.type,
            title: row.title,
            supplierId: row.supplierId || "",
            responsibility: row.responsibility,
            startAt: local(row.startAt),
            endAt: local(row.endAt),
            location: row.location || "",
            details: row.details || "",
            confirmationStatus: row.confirmationStatus,
            confirmationReference: row.confirmationReference || "",
            holdUntil: local(row.holdUntil),
            cost: String(Number(row.costMinor || 0) / 100),
            currency: row.currency || booking.currency,
            dueAt: local(row.dueAt),
          }
        : blank,
    );
  };
  return (
    <div className="drawer-body">
      <div className="section-title">
        <div>
          <h3>Service arrangements</h3>
          <p>Confirmed means the supplier actually confirmed it.</p>
        </div>
        <button className="button secondary" onClick={() => edit()}>
          <Plus /> Add service
        </button>
      </div>
      {rows.map((row: Row) => (
        <button className="ops-record" key={row._id} onClick={() => edit(row)}>
          <span className="record-icon">
            <Hotel />
          </span>
          <div>
            <b>{row.title}</b>
            <small>
              {row.type} · {row.responsibility} ·{" "}
              {row.supplierId
                ? s.suppliers.find((x: Row) => x._id === row.supplierId)?.name
                : "No supplier"}
            </small>
          </div>
          <span
            className={`badge ${row.confirmationStatus.toLowerCase().replaceAll(" ", "-")}`}
          >
            {row.confirmationStatus}
          </span>
          <ArrowRight />
        </button>
      ))}
      {!rows.length && (
        <Empty
          icon={Hotel}
          title="No service arrangements"
          text="Add only services needed for this accepted booking."
        />
      )}
      <div className="subform">
        <h4>{editing ? "Edit service" : "Add service"}</h4>
        <div className="form-grid two">
          <Field label="Service type">
            <select
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value })}
            >
              {[
                "Hotel",
                "Car",
                "Train",
                "Flight",
                "Bus",
                "Ferry",
                "Activity",
                "Guide",
                "Permit / visa",
                "Other",
              ].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </Field>
          <Field label="Responsibility">
            <select
              value={form.responsibility}
              onChange={(e) =>
                setForm({
                  ...form,
                  responsibility: e.target.value,
                  supplierId:
                    e.target.value === "Agency arranged" ? form.supplierId : "",
                  cost: e.target.value === "Agency arranged" ? form.cost : "0",
                })
              }
            >
              <option>Agency arranged</option>
              <option>Customer booked</option>
              <option>Third party</option>
            </select>
          </Field>
        </div>
        <Field label="Short title">
          <input
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="Munnar hotel - 2 nights"
          />
        </Field>
        <div className="form-grid two">
          <Field label="Supplier">
            <select
              disabled={form.responsibility !== "Agency arranged"}
              value={form.supplierId}
              onChange={(e) => setForm({ ...form, supplierId: e.target.value })}
            >
              <option value="">Choose supplier</option>
              {s.suppliers
                .filter((x: Row) => x.status === "Active")
                .map((x: Row) => (
                  <option key={x._id} value={x._id}>
                    {x.name}
                  </option>
                ))}
            </select>
          </Field>
          <Field label="Status">
            <select
              value={form.confirmationStatus}
              onChange={(e) =>
                setForm({ ...form, confirmationStatus: e.target.value })
              }
            >
              {[
                "Draft",
                "On hold",
                "Confirmed",
                "Unavailable",
                "Cancelled",
              ].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </Field>
        </div>
        <div className="form-grid two">
          <Field label="Start">
            <input
              type="datetime-local"
              value={form.startAt}
              onChange={(e) => setForm({ ...form, startAt: e.target.value })}
            />
          </Field>
          <Field label="End">
            <input
              type="datetime-local"
              value={form.endAt}
              onChange={(e) => setForm({ ...form, endAt: e.target.value })}
            />
          </Field>
        </div>
        <Field label="Location">
          <input
            value={form.location}
            onChange={(e) => setForm({ ...form, location: e.target.value })}
          />
        </Field>
        <Field label="Service details">
          <textarea
            value={form.details}
            onChange={(e) => setForm({ ...form, details: e.target.value })}
          />
        </Field>
        {form.confirmationStatus === "On hold" && (
          <Field label="Hold expires">
            <input
              type="datetime-local"
              value={form.holdUntil}
              onChange={(e) => setForm({ ...form, holdUntil: e.target.value })}
            />
          </Field>
        )}
        {form.confirmationStatus === "Confirmed" && (
          <Field label="Confirmation reference">
            <input
              value={form.confirmationReference}
              onChange={(e) =>
                setForm({ ...form, confirmationReference: e.target.value })
              }
            />
          </Field>
        )}
        {form.responsibility === "Agency arranged" && (
          <div className="form-grid three">
            <Field label="Supplier cost">
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.cost}
                onChange={(e) => setForm({ ...form, cost: e.target.value })}
              />
            </Field>
            <Field label="Currency">
              <input
                maxLength={3}
                value={form.currency}
                onChange={(e) =>
                  setForm({ ...form, currency: e.target.value.toUpperCase() })
                }
              />
            </Field>
            <Field label="Payment due">
              <input
                type="datetime-local"
                value={form.dueAt}
                onChange={(e) => setForm({ ...form, dueAt: e.target.value })}
              />
            </Field>
          </div>
        )}
        <p className="form-help">
          Sales can prepare drafts and holds. Owner confirms agency supplier
          commitments.
        </p>
        <button
          className="button primary wide"
          disabled={busy}
          onClick={async () => {
            const data = {
              ...form,
              startAt: iso(form.startAt),
              endAt: iso(form.endAt),
              holdUntil: iso(form.holdUntil),
              dueAt: iso(form.dueAt),
            };
            if (
              await run("arrangement-save", {
                id: editing?._id,
                version: editing?.version,
                data,
              })
            )
              edit();
          }}
        >
          <Check /> Save service
        </button>
      </div>
    </div>
  );
}

function TripSection({ s, booking, rows, staff, busy, run }: any) {
  const blank = {
    bookingId: booking._id,
    mode: "Car",
    title: "",
    from: "",
    to: "",
    startAt: "",
    endAt: "",
    timeZone: "Asia/Kolkata",
    driverId: "",
    vehicleId: "",
    arrangementId: "",
    pickupContact: "",
    assistanceNotes: "",
    bufferMinutes: 60,
  };
  const [editing, setEditing] = useState<Row | null>(null);
  const [form, setForm] = useState<any>(blank);
  const edit = (row?: Row) => {
    setEditing(row || null);
    setForm(
      row
        ? {
            bookingId: booking._id,
            mode: row.mode,
            title: row.title,
            from: row.from || "",
            to: row.to || "",
            startAt: local(row.startAt),
            endAt: local(row.endAt),
            timeZone: row.timeZone,
            driverId: row.driverId || "",
            vehicleId: row.vehicleId || "",
            arrangementId: row.arrangementId || "",
            pickupContact: row.pickupContact || "",
            assistanceNotes: row.assistanceNotes || "",
            bufferMinutes: row.bufferMinutes || 60,
          }
        : blank,
    );
  };
  return (
    <div className="drawer-body">
      <div className="section-title">
        <div>
          <h3>Trip assignments</h3>
          <p>Overlapping driver or vehicle times are blocked automatically.</p>
        </div>
        <button className="button secondary" onClick={() => edit()}>
          <Plus /> Add trip
        </button>
      </div>
      {rows.map((row: Row) => (
        <button className="ops-record" key={row._id} onClick={() => edit(row)}>
          <span className="record-icon">
            <Truck />
          </span>
          <div>
            <b>{row.title}</b>
            <small>
              {displayTime(row.startAt)} · {row.from} → {row.to}
            </small>
          </div>
          <span
            className={`badge ${row.status.toLowerCase().replaceAll(" ", "-")}`}
          >
            {row.status}
          </span>
          <ArrowRight />
        </button>
      ))}
      {!rows.length && (
        <Empty
          icon={Truck}
          title="No trip assignments"
          text="Add car legs or customer-booked transport references."
        />
      )}
      <div className="subform">
        <h4>{editing ? "Edit trip" : "Add trip"}</h4>
        <div className="form-grid two">
          <Field label="Mode">
            <select
              value={form.mode}
              onChange={(e) =>
                setForm({
                  ...form,
                  mode: e.target.value,
                  driverId: e.target.value === "Car" ? form.driverId : "",
                  vehicleId: e.target.value === "Car" ? form.vehicleId : "",
                })
              }
            >
              {[
                "Car",
                "Train",
                "Flight",
                "Bus",
                "Ferry",
                "Walk / activity",
                "Other",
              ].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </Field>
          <Field label="Title">
            <input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="Kochi pickup to Munnar"
            />
          </Field>
        </div>
        <div className="form-grid two">
          <Field label="From">
            <input
              value={form.from}
              onChange={(e) => setForm({ ...form, from: e.target.value })}
            />
          </Field>
          <Field label="To">
            <input
              value={form.to}
              onChange={(e) => setForm({ ...form, to: e.target.value })}
            />
          </Field>
        </div>
        <div className="form-grid two">
          <Field label="Start">
            <input
              type="datetime-local"
              value={form.startAt}
              onChange={(e) => setForm({ ...form, startAt: e.target.value })}
            />
          </Field>
          <Field label="End">
            <input
              type="datetime-local"
              value={form.endAt}
              onChange={(e) => setForm({ ...form, endAt: e.target.value })}
            />
          </Field>
        </div>
        <div className="form-grid two">
          <Field label="Time zone">
            <input
              value={form.timeZone}
              onChange={(e) => setForm({ ...form, timeZone: e.target.value })}
            />
          </Field>
          <Field label="Travel buffer (minutes)">
            <input
              type="number"
              min="0"
              value={form.bufferMinutes}
              onChange={(e) =>
                setForm({ ...form, bufferMinutes: Number(e.target.value) })
              }
            />
          </Field>
        </div>
        {form.mode === "Car" && (
          <div className="form-grid two">
            <Field label="Driver">
              <select
                value={form.driverId}
                onChange={(e) => setForm({ ...form, driverId: e.target.value })}
              >
                <option value="">Choose driver</option>
                {staff.map((x: Row) => (
                  <option value={x._id} key={x._id}>
                    {x.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Vehicle">
              <select
                value={form.vehicleId}
                onChange={(e) =>
                  setForm({ ...form, vehicleId: e.target.value })
                }
              >
                <option value="">Choose vehicle</option>
                {s.vehicles
                  .filter((x: Row) => x.status === "Available")
                  .map((x: Row) => (
                    <option value={x._id} key={x._id}>
                      {x.label} · {x.seats} seats
                    </option>
                  ))}
              </select>
            </Field>
          </div>
        )}
        <Field label="Linked service">
          <select
            value={form.arrangementId}
            onChange={(e) =>
              setForm({ ...form, arrangementId: e.target.value })
            }
          >
            <option value="">No linked service</option>
            {s.arrangements
              .filter((x: Row) => x.bookingId === booking._id)
              .map((x: Row) => (
                <option value={x._id} key={x._id}>
                  {x.title}
                </option>
              ))}
          </select>
        </Field>
        <Field label="Pickup contact / sign">
          <input
            value={form.pickupContact}
            onChange={(e) =>
              setForm({ ...form, pickupContact: e.target.value })
            }
          />
        </Field>
        <Field label="Assistance notes">
          <textarea
            value={form.assistanceNotes}
            onChange={(e) =>
              setForm({ ...form, assistanceNotes: e.target.value })
            }
          />
        </Field>
        <button
          className="button primary wide"
          disabled={busy}
          onClick={async () => {
            const data = {
              ...form,
              startAt: iso(form.startAt),
              endAt: iso(form.endAt),
            };
            if (
              await run("trip-save", {
                id: editing?._id,
                version: editing?.version,
                data,
              })
            )
              edit();
          }}
        >
          <Check /> Save trip assignment
        </button>
      </div>
    </div>
  );
}

function ReadinessSection({ booking, rows, busy, run }: any) {
  return (
    <div className="drawer-body">
      <div className="section-title">
        <div>
          <h3>Travel readiness</h3>
          <p>Use Blocked only when something truly prevents travel.</p>
        </div>
      </div>
      {rows.map((row: Row) => (
        <div className="readiness-row" key={row._id}>
          <div>
            <b>{row.label}</b>
            <small>{row.note || "No note"}</small>
          </div>
          <select
            value={row.status}
            disabled={busy}
            onChange={(e) =>
              run("readiness-update", {
                bookingId: booking._id,
                itemId: row._id,
                status: e.target.value,
                note:
                  e.target.value === "Blocked"
                    ? "Needs coordinator review"
                    : row.note || "",
                expiresAt: row.expiresAt || "",
              })
            }
          >
            {["Pending", "Ready", "Not required", "Blocked"].map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </div>
      ))}
      {!rows.length && (
        <Empty
          icon={ClipboardCheck}
          title="Checklist not started"
          text="Use Start setup above."
        />
      )}
    </div>
  );
}

function DocumentsSection({
  booking,
  arrangements,
  documents,
  travelDocuments,
  busy,
  run,
}: any) {
  const [arrangementId, setArrangementId] = useState("");
  const [travel, setTravel] = useState({
    category: "Passport / ID",
    travellerName: booking.travellers?.[0]?.name || "",
    expiresAt: "",
    note: "",
  });
  const [file, setFile] = useState<File | null>(null);
  return (
    <div className="drawer-body">
      <div className="section-title">
        <div>
          <h3>Operational documents</h3>
          <p>
            Generated from confirmed CRM data and never includes supplier cost.
          </p>
        </div>
      </div>
      <div className="document-actions">
        <button
          className="button secondary"
          disabled={busy}
          onClick={() =>
            run("operations-document", {
              bookingId: booking._id,
              kind: "Final itinerary",
              arrangementId: "",
            })
          }
        >
          <FileText /> Final itinerary
        </button>
        <button
          className="button secondary"
          disabled={busy}
          onClick={() =>
            run("operations-document", {
              bookingId: booking._id,
              kind: "Passenger manifest",
              arrangementId: "",
            })
          }
        >
          <Users /> Passenger manifest
        </button>
        <button
          className="button secondary"
          disabled={busy}
          onClick={() =>
            run("operations-document", {
              bookingId: booking._id,
              kind: "Driver trip sheet",
              arrangementId: "",
            })
          }
        >
          <Route /> Driver trip sheet
        </button>
      </div>
      <div className="voucher-create">
        <select
          value={arrangementId}
          onChange={(e) => setArrangementId(e.target.value)}
        >
          <option value="">Choose confirmed service</option>
          {arrangements
            .filter((x: Row) => x.confirmationStatus === "Confirmed")
            .map((x: Row) => (
              <option key={x._id} value={x._id}>
                {x.title}
              </option>
            ))}
        </select>
        <button
          className="button secondary"
          disabled={busy || !arrangementId}
          onClick={() =>
            run("operations-document", {
              bookingId: booking._id,
              kind: "Hotel / supplier voucher",
              arrangementId,
            })
          }
        >
          Generate voucher
        </button>
      </div>
      {documents.map((doc: Row) => (
        <a
          className="simple-row"
          href={`/api/documents/operations/${doc._id}`}
          target="_blank"
          rel="noreferrer"
          key={doc._id}
        >
          <Download />
          <div>
            <b>{doc.kind}</b>
            <small>{displayTime(doc.createdAt)}</small>
          </div>
          <ArrowRight />
        </a>
      ))}
      {!documents.length && (
        <Empty
          icon={FileText}
          title="No documents generated"
          text="Confirm required services first."
        />
      )}
      <div className="subform travel-doc-form">
        <h4>Private traveller document</h4>
        <p>Owner and assigned Sales only. Drivers cannot open these files.</p>
        <div className="form-grid two">
          <Field label="Document type">
            <select
              value={travel.category}
              onChange={(e) =>
                setTravel({ ...travel, category: e.target.value })
              }
            >
              {[
                "Passport / ID",
                "Ticket",
                "Visa",
                "Permit",
                "Insurance",
                "Other",
              ].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </Field>
          <Field label="Traveller">
            <select
              value={travel.travellerName}
              onChange={(e) =>
                setTravel({ ...travel, travellerName: e.target.value })
              }
            >
              {(booking.travellers || []).map((x: Row) => (
                <option key={x.id}>{x.name}</option>
              ))}
            </select>
          </Field>
        </div>
        <div className="form-grid two">
          <Field label="Expiry (optional)">
            <input
              type="datetime-local"
              value={travel.expiresAt}
              onChange={(e) =>
                setTravel({ ...travel, expiresAt: e.target.value })
              }
            />
          </Field>
          <Field label="JPG, PNG or PDF - max 1.5 MB">
            <input
              type="file"
              accept="image/jpeg,image/png,application/pdf"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
          </Field>
        </div>
        <Field label="Note">
          <input
            value={travel.note}
            onChange={(e) => setTravel({ ...travel, note: e.target.value })}
          />
        </Field>
        <button
          className="button secondary"
          disabled={busy || !file || !travel.travellerName}
          onClick={async () => {
            if (!file) return;
            const ok = await run("travel-document-save", {
              bookingId: booking._id,
              ...travel,
              expiresAt: iso(travel.expiresAt),
              fileName: file.name,
              mimeType: file.type,
              fileBase64: await fileToBase64(file),
            });
            if (ok) setFile(null);
          }}
        >
          <Plus /> Add private document
        </button>
      </div>
      {travelDocuments.map((doc: Row) => (
        <a
          className="simple-row"
          href={`/api/documents/travel/${doc._id}`}
          target="_blank"
          rel="noreferrer"
          key={doc._id}
        >
          <Download />
          <div>
            <b>
              {doc.category} - {doc.travellerName}
            </b>
            <small>
              {doc.fileName}
              {doc.expiresAt ? ` · expires ${displayTime(doc.expiresAt)}` : ""}
            </small>
          </div>
          <ArrowRight />
        </a>
      ))}
    </div>
  );
}

function Incidents({ s, busy, run }: any) {
  const [notes, setNotes] = useState<Record<string, string>>({});
  return (
    <section className="panel ops-list-panel">
      <div className="section-title">
        <div>
          <h3>Trip incidents</h3>
          <p>Urgent reports notify Owner and Sales immediately.</p>
        </div>
      </div>
      {s.incidents.map((row: Row) => (
        <div className="incident-row" key={row._id}>
          <AlertTriangle />
          <div>
            <b>
              {row.severity} · {row.type}
            </b>
            <p>{row.description}</p>
            <small>
              {row.reportedByName} · {displayTime(row.reportedAt)}
            </small>
            {row.resolution && <em>Resolved: {row.resolution}</em>}
          </div>
          <span className={`badge ${row.status.toLowerCase()}`}>
            {row.status}
          </span>
          {row.status === "Open" && (
            <div className="incident-resolve">
              <input
                placeholder="How was it resolved?"
                value={notes[row._id] || ""}
                onChange={(e) =>
                  setNotes({ ...notes, [row._id]: e.target.value })
                }
              />
              <button
                className="button primary"
                disabled={busy || !(notes[row._id] || "").trim()}
                onClick={() =>
                  run("incident-resolve", {
                    incidentId: row._id,
                    version: row.version,
                    resolution: notes[row._id],
                  })
                }
              >
                <Check /> Resolve
              </button>
            </div>
          )}
        </div>
      ))}
      {!s.incidents.length && (
        <Empty
          icon={ShieldCheck}
          title="No incidents"
          text="New driver or coordinator reports will appear here."
        />
      )}
      <div className="section-title request-heading">
        <div>
          <h3>Driver requests and expenses</h3>
          <p>
            Approval records the decision; coordinators apply any schedule
            change separately.
          </p>
        </div>
      </div>
      {s.operationsRequests.map((request: Row) => (
        <div className="incident-row" key={request._id}>
          <ReceiptText />
          <div>
            <b>
              {request.type} · {request.submittedByName}
            </b>
            <p>{request.description}</p>
            {request.type === "Expense" && (
              <small>{money(request.amountMinor, request.currency)}</small>
            )}
            {request.evidenceName && (
              <a
                className="text-button"
                href={`/api/documents/operations-request/${request._id}`}
                target="_blank"
                rel="noreferrer"
              >
                <Download /> Open evidence
              </a>
            )}
            {request.decisionReason && (
              <em>
                {request.status}: {request.decisionReason}
              </em>
            )}
          </div>
          <span
            className={`badge ${request.status.toLowerCase().replaceAll(" ", "-")}`}
          >
            {request.status}
          </span>
          {request.status === "Pending review" && (
            <div className="incident-resolve">
              <input
                placeholder="Decision reason"
                value={notes[`request:${request._id}`] || ""}
                onChange={(e) =>
                  setNotes({
                    ...notes,
                    [`request:${request._id}`]: e.target.value,
                  })
                }
              />
              <button
                className="button secondary"
                disabled={
                  busy || !(notes[`request:${request._id}`] || "").trim()
                }
                onClick={() =>
                  run("operations-request-decision", {
                    requestId: request._id,
                    version: request.version,
                    decision: "Rejected",
                    reason: notes[`request:${request._id}`],
                  })
                }
              >
                Reject
              </button>
              <button
                className="button primary"
                disabled={
                  busy || !(notes[`request:${request._id}`] || "").trim()
                }
                onClick={() =>
                  run("operations-request-decision", {
                    requestId: request._id,
                    version: request.version,
                    decision: "Approved",
                    reason: notes[`request:${request._id}`],
                  })
                }
              >
                Approve
              </button>
            </div>
          )}
        </div>
      ))}
    </section>
  );
}

function MyTrips({ s, q, busy, run }: any) {
  const rows = useMemo(
    () =>
      s.tripSegments.filter((row: Row) =>
        [row.title, row.from, row.to]
          .join(" ")
          .toLowerCase()
          .includes(q.toLowerCase()),
      ),
    [s.tripSegments, q],
  );
  const [incident, setIncident] = useState<any>({
    bookingId: "",
    segmentId: "",
    type: "Delay",
    severity: "Medium",
    description: "",
    customerContacted: false,
  });
  const [cash, setCash] = useState<any>({
    bookingId: "",
    amount: "",
    currency: "INR",
    collectedAt: local(new Date().toISOString()),
    reference: "",
    payerName: "",
    note: "",
  });
  const [request, setRequest] = useState<any>({
    bookingId: "",
    segmentId: "",
    type: "Logistics change",
    description: "",
    amount: "0",
    currency: "INR",
  });
  const [requestFile, setRequestFile] = useState<File | null>(null);
  return (
    <>
      <div className="driver-hero">
        <div>
          <p className="eyebrow">My trips</p>
          <h2>One route, one status, one clear next step.</h2>
          <p>
            Call the coordinator if you cannot save. Never promise price or
            supplier changes to the customer.
          </p>
        </div>
        <Truck />
      </div>
      <div className="driver-trip-list">
        {rows.map((row: Row) => {
          const booking = s.bookings.find((x: Row) => x._id === row.bookingId);
          const vehicle = s.vehicles.find((x: Row) => x._id === row.vehicleId);
          return (
            <article className="driver-trip" key={row._id}>
              <div className="trip-time">
                <b>{displayTime(row.startAt)}</b>
                <span
                  className={`badge ${row.status.toLowerCase().replaceAll(" ", "-")}`}
                >
                  {row.status}
                </span>
              </div>
              <h3>{row.title}</h3>
              <p className="trip-route">
                <MapPin /> {row.from || "Pickup"} <ArrowRight />{" "}
                {row.to || "Drop"}
              </p>
              <div className="trip-facts">
                <span>
                  <BusFront /> {vehicle?.label || "Vehicle pending"}
                </span>
                <span>
                  <UserRound />{" "}
                  {booking?.travellers?.find((x: Row) => x.lead)?.name ||
                    "Lead traveller"}
                </span>
              </div>
              {row.pickupContact && (
                <p>
                  <b>Pickup contact:</b> {row.pickupContact}
                </p>
              )}
              {row.assistanceNotes && (
                <div className="driver-note">
                  <b>Assistance notes</b>
                  <p>{row.assistanceNotes}</p>
                </div>
              )}
              <div className="progress-buttons">
                {[
                  "Started",
                  "Picked up",
                  "Completed",
                  "Unable to complete",
                ].map((status) => (
                  <button
                    className="button secondary"
                    disabled={busy || row.status === "Completed"}
                    key={status}
                    onClick={() =>
                      run("trip-progress", {
                        segmentId: row._id,
                        version: row.version,
                        status,
                        actualStart:
                          status === "Started"
                            ? new Date().toISOString()
                            : row.actualStart || "",
                        actualEnd:
                          status === "Completed"
                            ? new Date().toISOString()
                            : row.actualEnd || "",
                        startOdometer: null,
                        endOdometer: null,
                        note:
                          status === "Unable to complete"
                            ? "Unable to continue; coordinator action required"
                            : "",
                      })
                    }
                  >
                    {status === "Completed" && <Check />}
                    {status}
                  </button>
                ))}
              </div>
              <button
                className="link-button danger"
                onClick={() =>
                  setIncident({
                    ...incident,
                    bookingId: row.bookingId,
                    segmentId: row._id,
                  })
                }
              >
                <AlertTriangle /> Report a problem
              </button>
            </article>
          );
        })}
        {!rows.length && (
          <Empty
            icon={Route}
            title="No trips assigned"
            text="New assignments will appear here."
          />
        )}
      </div>
      <div className="driver-tools">
        <section className="panel compact-form">
          <div className="section-title">
            <div>
              <h3>Report a trip problem</h3>
              <p>This alerts Owner and the coordinator.</p>
            </div>
          </div>
          <Field label="Booking">
            <select
              value={incident.bookingId}
              onChange={(e) =>
                setIncident({
                  ...incident,
                  bookingId: e.target.value,
                  segmentId: "",
                })
              }
            >
              <option value="">Choose booking</option>
              {s.bookings.map((x: Row) => (
                <option key={x._id} value={x._id}>
                  {x.bookingNumber}
                </option>
              ))}
            </select>
          </Field>
          <div className="form-grid two">
            <Field label="Type">
              <select
                value={incident.type}
                onChange={(e) =>
                  setIncident({ ...incident, type: e.target.value })
                }
              >
                {[
                  "Delay",
                  "Vehicle issue",
                  "Driver unavailable",
                  "Customer issue",
                  "Supplier issue",
                  "Emergency",
                  "Other",
                ].map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </Field>
            <Field label="Severity">
              <select
                value={incident.severity}
                onChange={(e) =>
                  setIncident({ ...incident, severity: e.target.value })
                }
              >
                {["Low", "Medium", "High", "Urgent"].map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="What happened?">
            <textarea
              value={incident.description}
              onChange={(e) =>
                setIncident({ ...incident, description: e.target.value })
              }
            />
          </Field>
          <label className="checkline">
            <input
              type="checkbox"
              checked={incident.customerContacted}
              onChange={(e) =>
                setIncident({
                  ...incident,
                  customerContacted: e.target.checked,
                })
              }
            />{" "}
            Customer has been contacted
          </label>
          <button
            className="button primary wide"
            disabled={busy}
            onClick={async () => {
              if (await run("incident-report", incident))
                setIncident({
                  bookingId: "",
                  segmentId: "",
                  type: "Delay",
                  severity: "Medium",
                  description: "",
                  customerContacted: false,
                });
            }}
          >
            <AlertTriangle /> Send incident report
          </button>
        </section>
        <section className="panel compact-form">
          <div className="section-title">
            <div>
              <h3>Exceptional cash collection</h3>
              <p>
                Use only if the customer gave you money. Owner must verify it.
              </p>
            </div>
          </div>
          <Field label="Booking">
            <select
              value={cash.bookingId}
              onChange={(e) => {
                const b = s.bookings.find((x: Row) => x._id === e.target.value);
                setCash({
                  ...cash,
                  bookingId: e.target.value,
                  currency: b?.currency || "INR",
                });
              }}
            >
              <option value="">Choose booking</option>
              {s.bookings.map((x: Row) => (
                <option key={x._id} value={x._id}>
                  {x.bookingNumber}
                </option>
              ))}
            </select>
          </Field>
          <div className="form-grid two">
            <Field label="Amount">
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={cash.amount}
                onChange={(e) => setCash({ ...cash, amount: e.target.value })}
              />
            </Field>
            <Field label="Currency">
              <input readOnly value={cash.currency} />
            </Field>
          </div>
          <Field label="Collected at">
            <input
              type="datetime-local"
              value={cash.collectedAt}
              onChange={(e) =>
                setCash({ ...cash, collectedAt: e.target.value })
              }
            />
          </Field>
          <Field label="Customer / payer">
            <input
              value={cash.payerName}
              onChange={(e) => setCash({ ...cash, payerName: e.target.value })}
            />
          </Field>
          <Field label="Reference (optional)">
            <input
              value={cash.reference}
              onChange={(e) => setCash({ ...cash, reference: e.target.value })}
            />
          </Field>
          <Field label="Why and how it was collected">
            <textarea
              value={cash.note}
              onChange={(e) => setCash({ ...cash, note: e.target.value })}
            />
          </Field>
          <button
            className="button primary wide"
            disabled={busy}
            onClick={async () => {
              const data = { ...cash, collectedAt: iso(cash.collectedAt) };
              if (await run("collection-report", data))
                setCash({
                  bookingId: "",
                  amount: "",
                  currency: "INR",
                  collectedAt: local(new Date().toISOString()),
                  reference: "",
                  payerName: "",
                  note: "",
                });
            }}
          >
            <WalletCards /> Report collection
          </button>
          <p className="form-help">
            Reporting cash does not verify payment. Cash handover is tracked
            separately and never adds a second customer payment.
          </p>
        </section>
        <section className="panel compact-form">
          <div className="section-title">
            <div>
              <h3>Request a change or expense</h3>
              <p>
                This never changes a route or financial total until reviewed.
              </p>
            </div>
          </div>
          <Field label="Assigned trip">
            <select
              value={request.segmentId}
              onChange={(e) => {
                const segment = rows.find((x: Row) => x._id === e.target.value);
                const booking = s.bookings.find(
                  (x: Row) => x._id === segment?.bookingId,
                );
                setRequest({
                  ...request,
                  segmentId: e.target.value,
                  bookingId: segment?.bookingId || "",
                  currency: booking?.currency || "INR",
                });
              }}
            >
              <option value="">Choose trip</option>
              {rows.map((x: Row) => (
                <option key={x._id} value={x._id}>
                  {x.title}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Request type">
            <select
              value={request.type}
              onChange={(e) =>
                setRequest({
                  ...request,
                  type: e.target.value,
                  amount: e.target.value === "Expense" ? request.amount : "0",
                })
              }
            >
              <option>Logistics change</option>
              <option>Expense</option>
            </select>
          </Field>
          <Field label="Details">
            <textarea
              value={request.description}
              onChange={(e) =>
                setRequest({ ...request, description: e.target.value })
              }
            />
          </Field>
          {request.type === "Expense" && (
            <>
              <div className="form-grid two">
                <Field label="Amount">
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={request.amount}
                    onChange={(e) =>
                      setRequest({ ...request, amount: e.target.value })
                    }
                  />
                </Field>
                <Field label="Currency">
                  <input readOnly value={request.currency} />
                </Field>
              </div>
              <Field label="Evidence (optional, max 1.5 MB)">
                <input
                  type="file"
                  accept="image/jpeg,image/png,application/pdf"
                  onChange={(e) => setRequestFile(e.target.files?.[0] || null)}
                />
              </Field>
            </>
          )}
          <button
            className="button primary wide"
            disabled={busy || !request.segmentId}
            onClick={async () => {
              const fileBase64 = requestFile
                ? await fileToBase64(requestFile)
                : "";
              const ok = await run("operations-request", {
                ...request,
                evidenceName: requestFile?.name || "",
                evidenceType: requestFile?.type || "",
                evidenceBase64: fileBase64,
              });
              if (ok) {
                setRequest({
                  bookingId: "",
                  segmentId: "",
                  type: "Logistics change",
                  description: "",
                  amount: "0",
                  currency: "INR",
                });
                setRequestFile(null);
              }
            }}
          >
            <ReceiptText /> Submit for review
          </button>
          <p className="form-help">
            If Owner has not enabled the relevant capability, the CRM blocks
            submission and explains what is missing.
          </p>
        </section>
      </div>
    </>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}
