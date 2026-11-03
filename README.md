# EarlyBird Travel CRM — complete workflow build

A simple role-based travel agency CRM. Phase 1 covers enquiries and follow-up, Phase 2 adds approved quotations, Phase 3 adds booking and verified payments, and Phase 4 adds supplier arrangements, driver/vehicle scheduling and trip execution.

The application covers enquiry through quotation, booking, verified payment, operations, trip execution, settlement, administration and role-scoped reporting/export. Manual business acceptance and external production activation remain separate. Read `docs/complete-manual-acceptance-guide.md` and `docs/phase-6-7-completion-report.md`.

## Project reading order

1. `CONTEXT.md` — current implementation status and boundary.
2. This README — local setup and commands.
3. `docs/phase-4-report.md` — what the current release added.
4. `docs/phase-1-4-acceptance-checklist.md` — short combined sign-off checklist.
5. `docs/phase-4-manual-test.md` — operations and trip-execution checks.
6. Earlier phase reports/manual guides — foundation, quotation and booking history.
7. `docs/workflow-charts.html` — double-click to view the workflow charts in a browser.
8. `docs/01-product-and-workflow.md` to `docs/10-configuration-and-launch-decisions.md` — approved full-product plan.

## Requirements

- Node.js 20.19 or newer
- MongoDB Atlas or another replica-set deployment that supports transactions (transactions keep linked records consistent)
- npm 10+

## Local setup

1. Copy `.env.example` to `.env.local` and fill the values.
2. Allow your current IP in MongoDB Atlas Network Access.
3. Install packages: `npm install`
4. Create indexes and the first owner: `npm run db:setup`
5. Open the one-time activation link printed by the setup command.
6. Start the app: `npm run dev`
7. Open `http://localhost:3000`.

Do not commit `.env.local` or activation links. Set `BETTER_AUTH_URL` to the exact deployed URL in production and use a different database name for each environment.

## Commands

- `npm run dev` — local development
- `npm run typecheck` — TypeScript validation
- `npm run lint` — code quality checks
- `npm run test` — unit and MongoDB integration tests (first run downloads a temporary MongoDB binary)
- `npm run test:phase5` — focused settlement, cancellation, role and money regression checks
- `npm run test:smoke` — after a successful build, isolated browser testing with disposable demo users/data on port 3105 (requires installed Google Chrome)
- `npm run build` — production build
- `npm run pdf:sample` — create a sample customer quotation in `output/pdf`
- `npm run pdf:finance-sample` — create a sample customer invoice in `output/pdf`
- `npm run pdf:operations-sample` — create a sample driver trip sheet in `output/pdf`
- `npm run db:setup` — idempotent indexes and first-owner setup
- `npm run db:seed-demo` — development-only, idempotent fictional customers/enquiries/tasks for manual testing
- `npm run worker` — reminder and escalation pass
- `npm run owner:recover` — issue a new private owner activation/reset link
- `npm run production:check` — validate production configuration names/safety without printing secret values

Run `npm run worker` as a long-running process, or call the protected reminder endpoint every 15 minutes. It is idempotent: notification keys stop repeated alerts for the same reminder state.

## Deployment

Deploy to a Node.js host that supports Next.js and scheduled jobs (for example Vercel plus a protected cron route, Render, Railway or a managed container). Add the same environment variables to the host, run `npm run db:setup` once against the production database, then use either `npm run worker` or `POST /api/jobs/reminders` with `Authorization: Bearer YOUR_JOB_RUNNER_SECRET`.

The application deliberately has no public sign-up. The owner creates staff accounts and shares one-time activation links privately.

## Important scope note

The local application now includes reporting/export, safe role changes, fixed responsive navigation and an installable privacy-safe PWA shell. Payment, supplier confirmation, trip completion and financial closure remain deliberately separate states. External hosting/domain, scheduler monitoring, Atlas restore rehearsal, Cloudinary activation and source-dependent historical migration still require external accounts/data and formal acceptance. See `docs/phase-6-7-completion-report.md`.

For the safe demo command, customer lookup optimisation and exact remaining scope, see `docs/demo-data-and-optimisation.md`.
