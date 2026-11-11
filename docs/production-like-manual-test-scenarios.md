# EarlyBird CRM — production-like manual test using the current seeded data

Updated: 4 November 2026

This guide is based on the records already in the current MongoDB database. Do **not** create the six extra QA customers from the older guide. Existing seeded customers are reused for complete workflows and edge cases. Create new data only where a feature cannot be tested safely with an existing record.

Run the sections in order because later tests depend on records advanced in earlier sections.

## 1. Current database baseline

The database was read without changing it. Before this test run it contains:

| Data | Current count | Notes |
| --- | ---: | --- |
| Staff | 5 | 1 Owner, 1 Sales, 3 Operations |
| Customers | 23 | 22 seeded customers plus `Subash` |
| Enquiries | 22 | One per seeded customer; Subash has none |
| Tasks | 22 | Seeded follow-ups plus current workflow task(s) |
| Notifications | 4 | Existing notification records |
| Quotations | 1 | Rahul Menon, `EB-Q-2026-0001`, Requested |
| Bookings | 0 | Created during this guide |
| Invoices/payments | 0 | Created during this guide |
| Suppliers/vehicles | 0 | Created during this guide |
| Operations/arrangements/segments | 0 | Created after advance verification |
| Settlement entries | 0 | Created during finance testing |

The active database currently reports the Owner email as `admin@example.com`. If the EA browser is logged in as `earlybirdadmin@example.com`, first confirm that browser is connected to the same database/environment. The account shown in Team & setup is authoritative.

## 2. Browser sessions

Keep these sessions open in separate browser profiles or different browsers:

| Session | Account | Role | Test responsibility |
| --- | --- | --- | --- |
| EA | Current active Owner | Owner | approvals, money, staff, templates and reports |
| US | `user@gmail.com` | Sales | assigned enquiries, quote requests, sharing and payment reports |
| ST1 | `staff@gmail.com` | Operations | main driver |
| ST2 | `staff2@gmail.com` | Operations | second driver and conflict checks |
| ST3 | `staff3@gmail.com` | Operations | unassigned privacy checks |

## 3. Existing records used by this test

| Existing record | Current state | Use in this guide |
| --- | --- | --- |
| Rahul Menon — Ooty and Coonoor | Quote requested; quote already exists | Main enquiry-to-settlement journey |
| Ananya & Karthik — Munnar and Alleppey | New | Quote return/revision and invoice correction |
| Meera Krishnan — Goa | Gathering details | Hotel-only booking without driver |
| Dev Patel — Manali and Shimla | New | Multiple vehicles and schedule conflicts |
| Arjun & Nila — Kodaikanal | On hold | Amendment, cancellation, refund and recovery |
| Sneha Iyer — Andaman | Contacting | Customer-held flight/ferry and readiness |
| Farah Khan — Jaipur and Udaipur | Gathering details | Concurrent/stale editing |
| Aditi Sharma — Wayanad | New; assigned to Sales | Follow-up and task behaviour |
| Vikram Rao — Coorg | Lost | Lost reason and controlled reopen |
| Subash | Customer only; no enquiry | Existing-customer selection and international enquiry |
| Remaining seeded customers | Mixed stages; mostly assigned to Sales | Search, filters, pages, dashboard and reports |

### New records genuinely required

Create only these during testing:

1. `QA Import Customer 01` and `QA Import Enquiry 01` through the import test.
2. One pending staff account request such as `qa.pending@example.test`.
3. A duplicate-customer attempt using an existing fictional contact. Cancel after the warning; do not save another customer unless testing an approved separate-person case.

Do not rerun `npm run db:seed-demo`. It is idempotent, but rerunning it adds no value and makes the baseline confusing.

## 4. Record results

Use a sheet with: Test ID, Session, Record, Expected, Actual, Result, Screenshot/notes. Mark each test `Pass`, `Fail`, `Blocked` or `Accepted limitation`. Capture the exact error before refreshing or retrying.

