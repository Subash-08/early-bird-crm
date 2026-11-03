# Configuration and decisions before implementation/launch

## Credential handling

User will enter real credentials manually. After coding approval, provide `.env.example` with placeholder names, explanatory comments and validation. Never request secrets in chat or store them in planning docs, source control, fixtures or logs. The names below are the proposed application configuration contract; actual auth-library names will be mapped during Phase 1.

| Setting group | Purpose | Needed by |
|---|---|---|
| APP_URL, APP_TIME_ZONE | Base URL and staff default time zone (Asia/Kolkata initially) | Phase 1 |
| MONGODB_URI, MONGODB_DB_NAME | Atlas connection and environment-specific database | Phase 1 live persistence |
| AUTH_SECRET and selected library configuration | Secure sessions/authentication | Phase 1 |
| BOOTSTRAP_OWNER_EMAIL plus one-time activation mechanism | Establish initial owner; no permanent seeded/default password | Phase 1 |
| JOB_RUNNER_SECRET or host scheduler identity | Authenticate scheduled reminder/PDF/job execution | Phase 1 jobs; extend Phase 2 |
| CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET | Image/file upload and controlled media access | Phase 2 media; Phase 3 evidence |
| Private media delivery configuration | Restrict sensitive files, downloads and retention | Before sensitive upload is enabled |

No WhatsApp business API or business email notification keys are required at launch. Manual WhatsApp sharing works through staff action; in-app alerts are stored by the CRM.

An authentication recovery mechanism still needs a deliberate choice. Proposed default is owner-issued one-time activation/reset for staff, with secure expiry, forced password setup and audit. Owner-account recovery must have a documented protected recovery procedure; if email-based recovery is chosen, its mail configuration is separate from business notifications. Final library capabilities are verified before implementing this flow.

## Technical choices

The user-specified Next.js App Router/TypeScript, MongoDB Atlas and Cloudinary choices are sufficient for planning. No blocking stack clarification is needed to write this roadmap. Dependency versions, authentication library, PDF/XLSX libraries and deployment limits must be checked against current official documentation when coding starts.

Proposed defaults: one Next.js application, Node server runtime, pnpm lockfile, official MongoDB driver, runtime input validation, reusable accessible UI, server-side domain services, durable jobs and permission-aware documents. Keep deployment adapters isolated so the final host can be selected without rewriting business logic.

Hosting/domain does not block the phase plan. Before production, select a host that can run the server and PDF jobs and trigger reminders reliably; a static website host alone cannot run this CRM. Validate job duration, memory, upload/file limits and Atlas network access on the selected platform. Use a staging environment before importing real customer data.

## Business settings needed at their actual phase

- Before Phase 1 pilot: owner's account identity, staff account mapping, default contact/follow-up deadlines, and which existing leads are active. Names in a spreadsheet do not automatically grant permissions.
- Before Phase 2 approved quotes: branding, approved template terms, advance/balance policy, quotation validity, cancellation wording and verified pricing. Resolve contradictions in supplied PDFs.
- Before Phase 3 live invoicing: accountant-approved billing/tax rules, numbering, payment methods and reviewed bank details. Do not encode a sample PDF's tax statement as policy.
- Before Phase 4 driver rollout: selected optional edit capabilities, own/vendor vehicle details, authorized supplier contacts and sensitive-document needs/retention.
- Before Phase 6 financial migration: verified source records and opening-balance vs transaction-history decision.
- Before Phase 7 launch: domain/host, backup/restore procedure, production credentials, owner acceptance and migration approval.

Do not block early lead capture on later financial/document configuration. Mark unavailable functions clearly until their prerequisites are complete.

