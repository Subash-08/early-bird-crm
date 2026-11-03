# Complete manual acceptance guide — Owner, Sales and Operations

This is the final business acceptance script for the complete CRM. Run it in a staging/development database with fictional people, amounts and documents. Do not use real passports, bank evidence or customer contact details until production security and retention are approved.

Record every result as **Pass**, **Fail**, **Blocked** or **Not applicable**, with the tester, date, role, record number, expected result, actual result and screenshot/error text.

## Test scope and current account roster

Use the accounts below only with fictional test data. Never put passwords in this file, screenshots, issue reports or chat.

| Test identity | Current account | Role | Purpose |
| --- | --- | --- | --- |
| OW1 | `admin@example.com` | Owner | Agency administration, approvals, finance and final review |
| SA1 | `user@gmail.com` | Sales | Enquiry qualification, follow-up, quote request and customer communication |
| OP1 | `staff@gmail.com` | Operations | Existing driver/operations account |

Before starting the full acceptance run, create four more fictional Operations accounts so schedule conflicts, reassignment, least-privilege capabilities and concurrent trips can be tested properly:

| Test identity | Suggested name | Suggested capability set | Main test duty |
| --- | --- | --- | --- |
| OP2 | Operations Two | Trip notes + trip timings | Second driver and overlapping-schedule checks |
| OP3 | Operations Three | Expense evidence | Driver expense and restricted-action checks |
| OP4 | Operations Four | Logistics requests | Supplier/logistics exception checks |
| OP5 | Operations Five | All optional Operations capabilities | Backup driver, reassignment and coordinator tests |

All five Operations accounts remain the same **operations** role. Capabilities only enable explicitly permitted operational actions; they must never reveal customer finance, supplier margin, quotations or the general customer directory.

### Evidence sheet to maintain while testing

Create one test evidence row for every numbered check:

| Field | Required value |
| --- | --- |
| Test ID | For example `E2E-01.07` |
| Date/time | Local test time |
| Environment | Local, staging or production smoke |
| Browser/device | Browser name, version and screen size |
| Signed-in account | OW1, SA1 or OP1–OP5 |
| Record identifiers | Customer, enquiry, quote, booking or task number |
| Expected result | What this guide says should happen |
| Actual result | What actually happened |
| Result | Pass, Fail, Blocked or Not applicable |
| Evidence | Screenshot/video filename and relevant error text |
| Severity | Critical, High, Medium or Low when failed |

Never approve production when a failed test exposes another customer's data, permits an unauthorized financial action, loses a record, creates duplicate money/booking data or reports a false success.

## 1. Prepare the test environment

1. Use a database name that clearly identifies staging or development.
2. Run `npm install`, `npm run db:setup`, `npm run db:seed-demo`, `npm run typecheck`, `npm run lint`, `npm run test` and `npm run build`.
3. Start the app with `npm run dev` and the reminder worker with `npm run worker` in a separate terminal.
4. Open separate browser profiles for Owner, Sales and each Operations user. Never test different roles in tabs sharing one browser profile.
5. Confirm `/api/health` returns `status: ok` without database names, credentials or customer data.
6. Confirm the browser console and server terminal contain no secrets, activation tokens, passwords, private files or full MongoDB URIs.
7. In a normal browser profile, sign in, stop the server, start it again and reload `http://localhost:3000`. Confirm the session remains signed in. Do not switch to `127.0.0.1`; it is a different cookie host.

## 2. Create and activate accounts

### 2.1 Create Sales

1. Sign in as Owner.
2. Open **More → Team & setup → Invite team member**.
3. Enter a fictional name and unique email, choose **sales**, and save.
4. Copy the one-time activation link privately. Confirm the account is **invited**, not active.
5. Open the link in the Sales browser profile, create a password of at least 12 characters and sign in.
6. Confirm Sales sees Today, Enquiries, Customers, Quotations, Bookings, Money & changes, Tasks, Reports and Notifications.
7. Confirm Sales cannot see Import data or Team & setup.

### 2.2 Create five Operations accounts

Keep OP1 and create OP2–OP5 using the roster above. Five accounts are recommended because one account cannot prove assignment isolation, driver overlap protection or reassignment behaviour.