---

# Part A — environment, authentication and role access

## A1. Confirm baseline

In EA:

1. Customers total: 23.
2. Enquiries total: 22.
3. Team & setup: five active users with the roles above.
4. Quotations: Rahul has the one requested quote.
5. Bookings, Suppliers/resources and Money & changes: no business records yet.

Expected: counts match. If not, record the actual baseline and continue; do not delete records.

## A2. Login and session persistence

In every session:

1. Refresh the current feature page.
2. Close the browser, reopen it and revisit that URL.
3. Restart the development server and refresh again.
4. Use Back and Forward between features.

Expected: valid sessions survive browser/server restart; refresh opens the permitted page; sidebar stays mounted and only content loads; sign-out clears access and Back reveals no private cached page.

## A3. Role navigation and direct URLs

1. EA opens every feature, including Staff, Import and Invoice template.
2. US types `/staff`, `/imports` and `/invoice-settings` directly.
3. ST1/ST2/ST3 type `/customers`, `/enquiries`, `/quotations`, `/bookings`, `/invoice-settings` and `/staff`.

Expected: EA has Owner access; US cannot manage staff/settings; Operations sees only Today, My trips, Tasks, Notifications and safe reports; forbidden URLs never expose protected content or JSON.

## A4. Staff administration and last-Owner safety

In EA:

1. Confirm ST1/ST2/ST3 currently have trip notes, trip times, logistics request and expense-evidence capabilities.
2. Remove `logistics-request` from ST3, save and refresh.
3. Try to deactivate or demote the only Owner.
4. Submit public account request `qa.pending@example.test`.
5. Try signing in before approval.
6. EA approves it as Sales, activates it, signs in once, then deactivates it.
7. Refresh its still-open session.

Expected: last Owner is protected; pending user has no CRM access; role/status save has no unrecognized-key error; deactivation stops the next server request; history records changes.

---

# Part B — lists, search, filters and details

## B1. Pagination with the 23 customers

1. EA selects 10 rows: pages should contain 10, 10 and 3.
2. Confirm no record repeats between pages.
3. Select 20: pages should contain 20 and 3.
4. Select 50: all 23 should be on one page.
5. Repeat the 10-row check for Enquiries and Tasks.

Expected: `x–y of total`, Previous/Next and page reset after filter change are correct; API does not fetch more primary rows than requested.

## B2. Search known records

1. Search `Ananya`, `Rahul`, `Subash` and a nonexistent name.
2. Search seeded phone ending `0101` and email fragment `ananya.demo`.
3. Search `Andaman`, `Kashmir` and `Gangtok` in Enquiries.
4. Clear each search.

Expected: final typed value wins after a short delay; no match gives a clear empty state.

## B3. Filters

1. Filter Enquiries by New, Contacting, Gathering details, On hold and Lost.
2. Filter by Owner and Sales assignee.
3. Use date From/To around seeded follow-up dates.
4. Filter Tasks by To do, assignee and due range.
5. Filter Notifications by Read/Unread.
6. Use a zero-result combination, then clear it.

Expected: EA sees all authorized records; US only assigned records; totals and exports match filters.

## B4. Customer detail and encoded IDs

1. EA clicks Ananya and confirms `/customers/demo%3Acustomer%3Aananya` loads with sidebar visible.
2. Check contact, enquiry, tasks, quotes, bookings and invoices sections.
3. US opens assigned Aditi.
4. US tries Ananya before assignment.
5. ST1/ST2/ST3 try the same URLs.
6. Replace ID with `missing-customer-id`.

Expected: seeded IDs containing colons work; Sales sees assigned history only; Operations sees no customer; unknown ID shows safe not-found.

---

# Part C — leads, tasks and notifications

## C1. Existing customer Subash (no new customer)

In EA:

