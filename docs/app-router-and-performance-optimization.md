# App Router pages and performance handoff

Updated: 3 November 2026

## What changed

The CRM now uses a real URL for every main workspace. Opening a link directly, refreshing it, and using browser Back/Forward all keep the selected feature:

| Feature | URL | Roles |
| --- | --- | --- |
| Today | `/dashboard` | Owner, Sales, Operations |
| Enquiries | `/enquiries` | Owner, Sales |
| Customers | `/customers` | Owner, Sales |
| Quotations | `/quotations` | Owner, Sales |
| Bookings | `/bookings` | Owner, Sales |
| Operations | `/operations` | Owner, Sales, Operations |
| Money & changes | `/settlements` | Owner, Sales |
| Tasks | `/tasks` | Owner, Sales, Operations |
| Notifications | `/notifications` | Owner, Sales, Operations |
| Reports | `/reports` | Owner, Sales, Operations, with role-safe results |
| Import data | `/imports` | Owner only |
| Invoice template | `/invoice-settings` | Owner only |
| Team & setup | `/staff` | Owner only |

The desktop sidebar and mobile navigation remain mounted when moving between these URLs. Only the page content shows a loading animation. A hard refresh or a shared direct link uses the route-level loading screen.

## Data-loading improvements

- `/api/crm?scope=<feature>` loads only the collections required by that feature instead of returning the complete CRM workspace every time.
- Private responses remain `no-store`; CRM data is not placed in a public or offline cache.
- Rapid navigation ignores stale responses, so a slower old request cannot overwrite the current page.
- Today, Operations, Tasks and Notifications refresh every 30 seconds while visible. Less time-sensitive pages refresh every 2 minutes and also refresh when the window regains focus or reconnects.
- Quotation, Booking, Operations, Settlement, Reports and Invoice Template UI modules are split into separate browser chunks and loaded when needed.
- Navigation targets are prefetched on pointer hover.
- Customer selectors continue to use limited server search rather than downloading every customer.

## MongoDB indexes

`npm run db:setup` creates the indexes. New query-aligned indexes cover:

- owner task due-date ordering;
- enquiry and quotation recent-update ordering;
- booking recent-update ordering;
- unread notification count plus recent notification ordering;
- booking invoice history ordering;
- trip segments by booking and start time.

Run `npm run db:setup` once against each environment after deployment. It is idempotent and does not delete business data.

## Manual checks

1. Sign in as Owner and click every sidebar item. Confirm the URL changes and the sidebar does not disappear or flash.
2. Confirm only the content area shows `Loading this workspace…` during a change.
3. Use browser Back and Forward. Confirm the highlighted navigation item, heading and data follow the URL.
4. Refresh `/bookings`, then paste the same URL into a new signed-in tab. Confirm Bookings opens directly.
5. Sign in as Sales and type `/staff`, `/imports` and `/invoice-settings`. Confirm the app returns to `/dashboard` and does not reveal owner data.
6. Sign in as Operations and type `/bookings`, `/customers`, `/quotations` and `/settlements`. Confirm the app returns to `/dashboard`.
7. Open DevTools Network, move from Today to Bookings, then Operations. Confirm requests use `scope=dashboard`, `scope=bookings` and `scope=operations` respectively.
8. Click several navigation items quickly. Confirm the final clicked page wins and earlier responses do not replace it.
9. At mobile width, repeat the checks with bottom navigation and More.
10. Run `npm run db:setup`, `npm run typecheck`, `npm run lint`, `npm run test` and `npm run build`.

## Still pending before production

These are release or scale tasks, not missing basic navigation:

- complete the multi-role manual acceptance guide with realistic agency records;
- configure production hosting, TLS/domain, secrets, job scheduler monitoring and Atlas backup/restore rehearsal;
- approve and run real historical-data migration; do not fabricate missing booking or payment records;
- activate external asset storage only after the Cloudinary account and retention policy are chosen;
- add server pagination/cursor loading when any main list regularly approaches 1,000 records;
- add entity detail URLs such as `/customers/[id]` and `/bookings/[id]` only if sharing/bookmarking individual records is required;
- add automated browser tests for navigation and role redirects after the manual behavior is approved.

Not planned without separate approval: automated WhatsApp, payment gateway, live flight/train inventory, GPS tracking, customer portal or AI-approved rates.
