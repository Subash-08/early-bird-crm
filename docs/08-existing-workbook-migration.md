# Existing workbook review and migration proposal

Source: `C:\Users\Dell\Downloads\Itinary SEnd 2026.xlsx`. Reviewed read-only on 29 October 2026 using the bundled Python runtime and openpyxl. All nonempty data rows were inspected for structure/types/completeness. Source file was not edited or imported into a database.

## What is present

- `Daily qoute`: headers in A1:J1, 74 nonempty data rows, each with a name. Used range extends through row 78 and column P, but L:P contain no values.
- `Confirmed Pax`: empty. This workbook provides no confirmed passenger/booking/payment dataset.
- No formulas in either sheet.
- Columns: serial number, Date, Name, Contact No., Destination, No. of Nights, No. of Pax, Travel date, followed by, Remarks.
- Column K has 25 additional notes without a heading. Preserve these as legacy notes, distinct from column J.
- Staff names have spelling/case/whitespace variants. Proposed review mapping: Suriya variants -> selected Suriya account; Dhivya/Dhivya mam -> selected Dhivya account. Do not infer the permission role from a name.

## Completeness and ambiguity across 74 rows

| Field | Finding | Import behavior |
|---|---|---|
| Contact | 4 blank; most values stored as numbers | Preserve raw value; normalize only after country code selection; incomplete records go to owner review |
| Destination | 20 blank; one numeric value (10) | Keep unknown; flag numeric value/possible shifted columns; do not invent destination |
| Nights | 54 blank | Keep unknown; request later before relevant firm quotation |
| Pax | 22 blank; numbers, free text and one date value | Parse suggestions only; review mixed adults/children/infants and shifted values |
| Travel date | 33 blank; 12 Excel date values; 29 text values | Preserve original text/value; date precision can be exact/range/month/flexible/unknown |
| Enquiry Date | 1 blank; two entries `31/047/2026` | Ask for correction; do not assume the intended month |
| Assignee | 1 blank | Owner review queue |
| Remarks | 4 blank | Optional; no fabricated status |

Two repeated-phone groups occur at worksheet rows 7/49 and 13/57. These may represent repeat enquiries for the same customer. Review customer identity once, preserve each trip enquiry, and never simply delete duplicate-phone rows.

Travel date H2 is stored as 1 February 2010 despite the row's enquiry date being in 2026. Other travel cells include years such as 2002, 2012, 2015, 2016, 2024, 2027 and 2028. Some may reflect Excel's interpretation of day/month text; the intended dates cannot be recovered safely by guessing. Month-only entries such as Sep or Dec or jan must not become exact dates automatically.

Pax contains strings such as `2 + 1 i`, `2 Or 3`, ages and couple counts, plus a destination name and a date in that column. The importer should highlight the complete affected row so the owner can correct shifted values. Do not assume a 16-year-old qualifies for a child price; supplier policy decides.

## Proposed mapping

| Source column | CRM target |
|---|---|
| A S/no. | Legacy serial; provenance only, not global customer identity |
| B Date | Legacy enquiry date after validation |
| C Name | Customer display name; duplicate review required |
| D Contact No. | Customer contact with reviewed country code |
| E Destination | Original destination text plus reviewed cities/countries/alternatives |
| F No. of Nights | Requested nights if valid |
| G No. of Pax | Original party description plus reviewed adults/children/infants |
| H Travel date | Original date description plus optional normalized date/range/month/year |
| I followed by | Assigned staff via explicit account mapping |
| J Remarks | Legacy note 1; suggested stage/outcome only after review |
| K unnamed | Legacy note 2; preserve without inventing a timestamp |

Slash/ampersand destination text may mean alternatives or a combined itinerary. Owner confirms which. Keep original spelling alongside normalized suggestions.

## Status and task migration

Notes such as 'quote sent', 'not picking up', 'next group trip' and 'will confirm tickets' are useful history, but not proof of approved quotation versions, payments, bookings or exact deadlines.

- Import as legacy enquiries with Original status/remarks and Review needed.
- Owner reviews suggested stage and active/inactive state in a batch preview.
- Preserve 'historical quotation reportedly sent' as history without fabricating a PDF or approval event.
- Create follow-up tasks only when staff/due date are intentionally assigned or the owner activates the row.
- Never use the import time as the original call or sending time.
- No customer notifications during migration. Separate review-and-activate step for current leads.
- Source batch hash + sheet + row is a provenance key; a corrected upload should explicitly target the prior batch/record rather than silently relying on a new file hash to match it.

## Product changes justified by this workbook

1. Dates can be flexible/month-only; exact travel dates are required later for actual services.
2. Customers can compare destinations and have multiple enquiries.
3. Preserve group-tour interest as destination/month preferences and callback tasks. User subsequently confirmed no fixed-departure seat inventory is required.
4. Existing ticket references and accommodation-not-required flags support transport-only work already present in notes.
5. Follow-up must be its own date/time/action field, rather than buried in remarks.
6. Separate structured stage, call outcome and free notes so 'sent quote but no answer' can be represented accurately.

## Data still needed before production migration

Confirm staff account mapping, ambiguous travel dates, unknown contacts/destinations and active versus historical leads. User confirmed that shared group-departure seat inventory is not needed. For finance/confirmed bookings, supply another source or enter verified opening records later; the empty Confirmed Pax sheet is not evidence of zero bookings in the business.
