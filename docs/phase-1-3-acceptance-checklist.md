# Phase 1–3 acceptance checklist

This is the short sign-off index. Use the detailed guides linked below for step-by-step checks.

## Phase 1 — Enquiries and daily work

- [ ] Owner creates/assigns an enquiry; Sales receives one notification and one task.
- [ ] Sales records a call and next follow-up; My Day shows the correct date.
- [ ] Reassignment transfers open work and removes old access.
- [ ] Customer/enquiry imports preview errors and retries do not create duplicates.
- [ ] Owner, Sales and Operations API permissions match the UI.

Detailed guide: `phase-1-manual-test.md`.

## Phase 2 — Quotations

- [ ] Sales requests a quotation; Owner returns missing information or prepares it.
- [ ] Owner approves a frozen version; PDF matches that exact version.
- [ ] Manual sharing records the action without claiming WhatsApp delivery.
- [ ] Revision creates a new version and leaves the old PDF unchanged.
- [ ] Customer acceptance records the exact option/version and remains separate from payment.

Detailed guide: `phase-2-manual-test.md`.

## Phase 3 — Booking and verified advance

- [ ] Accepted quote creates one booking even when retried.
- [ ] Payer, lead traveller and dates validate clearly.
- [ ] Invoice PDF is correct and customer-safe.
- [ ] Unverified/partial/rejected/duplicate payments cannot falsely release operations.
- [ ] Verified split payments create exact totals and one receipt each.
- [ ] Agreed advance releases one assigned operations checklist.
- [ ] Operations sees only the minimum trip data and no finance/evidence.
- [ ] Advance amendments, invoice correction and payment reversal preserve history.
- [ ] Reversal after release creates an Owner exception task.

Detailed guide: `phase-3-manual-test.md`.

## Technical gate

- [ ] `npm run db:setup`
- [ ] `npm run typecheck`
- [ ] `npm run lint`
- [ ] `npm run test`
- [ ] `npm run build`
- [ ] Separate Owner, Sales and Operations browser sessions tested.
- [ ] No real secrets, activation links or customer files committed.

Phase 4 is a separate approval: suppliers, hotel/vehicle arrangements, driver trips, operational documents and incidents.
