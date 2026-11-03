# Phase 3 implementation report

Status: implemented and automatically verified. Manual business acceptance is still required.

## What Phase 3 adds

Phase 3 turns one accepted quotation into one controlled booking. It records who is travelling, who is paying, the agreed advance, invoices, payment submissions, owner verification and the hand-off to operations.

The simple staff flow is:

1. Sales records the customer decision on an approved quotation.
2. Owner or assigned Sales creates the booking. Repeating the action opens the same booking; it never creates a duplicate.
3. Owner issues the invoice. Sales downloads it and shares it manually.
4. Sales records a payment reported by the customer. A screenshot is evidence only and does not count as money received.
5. Owner verifies or rejects the payment.
6. When verified payments reach the agreed advance, Owner assigns Operations and releases one trip checklist.

## Features delivered

- Immutable copy of the accepted quotation, option, price, currency and advance terms.
- Separate payer and traveller details with exactly one lead traveller.
- Booking stages that distinguish awaiting money from operational release.
- Draft and issued invoice records with a customer-safe PDF.
- Partial and split payment submissions, optional private evidence and owner-only verification.
- Unique references, verified receipts, outstanding balance and overpayment/unapplied credit.
- Owner-controlled advance amendment with previous values retained in history.
- Operations release only after sufficient verified advance, or an explicit owner exception reason.
- One release checklist and one set of operations tasks even when an action is retried.
- Driver-safe booking view containing trip/contact/checklist information but no invoices, payments, payer details or commercial agreement snapshot.
- Reminder processing for pending verification, overdue advance and balance dates.
- Payment reversal history. Reversal after release creates an owner exception task instead of silently cancelling operational work.
- Issued-invoice void/correction path; invoices with verified allocations cannot be casually voided.

## Deliberate boundaries

Phase 3 does not claim that hotels, vehicles or suppliers are confirmed. It only releases the work needed to arrange them. Supplier arrangements, vehicles, driver trip execution, vouchers and manifests belong to Phase 4 and have not been started.

Automated WhatsApp, payment gateways and online ticketing are not included. Staff download documents and share them manually.

## Automatic verification completed

- TypeScript validation and linting.
- Domain tests for traveller rules, exact money conversion, overpayment credit and operations privacy.
- Database workflow test for idempotent booking creation, partial payments, duplicate references, verified receipts, release gating, one checklist and post-release reversal.
- A4 invoice generation and rendered visual inspection.

Run the full project checks before each handoff: `npm run typecheck`, `npm run lint`, `npm run test` and `npm run build`.
