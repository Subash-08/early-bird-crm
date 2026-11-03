# Invoice template, billing and print-copy manual test

Use a test database and fictional data. Confirm GST/TCS wording with the agency accountant before production use.

## 1. Owner template

1. Sign in as Owner and open **Invoice template**.
2. Enter company address, GSTIN, state, bank details, invoice prefix, footer and signatory.
3. Upload a PNG/JPEG logo and signature under 500 KB. Confirm another type or an oversized image is rejected.
4. Set print labels to `Customer copy, Office copy, Accounts copy` and save.
5. Refresh and confirm values remain. Confirm Sales and Operations do not see the page or template data.

## 2. Billing details

1. Convert an accepted quotation into a booking.
2. As assigned Sales, open **Booking → People** and add payer, GSTIN, billing/service addresses, place of supply, state code, advance/balance dates and payment note.
3. Save and reopen. Confirm values persist.
4. Confirm unrelated Sales is denied and Operations sees no payer, invoice, payment or bank data.

## 3. Invoice draft

1. As Owner, open **Booking → Invoice**.
2. Add two HSN 998552 charge rows and note rows for Visa and accommodation/transfers.
3. Select the tax method, add place/state, TCS, due date and copy labels.
4. Confirm note rows add no money. Confirm negative prices, zero charge quantity and missing descriptions are blocked.
5. Saving must be blocked until the grand total equals the accepted booking value.
6. Save and reopen. Confirm all rows and settings remain.
7. Save the same draft from two tabs. The stale tab must receive a conflict instead of overwriting.

## 4. Issue and immutable history

1. Issue as Owner. Confirm the number uses `PREFIX-FY-NNNN` and only one issued invoice exists.
2. Retry Issue. Confirm no second invoice/number is created.
3. Check the PDF company/buyer data, HSN, descriptions, quantity, price, GST, totals, bank, payment summary, signatures and labels.
4. Change the template and confirm the old PDF remains unchanged.
5. Confirm assigned Sales can download; Operations and unrelated Sales receive 403 from the direct URL.
6. Before payment/release, test Void with a reason. Confirm the original remains and a correction draft is created. Confirm void is blocked after verified money or release.

## 5. Customer profile and print copies

1. Open the customer profile and find **Invoice history**.
2. As Owner, choose **Prepare renamed print copies**, enter `Customer copy, Office file, Accounts review`, and create the PDF.
3. Confirm every page retains the same invoice number and frozen financial data; only the label changes.
4. Confirm this creates no new invoice, payment, booking value or balance. Check activity history records it.
5. Confirm Sales can view issued history but cannot generate renamed copies. Operations sees none.

## 6. Payment truth

1. Submit an initial payment. Confirm it remains pending until Owner verification.
2. Verify it as Owner. Confirm the summary uses verified paid, required advance and remaining balance.
3. Test partial, split, rejected, reversed and overpayment records. A payment note must never change verified totals.

## 7. PDF quality and long content

1. Print at 100% on Letter paper and inspect at 200% zoom. Text must be dark/sharp and borders aligned.
2. Test long names/addresses, ten rows and missing optional fields. Confirm continuation pages do not clip rows.
3. Enable Travel summary. Confirm it is labelled as a service summary, not another tax invoice.
4. Confirm internal cost, margin, supplier-private notes and evidence never appear.

## Acceptance result

Record tester, date, browser, invoice number, pass/fail sections and screenshots/PDF. Do not approve production GST/TCS wording until the accountant confirms tax treatment, place of supply, rounding and TCS applicability.