1. Create an enquiry and select existing `Subash`.
2. Make it a Singapore enquiry with flexible dates, two adults, hotel, local transfers and customer-held flight.
3. Assign US and set a near-term follow-up.

Expected: customers remain 23; enquiries become 23; US receives one notification and one task.

## C2. Aditi follow-up

In US:

1. Open/acknowledge Aditi.
2. Record Connected call.
3. Add pickup, drop, room, budget basis and special request.
4. Reschedule with a work note.
5. Try rescheduling without required note.
6. Complete with a note.

Expected: only one current follow-up task; required note enforced; no unrecognized-key error; EA sees activity.

## C3. On-hold and Lost

1. EA checks Arjun's On hold reason/review date.
2. Check Vikram's Lost reason `Demo: customer postponed travel` and no active follow-up.
3. Reopen Vikram to Contacting with reason/future follow-up, confirm one task, then return to Lost with reason.

Expected: no duplicate task; reason and history persist.

## C4. Duplicate warning

1. Begin a customer using Ananya's seeded phone/email.
2. Confirm existing-record suggestion.
3. Cancel and open Ananya.
4. If intentional separate person is supported, verify it requires a deliberate choice and does not auto-merge histories.

Expected: basic test creates no accidental 24th customer.

## C5. Reminder worker

1. Set a follow-up due soon.
2. Run `npm run worker` locally or protected staging cron once, then again.
3. Move one task beyond escalation and run again.
4. Mark notification read and click it.

Expected: one notification per reminder state; rerun does not duplicate; overdue escalates to EA; Read does not complete task; link opens permitted record.

---

# Part D — package templates and quotations

## D1. Rahul's existing requested quote

Rahul already has `EB-Q-2026-0001` in Requested state.

1. EA reassigns Rahul/open tasks to US if Sales participation is needed.
2. EA opens the existing request; do not create another.
3. Add Option A: 3-star + sedan; Option B: 4-star + SUV.
4. Add Ooty/Coonoor itinerary, rooms/meals, car legs, sightseeing, inclusions/exclusions, validity, advance and cancellation terms.
5. Add internal supplier-cost notes.
6. Preview, approve and generate PDF.

Expected: Sales cannot price/approve; Operations cannot access it; approved version is immutable; customer PDF has no margin/internal notes; PDF failure can retry without data loss.

## D2. Create and reuse package template

1. EA saves Rahul's prepared structure as `QA Hill Station Car + Hotel`.
2. Confirm it appears in Package templates.
3. Assign Ananya to US, collect details and request quote.
4. EA applies the template to Ananya.
5. Change hotels, dates, rates and destination-specific content.
6. Edit template later; recheck Rahul's approved quote.

Expected: template is an editable starting point, not live availability/rate; old approved quote stays unchanged.

## D3. Ananya return and revision

1. US requests quote with one required detail missing.
2. EA returns it: `Confirm hotel category and Kochi pickup time`.
3. US fills details and resubmits.
4. EA approves version 1.
5. US records manual share and customer change request.
6. EA creates/approves version 2.
7. Compare both PDFs.

Expected: v1 remains immutable; only intended version can be accepted; manual share does not claim delivered/read.

## D4. Rahul acceptance and retry

1. US downloads PDF and records manual WhatsApp share.
2. Record acceptance of Option B with fictional call/message reference.
3. Retry acceptance/conversion once.

Expected: exact version/option retained; only one booking.

---

# Part E — Rahul booking, invoice and payments

## E1. Booking/travellers

1. Open Rahul booking.
2. Add payer, billing/service address and place of supply.
3. Add travellers with exactly one lead.
4. Try zero and two leads, then correct it.
5. Compare dates, destination, selected option, advance and balance terms to accepted quote.

Expected: agreement snapshot matches; invalid lead blocked; Operations cannot see payer/billing/prices.

## E2. Invoice template

In EA:

