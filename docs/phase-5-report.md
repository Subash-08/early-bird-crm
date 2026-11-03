# Phase 5 implementation report

Phase 5 adds a booking-level **Money & changes** workspace. Business acceptance remains pending until the agency tests real scenarios with fictional development records.

## Delivered

- Supplier bills, partial payment allocations, credits, due dates and private evidence.
- Approved driver expenses and reimbursements without counting the same expense twice.
- Customer credit, approved refunds and actual refund instalments.
- Supplier expected recovery, received cash and accepted credit, independently from customer refunds.
- Booking amendments, partial/full cancellation, Owner review and recorded customer reconfirmation.
- Immutable original quote/invoice history, customer adjustment event and protected printable adjustment (browser Print > Save as PDF).
- Selected affected service/trip/traveller handling, remaining lead traveller, supplier-review task and amendment readiness check.
- Append-only posted financial history with linked reversals; no delete or direct paid-total editing action.
- Exact rate conversion using integer arithmetic; original currency/rate/date/source retained. Estimated margin is separated from final profit.
- Explicit financial-close/reopen action with reconciliation gates, recorded reason and notifications.
- Reused responsive design, contextual field explanations, one form at a time, review comments and retry/error feedback.
- Added role-based mobile bottom navigation, a role-safe More sheet, mobile page search, safe-area spacing, full-screen form drawers and larger touch targets. See `mobile-navigation-and-screens.md`.

## Approval model

Phase 5 financial entries and commercial changes require a different Owner reviewer. With one Owner, Sales submits and Owner reviews. Owner-submitted requests require another active Owner. Drivers cannot access the finance workspace. Existing owner payment verification in Phase 3 remains the original workflow; it is not a second-owner-only workflow.

## Earlier-phase fixes from this review

- Replaced driver booking financial-field denylist with an explicit safe-field allowlist; removed private identity fields from driver traveller payloads.
- Removed internal quote costs from accepted quote and booking snapshots sent to Sales.
- Restricted driver activity feeds so financial audit messages cannot leak through linked booking history.
- Added shared booking-write serialization between operational/payment and settlement mutations.
- Added driver/vehicle schedule locks for simultaneous assignment and existing-buffer handling.
- Prevented moving an existing trip segment into another booking through an ID change; removed old driver access when reassignment leaves no active trips.
- Fixed automatic-task completion comparing absent links with empty form fields.
- Preserved refunded amounts in payment-derived outstanding calculations and blocked payment reversals that would invalidate refund commitments.
- Blocked cancelled booking release/recompletion and filtered cancelled travellers/services from newly generated travel documents.
- Added focus/reconnect/visible polling for in-app updates and an offline banner.
- Rejected negative/malformed money and excess decimal precision rather than silently truncating it.

## Scope and practical limits

- Cancellation changes CRM records and creates supplier follow-up work; it does not call external booking systems. Coordinator records supplier confirmation/penalties and updates affected schedules/documents.
- Original tax invoices are preserved. The printable adjustment is a customer agreement adjustment; statutory credit-note/tax treatment needs accountant-approved configuration before launch.
- Phase 5 supports the explicitly listed two-decimal currencies. Other currency exponents need a currency-aware money migration across earlier phases before enablement.
- Supplier recovery credit is recorded and distinguished from cash; spending that credit across other bookings is not implemented.
- Documents and private evidence currently use protected MongoDB storage. Cloudinary public media integration remains outstanding; credentials alone do not activate it.
- PWA installation, service worker and OS push are planned, not implemented. See `pwa-and-notification-plan.md`.
- Full reports/exports, remaining historical imports and production deployment remain Phases 6–7.
- A safe test script uses disposable local demo data, never production/Atlas seed data.

## Verification

See `phase-5-verification.md` for actual command results and the browser test outcome. See `phase-5-manual-test.md` for business checks. No automated suite can prove every future exception; new business cases should be recorded and added to regression tests.
