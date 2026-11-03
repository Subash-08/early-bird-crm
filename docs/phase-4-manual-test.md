# Phase 4 manual test guide

Use sample data in the development database and separate Owner, Sales and Operations browser sessions.

## A. Suppliers and vehicles

- [ ] Owner and Sales can add/edit an active supplier with phone or email.
- [ ] Duplicate supplier name/location shows a useful warning.
- [ ] Supplier-owned vehicles require an active supplier.
- [ ] Duplicate registration is blocked.
- [ ] Seats and luggage capacity are clear.
- [ ] Maintenance/inactive vehicles cannot be assigned.
- [ ] Operations cannot browse the supplier directory or supplier costs.

## B. Booking arrangements

- [ ] Only released bookings appear in Operations.
- [ ] Add hotel, car and activity arrangements without unnecessary required fields.
- [ ] Customer-booked flight/train can be recorded for coordination with zero agency cost.
- [ ] Sales can save Draft and On hold; On hold requires an expiry.
- [ ] Sales cannot confirm an Agency arranged supplier commitment.
- [ ] Owner confirmation requires a supplier reference.
- [ ] Changing a confirmed service requires Owner review.
- [ ] Unavailable/Cancelled service notifies the coordinator for replacement/review.
- [ ] Expired hold creates one reminder when the worker runs repeatedly.

## C. Driver and vehicle scheduling

- [ ] A car segment requires active driver and available vehicle.
- [ ] Vehicle below traveller capacity is blocked.
- [ ] Same driver or vehicle cannot overlap another active segment, including buffer time.
- [ ] Overnight segments and non-India time zones save and display correctly.
- [ ] Non-car/customer-booked segments do not require driver or vehicle.
- [ ] Driver replacement moves the assignment and removes the old driver's access.
- [ ] Deactivating a driver requires an active Operations replacement.

## D. Driver My trips

- [ ] Driver sees only personally assigned segments.
- [ ] Driver sees traveller name/contact, route, schedule, vehicle, pickup and assistance notes.
- [ ] Driver does not see price, supplier cost, invoice, payment, payer billing or another driver's trip.
- [ ] Progress cannot move backwards.
- [ ] Actual time/odometer and notes respect Owner-enabled capabilities.
- [ ] Completed trip segment cannot be casually edited by Sales.
- [ ] Failed save displays an error and does not show false success; phone fallback text remains visible.

## E. Readiness and documents

- [ ] Operations setup creates one checklist even when clicked twice.
- [ ] Blocked readiness requires a reason and prevents trip completion.
- [ ] Private traveller files accept only JPG/PNG/PDF up to 1.5 MB.
- [ ] Only Owner and assigned Sales can open private traveller files.
- [ ] Final itinerary is blocked until active agency services are confirmed.
- [ ] Voucher requires one confirmed arrangement.
- [ ] Manifest matches recorded travellers.
- [ ] Driver trip sheet contains only that driver's assigned routes.
- [ ] Generated PDFs contain no supplier cost or customer billing data.

## F. Incidents and replacements

- [ ] Driver can report delay, vehicle issue, absence, customer/supplier issue or emergency.
- [ ] Urgent issue creates fast Owner/coordinator attention.
- [ ] Another driver cannot report against an unassigned segment.
- [ ] Customer-contacted status is retained.
- [ ] Resolution reason and actor/time remain in history.
- [ ] Open incidents prevent trip completion.
- [ ] Vehicle/driver replacement still runs overlap and capacity checks.

## G. Driver requests and expenses

- [ ] Driver without the relevant capability is blocked.
- [ ] Granted driver can submit expense evidence or a logistical change request.
- [ ] Request does not directly change schedule, supplier cost or financial totals.
- [ ] Owner/Sales approves or rejects with a reason.
- [ ] Revoking capability blocks the next server request even from an already-open page.

## H. Exceptional cash and custody

- [ ] Driver can report exceptional cash only for an assigned released booking.
- [ ] Report remains Pending verification and does not immediately change paid totals.
- [ ] Duplicate retry is blocked.
- [ ] Owner verification uses the existing Phase 3 payment review and creates one receipt.
- [ ] Handover is recorded separately and never creates another customer payment.
- [ ] Partial, rejected and full handovers calculate custody correctly.
- [ ] Driver and Owner entering the same collection cannot create two verified credits.

## I. Completion

- [ ] Trip completion is blocked by unconfirmed services, incomplete segments, blocked readiness or open incidents.
- [ ] Successful completion creates one customer-feedback task.
- [ ] Booking says Trip completed but settlement remains outstanding for Phase 5.
- [ ] Repeated completion does not duplicate tasks.
- [ ] Desktop, tablet and 375px mobile layouts remain understandable.

## Sign-off

Record failures with role, booking number, action, expected result, actual result and screenshot. Approve Phase 4 only after Owner, Sales and at least one Operations user complete the normal workflow and permission checks.
