"use client";

import { useMemo, useState } from "react";
import { Building2, Eye, FileSignature, Landmark, Save, ShieldCheck } from "lucide-react";
import { defaultInvoiceTemplate } from "@/lib/invoice-domain";

async function api(action: string, data: unknown) {
  const response = await fetch("/api/crm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, data }),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Request failed");
  return result.result;
}

function Field({ label, value, set, area = false, type = "text", required = false }: any) {
  const control = area ? (
    <textarea value={value} required={required} onChange={(event) => set(event.target.value)} />
  ) : (
    <input type={type} value={value} required={required} onChange={(event) => set(type === "number" ? Number(event.target.value) : event.target.value)} />
  );
  return <label className="invoice-field"><span>{label}</span>{control}</label>;
}

async function imageData(file?: File) {
  if (!file) return "";
  if (!['image/png', 'image/jpeg'].includes(file.type)) throw new Error("Use a PNG or JPEG image.");
  if (file.size > 500_000) throw new Error("Image must be 500 KB or smaller.");
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read image."));
    reader.readAsDataURL(file);
  });
}

export function InvoiceSettings({ s, reload, fail }: any) {
  const [data, setData] = useState({ ...defaultInvoiceTemplate, ...(s.invoiceTemplate || {}) });
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const keys = useMemo(() => Object.keys(defaultInvoiceTemplate) as (keyof typeof defaultInvoiceTemplate)[], []);
  const update = (key: string, value: any) => setData((current: any) => ({ ...current, [key]: value }));
  const toggles = [
    ["showDeliveryAddress", "Delivery address"], ["showBuyerGstin", "Buyer GSTIN"],
    ["showBankDetails", "Bank details"], ["showHsn", "HSN/SAC"],
    ["showQuantity", "Quantity"], ["showUnitPrice", "Unit price"],
    ["showGstRate", "GST rate"], ["showTaxBreakdown", "Tax breakdown"],
    ["showTcs", "TCS"], ["showPaymentSummary", "Payment summary"],
    ["showReceiverSignature", "Receiver signature"], ["showAuthorisedSignature", "Authorised signature"],
    ["includeTravelSummary", "Travel summary page"],
  ];
  return (
    <div className="invoice-settings-page">
      <section className="invoice-settings-hero">
        <div><p className="eyebrow">Owner setup</p><h2>Invoice template</h2><p>Set the business details once. Every issued invoice stores its own locked copy.</p></div>
        <span><ShieldCheck /> Owner only</span>
      </section>
      <div className="invoice-settings-layout">
        <form className="panel invoice-settings-form" onSubmit={async (event) => {
          event.preventDefault(); setBusy(true); setSaved(false);
          try {
            const clean = Object.fromEntries(keys.map((key) => [key, data[key]]));
            await api("invoice-template-save", clean); setSaved(true); await reload();
          } catch (error) { fail((error as Error).message); } finally { setBusy(false); }
        }}>
          <header><Building2 /><div><h3>Company and tax details</h3><p>These appear on the top of every new invoice.</p></div></header>
          <div className="invoice-form-grid">
            <Field label="Legal business name" value={data.legalName} set={(value: string) => update("legalName", value)} required />
            <Field label="Invoice title" value={data.documentTitle} set={(value: string) => update("documentTitle", value)} required />
            <Field label="Phone" value={data.phone} set={(value: string) => update("phone", value)} />
            <Field label="Email" type="email" value={data.email} set={(value: string) => update("email", value)} />
            <Field label="GSTIN" value={data.gstin} set={(value: string) => update("gstin", value)} />
            <Field label="PAN" value={data.pan} set={(value: string) => update("pan", value)} />
            <Field label="State" value={data.stateName} set={(value: string) => update("stateName", value)} />
            <Field label="State code" value={data.stateCode} set={(value: string) => update("stateCode", value)} />
            <div className="invoice-field full"><Field label="Registered address" area value={data.address} set={(value: string) => update("address", value)} required /></div>
          </div>
          <header><Landmark /><div><h3>Bank and numbering</h3><p>Bank fields can be hidden from the PDF.</p></div></header>
          <div className="invoice-form-grid">
            <Field label="Bank name" value={data.bankName} set={(value: string) => update("bankName", value)} />
            <Field label="Account name" value={data.accountName} set={(value: string) => update("accountName", value)} />
            <Field label="Account number" value={data.accountNumber} set={(value: string) => update("accountNumber", value)} />
            <Field label="IFSC" value={data.ifsc} set={(value: string) => update("ifsc", value)} />
            <Field label="Account type" value={data.accountType} set={(value: string) => update("accountType", value)} />
            <Field label="Invoice prefix" value={data.prefix} set={(value: string) => update("prefix", value.toUpperCase())} required />
            <Field label="Number digits" type="number" value={data.sequenceDigits} set={(value: number) => update("sequenceDigits", value)} />
            <Field label="Authorised signatory" value={data.authorisedSignatory} set={(value: string) => update("authorisedSignatory", value)} />
          </div>
          <header><FileSignature /><div><h3>Print and display</h3><p>Copy labels repeat the same invoice data and number; they do not create duplicate invoices.</p></div></header>
          <div className="invoice-form-grid">
            <Field label="Print-copy labels (comma separated)" value={data.copyLabels.join(", ")} set={(value: string) => update("copyLabels", value.split(",").map((item) => item.trim()).filter(Boolean).slice(0, 6))} />
            <Field label="Footer note" value={data.footerNote} set={(value: string) => update("footerNote", value)} />
            <div className="invoice-field full"><Field label="Payment terms" area value={data.paymentTerms} set={(value: string) => update("paymentTerms", value)} /></div>
            <label className="invoice-field"><span>Logo (PNG/JPEG, max 500 KB)</span><input type="file" accept="image/png,image/jpeg" onChange={async (event) => { try { update("logoDataUrl", await imageData(event.target.files?.[0])); } catch (error) { fail((error as Error).message); } }} /></label>
            <label className="invoice-field"><span>Signature (PNG/JPEG, max 500 KB)</span><input type="file" accept="image/png,image/jpeg" onChange={async (event) => { try { update("signatureDataUrl", await imageData(event.target.files?.[0])); } catch (error) { fail((error as Error).message); } }} /></label>
          </div>
          <div className="invoice-toggle-grid">
            {toggles.map(([key, label]) => <label key={key}><input type="checkbox" checked={Boolean((data as any)[key])} onChange={(event) => update(key, event.target.checked)} /><span>{label}</span></label>)}
            <label><input type="checkbox" checked={data.roundTaxToRupee} onChange={(event) => update("roundTaxToRupee", event.target.checked)} /><span>Round tax to rupee</span></label>
          </div>
          <div className="invoice-save-bar"><button className="button primary" disabled={busy}><Save /> {busy ? "Saving..." : "Save new template version"}</button>{saved && <span><ShieldCheck /> Saved</span>}</div>
        </form>
        <aside className="invoice-preview-wrap">
          <div className="invoice-preview-title"><Eye /><div><b>Live layout preview</b><small>Sample data only</small></div></div>
          <div className="invoice-paper">
            <h3>{data.documentTitle}</h3><small>Customer copy</small>
            <div className="invoice-preview-company"><div className="preview-logo">{data.logoDataUrl ? <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={data.logoDataUrl} alt="Company logo preview" />
            </> : "LOGO"}</div><div><b>{data.legalName}</b><p>{data.address}</p><p>{data.phone} {data.email}</p></div></div>
            <div className="preview-gst">GSTIN: {data.gstin || "Not configured"}</div>
            <div className="preview-two"><div><b>Invoice No</b><p>{data.prefix}-26-27-0008</p></div><div><b>Date</b><p>03 Nov 2026</p></div></div>
            <div className="preview-two"><div><b>Buyer</b><p>Sample customer<br />Billing address</p></div><div><b>Service address</b><p>Place of supply<br />State code</p></div></div>
            <div className="preview-table"><b>{data.showHsn ? "HSN" : ""}</b><b>Particulars</b><b>{data.showQuantity ? "Qty" : ""}</b><b>Total</b><span>{data.showHsn ? "998552" : ""}</span><span>Travel package and cab charges{data.showGstRate ? " · GST 5%" : ""}{data.showUnitPrice ? " · Price 1,00,000" : ""}</span><span>{data.showQuantity ? "1" : ""}</span><span>1,00,000.00</span></div>
            <div className="preview-total"><span>Taxable value</span><b>1,00,000.00</b>{data.showTaxBreakdown && <><span>GST</span><b>5,000.00</b></>}<span>Grand total</span><b>1,05,000.00</b></div>
            <div className="preview-sign"><span>{data.showReceiverSignature ? "Receiver's signature" : ""}</span><span>{data.showAuthorisedSignature ? "Authorised signatory" : ""}</span></div>
          </div>
        </aside>
      </div>
    </div>
  );
}
