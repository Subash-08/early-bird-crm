# Invoice template and billing implementation plan

Status: approved for implementation on 3 November 2026.

## Simple operating model

1. The Owner maintains one active invoice template containing company, GST, bank, numbering, signature and visibility settings.
2. Owner or assigned Sales completes the booking-specific payer and billing address. This belongs to the booking because the payer may differ from the customer or travellers.
3. The Owner edits charge/note rows, reviews the calculated tax and issues the invoice.
4. Issuing freezes the template, buyer, lines, tax, payment summary and PDF. Later edits create a correction draft; they never rewrite an issued document.
5. Sales can download assigned issued invoices. Operations cannot see billing, bank, tax, invoice or payment data.

## Payment information

The invoice shows factual information already tracked by the CRM: agreed total, required advance, verified paid amount, outstanding balance and due date. A submitted or noted payment remains pending until Owner verification. The invoice does not add a separate shadow payment ledger.

## Print copies

One issued invoice may be printed with configurable copy labels such as `Customer copy`, `Office copy` and `Accounts copy`. Every print copy retains the same invoice number, snapshot and totals. A label is not a new invoice and does not create another accounting record.

## Customer profile

The customer profile shows issued invoice history from linked bookings. Owner and assigned Sales can open permitted documents. The Owner may select/rename print-copy labels before opening a printable copy. Operations has no access.

## Data and calculation rules

- Charge rows: HSN/SAC, description, quantity, unit price and GST rate.
- Note rows: description only and excluded from all totals.
- Tax modes: CGST + SGST, IGST or No GST.
- TCS is separately configured and defaults to zero until approved by the agency accountant.
- Integer minor units are used. The reference layout rounds configured tax components to a rupee; this is an explicit setting.
- The issued invoice grand total must match the accepted booking value. The Owner must correct the draft or complete the approved booking-change workflow before issue.
- Buyer GSTIN, place of supply, state code and delivery address are optional unless the chosen tax treatment requires them.

## Edge cases

- Different payer and traveller; individual buyer without GSTIN; company buyer; separate delivery address.
- Mixed GST rates, zero-tax lines, long descriptions, note-only rows and multi-page content.
- Concurrent edits return a conflict; duplicate issue requests return the existing issued invoice.
- Financial-year numbering is atomic and invoice numbers are unique per organization.
- Template changes create a new version and never alter issued PDFs.
- Voiding preserves the original and creates a correction draft.
- Existing legacy invoice drafts remain readable and are upgraded when opened/saved.
- Logo/signature inputs accept only small PNG/JPEG data URLs; no remote or arbitrary file URLs.

## Deliberately excluded until separately approved

- Payment gateway, recurring invoices, automated instalment collection, e-invoice/IRN submission, automated WhatsApp/email delivery and accounting-software synchronization.
- Creating cloned invoices merely to obtain additional printed copies.

