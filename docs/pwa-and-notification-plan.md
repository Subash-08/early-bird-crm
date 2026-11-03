# Mobile, PWA and notification plan

## Available now

The responsive CRM works in a mobile browser. It now has role-based bottom navigation, a More sheet, mobile page search, full-screen form drawers, safe-area spacing and larger touch targets. Drivers have My trips; finance screens use single-column forms on smaller screens. An offline banner explains that saving needs a connection. In-app data refreshes after writes, on focus/reconnection and about every 30 seconds while visible. The server worker handles due reminders independently of open browsers. See `mobile-navigation-and-screens.md`.

There is no installable PWA, service worker, offline data cache or operating-system push notification implementation in this phase. No WhatsApp automation is required; staff share manually.

## Phase 6 preparation

- Validate every primary workflow at 390px and tablet width, keyboard navigation, zoom, long names, form error focus and slow networks.
- Provide a clear installed-app name/icon, application manifest, theme colour and standalone launch mode. Generate 192px/512px and Apple touch icons from the approved agency branding.
- Keep role navigation simple: Owner/Sales see their coordination screens; drivers start in My trips.
- Add a notification preference page only when there are real choices to configure. Never ask users to allow push before explaining why.

## Phase 7 PWA installation and safe offline screen

1. Deploy over HTTPS with the real auth origin and secure cookies.
2. Add and test manifest/install instructions for Android Chrome and iPhone Safari Add to Home Screen. Installed browser behaviour varies and must be tested on real devices.
3. Register a versioned service worker that caches only public icons and an offline fallback screen.
4. Do not cache CRM APIs, authenticated pages, PDFs, passports, financial evidence, tokens or customer contact records. Do not save private form drafts in localStorage by default.
5. Offline: show connection status and phone fallback. Do not queue payments, approvals, cancellations or other financial writes for later replay.
6. Test logout, role revocation, app upgrades, old service workers, reconnect and multiple tabs. Show an update prompt after saving rather than reloading an unfinished form.

## Notification delivery

| Event | Recipient | Delivery now |
| --- | --- | --- |
| Assignment, follow-up, quote ready | Assigned staff | In-app inbox + task |
| Payment/financial/change review | Eligible Owner | In-app inbox + review task |
| Change approved | Assigned Sales | Customer-confirmation task |
| Booking change applied | Coordinator and assigned drivers | Minimal in-app alert; no driver financial figures |
| Supplier bill/refund/recovery due | Owner | Follow-up task + due alert |
| Financial closure/reopen | Owner and assigned Sales | In-app alert + audit history |

Configure either the persistent worker or an authenticated scheduler before launch. Test that reminders work with browsers closed. Notification reading never counts as task completion or financial approval.

## Optional push after the initial release

If the agency requests it, add VAPID keys, per-device subscriptions, explicit opt-in, expired-subscription cleanup, logout/account-deactivation revocation, retry/backoff and deduplication. Keep notification text generic: “A task needs your attention.” Opening it must authenticate and check current assignment. Push supplements the persistent inbox; delivery is not guaranteed and does not complete a task. This requires its own implementation and device tests.

Implementation reference: the bundled Next.js guide at `node_modules/next/dist/docs/01-app/02-guides/progressive-web-apps.md`.
