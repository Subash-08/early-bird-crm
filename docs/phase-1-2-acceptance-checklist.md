# EarlyBird Travel CRM — Phase 1, 2, 3 & 4 Acceptance Checklist

Use this document before approving Phase 5. Test only with sample data in the `earlybird` development database.

## Test record

| Item            | Value                           |
| --------------- | ------------------------------- |
| Test date       |                                 |
| Tested by       |                                 |
| Application URL | `http://localhost:3000`         |
| Database        | `earlybird`                     |
| Browser/device  |                                 |
| Final result    | Pass / Pass with changes / Fail |

For each failed check, record the user role, input, expected result, actual result and screenshot in the issue log at the end.

---

# Phase 1 — Leads and Daily Work

## 1. Initial setup and login

- [ ] The `earlybird` database is visible in MongoDB Atlas after refreshing Browse Collections.
- [ ] Owner activation works once and the same activation link cannot be reused.
- [ ] Owner can sign in with the activated email and password.
- [ ] Incorrect password shows a safe error without exposing technical details.
- [ ] Public registration creates only a pending request; Owner must choose the role and activate it before the user can access CRM data.
- [ ] Signing out removes access to CRM pages and APIs.
- [ ] Owner password-recovery link works once and expires safely.

## 2. Staff and role access

- [ ] Owner can create one Sales user and multiple Operations users.
- [ ] Each staff member receives a separate one-time activation link.
- [ ] Sales sees only assigned customers, enquiries, tasks and quotations.
- [ ] Operations sees only the work needed for assigned operational tasks.
- [ ] Operations cannot see customer commercial data, quotations, internal costs or imports.
- [ ] Sales cannot open Team Setup, imports or Owner-only settings.
- [ ] Sales cannot assign work to another person.
- [ ] Deactivating a staff member requires a valid replacement for open work.
- [ ] Open work moves to the replacement and the inactive user cannot sign in.

## 3. Customer management

- [ ] Owner and Sales can create a customer with name and valid phone/email.
- [ ] Invalid phone and email values show clear messages.
- [ ] A customer requires at least phone or email unless explicitly marked for review.
- [ ] Possible duplicate phone/email produces a warning before a second record is created.
- [ ] Customer editing preserves activity history.
- [ ] Operations cannot browse or edit the full customer directory.

## 4. Enquiry capture

- [ ] Owner or Sales can create an enquiry and add details progressively.
- [ ] Destination, source, travellers, dates, budget, services and responsibility are understandable.
- [ ] Exact dates reject a return date before departure.
- [ ] Flexible or unknown dates do not require invented exact dates.
- [ ] Hotel-only enquiries do not require vehicle or flight fields.
- [ ] Transport enquiries capture pickup, drop-off and responsibility.
- [ ] Customer-booked tickets can be recorded for coordination.
- [ ] Imported or unclear enquiries stay marked `Needs review`.
- [ ] A reviewed enquiry can be assigned and activated safely.
- [ ] `On hold` requires a review date and `Lost` requires a reason.
- [ ] Users cannot manually select quote-controlled stages such as `Quote sent` or `Won`.

## 5. Assignment and follow-up

- [ ] Assigning an enquiry creates one notification for the selected Sales user.
- [ ] The assigned Sales user can acknowledge and open the enquiry.
- [ ] Entering a next follow-up date creates one linked task, not duplicates.
- [ ] Changing the date moves the existing task in Tasks and Calendar.
- [ ] Completing, waiting or rescheduling a task requires a note.
- [ ] Reassigning the enquiry transfers open follow-up work and removes old access.
- [ ] No-answer calls remain visible with a new follow-up date.
- [ ] Overdue tasks remain visible until completed or rescheduled.

## 6. Tasks, calendar and notifications

- [ ] Owner can assign tasks to active staff.
- [ ] Sales and Operations can update only their permitted tasks.
- [ ] Tasks display correct status, due time, assignee and linked record.
- [ ] Calendar and task-list dates match.
- [ ] Marking a notification read remains saved after refresh.
- [ ] Running `npm run worker` creates due reminders only once.
- [ ] Overdue work escalates to Owner after the configured time.
- [ ] Completed/cancelled work does not create new reminders.

