# Phase 2 Completion Report

## Outcome

Phase 2 adds the complete quotation workflow on top of the Phase 1 enquiry CRM. Sales can request a quotation from a sufficiently complete enquiry; the Owner prepares and approves it; the CRM freezes that version, creates a customer-safe PDF, and returns a send task to Sales. Sales records manual sharing and the customer's exact decision without gaining access to supplier cost or margin.

## Working features

- Quotation request validation based on the services the customer actually needs.
- Owner preparation workspace for itinerary, stays, transport, priced options, extras, inclusions, exclusions, advance, validity, balance and cancellation terms.
- Exact and indicative date handling, domestic and international transport modes, agency-arranged and customer-booked responsibility.
- Multiple named price options with exact minor-unit totals, discount/tax fields and Owner-only internal cost/margin.
- Owner templates for reusable quotation content.
- Return-for-information and resubmission loop with linked tasks and notifications.
- Owner-only approval with a frozen, immutable customer snapshot.
- Durable PDF job, stored document, checksum, independent download authorization and one controlled retry after failure.
- Customer-safe PDF with itinerary, stays, transport, options and commercial terms; internal notes, costs and margins are excluded.
- Manual WhatsApp, email, phone or in-person sharing log. Recording a share never claims automated delivery.
- Exact-option acceptance, rejection or changes-requested outcome, with follow-up tasks and enquiry-stage synchronization.
- Revision flow that preserves every earlier approved/accepted version.
- Automatic expiring-soon work and expiry handling.
- Reassignment of every quotation version when enquiry ownership changes, immediately removing the former assignee's access.
- Owner and assigned Sales access only; Operations cannot view quotations or customer commercial data.
- Server-enforced state changes so users cannot manually bypass the quotation workflow from the enquiry screen.

## Edge cases covered

- Hotel-only, transport-only and customer-already-booked transport enquiries.
- Missing hotel, room, pickup, traveller or date information.
- Flexible/unknown dates without inventing exact dates.
- Duplicate active quotation requests.
- Invalid totals, excessive discounts, invalid option links and priced customer-booked legs.
- Concurrent edits through record-version checks.
- Draft, failed or unauthorized document downloads.
- Duplicate acceptance and acceptance of an option not present in the approved snapshot.
- Revision after approval, rejection, expiry or acceptance without overwriting history.
- PDF failure/retry, stale validity dates and assignment changes.
- Unicode-capable PDF fonts, multi-page content and reduced exposure of private fields.

## Deliberately excluded

Phase 2 does not confirm advance receipt, create bookings, reserve suppliers, dispatch drivers, record payments or upload Cloudinary assets. Those are Phase 3 and later. A customer accepting a quote changes the enquiry to Won, but it does not claim that money was received or that a supplier is confirmed.

## Verification

- TypeScript validation
- ESLint validation
- Unit tests for quotation validation, money calculations and role privacy
- MongoDB replica-set integration test for request → approval → PDF → sharing → acceptance
- Next.js production build
- Visual inspection of both pages of the generated sample quotation PDF

Manual business acceptance remains required with the agency's own MongoDB Atlas development database. Use `docs/phase-2-manual-test.md`.
