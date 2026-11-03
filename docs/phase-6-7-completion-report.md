# Phase 6–7 completion and external activation report

Implemented in code: Owner-managed role changes with last-owner/session/reassignment safety; Operations capability grants; server-side filtered pipeline/workload/operations/financial reports; role-scoped CSV/XLSX exports with formula safety; report definitions; PWA manifest/install registration and privacy-safe offline fallback; fixed/independently scrolling navigation; security headers; health endpoint; production configuration validation; integration coverage and the complete manual acceptance guide.

Not honestly completable without external decisions/accounts/data:

- A public production URL, TLS/domain, scheduler and monitoring need the selected hosting account.
- Cloudinary activation needs real credentials and an approved decision about which assets are public versus private. Sensitive evidence remains authenticated in MongoDB and is intentionally not pushed to public media storage.
- Atlas backup retention and restore rehearsal depend on the chosen Atlas plan and production project.
- Supplier/package/traveller/booking/finance historical migration needs real source files, stable references and an approved opening-balance versus transaction-history strategy. The supplied Confirmed Pax sheet is empty; the CRM must not invent those records.
- Final tax/invoice/refund language, bank details, branding and cancellation terms need Owner/accountant approval.

These are release activation gates, not hidden placeholder functionality. See `complete-manual-acceptance-guide.md`.
