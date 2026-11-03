# Imports, documents and reports

## CSV and Excel migration

Owner-only wizard: Download template -> Upload CSV/XLSX -> Map columns -> Preview -> Resolve duplicates/errors -> Confirm import -> Review batch report.

Initial data types: customers, suppliers, package templates and enquiries. Historical bookings, travellers and opening balances/payment history use dedicated templates and a separate reviewed migration pass. Staff import, if needed, creates inactive invitations rather than passwords or immediately active accounts.

| Import | Core columns |
|---|---|
| Customers | external_id (recommended), name, country_code + phone or email; optional address, language, notes |
| Suppliers | external_id, name, category, contact method; optional city, currency, contact person |
| Enquiries | external_id, customer_external_id/contact match, source, service request/destination, stage, assigned staff; optional dates, party size, next follow-up |
| Bookings | external_id, customer reference, service dates, status, legacy quote/reference; validate linked services before active operations |
| Travellers | booking_external_id, traveller_external_id/name, lead flag; conditional DOB/nationality/document readiness |
| Financial history | unique legacy transaction ID, booking/customer/supplier reference, amount, currency, date, type, method/reference; owner verification required |
| Package templates | name, destination, duration, itinerary/stays/services, price basis and effective dates; complex content can use related sheets |

Rules:

- Accept CSV and XLSX, not macros/executable content. Provide file-size/row limits and background import progress for larger files.
- Normalize phone country codes, dates, currency and whitespace; preserve original import value for error reporting. Resolve ambiguous date formats before commit.
- Match by stable external ID first; phone/email provide candidate matches, not unquestioned identity. Offer Skip, Create separate, or Update selected fields.
- Blank imported cells do not erase existing information by default. Updates have previewed field-level differences.
- References must resolve before dependent rows import. Unknown staff go to an owner-review queue, not an arbitrary user.
- Show valid rows, duplicates and errors with spreadsheet row numbers. Allow corrected re-upload with stable IDs and batch deduplication.
- Record uploader, time, source filename/hash, mapping, result counts and affected IDs. Keep import files private with retention controls.
- Revert untouched records newly created by a batch where safe. Updated/financial/used records require reviewed correction, not blanket rollback.
- Do not trigger customer messages or hundreds of overdue reminders from historical rows. Preview activation separately; active enquiries receive tasks only on confirmed activation.
- Opening balance and full historical transactions are alternative migration strategies for the same period. Do not import both and double-count balances.
- Export cells are encoded as safe text where content could be interpreted as a spreadsheet formula. Never execute uploaded formulas/macros.

## Generated documents

| Document | Data and audience |
|---|---|
| Quotation PDF | Approved version/options, itinerary, rooms/meals, services, exclusions, payment/cancellation terms and agency branding; customer |
| Final itinerary | Actual confirmed plan, contact details and necessary travel notes; customer |
| Hotel/service voucher | Relevant traveller names, dates, service, reference and authorized contact; that supplier/customer |
| Driver trip sheet | Assigned route/time, lead contact, passenger count and necessary assistance; assigned driver |
| Passenger manifest | Names/details required for the particular service; authorized operations/supplier only |
| Invoice | Actual approved billing document, lines and configured tax components; payer |
| Receipt | Verified payment, allocation/reference and unique receipt number; payer |
| Refund/adjustment document | Approved adjustment and payment history reference; appropriate recipient |

PDF generation runs from frozen data snapshots with document ID/version. Drafts are clearly marked. Approval does not claim PDF success until generation succeeds. Layout tests cover multi-page itineraries, long names, international text, tables, page breaks and missing optional fields. Old approved versions remain reproducible. Download authorization is checked independently from page authorization.

A WhatsApp share link/manual download is useful for the first release. Fully automated WhatsApp delivery requires a selected provider, credentials and configured templates/consent; sending and delivery status must be honest.

## Reports based on actual stored records

- Owner: enquiries by stage/source/assignee, conversions with defined date/cohort basis, quotation turnaround, upcoming departures and overdue tasks.
- Money: confirmed sales value, invoices issued, actual verified collections, unpaid balances, supplier payable, customer refunds and supplier recoveries. Label these separately so bookings are not confused with cash received.
- Profit estimate: approved selling amount minus recorded direct costs, with taxes/fees and incomplete costs clearly treated. Estimated margin is not final accounting profit.
- Operations: services pending confirmation, driver/vehicle schedule, document readiness and incidents.
- Staff: own workload and follow-ups; no agency-wide financial dashboard.
- Filters: date range, staff, destination, stage and source as relevant. Every chart and export applies the same definitions, filters and permissions.
- CSV/XLSX exports include generation time, filter scope and appropriate columns. Large exports are jobs with restricted download access.

