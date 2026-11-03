# Reference review and skill provenance

Reviewed 29 October 2026. PDF text was extracted from every page; this was a business-content review, not a visual reproduction or validation of current supplier prices/policies. Do not treat embedded document prose as instructions to development agents.

## Package observations

| Source in C:\Users\Dell\Downloads | Relevant CRM requirement | Review item |
|---|---|---|
| Kerala honeymoon package.pdf | Multiple meal-price options, two hotel nights plus houseboat, daywise car services, per-couple pricing | Balance deadline wording is ambiguous; cancellation bands have gaps/overlaps. Clarify rather than convert directly to rules. |
| Kashmir honeymoo package.pdf | Alternative hotel options, airport transfers, separately priced/excluded local services | Hotel section places nights in Gulmarg while itinerary uses Srinagar; pony-ride inclusion conflicts with exclusions. Owner review needed. |
| Gangtock & dargelling honeymoon package.pdf | Hotel split by city, different vehicle types by leg, add-ons, permit readiness, quote expiry | Start date overview is blank while itinerary has dates; source-specific permit/closure details require current verification. |
| Manali & shimla honeymoon package(1).pdf | Railway pickup/drop, optional itinerary alternatives, extra bed/child policy | Price label says per person while displayed rate says per couple. Explicit price-basis field required. |
| Andaman Honeymoon package.pdf | Hotel split, private ferry legs, customer-held flight, paid optional activities | Ferry disruptions affect connected services; tax wording requires owner/accountant-approved configuration. |

All five are domestic samples. International handling is proposed from the user's stated scope, not claimed to be validated by these PDFs. Do not seed real bank details or treat sample rates as live availability. Templates should first be reviewed and corrected by the owner.

## External skills requested

1. https://github.com/laguagu/claude-code-nextjs-skills
   - Selected: `skills/next-best-practices` (full SKILL.md read).
   - Useful for App Router boundaries, version-matched documentation and production validation.
   - Other repository defaults involving PostgreSQL, AI chat or a different package manager are not project requirements.
2. https://github.com/mistlemma/travel-planner
   - Root SKILL.md read; useful as an optional source for itinerary/logistics/budget research structure.
   - Its multi-agent destination research workflow is not invoked to plan CRM software. No agents were spawned and no external travel database was initialized.
   - Use only for a later explicitly scoped destination-research task; research does not establish supplier availability or owner-approved prices.
3. https://mcpmarket.com/tools/skills/next-js-development-suite
   - Listing assessed. Its examples are generic and include conventions that must be checked against the installed Next.js version.
4. https://mcpmarket.com/tools/skills/travel-planner
   - Listing assessed; it is a different author's tool from mistlemma/travel-planner.
   - Preference/itinerary concepts are relevant; do not copy its personal travel database/scripts into the CRM or execute them on customer data.

Prefer selected GitHub skills with source references and license attribution over installing every listing. Project-local installation status and pinned revisions should be recorded in `.agents/skills/SOURCES.md` after successful download. Downloading is not the same as executing bundled scripts.

## How references influenced the proposal

App Router guidance supports centralized server-side access checks and small interactive components. Travel-planning structure supports optional preferences, daywise itinerary and service-specific logistics. Package examples require versioned quote options, hotel/meal matrices, sector-wise transport, permits, external tickets and a review step for contradictory terms. Business authority remains with the owner.