1. Choose **operations**.
2. Grant only the capabilities required for that test user: trip notes, trip timings, expense evidence and/or logistics requests.
3. Activate every account in a separate browser profile or an isolated browser profile that does not share cookies with another role.
4. Confirm each Operations user sees Today, Trips, Tasks, Alerts and Reports, but cannot browse customers, quotations, finance, imports or Team & setup.
5. Record which optional capabilities were assigned to OP1–OP5. Do not give all permissions to every account because the restricted-action tests need limited users.

### 2.3 Test self-registration and Owner approval

1. From the signed-out page choose **New team member? Request an account**.
2. Enter a fictional name, unique email and a password of 12–128 characters. Confirm the success message says Owner approval is required.
3. Attempt to sign in before approval. It must fail with an awaiting-approval/inactive message and show no CRM data.
4. Sign in as Owner. Confirm an in-app alert is present and the new person appears under **More → Team & setup** with status **pending**.
5. Open the account, verify the person, choose the correct role and capabilities, change Status to **active**, and save.
6. Sign in using the password created during registration. Confirm navigation and data visibility match the selected role.
7. Repeat with another request and set it to **inactive**. It must never gain CRM access.

Safety expectations: public registration never chooses a trusted role, never activates itself and never returns CRM data. The temporary Sales value on a pending database record is only a non-authorizing placeholder; the Owner must deliberately select the final role.

### 2.4 Activation and recovery edge cases

- Reusing an activation link must fail.
- An expired or altered token must fail without revealing whether an email exists.
- Passwords below 12 characters or above 128 characters must fail.
- Owner password reset creates a new one-time link and invalidates earlier links.
- Resetting a password must revoke prior sessions.
- An inactive account cannot activate or sign in.
- Duplicate staff email must be rejected.
- An invited account cannot be manually marked active; it must activate using its link.
- A duplicate self-registration email is rejected without replacing credentials.
- A pending account can be assigned any role by an Owner without requiring work reassignment because it owns no active work.

## 3. Owner account and role administration

### 3.1 Normal changes

- Owner can edit staff name, status and Operations capabilities.
- Email remains immutable; replacing an email requires a new account.
- Removing an Operations capability immediately removes the related action on the next server request/refresh.
- Changing Sales to Owner keeps assigned Sales work and revokes existing sessions.
- Changing Sales/Owner to Operations requires a different active Owner/Sales replacement; customers, enquiries, open tasks, quotations and bookings move to that replacement.
- Changing Operations to Sales/Owner requires a different active Operations replacement; active trip segments and booking Operations assignments move to that replacement.
- Deactivating Sales requires reassignment of open commercial work.
- Deactivating Operations requires reassignment of active trips.
- Historical audit records keep the original actor name; completed records are not rewritten.

### 3.2 Protection edge cases

- A user cannot change their own role or deactivate themselves.
- The last active Owner cannot be demoted or deactivated.
- The replacement cannot be the same account, inactive, invited or the wrong role family.
- Two Owners editing the same staff version: the second save must receive a conflict and refresh.
- After role change/deactivation, an already-open old session must lose access.
- Direct API requests using old record IDs must be rejected, not merely hidden in navigation.

## 4. Connected production simulation

### Run this before isolated edge cases

This is the primary acceptance journey. It proves that records created in one module correctly create work in the next module. Complete it in order and keep the same record numbers throughout.

### Simulation data set

Create these five fictional enquiries. Use clearly fictional phone numbers, email addresses, passport references, payment references and documents.

| Journey | Enquiry | Services | Assigned delivery team | Main coverage |
| --- | --- | --- | --- | --- |
| J1 | Three-day Kerala local trip | Hotel + agency car | OP1, backup OP5 | Normal enquiry-to-completion path |
| J2 | Airport transfer and hotel | Hotel + agency car | OP2 | Vehicle/driver overlap and supplier hold |
| J3 | Domestic multi-city trip | Customer-held train + agency cars/hotels | OP3 and OP4 | Responsibility split, expenses and logistics |
| J4 | International holiday | Customer-held flight + hotels + local transfer | OP5 | Currency, documents, timezone and readiness |
| J5 | Family trip that changes | Hotel + car + optional activity | OP1 and OP2 | Amendment, cancellation, refund and settlement |

### E2E-01 — capture, assign and qualify all five enquiries

