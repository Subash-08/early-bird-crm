# Pagination, filters and detail-page report

Updated: 3 November 2026

## Changes made

- Customers, Enquiries, Quotations, Bookings, Operations, Money & changes, Tasks and Notifications use server pagination.
- Page sizes are limited to 10, 20 or 50; the API never accepts more than 50 primary records per page.
- Search waits 350 ms and runs on the server. Stale responses cannot replace the latest page.
- Important lists have status, assignee, from-date, to-date and page-size filters where applicable.
- Responses include authorized total rows and pages. Dashboard supporting lists remain capped.
- Notifications no longer download unrelated CRM collections just to choose a destination.
- Customer cards open `/customers/[id]`; the endpoint checks organization, role and assignment before returning linked records.
- Customer detail caps each linked history and never returns document bytes.
- Customer Edit remains a separate action.
- Task updates send only schema-approved fields, fixing the `unrecognized_keys` error.
- Demo fixtures now include 22 fictional leads, enough to test page 2 at the default size.

## Indexes added

Indexes now align with organization, role/assignee, status, service/due date, update-time ordering and customer-detail relationships for customers, enquiries, quotations, bookings and tasks. Existing notification recipient/read/date indexes remain in use.

Run `npm run db:setup` against each environment after deploying this code. It is idempotent and does not delete CRM records.

## Deliberate limits

- Reports remain server-aggregated and keep independent filters, so pagination never changes report totals.
- Supplier and vehicle masters remain bounded for the agency's expected size. Add separate pagination only if those masters become materially large.
- Quotation and booking action workflows remain in focused drawers; splitting them now would add complexity without reducing primary-list payloads.
- No Vercel deployment, environment secret, production data or live database was changed.

Use `docs/manual-test-with-current-accounts.md` and record evidence for every failure.
