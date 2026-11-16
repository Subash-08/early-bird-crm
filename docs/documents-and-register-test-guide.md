# Customer documents and register

## Downloads and customer changes

- **Quotations → Preview** and **Download detailed package** use the same customer-facing trip fields and omit prices, payment terms and private option notes. Only explicit currency patterns in free text can be detected automatically, so review customer-facing notes before sharing.
- **Download quotation** uses the reference Letter grid with package particulars. The **Download invoice** action appears when the invoice is issued and the viewer is authorized. Find it in **Bookings → Invoice**, the linked accepted quotation, or the customer's **Invoices** section. The printed invoice contains its billing figures. Older issued copies can be retrieved with `?original=1`; a compatible saved invoice snapshot can be downloaded in the updated layout without changing the source.
- A normal invoice download includes one copy. Additional copies are created explicitly from the customer's invoice actions. A long invoice can still span multiple pages, and an enabled travel summary adds its own page. The default charge description uses the trip title, so meal-plan option names stay in the package. Custom invoice line text remains as entered. Compatible historical invoices download with the corrected default description and original billing values.
- After sharing, **Customer asked for changes** records the message and reference without choosing a package. It alerts the Owner and keeps the record on the original quotation. The Owner can create a revised quote and edit its package. After booking, use **Booking changes** for an agreed trip change.

## Reports and Overview

- **Reports → Customer & trip register** lists one row per visible enquiry and also customers without a visible enquiry. Open a row for contacts, trip details, budget, travellers, next action and linked references. The status filter uses the booking status when there is a booking, otherwise the latest quote status. The enquiry-stage filter is separate.
- Today, 7 days, 30 days and Custom filter record creation dates in India time. Exports use the applied filter across every page, or all records the current user can access. CSV and Excel are generated from the database when downloaded. Owner sees the agency's records, Sales sees authorized work, and Operations has Summary reports only.
- **Overview** keeps today’s and overdue tasks. Upcoming items stay in Tasks.

## What to test

1. Open the same approved quotation on the web and download the quotation and detailed package. Check the logo, quote version, stays, transport, meal descriptions and itinerary. Verify that the preview and both PDFs omit package prices and private notes.
2. Issue a test invoice with multiple line items and verify its number, GST and totals. Download it from the booking, customer and linked accepted quote. Compare it with the supplied reference and try a draft invoice, a long address and a non-Owner account. Check that unrelated Sales and Operations cannot download it.
3. Record a change request on a sent quote with two options. Check that there is no package selection step, the Owner is notified, and creating a revision preserves the original request. For a single-option acceptance, confirm the only package is chosen automatically.
4. In Reports, combine Today or Custom with a stage, status, lead, source or search term. Compare the list with Filtered CSV and Excel. Switch to All records and check that it includes older authorized rows and standalone customers. Try an empty result, a reversed date range and a customer name beginning with `=`.
5. Repeat with Sales and Operations accounts. Try direct register and download URLs as Operations. Confirm Sales cannot retrieve a customer or enquiry outside their scope. On Overview, check that future tasks no longer appear in the due-today list and that overdue tasks still appear.

The new booking lookup index is included in the existing database setup command.
