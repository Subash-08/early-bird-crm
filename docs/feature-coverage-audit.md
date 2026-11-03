# Feature coverage audit after administration/reporting completion

This maps the requested application to current code and remaining delivery work. “Implemented” means code exists; agency manual acceptance is separate. It does not mean production launch is approved.

| Requested capability | Current evidence / status | Remaining review |
| --- | --- | --- |
| Owner, Sales, multiple Operations staff | Authentication, activation/recovery, safe role changes, last-owner protection, session revocation, reassignment and explicit Operations capabilities | Real separate-session business acceptance |
| Capture enquiries, assign Sales, follow up | Customer/enquiry modules, debounced role-safe customer lookup, tasks, reminders and notifications | Agency workflow and historical import validation |
| Owner prepares/approves quotation, Sales shares | Versioned quotation flow and protected PDFs | Source package content, branding and cancellation terms |
| Local, domestic/international, hotel-only, customer-held tickets | Quote/service responsibility and transport modes | Actual hotel/ticket/permit requirements; no live ticketing integration |
| Accept quote, create booking, verify advance | Booking/payment integration tests and immutable agreement snapshot | Real payment evidence and accountant review |
| Suppliers, hotels, vehicles, drivers and travel documents | Operations services, readiness, role-limited documents and schedule checks | Real dispatch scenarios, long itineraries and device tests |
| Driver collections and expenses | Report/Owner verification/cash custody; Phase 5 expense settlement | Partial handover/discrepancy business review |
| Supplier payments, refunds, cancellation and settlement | New Money & changes module and integration tests | Phase 5 manual checklist |
| Tasks and notifications at business handoffs | Existing reminder worker plus Phase 5 review/due tasks; visible polling added | Production scheduler, failure monitoring and device behaviour |
| CSV/Excel existing customer/enquiry import | Preview/mapping/review/duplicate workflow | Historical supplier/package/traveller/booking and finance migration: Phase 6 |
| Reports, CSV/Excel exports | Server-filtered pipeline/workload/operations/finance reports plus role-scoped CSV/XLSX exports | Manual reconciliation against agency records |
| MongoDB Atlas | Official MongoDB driver, transactions and indexes | Backup/restore and production network/config validation |
| Cloudinary images/assets | Environment placeholders and architecture plan only | Actual public-image upload/usage integration is outstanding; private evidence is stored in MongoDB with authenticated access |
| Mobile-friendly PWA | Responsive fixed navigation, manifest/install registration and privacy-safe generic offline fallback | Device/browser installation acceptance; no OS push yet |
| Public/live hosted CRM | Production build, health endpoint, configuration validator and deployment runbook | External host/domain/secrets, scheduler, backups and live acceptance |

## Important limits to review before launch

- Existing money formatting assumes two decimal places. Do not activate JPY/KWD-like currency exponents without a consistent migration.
- Customer selection now performs a bounded server lookup, but existing directory snapshots still use record caps (for example 1,000 bookings); full pagination and large-data performance belong in the reporting/launch work. Do not interpret a capped list as an agency-wide report.
- Private-upload validation has been strengthened for Phase 5 evidence. Earlier upload endpoints need equivalent file-content checks and production storage/retention review during security acceptance.
- Earlier financial receipts/PDFs need accountant-approved wording and long-content layout testing; printed agreement adjustments are not automatically statutory tax credit notes.
- Future push notifications and external messaging are not included in the present in-app notification scope.
- Full financial allocation across multiple bookings/invoices is not implemented; current payments are attached to a booking. Keep shared bank transfers separated into reviewed booking entries with traceable references until that feature is added.

## Test evidence

Unit and temporary-replica-set integration tests exercise quotation, booking, operations and settlement paths. `scripts/smoke-phase5.ts` supplements them with actual browser login, persisted UI approval/submission, role restrictions and mobile checks. These tests use synthetic data, not customer information. See the verification report for results rather than assuming all checklist items passed.