1. **E2E-01.01 — OW1:** Create one customer for J1. Expected: the customer is saved once and appears in bounded customer search.
2. **E2E-01.02 — OW1:** Attempt the same phone/email again. Expected: duplicate warning; no silent duplicate.
3. **E2E-01.03 — OW1:** Create J1 enquiry with minimal known information, assign SA1 and set a first follow-up. Expected: SA1 receives one task and one in-app notification.
4. **E2E-01.04 — SA1:** Acknowledge J1, record call outcome, destination, travellers, flexible/exact dates, budget basis, hotel preference, rooms, pickup/drop-off, services, special requirements, next action and follow-up. Expected: enquiry and linked follow-up remain synchronized.
5. **E2E-01.05:** Repeat for J2–J5 using different sources and date modes. Expected: pipeline/source/stage reports later count all five correctly.
6. **E2E-01.06 — OP1:** Attempt to open a copied customer/enquiry URL or call customer search. Expected: 403/no customer directory or commercial notes.
7. **E2E-01.07 — SA1:** Mark one temporary test enquiry Lost without a reason, then On hold without follow-up. Expected: validation blocks both. Add valid values and confirm obsolete follow-up handling.

### E2E-02 — prepare package templates and quotations

1. **E2E-02.01 — SA1:** Request quotations for J1–J5 only after the required enquiry details are complete. Expected: Owner work/notification is created; Sales cannot enter final pricing or approve.
2. **E2E-02.02 — OW1:** Open J1 quotation and complete itinerary days, stays, agency car transport, inclusions, exclusions, terms, validity and at least two customer price options.
3. **E2E-02.03 — OW1:** Enter `Kerala local · 3 days` in Package templates and select **Save current quote**. Expected: reusable template appears; it does not claim live price or availability.
4. **E2E-02.04 — OW1:** Apply it to a separate test quote. Expected: reusable content loads while the current customer, dates and traveller-specific values remain correct. Recheck every rate and availability.
5. **E2E-02.05 — OW1:** Prepare J2–J5. Mark customer-held train/flight as customer responsibility and zero agency supplier charge. Add international currency/timezone/document-readiness notes to J4.
6. **E2E-02.06 — OW1:** Return one quote with a reason; SA1 adds information and resubmits. Expected: reason/history remains visible and version handling is preserved.
7. **E2E-02.07 — OW1:** Approve all valid quotes. Expected: immutable approved versions and customer-safe PDF jobs; no internal margin/supplier cost/private note in PDF.
8. **E2E-02.08 — SA1:** Download, review and record manual sharing method/time for each quote. Expected: CRM records the action but never claims WhatsApp/email delivery or customer reading.
9. **E2E-02.09 — SA1:** Record exact customer option/version acceptance for J1–J5. Expected: an expired or superseded option cannot be accepted.

### E2E-03 — convert to bookings and verify money

1. **E2E-03.01 — OW1/SA1 as permitted:** Convert each accepted quote. Expected: exactly one booking per accepted quote; retry returns the same booking.
2. **E2E-03.02:** Add traveller details and exactly one lead traveller. Test missing and duplicate lead selection. Expected: invalid traveller set is blocked.
3. **E2E-03.03 — OW1:** Issue invoice for J1 and inspect booking number, currency, customer details, agreed option and approved wording. Repeat representative checks for J3 and J4.
4. **E2E-03.04 — SA1:** Submit a partial advance for J1 with fictional evidence/reference. Expected: pending verification; no confirmed cash/balance change yet.
5. **E2E-03.05 — OW1:** Reject it with a reason. Expected: no balance change and immutable rejection history.
6. **E2E-03.06 — SA1:** Submit corrected evidence with a unique reference. **OW1:** verify it. Expected: verified total and outstanding balance update exactly once.
7. **E2E-03.07:** Verify an amount below the required advance. Expected: Operations release remains blocked. Verify the remainder and release J1 to OP1 and OP5.
8. **E2E-03.08:** Release J2 to OP2, J3 to OP3+OP4, J4 to OP5 and J5 to OP1+OP2. Expected: each assigned Operations user receives relevant tasks/notifications only.
9. **E2E-03.09 — OP3:** Attempt invoice/payment/PDF finance URL. Expected: 403 and no amounts/evidence.

### E2E-04 — suppliers, arrangements, vehicles and dispatch