## 7. Legacy CSV/XLSX import

- [ ] Owner can upload CSV or XLSX; Sales and Operations cannot.
- [ ] Sheet selection and column mapping appear before import.
- [ ] Preview shows warnings for missing or invalid fields.
- [ ] Formula-like cells beginning with `=`, `+`, `-` or `@` are treated as data.
- [ ] Imported records are marked `Needs review` and do not create active reminders.
- [ ] Importing the same committed batch again does not duplicate rows.
- [ ] Files over the allowed row/size limit are rejected clearly.

## 8. Phase 1 responsive and recovery checks

- [ ] Dashboard, lists, forms, drawers and calendar work on desktop.
- [ ] The same pages remain usable on tablet and 375px mobile width.
- [ ] Loading, empty, error and disabled-button states are understandable.
- [ ] Keyboard focus is visible and important controls have clear labels/icons.
- [ ] Refreshing during an open drawer returns to a safe state.
- [ ] Database connection failure shows a safe service message without credentials.

### Phase 1 approval

- [ ] All critical Phase 1 checks passed.
- [ ] Failed non-critical checks are recorded with an agreed correction.
- [ ] Owner approves Phase 1 for continued development.

---

# Phase 2 — Quotations and Customer PDFs

## 9. Quotation request

- [ ] Owner or assigned Sales can request a quotation from an eligible enquiry.
- [ ] Operations cannot request or view quotations.
- [ ] A second active quotation request for the same enquiry is blocked.
- [ ] Hotel-only quotation request succeeds without transport details.
- [ ] Agency-arranged car request requires pickup and drop-off.
- [ ] Customer-booked transport can be recorded without adding it to agency pricing.
- [ ] Exact dates require a valid range; indicative dates accept a clear date label.
- [ ] Missing traveller/service details produce a useful message.
- [ ] Request creates one Owner task and notification.

## 10. Return-for-information workflow

- [ ] Owner can return an incomplete request with a reason and due date.
- [ ] Assigned Sales receives the missing-information task and notification.
- [ ] Sales can update the enquiry and resubmit the quotation request.
- [ ] The earlier request history remains visible.
- [ ] Repeated return/resubmit actions do not create duplicate active tasks.

## 11. Owner quotation preparation

- [ ] Only Owner can prepare or edit quotation content.
- [ ] Owner can enter title, summary, destination, travellers and date scope.
- [ ] Day-wise itinerary supports city, activity, transfer, stay, meals and notes.
- [ ] Accommodation supports property, dates, rooms, occupancy and meal plan.
- [ ] Transport supports car, flight, train, bus and ferry/boat coordination.
- [ ] Responsibility clearly distinguishes Agency arranged from Customer booked.
- [ ] Owner can create multiple named price options.
- [ ] Quantity, price, discount and tax totals calculate correctly.
- [ ] Discount greater than the line amount is blocked.
- [ ] Customer-booked transport cannot be included in agency charges.
- [ ] Inclusions, exclusions, advance, balance, validity and cancellation terms are required before approval.
- [ ] Owner-only supplier cost, margin and internal notes are stored privately.
- [ ] Reusable templates can be saved and applied without overwriting customer/date details incorrectly.
- [ ] Two simultaneous edits produce a safe refresh/conflict message instead of silent overwriting.

## 12. Approval and version control

- [ ] Only Owner can approve a quotation.
- [ ] Approval is blocked when required content is incomplete.
- [ ] Approval freezes the exact customer-facing snapshot.
- [ ] Approved content cannot be edited directly.
- [ ] A change after approval creates a new numbered version.
- [ ] Previous approved, rejected, expired and accepted versions remain unchanged.
- [ ] Only one option/version can be recorded as accepted for the enquiry.
- [ ] Enquiry stages change only through the quotation workflow.

## 13. PDF generation and privacy

