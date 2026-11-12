# Current project context

Updated: 4 November 2026

## Current state

**Team & setup → View activity** opens an Owner-only page for the selected team member, with date filters for due tasks, logged completions and contact attempts, driver assignments, and attendance. Sales and Operations have **My attendance** with the same period presets and their own totals. Historical calls and completions without a dated event are not inferred.

The Owner attendance calendar now shows dated overviews and supports named office holidays. Staff can request off-site attendance with work location, hours, reason and an optional reference. Owner approval records off-site work as present without replacing original clock events; request notifications link back to Attendance.

Attendance includes an editable office map with a live radius preview and a staff map with an on-demand location preview. The preview is held in the browser; attendance checks still use a fresh location and the server's saved policy.
Attendance panels and forms adapt to narrow screens, with wide tables scrolling inside their own panels. The shared workspace loading skeleton now follows the mobile header and bottom navigation layout at phone widths.

Enquiry and task usability fixes now keep the selected customer name visible, prefer the active Sales user for new Owner-captured enquiries, label assignment clearly, send an explicit enquiry field allowlist, mark conditional follow-up/task-note requirements and convert Zod validation failures into plain user messages. The implemented role workflow is documented in `docs/enquiry-to-trip-role-workflow.md` with a browser-viewable chart in `docs/enquiry-to-trip-role-workflow.html`.

The complete local workflow covers enquiry, quotation, booking, verified advance, supplier/vehicle coordination, driver assignments, My trips, readiness/private documents, operational PDFs, incidents, collection/custody, gated trip completion, settlement, Owner-managed role transitions, filtered reports and CSV/XLSX exports. The responsive shell now includes fixed independently scrolling navigation and a privacy-safe installable PWA/offline fallback.

The visual system uses deep navy, sea blue, warm sand and coral with Plus Jakarta Sans and Lucide icons. It intentionally differs from the old green demo while keeping the clean, friendly density the user preferred.

The invoice workflow now includes an Owner-only versioned template, booking-specific billing/service addresses, HSN charge and note rows, CGST/SGST/IGST/TCS calculation, financial-year numbering, verified-payment summary, reference-style Letter PDF, optional travel summary, customer invoice history and audited renamed print copies that keep the original invoice number and data. See `docs/invoice-template-and-billing-plan.md` and `docs/invoice-template-manual-test.md`.

The main workspace now has App Router URLs for all 13 feature areas. The persistent desktop/mobile shell stays mounted during navigation, the content area has a route loading state, role-forbidden direct URLs are rejected, and the CRM snapshot API returns feature-scoped data. Query-aligned MongoDB indexes, stale-response protection, adaptive background refresh and deferred feature chunks reduce unnecessary work. See `docs/app-router-and-performance-optimization.md`.

Attendance Phase 1 is now an office-only module at `/attendance`: the Owner configures and monitors attendance but does not clock in, while active Sales and Operations staff can use a mobile-friendly, GPS-validated check-in/out flow. The server owns the timestamp, checks location freshness/accuracy/geofence, records immutable events, prevents duplicate daily sessions, supports Owner-reviewed corrections, in-app correction alerts, daily CSV export and relevant MongoDB indexes. The initial editable office pin is `11.780343, 77.7937358`; Owner must verify it before real use. See `docs/attendance-phase-1.md`. Field/trip attendance, offline writes, biometrics, payroll and tracking remain deliberately deferred.

Primary work queues now use bounded server pagination (10/20/50), server search and important status/assignee/date filters. Customer cards open an authorized `/customers/[id]` page instead of loading all customer history into the directory. Task edits send an explicit schema field allowlist. See `docs/optimization-and-detail-pages-report.md` and `docs/manual-test-with-current-accounts.md`.

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
