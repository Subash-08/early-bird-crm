# Phase 5 manual testing guide

Use a development database and fictional customers. Sign in using separate browser profiles for Owner, Sales and Operations. Do not mark a test passed until you have tried it.

## Where to start

Open **Money & changes**, select a booking, and use these three tabs:

- Overview: remaining balances, overdue items and what prevents financial closure.
- Transactions: bills, payments, credits, refunds, recoveries, expenses and corrections.
- Booking changes: owner review, customer decision and printable adjustment.

With one Owner, Sales enters requests and Owner reviews them. An Owner cannot approve their own Phase 5 request; a second active Owner is required for an Owner-submitted request. Operations has no finance screen.

## 1. Supplier bills and instalments

- [ ] On a released test booking, add a supplier and an agency arrangement in Operations.
- [ ] Sales selects Transactions > Record a financial entry > Supplier bill.
- [ ] Enter 600 INR, the correct service, invoice reference, date, due date and reason.
- [ ] Check it says Pending review and does not count as a posted bill yet.
- [ ] Owner reviews the evidence, adds a reason, and approves. Remaining supplier balance becomes 600.
- [ ] Sales records a Supplier payment of 200 against that bill. Owner approves. Remaining balance becomes 400.
- [ ] Try to pay 401: the CRM must reject it. Paying 400 should settle the bill after approval.
- [ ] Reuse the same reference or double-click Submit: it must not create duplicate posted money.
- [ ] A payment does not confirm a hotel or mark a trip completed.

## 2. Changes and customer confirmation

- [ ] Sales requests an amendment with a revised total, reason, customer-facing description, used services and supplier impact.
- [ ] Owner approves: booking total must remain unchanged until customer confirmation.
- [ ] Customer declines: original terms remain unchanged.
- [ ] Repeat, then record customer acceptance with a real call/message reference. Revised total appears; original quotation/invoice remains in history.
- [ ] Open printable adjustment. Check old total, revised total, difference, effective date and customer reference. Use browser Print > Save as PDF if needed.
- [ ] Confirm the adjustment does not contain supplier costs or internal notes.
- [ ] Date changes create a readiness check and a supplier-review task. Coordinator updates affected arrangements/trip legs and regenerates travel documents after review.
- [ ] A second unresolved change request is blocked.

## 3. Cancellation, refunds and recovery — worked example

Use a booking whose original total is 1,000 INR, with verified customer payments of 1,000 and a supplier bill/payment of 600.

1. Sales requests full cancellation with revised customer total **400**. This means the agency retains an agreed 400 charge; it is not the refund amount.
2. Record the used-service/deduction explanation and supplier impact: supplier retains 200 and returns 400.
3. Owner approves; Sales records the customer's confirmation.
4. Check booking becomes Cancelled; unused trip legs stop; affected-service review task remains.
5. Record Refund approved **600**, then Owner approves.
6. Record Refund paid **200**, then Owner approves. Refund remaining must show **400**.
7. Record Recovery expected **400** linked to the supplier service, then approve.
8. Record Recovery received **400** against that recovery, then approve. Customer refund remaining must still be **400**.
9. Pay the remaining customer refund **400** and approve it.
10. Complete the supplier review task with confirmation/penalty details. Check all closure requirements.
11. Owner closes settlement. Final profit in this example is **200**: retained revenue 400 minus supplier net cost 200.

- [ ] Refunds above customer credit are blocked.
- [ ] Recovery above the amount actually paid to that supplier service is blocked.
- [ ] Full cancellation during an in-progress leg is blocked until the running leg is resolved.
- [ ] Partial cancellation affects selected services/trips only. Completed travel is preserved as used history.
- [ ] Cancel one traveller: other travellers and unselected services remain; a remaining traveller becomes lead if needed.
- [ ] Contact suppliers manually. CRM cancellation does not send a cancellation to a hotel, airline, railway or vendor.

## 4. Corrections, currency and expenses

- [ ] Reverse a posted payment with its exact original amount/currency/rate and a reason. Original record stays visible.
- [ ] Reversing the same entry twice is blocked.
- [ ] A bill cannot be reversed before its linked payments/credits; a supplier payment cannot be reversed while it supports an outstanding recovery.
- [ ] Driver submits an expense through My trips. After operational approval, Sales records it as Expense; Owner reviews it financially; Expense paid records reimbursement.
- [ ] Same driver expense cannot be counted twice.
- [ ] Test foreign supplier money with original currency, exact conversion rate, source and date. Amounts in different currencies are never simply added together.
- [ ] Supplier credit reduces an unpaid bill; Recovery credit records an accepted credit instead of cash recovery. Its reference remains in history. Cross-booking spending of supplier credit is not implemented.
- [ ] Invalid amounts, negative values, excess decimal places and future transaction dates are rejected.
- [ ] Fake file contents renamed to PDF, unsupported file types and files above 1.5 MB are rejected for Phase 5 evidence.

## 5. Access, tasks and mobile

- [ ] Owner sees all bookings; Sales sees assigned bookings; another Sales user's IDs/URLs are rejected.
- [ ] Operations cannot open Money & changes, settlement API, adjustment documents or financial evidence.
- [ ] Driver booking response does not include amounts, balances, payer identity or internal quote cost.
- [ ] Approval/decision notifications link into Money & changes.
- [ ] Pending reviews and settlement follow-ups appear in Tasks; reading a notification does not finish the task.
- [ ] Automatic tasks can be completed with a note.
- [ ] Refreshing, reopening the tab or waiting about 30 seconds updates the in-app notification count while online.
- [ ] At 390px phone width, fields and buttons stay usable without horizontal scrolling.
- [ ] Turn off internet: the offline notice appears; failed saves do not report success. Reconnect and refresh.
- [ ] Deactivate/reassign a driver and verify old data/document access is removed appropriately.

## 6. Financial closure

- [ ] Attempt closing with a pending refund, recovery, payment verification, expense or driver cash handover. Closure must fail with useful guidance.
- [ ] Closing is separate from Trip completed and requires customer credit/balance and supplier obligations to be reconciled.
- [ ] Closed bookings reject further money and operational changes until Owner reopens with a reason.
- [ ] Reopen and verify history is preserved. An estimated result is not labelled final profit while open.

## Repeatable automated checks

Run from `D:\AI\earlybird-travel-crm`:

```powershell
npm run typecheck
npm run lint
npm run test
npm run build
npm run test:smoke
```

`npm run test:phase5` runs the focused Phase 5 tests. `test:smoke` requires installed Google Chrome and a successful production build, uses port 3105, creates a temporary local MongoDB replica set and removes it afterwards. It does not read `.env.local` credentials or seed Atlas. Screenshots are saved under `output/qa`.

Record each result as Pass / Fail / Not tested with role, booking number, exact steps and expected vs actual result. Automated tests supplement your business review; they cannot confirm your actual cancellation terms or supplier statements.
