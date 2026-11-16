# Enquiry workspace rollout — change report

## Follow-up release

- Existing enquiries now open on a dedicated page; new capture still takes a short drawer.
- **Quote & package** shows missing details and linked versions. **Request quote** creates the quote and sets the status through the existing workflow. Save changes to the enquiry before requesting. Owner approval and the existing lead-sharing rules still apply.
- Follow-up fields show India time. Saving without changing a date preserves its exact stored timestamp. Old activity entries display readable dates without changing the underlying history. Previously shifted dates are not rewritten automatically.
- Authorized drafters can use package templates. The Owner can save a new template from a draft. Template application requires confirmation when replacing existing package sections and discards old trip dates and booking references.
- Open a ready, approved quote to get the separate **Detailed package** PDF generated from that same approved version. The invoice-style quotation redesign and bookings without internal drivers were not changed in this release. Passport and PAN collection remain deferred by request.

**Check before release:** Open or reload an enquiry URL as Owner, authorized Sales, and an unrelated account. Save without touching the follow-up time, then reopen and compare the time. Try requesting an incomplete or already quoted enquiry. For an approved enquiry, compare the quotation and package PDFs for the same version, destination, and terms. Apply a template to a draft and make sure the template itself does not change.

## Quotation layout and optional Operations staff

1. Approve a new quote with two options, a discount, tax, and a validity date. Open **Quotation** and **Detailed package**. Compare their quote numbers, versions, destination, and option totals. The options have separate prices and the quote does not add them together. Check the logo, business name, and GSTIN against **Invoice settings**.
2. Open an existing stored quotation and issue a test invoice. Verify that the stored quote retains its original layout and the invoice still uses the tax-invoice title, invoice number, and tax breakdown.
3. Convert an accepted quotation to a booking and open the **Operations** tab. Before issuing an invoice, try starting the service checklist. Repeat after issuing an invoice with the advance still unpaid. Verify the invoice gate and Owner reason requirement respectively.
4. After advance verification, choose **Owner or Sales lead** and start the checklist. Verify that the active lead sees the tasks and notification, Operations staff cannot open this booking, and retrying does not duplicate the tasks. To verify the Owner fallback, use a historical test booking whose lead is already missing or inactive.
5. In **Operations**, add a Car service from a supplier or use a customer-booked car. In **Trips**, link the service and save the trip without a driver or vehicle. Try saving without the service and with an unavailable service. Record progress as the assigned Sales lead or Owner, then test trip completion.
6. On a separate booking, choose **Operations staff**, assign an active driver, and save a trip with an available vehicle. Confirm the driver's task and that overlapping trips still raise a conflict.
7. Repeat steps 4–6 on a phone. Check that the options, lists, required fields, and save buttons remain usable at narrow widths.

## Delivered

- **Start:** Find or add a customer, set the lead, add teammates, and save the enquiry without collecting all trip data.
- **Trip:** Keep Unknown, Exact, Flexible, and Month only. Only Exact requires start and end dates. Existing month preferences written as text remain visible.
- **Activity:** Update status, log contact, set a follow-up, and see recent changes. An open follow-up shows its due time and whether it is overdue. Logging a contact finishes the existing follow-up unless a new follow-up date was chosen.
- **Access:** New enquiries remember their creator. Existing enquiries keep their lead; historical creators are not guessed. Owner or creator can change the lead or remove teammates. Active Owners and Sales can be added. Operations are not enquiry team members. The Owner can always see enquiries without being assigned.
- **Linked records:** The existing lead remains responsible for one follow-up. Existing downstream lead handoffs still update linked quotes and bookings. Adding a teammate does not transfer a booking, disclose payments or give approval rights.
- **Quotes:** Creators and assigned teammates can request and edit an authorized draft. Sales cannot change private cost or note fields or approve a quote. The Owner can still approve, and the Owner or lead continues to share the approved PDF and record the decision.

## Manual checks

1. Sign in as Sales. Open **Enquiries → New enquiry**. Save from Start with only a customer, source and lead. Reopen it and fill Trip later.
2. Try **Month only** and **Flexible**, then **Exact** with an end before the start. Check that the last case is rejected and the draft stays open.
3. Add a second active Sales member. Confirm the teammate receives an in-app notice and can view and update the enquiry. Confirm an unrelated Sales account and Operations cannot access it.
4. As creator or Owner, change the lead. Confirm the new lead has one follow-up, the previous lead loses access unless still on the team, and the creator can still view the enquiry.
5. Set a due follow-up. Log a call with no new follow-up, then repeat on another enquiry with a new due time. Confirm **Done** in the first case and one rescheduled follow-up in the second. Test due and overdue in-app alerts with the reminder worker enabled.
6. As teammate, open **Quotations**, save a draft, and check that no private cost fields or approval button appear. Switch to Owner, confirm internal notes and costs are unchanged, and run the existing approval → share → accept → booking path.
7. Repeat Start, Trip, and Activity on a phone. Check the tab buttons, long team names, and timeline stay within the screen.

## Deferred

Optional passport and PAN collection remain deferred.

The new indexes are included in the existing setup script. Apply them with `npm run db:setup` in the environment you intend to use. This rollout does not backfill creators or change live records.
