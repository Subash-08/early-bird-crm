# Demo data, optimisation and what remains

## Safe demo records

Run this only with the development database configured in `.env.local`:

```powershell
npm run db:seed-demo
```

The command requires `APP_ENV=development`. It creates eight fictional customers, eight enquiries, seven follow-up tasks and one notification. Every record uses a `demo:` identifier and `example.test` email address. It is idempotent: running it again does not create duplicates or overwrite records you edited.

The seed intentionally does not insert fake approved quotations, payments or supplier confirmations. Those records must be produced through the UI so approval, version, audit and money rules are genuinely tested.

## Suggested manual path

1. Sign in as Owner and confirm the eight demo customers and enquiries are visible.
2. Open **Enquiries → New enquiry**. Search `Ananya`, `9900000101` or `ananya.demo`; choose the returned customer.
3. Assign an enquiry to Sales and confirm Sales receives the task and in-app notification.
4. As Sales, complete the missing details and request a quotation.
5. As Owner, prepare and approve it. As Sales, record manual sharing and acceptance.
6. Continue through booking, advance verification, Operations release, arrangements, trip completion and settlement using the existing phase checklists.

Never use real payment evidence, passport files or customer identity documents during development testing.

## Optimisations now implemented

- Customer selection uses a 300 ms debounced server search instead of rendering every customer as an option.
- Each lookup returns at most 20 fields-only results and applies the signed-in user's role/assignment rules.
- Previous requests are aborted when the query changes.
- Customer name, email and phone indexes support lookup and duplicate checks.
- Authenticated CRM responses remain private and uncached.
- The workspace refreshes only while visible, on focus/reconnection and after writes.

## Remaining launch work

Local functional development is complete enough for full manual acceptance. These items require business data, external accounts or production decisions:

1. Full manual acceptance using the role-by-role script in `complete-manual-acceptance-guide.md`.
2. Production hosting/domain, secrets, scheduler monitoring, error monitoring and security acceptance.
3. Atlas backup retention configuration and a real restore rehearsal.
4. Cloudinary credentials plus an approved public/private asset policy. Sensitive evidence remains authenticated rather than publicly hosted.
5. Historical supplier, package, traveller, booking and finance migration after source files and opening-balance strategy are approved.
6. Accountant approval for invoice/refund/tax wording and Owner approval for quotation branding, bank details, cancellation policy and terms.
7. Optional browser push notifications. The PWA install experience and persistent in-app notifications already work.

External Salesforce, HubSpot or Marketo synchronization is not currently required for this internal agency CRM. If it is added later, use server-side queued jobs with retry/idempotency rather than loading their SDKs in the browser.
