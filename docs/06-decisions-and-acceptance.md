# Decisions and acceptance

Status: Phases 1–4 approved and implemented; manual business acceptance is pending. Phase 5 is not authorized.

## Confirmed requirements

- Next.js App Router + TypeScript, MongoDB Atlas, Cloudinary.
- Domestic and international; cars, trains, flights and relevant boats/ferries.
- Partial-service bookings and customer-held tickets.
- Owner enters/assigns enquiry; sales gathers details and follows up.
- Sales requests quote -> owner prepares/approves -> system PDF -> sales sends.
- Owner verifies advance -> operations task/checklist; next-action dates create to-dos.
- Required and optional fields, restricted permissions, Excel/CSV migration.
- Project destination D:\AI\earlybird-travel-crm.
- Owner and sales executive coordinate hotels, suppliers and drivers. Driver logistical edit capabilities can be explicitly granted within assigned work; owner retains commercial and financial approvals.
- No fixed group departures or seat inventory.
- Drivers normally do not collect; exceptional collections are reported/entered, notify owner and require verification. Track cash custody separately.
- In-app notifications plus manual WhatsApp sharing; no external business notification integration at launch.
- Initially one owner, one sales and multiple operations members. Staff count may increase later.
- User supplies credentials manually. Phases 1–4 were explicitly approved for implementation.

## Open business decisions

| Question                                                       | Draft assumption until answered                                                                                                            |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Is any sales person allowed to draft quotations?               | No; owner prepares and approves as specifically requested                                                                                  |
| Own vehicles, vendor vehicles, or both?                        | Both; driver/vehicle assignments tracked separately                                                                                        |
| Agency books/issues tickets or only records external bookings? | Record/coordinate manual bookings; no live ticketing integration                                                                           |
| Need passport/ID scans or readiness fields only?               | Readiness fields first; private scans conditional on a confirmed service need                                                              |
| Default advance, balance deadlines and cancellation terms?     | Configurable per approved quotation; owner resolves conflicting samples                                                                    |
| Billing/tax rules and accountant-approved examples?            | No hard-coded tax treatment from samples; require approved settings before live billing                                                    |
| Import which old data and in what volume?                      | Customers/suppliers/enquiries first; historical finance needs migration strategy                                                           |
| Currency, languages and date format?                           | INR reporting and English UI; supplier currencies and local time zones supported                                                           |
| Hosting/domain and notification budget?                        | To select before production; runtime and job support required                                                                              |
| Which additional driver edit capabilities should be enabled?   | Trip execution and collection reports by default; optional logistical edits/draft requests for assigned work only                          |
| Should every arrangement be owner-approved?                    | Owner approves commercial commitment/scope; sales can coordinate and record confirmations within that approval; exceptions return to owner |

These questions remain launch/next-phase decisions. Silence is not approval for Phase 5 or production deployment.

## Required acceptance scenarios

1. Owner assigns enquiry; assigned sales receives one task/notification and sees only allowed details.
2. Follow-up saved/rescheduled/completed updates enquiry and task together, including after reassignment.
3. Incomplete enquiry saves as draft; firm quote submission enforces only relevant requirements.
4. Hotel-only quote requires no vehicle/flight fields; customer-booked tickets are excluded from agency charges.
5. Owner approves quote v1, PDF matches snapshot; edits produce v2; acceptance identifies exact version/option.
6. PDF failure can retry without reapproving or duplicating documents; draft cannot be mistaken for approved quote.
7. Partial/duplicate/unverified payment cannot falsely release operations or double-credit customer.
8. Sufficient verified advance creates operations checklist once, but booking stays pending until confirmations are complete.
9. Supplier paid and supplier confirmed remain independent; zero paid is Unpaid.
10. Assigned driver sees permitted contact and route only, including direct API/export/download tests.
11. Two simultaneous assignments cannot double book a driver/vehicle.
12. Delayed flight/train/ferry creates impacted-transfer review; schedule handles midnight and time zones.
13. Quote date/passenger/service change after acceptance creates amendment path with history.
14. Partial/full cancellation separates customer refund from supplier recovery and cancels obsolete reminders.
15. CSV/XLSX preview catches duplicates, bad dates and broken references; retries do not create duplicate records.
16. Imported opening balances do not double-count historical payments; historic records do not spam notifications.
17. Reports and downloadable exports match filtered authorized records and defined money totals.
18. Role/session removal blocks old URLs and private file downloads; concurrent edits are detected.
19. Background reminders run with all browsers closed and retry failures without duplicate actions.
20. Full desktop/mobile workflow tested by an owner, sales member and driver with little technical experience.
21. Existing workbook import preserves 74 source enquiry rows and unlabelled-column notes, flags implausible dates/shifted values, and creates no unproven bookings/payments.
22. Owner and assigned sales can coordinate arrangements; drivers cannot gain those rights through URL/field changes or stale open forms.
23. Driver collection report and owner-entered duplicate resolve to one verified payment; cash handover never duplicates customer credit.
24. Staff growth needs no code change; deactivation/reassignment revokes access and preserves authorship/history.
25. Only in-app alerts are generated; manual sharing never falsely reports WhatsApp delivery.

## Definition of complete

All approved workflows have persistent live storage, server-side access enforcement, working documents/exports, real calculated reports and tested recovery paths. No placeholder buttons or fabricated activity/notifications remain. Staging acceptance, documented operational setup and approved production deployment are complete. Any external service not configured is explicitly labelled unavailable rather than simulated.