1. **E2E-04.01 — OW1:** Create fictional hotel, transport and activity suppliers; create own/vendor vehicles with registration and capacity.
2. **E2E-04.02:** For every released booking, initialize Operations once. Expected: required readiness/checklist records are created once, not duplicated on retry.
3. **E2E-04.03:** Add hotel, car, activity and customer-held transport arrangements with responsibility, confirmation state, reference and hold deadline.
4. **E2E-04.04:** Assign trip segments to OP1–OP5 according to the simulation table. Expected: only assigned staff can see the relevant trip.
5. **E2E-04.05:** Deliberately assign OP1 or the same vehicle to overlapping segments in J1/J5. Expected: driver/vehicle overlap blocked. Reassign to OP2/OP5 and save.
6. **E2E-04.06:** Assign too many travellers to a low-capacity vehicle. Expected: blocked. Correct vehicle/capacity and save.
7. **E2E-04.07:** Generate itinerary, supplier voucher, passenger manifest and driver sheet. Expected: each document contains only audience-appropriate information.
8. **E2E-04.08 — OP1–OP5:** Each user checks Today, Trips, Tasks and Alerts. Expected: no other driver's trip, general customer directory, supplier cost or agency finance.

### E2E-05 — run live trip events with five Operations users

1. **E2E-05.01 — OP1:** Update J1 assigned progress/times and notes. Expected: permitted changes save with audit history.
2. **E2E-05.02 — OP2:** Attempt OP1's J1 update. Expected: denied unless OP2 is explicitly assigned.
3. **E2E-05.03 — OP3:** Add permitted fictional expense evidence to J3. Expected: review workflow created; OP3 cannot approve it.
4. **E2E-05.04 — OP4:** Submit a logistics request for J3. Expected: coordinator/Owner alert; OP4 cannot change commercial agreement.
5. **E2E-05.05 — OP5:** Update J4 trip progress and readiness. Expected: customer-held flight remains coordination-only and is not charged as agency transport.
6. **E2E-05.06:** Report normal, high and urgent incidents on different journeys. Expected: urgency and customer-contact status are retained; urgent unresolved incident blocks completion.
7. **E2E-05.07 — OW1:** Resolve incidents with notes. Expected: original incident/history remains.
8. **E2E-05.08:** Remove/reassign an Operations user from an active journey. Expected: active segments/tasks move to a different active Operations user, obsolete access is removed and history remains.

### E2E-06 — driver collection, handover and separation of duties

1. **E2E-06.01 — OP1:** Report a fictional cash collection on assigned J1. Expected: pending verification only; customer balance does not change.
2. **E2E-06.02 — OP2:** Try to report collection on unassigned J1. Expected: denied.
3. **E2E-06.03 — OW1:** Match and verify the OP1 report exactly once. Expected: one customer payment; retry cannot duplicate it.
4. **E2E-06.04:** Record partial handover, verify remaining custody, then final handover. Expected: custody never becomes negative or creates a second payment.
5. **E2E-06.05:** Test amount/currency/method mismatch and over-handover. Expected: each invalid action is blocked with useful guidance.

### E2E-07 — changes, cancellation, supplier money and settlement

1. **E2E-07.01 — SA1:** Submit a change request for J5. **OW1:** review revised services/total. Expected: nothing changes until customer decision is recorded.
2. **E2E-07.02:** Record customer decline on one test amendment. Expected: original agreement stays active.
3. **E2E-07.03:** Submit and accept a partial cancellation. Expected: selected service/traveller is removed while a valid lead and remaining service persist.
4. **E2E-07.04:** Test full cancellation with retained charge and explicit customer confirmation.
5. **E2E-07.05 — OW1:** Record supplier bills, partial supplier payments, expense decision, supplier credit, expected recovery and received recovery. Expected: separate ledgers/history and no double allocation.
6. **E2E-07.06:** Approve customer refund and pay it in two instalments. Expected: refund and supplier recovery remain independent.
7. **E2E-07.07:** Generate printable agreement adjustment. Expected: previous/new value and reference are shown; original invoice remains unchanged.
8. **E2E-07.08:** Attempt closure with pending refund, bill, expense, recovery, cash custody, incident or task. Expected: closure blocked with the outstanding reason.
9. **E2E-07.09:** Reconcile every blocker and close settlement. Expected: closed once, no normal new entries until audited reopen.

### E2E-08 — reports, export, audit and final reconciliation

1. **E2E-08.01 — OW1:** Filter Reports to the test date range. Reconcile five enquiries, accepted quotes, bookings, departures, incidents, workload and each currency against source records.
2. **E2E-08.02:** Download filtered CSV and XLSX. Expected: filters/time match; formula-like text is escaped and money remains separated by currency.
3. **E2E-08.03 — SA1:** Expected: assigned commercial pipeline/workload only, no agency-wide finance.
4. **E2E-08.04 — OP1–OP5:** Expected: each sees assigned operational delivery only, with no customer directory or financial totals.
5. **E2E-08.05 — OW1:** Review activity and notifications across the complete chain. Expected: actor/action/time and important handoffs are traceable; reading a notification does not complete its task.
6. **E2E-08.06:** Recalculate sample invoice, verified customer cash, balance, supplier payable, refund, recovery and custody values manually. Expected: exact agreement with CRM values.