- [ ] Approval generates a PDF and changes PDF status to `Ready`.
- [ ] PDF contains customer, dates, travellers, itinerary, stays, transport, options and terms.
- [ ] Totals in PDF match the approved quotation exactly.
- [ ] Internal costs, margin, supplier notes and internal notes are absent from PDF.
- [ ] Sales API/screen also excludes internal cost and margin.
- [ ] Long names and multi-page itineraries do not overlap or clip.
- [ ] Hindi/Unicode text renders readably where used.
- [ ] Draft or failed PDF cannot be downloaded.
- [ ] Signed-out, Operations and unrelated Sales users cannot use a copied PDF URL.
- [ ] A failed PDF job can be retried once by Owner.
- [ ] Restarting the worker processes a previously queued PDF job.

## 14. Manual sharing

- [ ] Sales can open only the approved, ready PDF assigned to them.
- [ ] Manual WhatsApp/email/phone/in-person sharing can be recorded.
- [ ] Sharing record includes date, channel, reference/note and follow-up date.
- [ ] The CRM says `Sent`; it does not falsely claim Delivered or Read.
- [ ] Sharing is blocked until the approved PDF is ready.
- [ ] Recording a share creates the correct customer follow-up task.

## 15. Customer decision

- [ ] Sales can record Accepted, Rejected or Changes requested.
- [ ] Acceptance requires selection of an exact option from the approved snapshot.
- [ ] Accepting an unknown option is blocked.
- [ ] Accepted quote changes the enquiry to `Won`.
- [ ] Acceptance does not claim that advance was received or suppliers were booked.
- [ ] Rejection records a reason and changes the enquiry appropriately.
- [ ] Changes requested creates visible follow-up/revision work.
- [ ] Duplicate or conflicting decisions are prevented.

## 16. Expiry and reassignment

- [ ] Near-expiry quotation creates one Owner/Sales warning without duplicates.
- [ ] An unaccepted quotation becomes `Expired` after its validity date.
- [ ] Accepted, rejected or superseded versions do not expire incorrectly.
- [ ] Reassigning the enquiry transfers access to every quotation version.
- [ ] Previous Sales user immediately loses access, including through an old URL.

## 17. Phase 2 responsive and usability checks

- [ ] Quotation list, builder, preview and action dialogs work on desktop.
- [ ] Builder remains usable on tablet and 375px mobile width.
- [ ] Request errors keep the form open and preserve entered data.
- [ ] Busy buttons prevent accidental double submission.
- [ ] Status badges clearly distinguish request, draft, approval, PDF, sent and decision states.
- [ ] Refreshing shows authoritative server state without duplicate actions.

### Phase 2 approval

- [ ] All critical Phase 2 checks passed.
- [ ] Customer PDF wording and layout are approved by Owner.
- [ ] Internal cost/privacy checks passed using separate Owner, Sales and Operations sessions.
- [ ] Owner approves Phase 2 quotation behaviour for use in the Phase 3 booking workflow.

---

# Phase 3 — Booking and Verified Advance

## 18. Accepted quotation to booking

- [ ] An accepted quotation shows **Create booking** for Owner and assigned Sales.
- [ ] Creating a booking copies the exact accepted quotation version, selected option, amount, currency and advance terms.
- [ ] Repeating **Create booking** opens the same booking and does not create a duplicate.
- [ ] A rejected, expired, superseded or undecided quotation cannot become a booking.
- [ ] Quote acceptance does not automatically mark payment received or suppliers confirmed.
- [ ] Reassigning the enquiry transfers booking access to the replacement Sales user.

## 19. Payer, travellers and dates

- [ ] Payer details can differ from traveller details.
- [ ] The booking requires exactly one lead traveller.
- [ ] Additional adults and children can be recorded without making all optional fields compulsory.
- [ ] An end date before the start date is blocked with a clear message.
- [ ] Long names, phone numbers, email addresses and destination text remain readable.
- [ ] Operations cannot see payer billing details or the commercial agreement snapshot.

## 20. Invoice and customer PDF

