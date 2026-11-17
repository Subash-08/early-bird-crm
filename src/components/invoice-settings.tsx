"use client";

import { useEffect, useState } from "react";
import { Building2, Eye, FileSignature, Landmark, RefreshCw, Save, ShieldCheck } from "lucide-react";
import { defaultInvoiceTemplate } from "@/lib/invoice-domain";

const templateKeys = Object.keys(defaultInvoiceTemplate) as (keyof typeof defaultInvoiceTemplate)[];
const templateFields = (data: typeof defaultInvoiceTemplate) => Object.fromEntries(templateKeys.map((key) => [key, data[key]]));

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
  const [previewInput, setPreviewInput] = useState(() => templateFields(data));
  const [preview, setPreview] = useState<{ url?: string; error?: string }>({});
  useEffect(() => {
    let active = true;
    let objectUrl = "";
    fetch("/api/crm", {
      method: "POST", cache: "no-store", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "invoice-template-preview", data: previewInput }),
    }).then(async (response) => {
      if (!response.ok) {
        const body = await response.json();
        throw new Error(body.error || "Could not make the invoice preview.");
      }
      const pdf = await response.blob();
      if (active) { objectUrl = URL.createObjectURL(pdf); setPreview({ url: objectUrl }); }
    }).catch((error: Error) => { if (active) setPreview({ error: error.message }); });
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [previewInput]);
  const refreshPreview = () => { setPreview({}); setPreviewInput(templateFields(data)); };
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
            await api("invoice-template-save", templateFields(data)); setSaved(true); refreshPreview(); await reload();
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
          <div className="invoice-preview-title"><Eye /><div><b>Invoice PDF preview</b><small>Sample for a new booking</small></div></div>
          <div className="invoice-preview-actions">
            <button type="button" className="button secondary" onClick={refreshPreview}><RefreshCw /> Refresh PDF preview</button>
            {preview.url && <a className="button secondary" href={preview.url} target="_blank" rel="noreferrer">Open sample PDF</a>}
          </div>
          {preview.error ? <p className="form-error" role="alert">{preview.error}</p> : preview.url
            ? <iframe className="invoice-preview-frame" title="Sample invoice PDF" src={preview.url} />
            : <p role="status">Generating PDF preview…</p>}
          <p className="field-hint">Refresh to see unsaved changes. The payment summary applies to older bookings that track payments.</p>
        </aside>
      </div>
    </div>
  );
}