## 5. Customer and enquiry workflow

Workflow: **Owner captures customer → creates enquiry → assigns Sales → Sales acknowledges → gathers details → schedules next action → requests quotation**.

1. Create a customer with name and valid `+country-code` phone.
2. Create another with email only.
3. Search the customer field by name, partial email and phone digits. It must wait briefly, return at most 20 authorized matches and never load the full directory into the selector.
4. Confirm Operations receives 403 when calling the customer-search endpoint.
5. Attempt duplicate phone/email. The CRM must warn; only an explicit separate-person confirmation can continue.
6. Create an enquiry with unknown dates and minimal details.
7. Assign it to Sales. Confirm Sales receives a task and notification.
8. Sales acknowledges it, records call outcome, destination, travellers, budget basis, services, hotel preference, pickup/drop-off, notes, next action and follow-up date.
9. Confirm the follow-up task uses the same due date/action.

Edge cases:

- Missing both phone and email is blocked unless Owner deliberately marks review needed.
- Invalid email/phone, 1-character name, very long fields and invalid dates are rejected.
- Sales cannot assign to another Sales user; Owner can.
- Reassignment moves customer, enquiry, open tasks, quotation and booking ownership together.
- Operations cannot view the customer directory or commercial notes.
- Quote-requested/quote-sent/won stages cannot be fabricated from the ordinary enquiry form.
- Lost requires a reason and cancels obsolete follow-up work.
- On-hold work becomes waiting rather than overdue active work.
- Two users editing the same enquiry must produce a conflict for the stale save.

## 6. Tasks, reminders and notifications

- Create a standalone task and an enquiry-linked task.
- A non-Owner can assign only themselves; Owner can assign active staff.
- Reschedule, wait, complete and cancel require a note where required.
- Follow-up task completion updates the enquiry follow-up fields.
- Run the worker after a task becomes due; verify one due notification, not duplicates.
- Move beyond escalation hours; Owner receives an overdue alert.
- Mark a notification read and confirm unread badges update.
- Offline saves must fail honestly and must not display success.
- Restoring connectivity refreshes current data.

## 7. Quotation workflow

Workflow: **Sales requests → Owner prepares → Owner approves → immutable PDF generated → Sales records manual sharing → Sales records customer decision**.

Test:

- Local car trip with hotel.
- Hotel-only booking.
- Customer-booked flight/train recorded for coordination but excluded from agency charges.
- Domestic multi-city trip.
- International trip with timezone, currency and passport-readiness notes.
- Multiple price options, optional extras, child/infant details and flexible dates.

Edge cases:

- Request is blocked when required enquiry data is incomplete.
- Sales cannot edit price/internal cost or approve.
- Owner cannot approve invalid totals, priced customer-booked transport, missing terms or expired validity.
- Returned quotation requires a reason; Sales resubmits; Owner sees the new version.
- Approval freezes the exact content/version; later edits require revision.
- PDF failure is visible and retryable; approval must not claim a document exists when generation failed.
- PDF contains no supplier cost, margin, private evidence or internal notes.
- Sharing is a manual record and never claims WhatsApp delivery.
- Customer accepts one exact option/version; duplicate acceptance cannot create two bookings.
- Customer requests changes: retain old approved PDF and create revision workflow.
- Expired quotation cannot be accepted without revision.

## 8. Booking, invoice and customer payment

Workflow: **Accepted quote → one booking → invoice → customer reports payment → Owner verifies → sufficient advance → release Operations**.

- Convert the accepted quote once; retry must return/reuse the same booking rather than duplicate it.
- Add travellers and select exactly one lead traveller.
- Issue invoice and inspect PDF values, currency, booking number, terms and customer-safe content.
- Record partial payment evidence. It remains pending until Owner decision.
- Owner rejects poor evidence with reason; booking balance does not change.
- Record valid payment; Owner verifies; receipt/reference remains traceable.
- Partial advance below threshold must not release Operations.
- Verify remaining advance, then release to at least one Operations user with checklist.

Edge cases:

