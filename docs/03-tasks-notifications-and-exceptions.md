# Tasks, notifications and exceptions

## One task system

Each task has a title, one assignee, due date/time, linked enquiry/customer/booking/service, status and short note. Priority is Normal or Urgent. Manual to-dos are allowed, but meaningful business events automatically create the common tasks.

My day shows Overdue, Today, Upcoming and Waiting. A small calendar uses actual due dates. A task opens the relevant record directly. Staff can complete, reschedule with a reason, or mark Waiting with a next review date. A notification is an alert; the task remains until completed/cancelled. Reading an alert does not complete work.

| Event | Task / notification | Who receives it |
|---|---|---|
| Enquiry assigned | Contact customer by deadline; assignment alert | Assigned sales |
| Follow-up saved | Create/update linked follow-up task | Current sales assignee |
| Follow-up due/overdue | Reminder; escalate after owner-configured grace period | Assignee, then owner |
| Quote requested | Prepare quotation, with requirements link | Owner |
| Quote approved and PDF ready | Send approved quote | Assigned sales |
| PDF fails | Retry job; show failure/action | Owner/requester |
| Quote sent | Follow-up at chosen date; no assumed acceptance | Sales |
| Quote expiring | Review or contact customer | Sales; owner if repricing needed |
| Customer accepts | Collect advance by agreed deadline | Sales |
| Payment evidence submitted | Verify receipt | Owner |
| Verified advance threshold reached | Assign coordinator and generate service checklist once | Owner/coordinator, then assigned operations |
| Hotel/transport assigned | Confirm specific service before deadline | Responsible operations member |
| Supplier hold expires soon | Confirm/release/reprice task | Coordinator/owner |
| Document/permit missing | Collect or verify document | Assigned sales/operations |
| Balance due | Collection follow-up | Sales/owner |
| Departure approaching | Recheck confirmations, pickup, contact and documents | Coordinator/driver as applicable |
| Change/cancellation/incident | Review scope, cost and affected arrangements | Owner and responsible operations |
| Trip completed | Feedback and outstanding settlement tasks | Sales/owner |
| Staff reassigned/deactivated | Transfer open tasks; inform relevant staff | New assignee and owner |

## Automation rules

- Saving a follow-up updates both the enquiry's next action and its linked task together. Rescheduling updates the same task; it does not produce duplicates.
- Completing a call records outcome, completes that task, and asks for a next action only while the enquiry remains active.
- Moving an enquiry to Lost cancels outstanding sales reminders; On hold keeps a review date. Reopening restores work deliberately.
- Completing a task never verifies money, accepts a quotation or confirms a supplier by itself.
- Only actual saved actions create activity entries. Record actor, time, changed fields and reason where required.
- Deduplicate system tasks using record/event/assignee/version keys. Reminders also have delivery keys to prevent repeated alerts after retries.
- Cancellation cancels irrelevant future tasks while creating cancellation, refund and recovery tasks.
- Time-sensitive service reminders use service location time zones; staff see local display plus destination time where different.
- Launch delivery is in-app only. Manual WhatsApp sharing/download records staff sending intent/action, not proof of delivery/read. External notification providers are outside launch scope. An authentication recovery mechanism, if it needs email, is a separate technical decision and not a business notification channel.
- Notifications show minimal sensitive information and link to an authenticated record. Assignment alerts to drivers do not include supplier costs or customer payment history.
- Background processing continues when users close the browser. Failed jobs have visible retry state and owner alerts after repeated failure.

## Exception register

This covers the main known operational and technical cases. Additional business-specific exceptions can be added during owner review and user testing.

