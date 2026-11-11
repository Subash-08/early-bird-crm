# Manual test run with the current five accounts

For the full production-style, step-by-step run covering every implemented workflow and edge-case group, use `docs/production-like-manual-test-scenarios.md`.

Use development/staging with fictional data. Do not run destructive edge cases on real customer records.

## Browser sessions

| Session | Account | Role | Main responsibility |
| --- | --- | --- | --- |
| EA | `earlybirdadmin@example.com` | Owner | approvals, money, staff, templates, reports |
| US | `user@gmail.com` | Sales | enquiries, quote requests, sharing, payment reports |
| ST1 | `staff@gmail.com` | Operations | primary driver |
| ST2 | `staff2@gmail.com` | Operations | second driver/conflict checks |
| ST3 | `staff3@gmail.com` | Operations | unassigned privacy checks |

Keep each signed in in a different browser profile. Never include passwords in evidence.

## One-time setup

1. Back up the test database if needed.
2. Run `npm run db:setup` for current indexes.
3. Local development only: run `npm run db:seed-demo`. It creates 22 idempotent fictional leads. Never run it in production.
4. Owner confirms all five accounts are active with the roles above.
5. Give ST1 `trip-notes` and `trip-times`, ST2 `logistics-request`, and initially leave ST3 without extra capabilities.
6. Save fictional agency, GST, bank and invoice-template details.
7. Configure the reminder worker/cron only in the intended environment.

## 1. Navigation, filters and pagination

1. Owner opens every sidebar item. URL changes; sidebar stays mounted; only content loads.
2. Customers shows no more than 20 rows and Next opens page 2 after seeding.
3. Test 10, 20 and 50 rows. No row repeats or disappears between pages.
4. Search Ananya, phone digits and email fragment. Only matching authorized records appear.
5. Test status, assignee, From and To on every list that displays them. Clear filters restores totals.
6. An impossible filter shows an honest empty state and `0–0 of 0`.
7. Click Ananya & Karthik. The `/customers/[id]` page shows allowed contact, enquiries, quotes, bookings, tasks and invoices.
8. Open the same customer URL as Sales: assigned data opens. Open it as ST1/ST2/ST3: access is denied without leaking customer data.
9. Edit a Task. It must save without `_id`, `org`, timestamp, `quoteId` or `version` schema errors.
10. Rapidly search/change pages; the final choice wins and an older request never replaces it.

## 2. Lead and quotation

1. Owner creates a fictional customer; test duplicate phone/email and explicit separate-person confirmation.
2. Owner creates an enquiry, assigns Sales and sets a near follow-up.
3. Sales receives task/notification, acknowledges, records call outcome, destination, dates, travellers, budget, services, hotel, transport responsibility, pickup and next action.
4. Sales reschedules with a note. Confirm one follow-up task only.
5. Sales requests a quote. Owner returns it once for missing information; Sales resubmits.
6. Owner prepares two options, terms and validity, verifies rates manually, approves and generates PDF.
7. Sales cannot see internal cost or approve. Operations cannot access quotation UI/API.
8. Sales records manual sharing and acceptance of one exact option. Retry cannot create a second booking.

## 3. Booking, invoice and payment

1. Convert accepted quote; add billing/service address and travellers with exactly one lead.
2. Owner issues invoice. Verify GST/HSN, totals, dates, addresses, travel summary, readable text and filename.
3. Create Customer copy and Office copy. Same invoice number and locked data must remain.
4. Toggle template sections; hidden fields must disappear from PDF.
5. Test CGST+SGST versus IGST, zero tax, discount, rounding, TCS, note row, long description and Unicode names.
6. Sales reports partial payment. Owner rejects poor evidence; totals stay unchanged.
7. Owner verifies valid evidence. Duplicate reference is blocked; overpayment becomes customer credit.
8. Reverse once; second reversal is blocked. Void invoice retains history and remains on customer detail.
9. Insufficient verified advance blocks release. Verify remainder and release to ST1 and ST2.
10. Operations direct URLs/API never expose invoice, payer, evidence, GST identity, price or internal agreement fields.

## 4. Operations and mobile work

1. Initialize released booking, add hotel/transport/activity arrangements and hold deadlines.
2. Add suitable vehicles; assign separate car segments to ST1 and ST2.
3. Test overlapping driver/vehicle, insufficient capacity, inactive driver and end-before-start; all must fail.
4. ST1/ST2 see only assigned trips. ST3 sees neither and cannot update guessed IDs.
5. ST1 updates allowed progress/notes. A capability-protected action fails until Owner grants capability and the page refreshes.
6. Complete readiness; generate itinerary, voucher, manifest and driver sheet. Driver documents contain no money/private supplier notes.
7. ST1 reports normal incident; ST2 reports urgent incident. Completion stays blocked until required readiness, segments and urgent incident are resolved.
8. Complete trip once. Feedback/settlement work must not duplicate on retry.

## 5. Collection, changes and settlement

1. ST1 reports exceptional customer collection. It remains pending and does not credit the booking.
2. Owner verifies/links once. Partial/final cash handover never creates a second payment.
3. Sales requests a change; Owner approves; Sales records customer decision. A declined change leaves original agreement unchanged.
4. Test partial cancellation, supplier bill/payment, refund in two instalments, supplier credit and recovery independently.
5. Submit financial entry as Sales; Owner reviews. Self-approval must be blocked.
6. Closure is blocked by pending balances, approvals, custody or tasks. Resolve all, close, block new entries, then reopen with reason.

## 6. Administration, import, reports and security

1. Owner reviews pending signup, assigns role, activates, changes role with reassignment, and verifies last-Owner protection.
2. Deactivate a test account; its session loses CRM access.
3. Preview fictional CSV/XLSX, test invalid rows and duplicates, commit and repeat. No duplicate rows or reminder flood.
4. Reports: test dates/staff/stage/source/destination. Screen and CSV/XLSX totals agree.
5. Export values beginning `=`, `+`, `-`, `@`; spreadsheet opens them as text, not formulas.
6. Alter customer, quote, booking, invoice, document and settlement IDs from wrong sessions. Expect 403/404 and no private content.
7. Test 320, 390, 768 and 1440 px; bottom navigation, More sheet, long names, forms, keyboard and offline screen.

## Failure record

Record session/account, URL, action, expected, actual, timestamp, screenshot and whether data changed. Unauthorized data, wrong money, duplicate booking/payment, missing history or false approval/delivery status is Critical.