- Duplicate transaction reference/command is rejected or idempotently reused.
- Reporter cannot approve their own financial request when separation of duties requires another reviewer.
- Overpayment becomes customer credit, not extra revenue.
- Reversal never deletes original payment and cannot be performed twice.
- Void invoice retains history and cannot silently erase verified cash.
- Operations cannot access invoice, payment evidence, totals or agreement internal notes through UI or direct URL.

## 9. Supplier, vehicle and trip operations

- Add hotel, transport and activity suppliers.
- Add own and vendor vehicles with valid registration and capacity.
- Initialize Operations only for a properly released booking.
- Create hotel/transport/activity arrangements with responsibility and confirmation status.
- Customer-booked or third-party services must have zero agency supplier cost.
- Confirm service, record reference/hold deadline and check readiness items.
- Create car segment with driver and vehicle; create train/flight coordination segment without forcing a driver.
- Generate itinerary, voucher, manifest and driver trip sheet; verify each audience receives only required data.
- Operations updates assigned progress and permitted fields only.
- Report normal, high and urgent incidents; urgent issue reaches coordinators.
- Resolve incident with history and customer-contact status.

Edge cases:

- Driver/vehicle overlap is blocked across bookings.
- End before start, missing car driver/vehicle, capacity mismatch and inactive driver are blocked.
- Unassigned Operations user cannot view/update/report another trip.
- Removing a driver cancels obsolete task/access.
- Supplier hold expiry creates action; duplicate reminders are prevented.
- Trip completion is blocked by unresolved urgent incident, unfinished required readiness or incomplete active segments.
- Completion creates feedback/settlement work once.

## 10. Exceptional driver collection and cash custody

- Operations reports customer money only on an assigned released booking.
- Owner sees **pending verification**; booking is not credited yet.
- Owner links/verifies exactly one payment or rejects/requests clarification.
- Record partial cash handover, remaining custody and final handover.
- Handover never creates a second customer payment.

Edge cases: duplicate report/reference, wrong currency, amount mismatch, non-cash method, over-handover, rejected evidence, driver deactivation mid-custody and owner-entered matching report.

## 11. Changes, cancellation and settlement

Workflow: **Sales requests change → Owner reviews → Sales records customer decision → financial/supplier effects recorded independently → Owner closes settlement**.

- Amendment: revised total remains unapplied until customer acceptance.
- Customer decline leaves original agreement unchanged.
- Partial cancellation removes selected traveller/service only; remaining lead/service stays valid.
- Full cancellation applies retained charge only after customer confirmation.
- Record supplier bill, partial payments, expense, supplier credit, expected recovery and actual recovery.
- Approve customer refund, pay in multiple instalments and keep supplier recovery independent.
- Printable adjustment shows previous/new value and customer reference without altering original invoice.
- Close only when customer balance/credit, refunds, supplier obligations, pending approvals, cash handover and change tasks are reconciled.
- Reopen with audited reason; no new entries after closed until reopened.

Edge cases: excess payment/refund/allocation, duplicate reference, reversed item with dependent recovery, self-approval, wrong booking/currency, concurrent approvals, disputed expense, supplier credit instead of cash and recovery received before/after customer refund.

## 12. Imports

- Upload CSV and XLSX only; reject macros/executables, oversized files and more than the allowed rows.
- Map customer/enquiry columns, choose country code and preview before commit.
- Verify original spreadsheet row numbers, raw notes and warnings are preserved.
- Resolve duplicates as skip, link, update or separate person where available.
- Re-upload/retry must not duplicate already committed rows.
- Imported records remain review-needed and do not generate hundreds of reminders automatically.
- Unknown staff and ambiguous dates/party sizes remain explicit review items; never invent confirmed bookings or payments.

Supplier/package/traveller/booking/financial migration must not be accepted until corresponding real source files, reference rules and opening-balance strategy are approved. The supplied Confirmed Pax sheet is empty, so fabricating those records would be a data-integrity failure.

## 13. Reports and exports

- Open Reports as Owner; apply from/to, staff, stage, source and destination filters.
- Confirm pipeline total, won cohort, conversion, source/stage/assignee counts and quote turnaround match source records.
- Confirm workload, overdue, readiness, incidents and next-30-day departures.
- Verify money is separated by currency and by booked, invoiced, verified cash, customer balance, supplier payable, refunds and recoveries.
- Download CSV and Excel. Filters and generated time must match the screen.
- Put `=`, `+`, `-` or `@` at the start of a test name/destination; exported cells must be treated as text, not spreadsheet formulas.
- Sales export contains only assigned commercial records and no agency-wide finance.
- Operations report contains only assigned delivery workload and no pipeline customer directory or financial totals.
- Anonymous, inactive and cross-agency export calls return 401/403 and no file.
- Zero is displayed as zero; unavailable turnaround is displayed as unavailable, not zero.

