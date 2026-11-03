# Data and permissions

## Progressive collection

Collect a few fields initially. Ask for more only when the next business step needs them. Allow Unknown / Flexible where appropriate; do not force invented answers.

| Stage | Required now | Optional or conditional |
|---|---|---|
| New enquiry | Customer name, one usable contact, source, destination/service request (TBD allowed), assignee or owner queue, first-contact deadline | Email, alternate contact, rough dates and budget |
| Quote request | Trip dates or clearly labelled flexible range, destinations, adults/children, services needed, pickup/drop when transport requested, hotel nights/rooms when lodging requested | Budget may be unknown; language, interests, pace, occasion, preferences |
| Quote approval | Exact service dates or labelled indicative scope, travellers/rooms basis, selected services, price basis/currency, inclusions/exclusions, payment schedule, validity, cancellation terms | Alternative options, optional extras, owner internal cost notes |
| Acceptance | Exact approved version and selected option, accepted date, channel/reference, recorded-by | Customer message attachment |
| Booking/services | Confirmed dates, lead traveller/contact, payer, assigned coordinator, required advance terms | Passenger details become mandatory only for relevant tickets/hotels/permits |
| Pre-travel | Necessary confirmations, assignment, customer contact, pickup information and relevant document checks | Emergency contact and assistance notes when applicable |

## Contact, payer and travellers

- Customer is the person/organization communicating with the agency; a customer can have many enquiries and bookings.
- Payer can differ from the customer and from all travellers.
- Traveller name must match required travel documents when applicable. DOB/age, nationality and identity details are conditional on service requirements; do not collect passport numbers for a routine local car trip.
- Children need ages at travel date for accurate quotation/room occupancy. Age bands and infant/child policies belong to the supplier/service; do not hard-code one universal rule.
- Same family phone number does not prove two people are duplicates. Duplicate matches require review.
- Address and billing identity/GST fields are collected when invoice treatment needs them, not during first contact.
- Assistance/dietary/accessibility notes are optional and purpose-limited; share only what an assigned service provider needs.

## Trip and service records

- Trip: type, cities/countries, dates/flexibility, party size, purpose, preferred language, budget and budget basis (total/per person/per couple), currency.
- Service types: accommodation, car/transfer, flight, train, bus, ferry/boat, activity, visa/permit assistance and other.
- Responsibility for every service: Agency arranged, Customer booked, Third-party arranged, Not required. Track coordination references without adding customer-booked ticket prices to agency revenue.
- Each segment: departure/arrival places, dates, local times/time zones, provider, reference/PNR when relevant, passengers, status and dependencies. An overnight train is not automatically a hotel night.
- Accommodation: city, hotel/houseboat, check-in/out, room category/count, occupancy, meal plan in plain language, extra beds, confirmation and special requests. Support split stays and different hotels for different nights.
- Vehicle: type, seats/luggage, own/vendor vehicle, driver, dates/time range, route, included km/hours, extra km/hour rate, AC terms, toll/parking/driver allowance inclusion, reporting point. Odometer and actual expenses are optional execution fields.
- Itinerary: day/date, city, activities, transfers, stay, meals and notes; service items can link to itinerary entries.
- Permit/visa: requirement, responsible party, due date, status (Required/Pending/Complete/Not applicable), checked by/time, notes. A requirement is never considered satisfied merely because a file exists.

## Quotation records

Reusable package templates hold draft itinerary, room/meal choices, inclusions/exclusions, reusable terms and optional extras. Template prices are suggestions requiring owner review.

Quotes can offer alternative hotels/meal plans and different price bases. Store quantity, unit price, discount, tax components where configured, currency and final total. Per-couple, per-person and full-package prices must be labelled explicitly. Keep internal supplier cost and margin separate from customer-facing prices.

Owner approval freezes a numbered version and starts its PDF job. Acceptance freezes the chosen option and terms. Editing an approved version produces a new draft; it cannot silently change an already sent/accepted document. Old versions remain accessible according to permission.

## Suppliers and financial records