1. Enter test company name, registered address, state, valid-format test GSTIN, PAN, email and phone.
2. Add bank/IFSC, payment terms and footer.
3. Enable required company, GST, payment and travel-summary sections.
4. Configure Customer copy and Office copy.
5. Save/refresh; US and Operations try direct edit access.

Expected: Owner only; settings persist; invalid GST/state code blocks GST issue.

## E3. Draft and issue Rahul invoice

1. Open booking invoice draft.
2. Add Hotel booking, Cab booking and Accommodation/breakfast/sightseeing/transfers lines.
3. Add HSN/SAC, quantity, rate, discount and tax.
4. Add explanatory note row with no charge.
5. Confirm total equals accepted booking.
6. Try mismatched total, correct it, then issue.
7. Inspect PDF at 100%, 150% and print preview.

Expected: mismatch blocked; addresses/numbers/totals correct; dark sharp unclipped text; issued snapshot immutable and listed on customer detail.

## E4. Tax/calculation edge cases

Use an unissued draft such as Ananya's later booking:

1. Intra-state CGST+SGST; inter-state IGST; never both.
2. 0% item, discount before tax, decimal quantity/rate, TCS and rounding.
3. Long descriptions and Unicode names.
4. Missing required HSN/SAC, zero, negative and extreme values.

Expected: invalid values blocked; UI/PDF totals and rounding match; wrapping remains readable.

## E5. Payment and advance gate

1. US reports partial `QA-RAHUL-UPI-001` with unclear evidence.
2. EA rejects with reason; verified totals remain unchanged.
3. US submits valid fictional `QA-RAHUL-BANK-002`.
4. EA verifies, then retries same reference.
5. Try Operations release before full required advance.
6. Verify remaining advance with a new reference.
7. Check receipt PDF and balance.

Expected: evidence is not money before verification; duplicate/currency mismatch blocked; release gated; one verification creates one allocation/receipt.

## E6. Print copies

Create Customer copy, Office copy and renamed `Traveller copy`.

Expected: only labels differ; invoice number, totals and locked data remain; no second invoice/receivable.

---

# Part F — Operations with ST1, ST2 and ST3

## F1. Resources

1. EA adds `QA Ooty Hotel`, `QA Hill Cab Supplier`, `QA Sightseeing Partner`.
2. Add `QA Sedan 01` capacity 4 and `QA SUV 02` capacity 6.
3. Try duplicate registration, invalid capacity and inactive vehicle.

Expected: valid save; invalid/duplicate blocked; Operations cannot create/confirm commercial commitments.

## F2. Release Rahul

1. EA releases after issued invoice and verified advance; retry once.
2. Assign ST1/ST2, leave ST3 unassigned.
3. Add hotel/cab/sightseeing arrangements as Planned/On hold.
4. Add deadlines/references, then confirm.

Expected: one checklist only; ST1/ST2 notified; ST3 sees nothing; advance does not falsely confirm suppliers.

## F3. Segments/conflicts

1. First segment: ST1 + Sedan.
2. Non-overlapping second: ST2 + SUV.
3. Attempt overlapping ST1 and overlapping Sedan.
4. Test insufficient capacity, end before start, missing driver/vehicle and travel-buffer violation.

Expected: all invalid assignments blocked server-side, including stale tab.

## F4. Capability and privacy

1. ST1 updates actual time/note, expense evidence and logistics request.
2. EA removes ST1 logistics capability while page stays open.
3. ST1 retries without refresh.
4. ST3 tries Rahul direct trip/document URLs.

Expected: capability checked per request; Operations never receives prices, invoice/GST, payer/evidence, supplier cost, margin or internal notes; ST3 gets safe 403/404.

## F5. Readiness/documents/incidents/completion

1. Complete only some readiness items.
2. Generate itinerary, voucher, manifest and driver trip sheet; inspect audience fields.
3. ST1 reports normal delay; ST2 urgent vehicle issue.
4. Try completing with urgent incident, incomplete segment and readiness gap.
5. Resolve with customer-contact note; complete requirements/trip; retry completion.

