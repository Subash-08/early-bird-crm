# Phase 3 manual test guide

Use a development database and three separate browser sessions: Owner, Sales and Operations. Do not use real customer identity or payment evidence while testing.

## A. Normal booking flow

- [ ] In Sales, open an accepted quotation and choose **Create booking**.
- [ ] Repeat **Create booking**. Confirm that the same booking opens and no second booking appears.
- [ ] Add payer, one lead traveller, any additional travellers, travel dates and payment deadlines.
- [ ] Confirm the form refuses zero lead travellers, two lead travellers and an end date before the start date.
- [ ] In Owner, issue the invoice and download its PDF. Check customer, booking number, amount, currency, advance and payment terms.
- [ ] In Sales, submit a partial payment with a unique reference. Confirm the booking still says that advance is pending.
- [ ] In Owner, verify the payment. Confirm a receipt becomes downloadable and the outstanding amount changes once.
- [ ] Submit and verify the remaining advance. Confirm the booking becomes eligible for operations release.
- [ ] Assign an active Operations member and release the booking. Confirm exactly one checklist/task set appears.
- [ ] Repeat release. Confirm no duplicate checklist or tasks are created.

## B. Payment and invoice exceptions

- [ ] Submit evidence without verifying it. Confirm totals and release eligibility do not change.
- [ ] Reject a payment with a reason. Confirm it adds no credit and the reference can be corrected/resubmitted.
- [ ] Try the same transaction reference twice. Confirm the second submission is blocked.
- [ ] Try verifying a different currency. Confirm verification is blocked.
- [ ] Verify several instalments. Confirm totals equal their exact sum and each verified payment has one receipt.
- [ ] Verify more than the booking total. Confirm the balance is zero and extra money is shown as unapplied credit, not a negative balance.
- [ ] Amend the required advance as Owner. Confirm the old amount and reason remain in history.
- [ ] Try voiding an issued invoice that has verified payments. Confirm it is blocked.
- [ ] Void an unpaid issued invoice. Confirm a correction draft is created without deleting the old record.

## C. Operations access and changes

- [ ] Before release, sign in as Operations and confirm the booking is not visible.
- [ ] After release, confirm only the assigned Operations member can see it.
- [ ] Confirm Operations can see customer contact, dates, route/service summary and checklist.
- [ ] Confirm Operations cannot see invoice, payments, payer billing details, quotation price snapshot or payment evidence URL.
- [ ] Deactivate the assigned Operations user before release and confirm assignment is blocked.
- [ ] Reassign the enquiry/booking to another Sales user and confirm access moves correctly.
- [ ] Reverse a verified payment after operations release. Confirm the trip is not silently cancelled and Owner receives a financial exception task.

## D. Usability and recovery

- [ ] Test desktop and mobile widths. Important actions must remain readable without horizontal page scrolling.
- [ ] Test long customer names, destination text and notes.
- [ ] Refresh during each stage. Confirm saved data remains and no action is repeated.
- [ ] Open the same booking in two Owner tabs, update one, then submit the older tab. Confirm the stale update is rejected.
- [ ] Run `npm run worker` twice. Confirm reminders are not duplicated.
- [ ] Temporarily use invalid PDF/font configuration. Confirm financial data remains saved and the error is visible rather than a false document success.

## Sign-off

Record defects with the role, booking number, exact action, expected result, actual result and screenshot. Phase 3 is manually accepted only after Owner, Sales and Operations complete the normal flow and all security checks pass.