| Situation | Expected handling |
|---|---|
| Existing customer, repeated or family phone number | Suggest matches; user selects or intentionally creates separate record; no automatic destructive merge |
| One customer asks about several trips | Separate enquiries/bookings under one customer; payment allocation stays explicit |
| Enquiry without dates/budget | Save draft; mark flexible/unknown; request needed details before firm quote |
| Unassigned enquiry or absent sales staff | Owner queue owns it; reassign work with history and updated access |
| Owner unavailable | Pending approvals remain visible; optional explicitly nominated approver, no implicit auto-approval |
| Customer not reachable | Record outcome, reschedule; owner-configured attempt policy then lost/on hold with reason |
| Quote expired or supplier rate changed | Revalidate price/availability, create new version, notify sales |
| Changes after quote acceptance | Change request, owner review, new version/adjustment, customer reconfirmation and impacted service tasks |
| Payment screenshot, partial advance, wrong reference | Evidence stays unverified; owner verifies actual receipt; only threshold or recorded exception releases operations |
| Customer accepts several options by mistake | Require one explicit accepted option or clearly agreed combined scope |
| Repeated payment submission or double click | Idempotent processing; detect likely duplicates; never double credit |
| Overpayment or one payment for multiple invoices | Retain unapplied credit; explicit allocation/refund; allocations cannot exceed payment |
| Refund exceeds refundable/received amount | Reject invalid amount; owner-reviewed adjustment for a legitimate separate compensation case |
| Customer cancellation vs supplier recovery | Track customer approved/paid refund independently from supplier expected/received recovery |
| Partial cancellation / one traveller drops out | Recalculate affected service scope and deductions; retain remaining booking and amended documents |
| Advance received but hotel unavailable | Booking remains pending; propose substitute/refund for owner and customer decision |
| Supplier paid but unconfirmed | Keep payment and confirmation statuses independent; highlight risk |
| Supplier holds inventory temporarily | Record hold expiry and reminder; expired hold is not confirmed inventory |
| Customer already has ticket/hotel | Mark customer booked; coordinate dates and references; exclude its value from agency invoice |
| Flight/train/ferry delayed or cancelled | Update leg; review connected transfers/stays; owner approves cost changes |
| Overnight or international route | Explicit dates/time zones; validate actual sequence; hotel nights calculated from stays |
| Multiple drivers/vehicles/sector changes | Separate assignments per service leg; ensure passenger capacity and schedule compatibility |
| Driver or vehicle double booked | Server checks overlap including transfer buffer; reject conflicting assignment; coordinator resolves |
| Breakdown, no-show, illness, road closure | Incident entry, urgent owner/coordinator task, replacement/alternative plan and logged customer update |
| Extra km/hours, tolls or cash collected | Record quantity/evidence and agreed rates; owner verifies charges/collection; no unapproved financial override |
| Driver and owner both enter the same exceptional collection | Suggest/resolve duplicate; link one verified payment; preserve who collected and who entered it |
| Driver holds cash or hands over only part | Track custody separately from customer credit; owner reconciles difference; handover is not another customer payment |
| Driver capability revoked during an edit | Reject unauthorized save and preserve only permitted changes; no stale-session bypass |
| Driver without internet | Show connection/pending-save state; no false success. Initial release uses phone fallback, not unreviewed offline financial edits |
| Room category, meal or child occupancy mismatch | Flag before quote approval/booking confirmation; supplier policy explicitly checked |
| Missing/expired document or permit rejected | Block relevant ready check; owner chooses replan/cancel; do not imply authorization to travel |
| Destination rule or closure changed | Staff verifies and dates source; template information is not authoritative live advice |
| Trip finished but money pending | Trip completed; financial settlement still open |
| Staff tries another user's URL/export | Server rejects access; sensitive fields absent from response as well as screen |
| Concurrent edits | Version conflict prompt; preserve current data, require refresh/reconciliation |
| Database/PDF/notification outage | No false completion; safe retries; existing approved documents remain identifiable |
| Import partial failures | Row-level report, batch history, resume without duplicates; financial imports remain pending review |
| Source PDF contradictory policies | Owner must resolve before adopting into templates or billing rules |