Expected: clear blockers; completion once; feedback/settlement tasks once; financial closure remains separate.

## F6. Exceptional driver collection

Only if Owner enables this exception:

1. ST1 reports fictional cash.
2. Verify paid total stays unchanged initially.
3. EA rejects unclear report; ST1 resubmits.
4. EA links/verifies one payment.
5. Record partial/final handover; try duplicate/over-handover.

Expected: collection, payment and custody are separate; handover creates no second payment; discrepancy stays visible.

---

# Part G — alternate existing-customer journeys

## G1. Meera — hotel-only

1. Assign to US; update Goa enquiry to hotel-only with customer-held transport if relevant.
2. Complete quote → approve → share → accept → booking → invoice/advance.
3. Confirm hotel arrangement.

Expected: no forced car/driver/vehicle or driver task; customer-held transport not charged.

## G2. Sneha — Andaman

1. Assign to US; record customer-booked flight as not charged.
2. Add agency hotel/local transfer and correct ferry responsibility.
3. Complete quote and inspect included/customer-held separation.
4. Test conditional readiness without real identity documents.

Expected: no duplicate flight charge; responsibility clear; private documents permission checked.

## G3. Subash — international

1. Add cities/time zones, nationality only when needed, transport responsibility and optional visa assistance.
2. Later add foreign supplier currency and Owner-recorded conversion rate.
3. Check reports do not add foreign currency silently to INR.

Expected: no irrelevant passport requirement; old templates never claim current visa rules/rates.

## G4. Dev — cross-booking conflict

1. Progress Dev to paid/released booking.
2. Create segment overlapping Rahul's ST1/vehicle time.
3. Try ST1, then Sedan; correct with ST3/another active vehicle.

Expected: overlap blocked across bookings; corrected assignment visible only to assigned Operations.

## G5. Ananya — invoice void/correction

Before verified payment:

1. Issue invoice, void with reason and confirm linked correction draft/version.
2. Try voiding original again.
3. After payment or release on another suitable invoice, try direct void.

Expected: history retained; duplicate void blocked; paid/released invoice requires adjustment, not destructive edit.

## G6. Arjun — amendment/cancellation/refund

1. Reactivate from On hold and progress to paid/released booking.
2. US requests date/price amendment; EA approves; record one customer rejection.
3. Create second change, approve and accept it.
4. Request partial cancellation; EA records supplier penalty.
5. Approve refund and pay in two instalments.
6. Record supplier recovery separately as expected, then cash or credit.

Expected: original agreement/invoice retained; refund and recovery independent; supplier credit is not cash; refund cannot exceed approved credit; remaining trip stays valid.

---

# Part H — finance and settlement

## H1. Approval separation

1. US submits supplier bill and expense.
2. EA approves one/rejects one.
3. EA submits a financial request then tries self-approval.

Expected: Sales needs Owner review; self-approval blocked where required; rejected request changes no posted total.

## H2. Overpayment/reversal

1. Verify payment exceeding outstanding.
2. Confirm excess becomes customer credit, not revenue.
3. Reverse verified payment with reason; retry reversal.
4. Check a released booking after reversal.

Expected: original stays in history; double reversal blocked; released booking gets financial exception, not silent operations removal.

## H3. Closure/reopen

1. Try closing Rahul with supplier balance, refund, custody, approval or task pending.
2. Resolve all blockers and close.
3. Try changing posted data after closure.
4. Reopen with reason and post linked correction/reversal.

Expected: explicit blockers; no direct edit/delete; audited reopen required; trip completion is not financial closure.

---

# Part I — import with minimal new data

Prepare CSV/XLSX with:

