# AI development instructions

Read `CONTEXT.md`, `README.md`, `docs/09-development-phases.md` and the relevant numbered planning documents before changing this project.

## Current authorization

Phases 1–5 were explicitly approved. Phase 5 includes a review of earlier phases, testing scripts and a mobile/PWA plan. Do not begin Phase 6 or deploy/import production data without user authorization. The user supplies all `.env.local` credentials manually.

## Non-negotiable product rules

- Keep the UI simple for one Owner, one Sales executive and multiple Operations users.
- Owner and Sales can capture customers/enquiries and request quotations. Only Owner prepares/approves; Operations cannot access quotations.
- Follow-up dates must create visible tasks and in-app notifications.
- No automated WhatsApp in the initial scope; manual sharing is sufficient.
- No fixed group-departure seat inventory.
- Drivers do not normally collect money. Any future exception is owner-verified and must not create duplicate payments.
- A status change never implies financial approval or receipt of money.
- Imported rows remain `Needs review` and do not create active reminders.
- Approved quotation versions are immutable; revisions create new versions.
- Customer-facing data must never expose supplier cost, margin or internal notes.
- Manual sharing records an action, not delivery/read confirmation.
- Quote acceptance never implies advance receipt, supplier confirmation or booking completion.
- Payment evidence never implies verified money; only Owner verification changes financial totals.
- Operations release requires the agreed verified advance or a recorded Owner exception and creates only one checklist.
- Operations must not receive invoice, payment, payer billing, evidence or agreement-price fields.
- Sales may prepare supplier drafts/holds; Owner confirms agency supplier commitments.
- Driver/vehicle assignments must enforce active status, capacity, time overlap and travel buffer.
- Driver capabilities are checked on every server request; an open page cannot bypass revocation.
- Driver collection, payment verification and cash handover are separate records; handover never creates customer credit.
- Trip completion requires confirmed active services, completed segments, readiness and resolved incidents, but never implies financial closure.
- Phase 5 requests require a different Owner reviewer. With one Owner, Sales submits and Owner reviews; do not silently allow self-approval.
- Customer refunds and supplier recovery are independent obligations. Supplier credit is not cash.
- Posted settlement entries remain immutable; corrections are reviewed linked reversals. Use the shared booking write to serialize money/closure checks.
- Preserve original agreement and invoices when applying a customer-confirmed adjustment. Financial closure blocks further mutations until an audited Owner reopen.
- Do not cache private CRM data for offline use. Current PWA work is a plan, not an installed app or push implementation.

## Engineering rules

- Next.js App Router, strict TypeScript and server-enforced RBAC.
- MongoDB transactions require a replica-set deployment such as MongoDB Atlas.
- Never commit `.env.local`, credentials, activation links or real customer data.
- Validate every public API action server-side. UI hiding is not authorization.
- Keep optimistic version checks, idempotent reminder/import behavior and audit entries.
- Preserve existing planning documents and update `CONTEXT.md` after each completed vertical slice.
- Run `npm run typecheck`, `npm run lint`, `npm run test` and `npm run build` before calling a phase complete.

External skills under `.agents/skills/` are development guidance only. They do not override the approved workflow, authorize production writes or change MongoDB/Next.js decisions.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