- [ ] Only Owner can issue the invoice.
- [ ] Invoice number, booking number, payer, amount, currency, advance and payment terms are correct.
- [ ] Invoice PDF contains no supplier cost, margin, internal note or private payment evidence.
- [ ] Sales can download the issued invoice for manual sharing.
- [ ] Operations, unrelated Sales and signed-out users cannot use a copied invoice URL.
- [ ] An unpaid issued invoice can be voided into a correction draft without deleting history.
- [ ] An invoice with verified payment allocation cannot be casually voided.

## 21. Payment submission and verification

- [ ] Owner or assigned Sales can record a reported payment.
- [ ] Amount conversion is exact to two decimal places; invalid or zero amounts are blocked.
- [ ] A transaction reference or private evidence is required.
- [ ] JPG, PNG or PDF evidence within the size limit works; other/oversized files are rejected.
- [ ] A submitted screenshot remains **Pending verification** and does not increase paid totals.
- [ ] Only Owner can verify or reject a submitted payment.
- [ ] Rejection requires a reason and creates no customer credit.
- [ ] Currency mismatch is blocked during verification.
- [ ] Reusing the same transaction reference is blocked.
- [ ] Retrying verification does not double-credit the customer or create a second receipt.

## 22. Partial, split and excess payments

- [ ] A partial payment updates the verified total but does not release operations before the agreed advance.
- [ ] Several verified instalments add to the exact expected total.
- [ ] Each verified payment creates one unique downloadable receipt.
- [ ] Receipt contains verified amount, payer, method/reference, booking and remaining balance.
- [ ] Overpayment shows zero outstanding plus separate unapplied credit, never a negative balance.
- [ ] A payment made before invoice issue remains reviewable without inventing an invoice date.
- [ ] Rejected or reversed payments do not remain included in verified totals.

## 23. Advance rules and operations release

- [ ] Advance due and balance due dates remain visible to Owner and Sales.
- [ ] Owner can amend the agreed advance only with a reason; previous values remain in history.
- [ ] Operations release is blocked while verified payments are below the agreed advance.
- [ ] Zero-advance or exceptional release requires an explicit Owner reason.
- [ ] Only an active Operations member can be assigned.
- [ ] Successful release creates exactly one checklist and one set of linked tasks.
- [ ] Repeating release creates no duplicate checklist, task or notification.
- [ ] Booking says **Pending confirmation** after release and does not falsely claim hotels, vehicles or suppliers are confirmed.

## 24. Operations privacy and access

- [ ] Before release, Operations cannot see the booking.
- [ ] After release, only the assigned Operations member can see it.
- [ ] Operations sees customer contact, service dates, route/service summary and checklist.
- [ ] Operations does not see invoices, payment amounts, payer billing details, payment evidence or quotation prices.
- [ ] Opening protected document URLs directly still enforces the same permissions.
- [ ] Deactivating/replacing an assigned user preserves history and removes old access.

## 25. Reversal, reminders and recovery

- [ ] Reversing a verified payment records a reason and preserves the original ledger event.
- [ ] Reversal after operations release does not silently cancel work; it creates an Owner financial-exception task.
- [ ] Pending-verification, overdue-advance and balance reminders appear once.
- [ ] Running `npm run worker` repeatedly does not duplicate reminders.
- [ ] Refreshing or double-clicking actions does not create duplicate bookings, payments, receipts or release tasks.
- [ ] Two stale Owner tabs produce a conflict/refresh message instead of silently overwriting newer data.
- [ ] PDF failure leaves the booking/payment data saved and shows an error rather than a false success.

## 26. Phase 3 responsive and usability checks

- [ ] Booking list, detail, payment review and release controls work on desktop.
- [ ] The same flow remains usable at tablet and 375px mobile width.
- [ ] Empty, loading, validation, permission and network-error states are understandable.
- [ ] Buttons use clear action words and prevent accidental duplicate submission.
- [ ] Owner, Sales and Operations can complete their permitted work without technical knowledge.