- valid `QA Import Customer 01`;
- valid `QA Import Enquiry 01`;
- Ananya duplicate phone;
- invalid email and missing contact;
- unknown staff and ambiguous `04/05/26` date;
- name beginning `=`, `+`, `-` or `@`.

1. EA uploads/maps and previews without commit.
2. Check warning and source row numbers.
3. Choose skip/link/update/create deliberately.
4. Commit only valid new QA records and deliberate links.
5. Commit same file again.

Expected: supported file/limits enforced; ambiguous data Needs review; seeded customer not duplicated; no reminder flood or invented booking/payment; repeat idempotent. Normal final customer total is 24: original 23 plus one valid import.

---

# Part J — reports and exports

## J1. Owner reconciliation

1. Filter date, staff, stage, source and destination.
2. Compare pipeline to Enquiries; departures/readiness/incidents to Operations.
3. Compare booked, invoiced, verified cash, outstanding, supplier payable, refunds and recovery to Rahul/Arjun.
4. Export CSV/Excel and open them.

Expected: screen/export filters and totals match; currencies not silently combined; `=`, `+`, `-`, `@` values exported safely as text.

## J2. Role-scoped reports

Repeat in US, ST1, ST2 and ST3.

Expected: US only assigned pipeline; Operations only assigned delivery workload; ST3 no Rahul while unassigned; no Operations finance/margin data.

---

# Part K — concurrency, retry and errors

## K1. Farah stale edit

1. Assign Farah to US; open enquiry in EA and US.
2. EA saves; US saves stale copy.
3. Repeat on a task and safe draft.

Expected: conflict asks refresh; no silent overwrite.

## K2. Double-click safety

Safely retry/double-click once: enquiry save, quote request/approval, acceptance/conversion, invoice issue, payment verify, Operations release, trip completion and settlement post.

Expected: no duplicate customer, quote version, booking, invoice number, payment, receipt, checklist, notification or ledger entry.

## K3. Navigation/network errors

1. Navigate away while customer detail loads; use Back/Forward quickly.
2. Disconnect network during save, reconnect and retry.

Expected: no visible `AbortError`, false success or endless spinner; current server data loads after reconnect.

---

# Part L — mobile, PWA, accessibility and security

## L1. Responsive

Test EA, US and ST1 at 320, 390, 768 and 1440 px. Check sidebar/bottom navigation, More menu, long forms, filters, tables/cards, detail, invoice and trip screens with mobile keyboard.

Expected: no page overflow; content/actions not hidden behind navigation; data remains usable.

## L2. Keyboard/accessibility

Use Tab/Shift+Tab, Enter/Space and Escape; verify focus return, visible focus, labels, errors and contrast.

Expected: core workflow is keyboard-completable; focus never trapped/lost.

## L3. PWA/offline privacy

Install if offered, disconnect network, reopen private feature and try save; reconnect/refresh.

Expected: offline fallback has no private data; save does not claim success; reconnect fetches server data.

## L4. Object/download authorization

From wrong roles change IDs in customer, quote, booking, invoice, evidence, operations document, travel document and settlement URLs.

Expected: 401/403/404 without names, amounts, documents, stack, MongoDB URI or secrets; downloads are permission checked and private/no-store.

---

# Final production acceptance

Release fails for any Critical problem:

- unauthorized customer, finance or document access;
- Operations receives commercial/private fields;
- retry duplicates booking/invoice/payment/receipt/checklist/ledger;
- verified money changes without Owner;
- invoice/PDF totals differ from booking/UI;
- approved quote/issued invoice history is editable/deletable;
- driver/vehicle overlap is allowed;
- stale save overwrites newer data;
- deactivated session still works;
- Rahul cannot complete quote → booking → invoice → advance → Operations → trip → settlement.

Mark each part Accepted, Accepted with limitation, Failed or Blocked externally. Final sign-off records commit/version, database environment, Owner, date, failed IDs, limitations and screenshots. Never use real identity documents, bank statements, payment references or customer contacts.
