# Phase 2 Manual Test Checklist

Use a separate development database and three test accounts: Owner, assigned Sales, and Operations. Never use real passport, payment or customer data during testing.

## 1. Access and privacy

- Owner can open every quotation; assigned Sales can open only their own; Operations sees no Quotations navigation or quotation data.
- Reassign an enquiry and confirm all old quote versions move to the new assignee and disappear from the previous Sales account.
- Inspect the Sales API response, screen and PDF: supplier cost, margin and internal notes must be absent.
- Try the PDF URL while signed out, as Operations, and as a different Sales user; each must be denied.
- Confirm a draft or failed PDF cannot be downloaded.

## 2. Request and missing information

- Request a hotel-only quote with stay/location/room needs and no transport; it should be allowed.
- Request agency-arranged car transport without pickup/drop; it should show a clear missing-information message.
- Record customer-booked flight/train details for coordination and confirm they are not priced as agency services.
- Confirm Flexible/Unknown dates can use an indicative label and Exact dates require a valid range.
- Confirm a second active request for the same enquiry is blocked.
- Return a request to Sales with a reason/due date; confirm task and notification; add information and resubmit.

## 3. Owner preparation

- Build at least two options and link each stay/transport row to the correct option.
- Try a discount greater than the line price, zero/negative quantity, invalid date range and missing cancellation terms; approval must be blocked.
- Try including an agency charge on a Customer booked transport leg; approval must be blocked.
- Save and apply a template; confirm customer, dates and travellers are not incorrectly overwritten.
- Open the same draft in two sessions, save both, and confirm the stale session receives a refresh/conflict message.

## 4. Approval and PDF

- Approve as Owner; confirm the version becomes frozen and a PDF-ready notification/send task is created.
- Confirm Sales cannot edit or approve.
- Open the PDF and verify customer, dates, travellers, options, totals, itinerary, stays, transport, inclusions, exclusions, advance, validity and cancellation terms.
- Use long destination/property names plus Hindi text; confirm the PDF remains readable and paginates without clipping.
- Temporarily cause PDF generation to fail, then restore it and use Retry once; confirm repeated retries are blocked.
- Confirm editing requires Create revision and the earlier approved PDF remains unchanged.

## 5. Sharing and decision

- Record manual WhatsApp sharing with date/reference and follow-up; confirm status says Sent, not Delivered/Read.
- Confirm sharing is blocked until the approved PDF is Ready.
- Accept one exact approved option; confirm the quote becomes Accepted and the enquiry becomes Won.
- Attempt to accept a missing option or accept a second version; both must be blocked.
- Test Rejected with reason and Changes requested; verify activity, notifications and follow-up work.
- Create a revision after acceptance and confirm the accepted historical version remains immutable.

## 6. Expiry and background work

- Set a near validity date and run `npm run worker`; confirm one expiring-soon task/notification appears without duplicates.
- Move time beyond validity, run the worker and confirm an unaccepted quote becomes Expired.
- Confirm Accepted/Rejected/Superseded quotes do not expire or create misleading work.
- Stop the worker during approval, restart it, and confirm a queued PDF job is recovered.

## 7. Responsive and recovery

- Test quotation list, builder and preview at desktop, tablet and 375px mobile widths.
- Confirm keyboard focus, visible errors, disabled busy buttons, empty states and reduced-motion behavior.
- Cause a request error and confirm its modal stays open with the entered data.
- Refresh during each major state and confirm the server state is authoritative.

For every failure record the role, quote number/version, exact input, expected result, actual result and screenshot.
