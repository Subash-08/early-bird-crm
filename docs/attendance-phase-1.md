# Attendance — Phase 1

## Purpose

Attendance is a small, office-based extension of EarlyBird Travel CRM. It is not a payroll, leave, live-tracking, or driver-trip module.

- The Owner monitors attendance, configures the office rule, exports a daily CSV, and reviews correction requests.
- Active Sales and Operations staff check in and check out for themselves.
- The Owner never checks in or out.
- Location is requested only after staff choose **Show my location**, **Check in**, or **Check out**. The application does not watch staff locations in the background.

## Initial configuration

The initial office pin is the location supplied by the Owner:

- Latitude: `11.780343`
- Longitude: `77.7937358`
- Initial radius: `100 m`
- Timezone: `Asia/Kolkata`
- Default schedule: Monday–Saturday, 09:30–18:30, 10-minute grace period

The Owner must verify the pin and schedule on **Attendance** before real staff use it. The values are editable in the application.

Under **Office attendance rules**, pan or zoom the map and click or tap the office entrance. Changing **Office radius (m)** immediately redraws the boundary; **Save attendance rules** applies the pin and radius. The latitude and longitude fields are also editable.

Sales and Operations can use **Show my location** to preview their own reported position, accuracy and distance alongside the office boundary. This preview does not send an attendance request or save the location. A wide-area preview uses a simple diagram to avoid requesting map tiles near the employee's location. Street tiles come from OpenStreetMap and require internet access; the office outline and position markers remain visible without them.

## How it works

1. A Sales or Operations user opens **Attendance**.
2. They press **Check in** or **Check out**.
3. The browser asks for a fresh, high-accuracy location.
4. The server checks the active CRM account, location freshness, reported accuracy, distance from the office, working day, and duplicate/open-session rule.
5. The server records the event and the daily attendance session. Server time is the official time.
6. The Owner sees daily totals and the staff list. A CSV is available for the selected date.

## Correction workflow

Use **My attendance** for Today, Last 7 days, This month, or a custom range of up to 93 days (India time). Staff see only their own rows. The Owner can select **View activity** next to a team member in **Team & setup** to see the same totals alongside due tasks, logged completions and calls, and driver assignments. Recorded hours count completed work sessions; a missed checkout is not estimated. To record a call, choose its outcome in the enquiry and select **Log this as a new contact attempt** before saving.

Owners can choose a date in the attendance calendar, view the day's summary, and mark or remove a named holiday. A holiday blocks regular check-ins and keeps existing attendance. Sales and Operations can submit **Request off-site attendance** after completing company work. Enter the date, start and end times in IST, work location, reason, and an optional task or booking reference. The Owner reviews it in **Requests to review**. Approval marks the day **Present · Off-site**; original clock events are preserved.

1. Staff submit a date, requested check-in/check-out time, and reason.
2. The Owner receives an in-app notification.
3. The Owner approves or rejects it with an audited decision.
4. Approval creates an effective display value for reports while preserving the original check-in/check-out event unchanged.

## Key safeguards

- One daily session per person and work date, protected by a MongoDB unique index.
- Server-side Haversine distance calculation; client-provided “inside office” claims are ignored.
- No password or shared office code for each action; the active CRM session is used.
- No direct timestamp editing by staff.
- Location evidence is restricted to attendance data and must be retained only as long as the agency policy requires.
- Browser permission, stale location, poor accuracy, outside-office location, duplicate check-in, and check-out-before-check-in all result in clear errors.

## Manual test before using real data

1. As Owner, open **Attendance** and select the office entrance on the map. Change the radius and confirm the circle updates immediately. Save and reload to confirm the pin and radius persist. Verify the working days, start/end time, grace period and accuracy limit.
2. As Sales, select **Show my location** and allow browser location permission near the office. Confirm both dots and the boundary are visible and the preview creates no attendance record. Then check in and confirm the Owner sees the person and time.
3. Check out near the office. Confirm duration is shown.
4. Try another check-in on the same date. It must be rejected.
5. Deny location permission. Confirm no attendance is created and the user sees a clear message.
6. Try outside the office radius. Confirm normal attendance is rejected.
7. Submit a correction as Sales or Operations. Confirm the Owner receives a notification, approves/rejects it, and the staff member sees the result.
8. As Operations, attempt to access another staff member’s attendance. The API/UI must show only their own records.
9. As Owner, download the selected date CSV and compare the staff/status/times to the screen.

## Explicitly deferred

- Field/trip attendance for drivers
- Offline attendance queue
- Kotlin Android app and device biometrics
- Multiple shifts, breaks, overtime, leave, payroll, facial recognition, continuous GPS, and live maps

Field attendance should be a later feature tied to a specific Owner-assigned trip or approved work site. It must never become unrestricted “check in from anywhere.”