## 14. Mobile, fixed navigation and PWA

- Desktop sidebar remains fixed while page content scrolls. Brand/account/footer stay visible; only a long navigation list scrolls.
- Top header stays visible while content scrolls.
- At phone width the desktop sidebar disappears and the bottom navigation remains fixed above the safe area.
- Owner, Sales and Operations bottom tabs match role permissions.
- More sheet closes with X, backdrop and Escape; background does not scroll.
- Test forms, long names, tables, drawers and keyboard focus at 320, 390, 768 and 1440 px.
- Build/start production locally, confirm manifest and service worker registration, then install the app when the browser offers it.
- Disable network: generic offline screen appears and contains no private CRM data. APIs, PDFs, contacts and form data must not be cached.
- Reconnect and reload; no stale save is silently submitted.

## 15. Security and privacy

- Verify security headers: no sniffing, frame denial, same-origin resource/opener policy, restricted device permissions and HSTS on HTTPS.
- Try altered IDs for every customer, quote, booking, document, settlement, report and export route with each role.
- Confirm rate limits on repeated activation attempts.
- Confirm POST origin checks reject a foreign origin.
- Upload fake PDF/image content with misleading extension; it must fail validation.
- Confirm downloaded private documents use `private, no-store` and independent authorization.
- Confirm database/network errors show safe messages without URI, stack, secret or customer content.
- Confirm deactivation and password reset invalidate sessions.
- Confirm audit events identify actor/action/time and cannot be edited through UI.

## 16. Performance and scale

- Create/import enough test customers to exceed ordinary selector size; customer lookup still returns no more than 20 results.
- Rapidly type different customer queries; stale responses must not replace the latest result.
- Test 1,000+ tasks/bookings and verify the limited-data banner; reports must use server queries, not capped client arrays.
- Verify no horizontal overflow on mobile and no layout shift from loading skeletons.
- Check browser Network: authenticated API responses are not cached; report/export requests are server-side.
- Record approximate login, dashboard, customer search, report and PDF times on staging and investigate regressions.

## 17. Production release gate

1. Create separate staging and production Atlas databases/users with least privilege and IP/network controls.
2. Enter production secrets manually and run `npm run production:check`; it prints only missing/safety problems, never secret values.
3. Configure HTTPS domain, `BETTER_AUTH_URL`, scheduler secret, Cloudinary credentials if external assets are approved, monitoring and alerts.
4. Run `npm run db:setup` once against production.
5. Configure the protected reminder job every 15 minutes and monitor its last success.
6. Configure Atlas backup retention, perform a restore rehearsal into a separate database and document recovery time.
7. Run the full test suite and this guide on staging, then a small approved real-data migration.
8. Owner signs off branding, terms, cancellation policy, bank details and accountant-reviewed invoice/refund wording.
9. Run production smoke tests with authorized accounts only; remove demo records before real use.

## 18. Requested-feature implementation and acceptance matrix

Use this matrix as the final audit. **Implemented** means the feature exists in the application and automated checks cover its main rules. It still requires the listed manual acceptance test before production use.

