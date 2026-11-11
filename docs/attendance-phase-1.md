# Attendance — Phase 1

## Purpose

Attendance is a small, office-based extension of EarlyBird Travel CRM. It is not a payroll, leave, live-tracking, or driver-trip module.

- The Owner monitors attendance, configures the office rule, exports a daily CSV, and reviews correction requests.
- Active Sales and Operations staff check in and check out for themselves.
- The Owner never checks in or out.
- Location is requested only after a deliberate check-in or check-out action. The application does not watch staff locations in the background.

## Initial configuration

The initial office pin is the location supplied by the Owner:

- Latitude: `11.780343`
- Longitude: `77.7937358`
- Initial radius: `100 m`
- Timezone: `Asia/Kolkata`
- Default schedule: Monday–Saturday, 09:30–18:30, 10-minute grace period

The Owner must verify the pin and schedule on **Attendance** before real staff use it. The values are editable in the application.

## How it works

1. A Sales or Operations user opens **Attendance**.
2. They press **Check in** or **Check out**.
3. The browser asks for a fresh, high-accuracy location.
4. The server checks the active CRM account, location freshness, reported accuracy, distance from the office, working day, and duplicate/open-session rule.
5. The server records the event and the daily attendance session. Server time is the official time.
6. The Owner sees daily totals and the staff list. A CSV is available for the selected date.

## Correction workflow

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

1. As Owner, open **Attendance** and confirm the office pin, working days, start/end time, grace period, radius, and accuracy limit.
2. As Sales, allow browser location permission near the office and check in. Confirm Owner sees the person and time.
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