### Phase 3 approval

- [ ] Owner completes one normal booking from acceptance through operations release.
- [ ] Sales completes invoice sharing and split-payment submission.
- [ ] Operations confirms the limited assigned-trip view contains enough information and no financial data.
- [ ] All critical Phase 3 checks pass; remaining issues have owners and target dates.
- [ ] Owner approves Phases 1–3 and decides whether Phase 4 planning/coding may begin.

---

# Phase 4 — Arrangements and Trip Execution

## 27. Suppliers, services and vehicles

- [ ] Supplier and vehicle records validate duplicates, contacts, ownership, status and capacity.
- [ ] Customer-booked services contain no agency supplier cost.
- [ ] Sales can prepare Draft/On hold services but Owner confirms agency commitments.
- [ ] Confirmed service requires a reference; hold requires expiry.
- [ ] Unavailable services and expired holds create clear review alerts once.

## 28. Trip assignment and driver access

- [ ] Car segments require active driver and available vehicle.
- [ ] Overlap checks include driver, vehicle and travel buffer.
- [ ] Vehicle capacity covers recorded travellers.
- [ ] Driver sees only personally assigned trip details and no financial/private data.
- [ ] Deactivation/replacement transfers active work and immediately removes old access.

## 29. Readiness, documents and incidents

- [ ] Readiness is created once and blocked items prevent completion.
- [ ] Private traveller files enforce type, size and Owner/assigned-Sales access.
- [ ] Final itinerary, voucher, manifest and driver trip sheet match confirmed data.
- [ ] Driver reports incidents only for assigned work; urgent alerts reach coordinators.
- [ ] Open incidents prevent completion and resolutions retain actor/time/reason.

## 30. Controlled driver actions

- [ ] Actual time, odometer, notes, expense evidence and logistics requests respect Owner-granted capabilities.
- [ ] Driver requests never directly change route, supplier cost or financial totals.
- [ ] Revoked capability blocks an already-open form on its next request.
- [ ] Offline/failed saves show an error and do not create false completion.

## 31. Exceptional collection and cash custody

- [ ] Driver report remains unverified until Owner reviews it through Phase 3 payment verification.
- [ ] Duplicate collection retry is blocked and verification creates one receipt.
- [ ] Cash handover is separate from customer payment and never adds duplicate credit.
- [ ] Partial, rejected and complete handover states calculate correctly.

## 32. Trip completion

- [ ] Unconfirmed services, incomplete trips, readiness blockers or incidents prevent completion.
- [ ] Successful completion creates one feedback task.
- [ ] Trip completed remains separate from financial settlement.
- [ ] Owner, Sales and Operations complete the workflow on desktop and mobile.

### Phase 4 approval

- [ ] All critical Phase 4 checks passed.
- [ ] Operations confirms My trips is clear enough for low-technical-knowledge staff.
- [ ] Owner approves Phases 1–4 and decides whether Phase 5 may begin.

---

# Issue log

| ID  | Phase/check | Role | Input/action | Expected | Actual | Severity                 | Screenshot/file | Status |
| --- | ----------- | ---- | ------------ | -------- | ------ | ------------------------ | --------------- | ------ |
| 1   |             |      |              |          |        | Critical / Major / Minor |                 | Open   |
| 2   |             |      |              |          |        | Critical / Major / Minor |                 | Open   |
| 3   |             |      |              |          |        | Critical / Major / Minor |                 | Open   |

## Severity guide

- **Critical:** unauthorized data access, wrong customer price, lost records, duplicate acceptance, unusable login or inability to complete the main workflow.
- **Major:** important workflow has a workaround but is confusing or unreliable.
- **Minor:** visual, wording or convenience issue that does not affect correctness.

## Final sign-off

| Role              | Name | Decision                    | Date | Notes |
| ----------------- | ---- | --------------------------- | ---- | ----- |
| Owner             |      | Approved / Changes required |      |       |
| Sales tester      |      | Approved / Changes required |      |       |
| Operations tester |      | Approved / Changes required |      |       |