| Requested capability | Code status | Manual proof in this guide | Remaining dependency or limit |
| --- | --- | --- | --- |
| Owner, Sales and 3–5+ Operations users | Implemented | Sections 2–4, OP1–OP5 | Create and test OP2–OP5 |
| Public signup requiring Owner activation/role choice | Implemented | 2.3–2.4 | Owner must verify identity manually |
| Role change, deactivate, reassignment and last-Owner safety | Implemented | Section 3 | Separate-session acceptance required |
| Operations capability controls | Implemented | 2.2, E2E-05 | Confirm on every limited account/device |
| Customer creation and bounded search | Implemented | E2E-01, Section 5 | Large directory pagination remains capped outside search |
| Duplicate customer protection | Implemented | E2E-01.02, Section 5 | Human review still required for genuinely separate people |
| Enquiry assignment and Sales qualification | Implemented | E2E-01 | Agency must approve required/optional field choices |
| Automatic follow-up tasks, reminders and in-app notifications | Implemented | E2E-01, Section 6 | Production scheduler/monitoring must be configured |
| Owner quotation preparation/approval | Implemented | E2E-02, Section 7 | Final agency terms, rates and branding require approval |
| Reusable package templates | Implemented | E2E-02.02–04 | Templates are not live inventory or guaranteed pricing |
| Versioned customer-safe quotation PDF | Implemented | E2E-02.06–09 | Long real itineraries need visual acceptance |
| Manual WhatsApp/email sharing record | Implemented | E2E-02.08 | No WhatsApp API/delivery confirmation by design |
| Local car, hotel-only and domestic multi-city trips | Implemented data/workflow | J1–J3, Sections 7–9 | No live hotel/train inventory integration |
| International and customer-held flight coordination | Implemented data/workflow | J4, E2E-02/04/05 | No airline ticketing, visa or live FX integration |
| Accepted quote to one booking | Implemented/idempotent | E2E-03.01 | Manual business acceptance |
| Travellers and lead traveller | Implemented | E2E-03.02 | Historical traveller import awaits source data |
| Invoice, customer payment review and advance gate | Implemented | E2E-03.03–08 | Tax/invoice language needs accountant approval |
| Operations release and checklist | Implemented/idempotent | E2E-03.07–08, E2E-04.02 | Test with agency's real checklist expectations |
| Suppliers, arrangements and hold deadlines | Implemented | E2E-04.01–03 | Historical supplier/package import awaits source data |
| Vehicles, drivers, capacity and overlap protection | Implemented | E2E-04.04–06 | Real dispatch/device acceptance |
| Itinerary, voucher, manifest and driver sheet | Implemented | E2E-04.07 | Branding and long-content visual acceptance |
| Trip progress, readiness and incidents | Implemented | E2E-05 | Real mobile/network conditions |
| Driver collection report and cash custody/handover | Implemented | E2E-06, Section 10 | Agency must approve real cash-control process |
| Amendments and customer decision | Implemented | E2E-07.01–04 | Customer communication remains manual |
| Supplier bills/payments, expenses, credits and recovery | Implemented | E2E-07.05 | Current allocations are booking-level |
| Customer refunds and independent supplier recovery | Implemented | E2E-07.06 | Accountant review required |
| Settlement blockers, close and audited reopen | Implemented | E2E-07.08–09 | Manual reconciliation acceptance |
| Customer/enquiry CSV/XLSX import with preview | Implemented | Section 12 | Other historical entities need approved source/mapping |
| Pipeline, workload, operations and finance reports | Implemented/server queried | E2E-08, Section 13 | Reconcile against agency records |
| CSV/XLSX export and formula safety | Implemented | E2E-08.02, Section 13 | Test in the spreadsheet application used by agency |
| Responsive desktop/mobile role navigation | Implemented | Section 14 | Real Android/iPhone keyboard and safe-area testing |
| Installable PWA and privacy-safe offline page | Implemented | Section 14 | No offline business writes; OS push is not included |
| Authentication, origin checks, rate limits and private documents | Implemented controls | Section 15 | Independent production security acceptance |
| MongoDB Atlas transactions/indexes | Implemented | Sections 1, 16–17 | Production backup/restore rehearsal required |
| Cloudinary assets | Planned, not activated | Production gate | Needs credentials and public/private asset policy |
| Public production hosting | Build/runbook ready, not externally activated | Section 17 | Needs chosen host, domain, HTTPS, secrets and monitoring |

### Explicitly outside the approved initial scope

The application does not currently promise automatic WhatsApp messages, payment-gateway collection, live hotel/airline/train inventory, automatic visa decisions, continuous GPS tracking, customer self-service portal, multi-booking bank-transfer allocation, guaranteed offline writes or OS push notifications. Do not record these as defects unless the scope is formally expanded.

### Acceptance decision

Mark each feature row:

- **Accepted** — all linked manual checks passed.
- **Accepted with limitation** — the business approves the documented limit.
- **Failed** — implemented behaviour does not match the expected result.
- **Blocked externally** — requires approved wording, source data, hosting, credentials, backup plan or a real device.

The application is ready for production only when all implemented critical workflows are Accepted, all accepted limitations are signed by the Owner, and every external release gate has an accountable owner and completion date.

## Final sign-off

Do not approve launch while any Critical issue remains: unauthorized access, wrong customer price, duplicate booking/payment, lost data, false approval/delivery status, broken login, private document leak, unresolvable balance or inability to finish the core workflow.
