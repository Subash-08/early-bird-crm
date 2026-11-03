# Current project context

Updated: 3 November 2026

## Current state

The complete local workflow covers enquiry, quotation, booking, verified advance, supplier/vehicle coordination, driver assignments, My trips, readiness/private documents, operational PDFs, incidents, collection/custody, gated trip completion, settlement, Owner-managed role transitions, filtered reports and CSV/XLSX exports. The responsive shell now includes fixed independently scrolling navigation and a privacy-safe installable PWA/offline fallback.

The visual system uses deep navy, sea blue, warm sand and coral with Plus Jakarta Sans and Lucide icons. It intentionally differs from the old green demo while keeping the clean, friendly density the user preferred.

The invoice workflow now includes an Owner-only versioned template, booking-specific billing/service addresses, HSN charge and note rows, CGST/SGST/IGST/TCS calculation, financial-year numbering, verified-payment summary, reference-style Letter PDF, optional travel summary, customer invoice history and audited renamed print copies that keep the original invoice number and data. See `docs/invoice-template-and-billing-plan.md` and `docs/invoice-template-manual-test.md`.

## Confirmed business decisions

- Initial users: one Owner, one Sales executive and multiple Operations members.
- Owner and Sales coordinate leads and customer requirements; drivers cannot create quotations or confirm money.
- In-app notifications only; WhatsApp remains manual initially.
- Drivers do not routinely collect money. A future exception is reported to and verified by Owner.
- No fixed group-departure inventory.
- User adds all environment credentials manually.
- Issued invoice snapshots and PDFs are immutable. Renamed print copies are presentation copies, not new invoices.

## Release boundary

Code-level reporting, export, administration, PWA, health and production validation are implemented. External hosting/domain, production secrets, scheduled-job monitoring, Atlas backup/restore rehearsal and Cloudinary activation require the user's selected external accounts. Remaining historical supplier/package/traveller/booking/finance migration requires real source files and an approved accounting strategy; the available Confirmed Pax sheet is empty, so records must not be fabricated. Financial requests submitted by the only Owner require another reviewer; with one Owner, Sales submits for Owner review.

## Verification snapshot

- `npm run typecheck`: passed
- `npm run lint`: passed
- `npm run test`: unit/integration checks include invoice calculation and existing booking/payment regression coverage
- `npm run build`: passed with report, health and manifest routes
- Sample quotation, invoice and driver trip sheet PDFs visually inspected

## Next safe step

Follow `docs/complete-manual-acceptance-guide.md`. `npm run test:smoke` uses a disposable local database and production build on port 3105; it never seeds Atlas. Do not treat external activation gates or unfinished manual business acceptance as complete.
