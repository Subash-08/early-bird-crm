# Phase 1 Manual Test Checklist

Use three test accounts: one Owner, one Sales user and one Operations user. Use test data only in a separate development database.

## 1. Setup and access

- Run `npm run db:setup`; confirm one owner link is printed and a second run does not create another owner.
- Open the owner link, set a 12+ character password, then confirm the link cannot be reused.
- Confirm public sign-up endpoints are blocked.
- Invite Sales and Operations users; privately open each activation link and sign in.
- Confirm Sales cannot open Import or Team Setup.
- Confirm Operations sees only Today, Tasks and Notifications.

## 2. Customers and enquiries

- Create a customer with a valid international-format phone number such as `+91...`.
- Try an invalid number and confirm a clear validation message appears.
- Create the same customer again and confirm a duplicate warning blocks the first save.
- Create an enquiry, assign it to Sales, and enter a next action plus follow-up date.
- Sign in as Sales and confirm the enquiry, task and assignment notification are visible.
- Confirm Sales cannot reassign the enquiry to another person.
- Test New, Contacting, Gathering details, On hold and Lost stages.
- Confirm On hold requires a review date and Lost requires a reason.
- Confirm exact travel dates reject a return date earlier than departure.

## 3. Tasks and notifications

- Confirm a follow-up date creates one linked task rather than duplicates.
- Change the follow-up time and confirm the task moves in the calendar.
- Complete or reschedule a task and confirm a note is required.
- Mark a notification read and verify it remains read after refresh.
- Run `npm run worker`; confirm due reminders appear once, not repeatedly.
- Set a short escalation rule, run the worker after the threshold and confirm the Owner receives the escalation.

## 4. Staff lifecycle

- Deactivate a Sales user who has open work; confirm a replacement is required.
- Select the Owner as replacement and confirm open enquiries/tasks move safely.
- Confirm the deactivated user is signed out and cannot sign in again.
- Create a password reset link and confirm existing sessions are invalidated after reset.

## 5. Import

- Upload the provided `Itinary SEnd 2026.xlsx` file (or a copied test subset under 500 rows).
- Choose a sheet and verify the header mapping before preview.
- Confirm invalid phone/email, missing destination and ambiguous passenger data show warnings.
- Import valid rows and confirm they are marked `Needs review` with no active reminders.
- Import the same batch again and confirm committed source rows are not duplicated.
- Test a CSV cell beginning with `=`, `+`, `-` or `@`; confirm it is treated as data, not executed content.

## 6. Responsive and recovery checks

- Test desktop, tablet and a 375px-wide mobile screen.
- Refresh while a drawer is open; confirm the application returns to a safe list state.
- Temporarily use an invalid database URI and confirm the UI shows a service error without exposing credentials.
- Run `npm run owner:recover` and verify the private recovery link works once.

Record each failed item with the account role, exact input, expected result, actual result and a screenshot.