- Supplier: category, contact person/details, location, currency, active status. Deactivate rather than remove suppliers used in bookings.
- Arrangement: booking, supplier, service scope/date, agreed cost/currency, due date, confirmation reference/status. Paying does not confirm delivery.
- Customer payment: payer, booking, amount/currency, paid date, method/reference, submitted-by, verified-by/time, verification state and invoice allocations.
- Supplier payment: supplier/arrangement, amount/currency, date, method/reference, recorded/approved-by and allocation.
- Invoice: unique number, booking, issue/due dates, billing identity, lines, tax treatment and status. Owner approves applicable accounting configuration with their accountant before live billing; old PDF wording is not a tax rule.
- Receipt: unique number from a verified payment. Multiple instalments and one payment allocated across invoices are supported with allocation limits.
- Adjustment/refund: original record reference, reason, amount, approval and actual payment/recovery history. Never delete verified money to correct a mistake; reverse/adjust it with history.
- Foreign currency: retain original currency/amount, conversion rate/date/source and booked INR equivalent. Later actual conversion differences are recorded separately.

## RBAC: three roles and optional delegated capabilities

Owner and sales executive are the default coordinators. The Operations coordinator column below describes an optional delegated capability set, not an extra employee or a required role at launch. Sales coordination does not authorize approving quotations, verifying payments or committing unapproved supplier costs.

| Capability | Owner | Sales | Operations coordinator | Operations driver |
|---|---|---|---|---|
| Customer/enquiry access | All | Assigned scope | Assigned booking/service details | Lead contact for assigned leg |
| Edit requirements and follow-up | Yes | Assigned records; before approval or via change request | Service notes only | Execution notes only |
| Prepare/approve quote | Yes | Request only | No | No |
| Approved quote PDF | Yes | Assigned customers | Only relevant itinerary/service document | Trip sheet only |
| Selling price/payment balance | All | Assigned customer amount needed to communicate | Hidden by default | Hidden except specifically authorized collection amount |
| Supplier costs/margin | All | Assigned arrangement cost if necessary to coordinate; no margin or agency-wide costs | Only delegated arrangement costs if needed | No |
| Verify payments/refunds | Yes | Submit evidence/request | Submit permitted expenses/evidence | Submit authorized collection/expense evidence |
| Arrange services/assign drivers | Yes | Assigned bookings within owner-approved scope; new costs/substitutions need approval | Only when explicitly delegated | No by default |
| Sensitive identity documents | Authorized business need | Assigned travellers only if collection required | Only necessary service documents | No general access |
| Export/import/staff settings | Yes | Restricted assigned customer documents | Assigned service sheets | Assigned trip sheet |

Owner can grant explicit extra capabilities; defaults remain narrow. Reassignment transfers open work and immediately changes access. Deactivated users lose sessions and pending work is reassigned. Staff cannot expand permissions by changing record IDs, accessing another route, exporting, or opening an old download URL.

Post-approval edit rules: basic contact typo corrections are audited; traveller identity changes trigger relevant supplier/ticket review; dates, service scope, price and selected options require owner review and customer reconfirmation where the agreement changes.

## Optional driver additions and edits

Default: update assigned trip progress, actual arrival/start/end times, execution notes and incidents. Owner may enable odometer/expense evidence, logistical-detail updates, or draft service/change requests for assigned work. Proposed pickup/route/service changes that affect the customer promise require coordinator review and owner approval for commercial impact. No driver changes approved price, discount, taxes, supplier payable, invoice, receipt, refund, permissions or another driver's assignment. Revoking a grant takes effect on the next server request; an already-open form cannot bypass it.

## Exceptional driver collection

Normal customer payments go through the owner. If a driver exceptionally receives money, either the driver submits a collection report or the owner records it on their behalf. Required: booking/service, amount/currency, method, collected-at date/time, payer, collected-by, entered-by and explanation/reference; evidence is optional when unavailable. Notify owner, show Pending verification and give the reporter a tracking status. Never automatically mark the booking paid.

Owner can verify, reject or request clarification. Verification links the report to exactly one customer payment or to an existing matching payment. A cash-custody record tracks money still with the driver, handed over, partly handed over and reconciled. Customer-payment verification and physical handover are distinct. Handing over or depositing the same cash creates no second customer receipt. Record discrepancies, returns, owner-entered reports, corrections and notification acknowledgement with history. Drivers see their own reports without gaining financial-ledger access.
