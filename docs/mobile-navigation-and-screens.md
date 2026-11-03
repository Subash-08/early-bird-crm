# Mobile navigation and screen plan

Status: the navigation structure and responsive shell below are implemented. Business acceptance on real Android and iPhone devices is still required.

## Mobile principles

- Keep four daily destinations visible and put secondary screens in **More**.
- Show only screens allowed for the signed-in role.
- Keep alerts accessible from the top bar on every screen.
- Use a full-screen workspace for long forms and a bottom sheet for navigation.
- Use at least 44–48px touch targets, safe-area spacing and no horizontal page scrolling.
- Do not queue financial or operational writes while offline. Show a clear connection message.

## Bottom navigation

| Position | Owner / Sales | Operations |
| --- | --- | --- |
| 1 | Today | Today |
| 2 | Leads | Trips |
| 3 | Tasks | Tasks |
| 4 | Bookings | Alerts |
| 5 | More | More |

Owner/Sales **More** contains Customers, Quotations, Operations, Money & changes, Alerts and Owner-only Import data / Team & setup. Operations **More** contains account/workspace information and Sign out; finance, customer and quotation screens are never shown.

## Screen behaviour

### Today

- Compact greeting and only the counts that lead to action.
- Overdue/Today work appears before analytics.
- Cards link directly to the appropriate task or record.

### Leads

- Search from the top bar.
- One record per row with customer, destination, stage and next action.
- Primary action remains visible and opens a full-screen capture/edit form.
- Follow-up date and outcome stay close to the customer context.

### Tasks

- Default focus: Overdue and Today; Upcoming remains available below.
- Large Done / Waiting / Reschedule controls with a required note when applicable.
- Opening a task takes the user to its linked enquiry, booking or settlement screen.

### Bookings

- Status and next blocking step are the first information shown.
- Payment verification, Operations release and supplier confirmation remain separate.
- Detailed booking forms open full-screen so fields do not become narrow columns.

### Trips (Operations)

- Route, pickup time, traveller contact and vehicle are visible without opening secondary panels.
- Start / Arrived / Complete actions use large buttons.
- Incident, expense and exceptional collection actions remain permission-checked.
- Financial totals, supplier costs and private traveller documents remain hidden.

### Alerts

- Unread count is shown on the mobile icon.
- Alert text stays minimal; opening it performs current server authorization.
- Reading an alert does not complete its task.

### More

- Opens as a familiar mobile bottom sheet with role and account context.
- Secondary modules use two-column tiles.
- Sign out stays separated from business modules.

## Responsive component rules

- Phone breakpoint: 760px. The desktop sidebar is removed and the bottom navigation appears.
- Sticky top bar contains product mark, current screen, page search and alerts.
- Search opens as a focused panel below the top bar and filters only the current screen.
- Bottom navigation respects iPhone/Android safe-area insets.
- Drawers become full-screen on phones with a sticky header.
- Multi-column forms collapse to one column; buttons and controls use 48px minimum height.
- Main content has bottom padding so the fixed navigation never covers actions.
- More sheet is scrollable on short phones and never exposes disallowed routes.

## Manual checks

- [ ] Owner, Sales and Operations each see exactly their planned bottom tabs.
- [ ] More shows only role-permitted modules and Sign out works.
- [ ] Search opens, filters the current screen, clears and closes correctly.
- [ ] Unread badge is legible at 320px, 390px and 430px widths.
- [ ] Long names, destinations, currencies and statuses do not cause horizontal scrolling.
- [ ] Every form can be completed using the on-screen keyboard without its final action being hidden.
- [ ] Drawers, More sheet, notifications and bottom navigation layer correctly.
- [ ] Rotate phone to landscape and return to portrait without losing the current form.
- [ ] Check Android Chrome and iPhone Safari including safe-area spacing.
- [ ] With internet disabled, the offline banner appears and a failed save does not show success.

Automated browser smoke testing covers role tabs, More visibility, horizontal overflow and the offline banner using disposable local data. Real-device testing remains necessary for keyboard, browser bars, safe areas and touch comfort.
