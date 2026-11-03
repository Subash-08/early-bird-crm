# Phase 1-4 acceptance checklist

Use this short index for release sign-off; use each phase's manual guide for the detailed steps.

## Phase 1 - Enquiries and daily work

- [ ] Assignment, follow-up, tasks, notifications, staff access and import behave correctly.
- [ ] Separate Owner, Sales and Operations permissions pass direct URL/API checks.

## Phase 2 - Quotations

- [ ] Owner-approved versions, PDFs, sharing record, revision and exact customer decision pass.
- [ ] Customer documents contain no internal cost or margin.

## Phase 3 - Booking and verified advance

- [ ] Accepted option creates one booking, invoices and exact balances.
- [ ] Only Owner verification changes payment totals and operations release happens once.
- [ ] Operations receives no financial data.

## Phase 4 - Arrangements and trip execution

- [ ] Supplier and vehicle records are correct and active.
- [ ] Sales drafts arrangements; Owner confirms agency supplier commitments.
- [ ] Driver/vehicle overlap, buffer and capacity checks pass.
- [ ] Drivers see only assigned trips and permitted actions.
- [ ] Readiness, private documents and recipient-specific PDFs pass.
- [ ] Incidents, replacement, requests and cash collection/custody pass.
- [ ] Trip completion gates pass and settlement remains open.

## Technical gate

- [ ] `npm run db:setup`
- [ ] `npm run typecheck`
- [ ] `npm run lint`
- [ ] `npm run test`
- [ ] `npm run build`
- [ ] Desktop and mobile role walkthrough completed.
- [ ] No production secrets or real customer documents committed.

Phase 5 requires separate approval and covers settlements, amendments, cancellation, refunds and supplier recovery.
