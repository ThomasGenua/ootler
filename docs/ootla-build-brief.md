# Ootla build brief

Recorded: 2026-10-21. Last updated: 2026-10-23 (Africa/Lagos).

## Working method and current authorization

Ootla is a property sales, leads and leasing CRM with embedded AI.

- Ootla is a new, separate project rooted at `C:/Users/user/Documents/software/Ootla`. The resolved Documents directory is `C:/Users/user/Documents`; the requested lowercase `Documents/software/ootla` resolves to the existing folder on this case-insensitive Windows filesystem.
- Do not integrate Ootla into LoomAgency or `loom_real`, convert another application, inherit another application's stack or modify unrelated repositories.
- Complete only the stage the user explicitly sends. Do not implement the entire project or automatically advance through multiple prompts.
- After that stage, stop for the user to review, test and request changes. Wait for the next explicit instruction. This supersedes earlier multi-stage working instructions.
- The initial request was documentation only. The later foundation attachment authorized the foundation implementation and is now identified by the user as revised Prompt 00. That foundation is complete. The authority/continuation rules and Stage 01 repository/startup verification are historical completed records. Stage 02 real staff authentication/authorization is a completed historical record. Stage 03 isolated persisted-demo implementation is a completed historical record. Stage 04 approved-dashboard implementation is a completed historical record. Stage 05 public-homepage implementation is a completed historical record. Stage 05a public workflows are a completed historical record. Stage 05b public platform/integrations/supporting information and the user-approved hello@ootla.ai handoff are completed historical records. Stage 06 property/contact implementation and verification are historical completed records. Stage 07 lead/opportunity implementation is a historical completed record. Stage 08 private lead detail is a historical completed scope with its final checks recorded below. Historical Stage 09 authorization: persistent tasks, property/team assignment, actionable follow-ups and in-app reminders. All 14 backend groups, eight isolated write-browser groups and four retained record-read-only groups passed. Additive migration 007 is applied once; original values/counts in all 29 prior tables and all seven checksums match. The final 144-module build and bounded compiled security smoke passed without outstanding failures. Stage 09 is a completed implementation record; passing checks do not imply user approval. Historical Stage 10 authorization: standalone CSV onboarding/imports, explicit duplicate review, idempotent background processing, safe undo and a separate standalone demo organization. Stage 10 implementation, all 15 backend groups, nine isolated browser groups, three bounded restriction-state cases, three retained read-only browser groups, final 147-module client/server build and bounded compiled security smoke passed. Migration 008 is applied once; all eight checksums, 109 protected source hashes and original-column/count/fingerprint preservation across all 35 prior business tables passed, excluding only four new separate-demo setup rows. The separate organization has no imported/customer records. Stage 10 is complete with no outstanding failures and awaits user review; STOP without advancing.
- Established Prompt 00 baseline: one Vite/TypeScript, vanilla HTML/CSS/TypeScript, Express/TypeScript and PostgreSQL application; public and protected foundation pages; real authentication; migrations; isolated demo setup; design tokens; documentation and focused verification. Preserve this architecture and its working features.
- Begin further CRM modules, live integrations or future portals only when the current explicit stage authorizes that work. Never advance automatically to a later prompt.
- Maintain `docs/ootla-progress.md` after each stage. Record subsequent user corrections and explicit approvals so later stages preserve approved work. Completion or successful checks do not imply user approval.

## Authoritative foundation and subsequent prompts

The revised **Prompt 00** is the authoritative project foundation. Ootla is a NEW application in `Documents/software/ootla`; on this machine its existing root is `C:/Users/user/Documents/software/Ootla`. The Vite + TypeScript frontend, Express + TypeScript backend and PostgreSQL database belong to this same project. This application serves both the public website and admin dashboards.

For every subsequent prompt:

1. Inspect the current implementation and project progress notes first, including this brief and the architecture record.
2. Preserve the architecture and working features established by Prompt 00.
3. When the stage overlaps completed work, verify what exists and implement only what is missing or needs correction. Do not recreate the project, reset the database or replace working authentication.
4. Treat earlier references to converting or reusing an older application as superseded by the NEW Ootla project direction.
5. Complete only the current stage, run focused checks and update the progress notes.
6. Report what changed, what works, any blockers and exactly how the user can test it, including the relevant URLs. Retain the detailed stage-report requirements below.
7. STOP after the current stage and wait for user feedback or the next explicit prompt.

This authority decision preserves the established baseline; it does not authorize a new feature stage or imply approval of every visual detail.

## Stage 02 scope and preservation decisions - historical

Stage 02 explicitly authorizes real backend authentication and organization membership with persistent organizations, users, memberships, roles, property access assignments and audit records. Inspect and adapt the established implementation rather than replacing it.

- Support organization admin, leasing agent, property manager and read-only analyst permissions on the backend. An organization admin has no platform-superadmin access.
- Keep applicant/resident identities separate from staff membership and staff login. This stage does not implement applicant/resident portals.
- Preserve normal `/admin/login`, sign-in, logout, current-user loading, session expiry and protected `/admin` access. Use existing Argon2id password hashes and secure server-managed database sessions; never substitute frontend-only login or a localStorage user.
- Enforce organization and assigned-property access server-side. Persistent grants are loaded on each authenticated request. Membership/role or property-assignment changes take effect for existing sessions.
- Apply only additive migration `002_staff_roles_property_access.sql`. Preserve existing organization/user/membership records, password hashes, legacy roles, session design and immutable migration 001. Do not reset or automatically reseed the retained database. Explicit non-destructive compatibility checks may verify seed idempotence; they must preserve existing records and password hashes.
- The four canonical roles are `organization_admin`, `leasing_agent`, `property_manager` and `read_only_analyst`. Retained `staff` and `read_only` roles remain conservative legacy mappings; existing memberships are not rewritten.
- The minimal property identity registry supports authorization only. It does not implement units, the full property CRM, Yardi synchronization or imports. Membership/assignment administration is API-only at this stage.
- An organization admin controls its own memberships, property identities, assignments and audit access. Other staff require explicit property assignments; property managers may rename assigned identities, while leasing agents and analysts have read-only identity access. Declared future leasing/analytics grants do not implement those workflows.
- Verify normal and invalid login, logout, expired sessions, role/property restrictions, portal separation and denial of another organization's records. Preserve the existing minimal visual layout; this stage does not authorize a redesign.
- Report testable behavior, URLs, checks and migration commands, then STOP for review.
## Stage 03 scope and demo decisions - historical

Implement only Stage 03 within the existing application. Preserve the normal authentication/session design, current layout and earlier immutable migrations.

- Use a real PostgreSQL demo administrator, `admin@demo.ootla.test` / `OotlaDemo!2026`, with a hashed password and organization-admin membership only in its demo organization. No platform-superadmin access.
- Keep `/admin/login` and the visible **Fill demo credentials** control. It fills the email and masked password without submitting; the user must use normal backend sign-in.
- Require server-side `DEMO_MODE` and verified isolated database/deployment controls. Demo passwords, autofill and existing demo sessions must not work against production/customer/mixed databases or with demo mode disabled. Verify the actual connected database identity and reject URL override ambiguity.
- Seed representative properties, separate units, leads and related records, including Maya Chen, Jordan Ellis and Priya Shah. Clearly label persisted records synthetic and activity/outbound behavior simulated.
- Ordinary explicit seeding is repeatable, adds only missing owned records and preserves existing passwords, membership settings, edits and unrelated records. Never run seed or reset automatically at startup.
- Provide a separate deliberate reset command requiring `--confirm-reset=<exact connected demo database name>`. It may restore manifest-owned sample rows and the established demo administrator's configured password/active role, revoke that administrator's sessions and append an audit event. It must preserve unrelated users/records and audit history; it does not authorize a database-wide reset.
- Default `INTEGRATIONS_MODE` and `OUTBOUND_MODE` to `simulation`. Only simulation is accepted in this stage; no live mode or ordinary-demo external-service write is enabled.
- Reuse the admin shell to show read-only saved demo records and real organization/property-scoped counts. Keep the public dashboard preview illustrative without private data. Do not implement full CRUD, live AI, screening, payments, emails or integrations.
- Additive migration `003_demo_dataset.sql` extends the schema and marks the demo identity; migrations 001/002 remain immutable.
- Verify real login, refresh, actual backend-process and actual PostgreSQL-restart persistence, ordinary seed idempotence, confirmed reset behavior and demo denial outside its verified environment. Run reset verification only in a uniquely owned scratch database, preserving the retained demo database. Actual restart verification is opt-in, restricted to the verified project-owned local cluster and owned API children, with no migration/seed/reset or password rewrite.
- Report the exact login URL, credentials, testable scope and actual verification results, then STOP. Stage 03 execution checks and preservation results are recorded in progress; completion does not imply user approval.

## Stage 04 scope and approved dashboard decisions - historical

Only implement the approved dashboard image supplied in the Stage 04 conversation (1586 by 992 pixels). It is now the authoritative visual reference. Its binary is not local; earlier notes that the reference was unavailable are historical, not permission to continue an invented dashboard design.

- Preserve the existing Vite/vanilla TypeScript, Express, PostgreSQL, real authentication, organization/property isolation and seeded demo. No rewrite, schema migration, reseed/reset, new integration or production deployment.
- Match the full-width rounded charcoal header and Ootla branding. Top navigation is Overview, Leads, Properties, Applications, Calendar.
- Show an Overview title and period selector, then exactly New leads, Tours booked, Applications and Leases signed.
- Keep the sidebar beneath the header with My leads, Tasks, Analytics, AI assistant and Integrations.
- Show three spacious Leads to follow up cards. Keep charts, activity feeds, AI panels and integration widgets off the overview.
- Use backend-created period metrics: `month`, `week` or `all`, using Africa/Lagos boundaries and server-enforced organization/property access. New leads uses lead creation; Tours booked uses non-cancelled booking creation. Applications/leases are null/unconfigured, not invented zeros or percentages. Preserve legacy API count fields.
- Cards use the saved record's actual status, property, unit description and open linked task. Existing status labels are New inquiry, Contacted, Tour booked and Qualified; do not rewrite fixtures to Applying or Leased.
- Add lead opens `/admin/leads?view=new` with an honest pending workflow. View lead opens `/admin/leads?lead=<uuid>` with read-only related detail. View all leads, header search and stage filtering must lead to useful current records; no full lead CRUD is authorized.
- Reuse the existing editable roof/O vector. The original exact logo source is still unavailable locally; align the admin wordmark to the reference without an added decorative dot. Do not claim exact original artwork.
- Preserve responsive navigation, accessible controls, reduced-motion behavior, login and all dedicated pages. The public preview remains illustrative and private-data-free.
- Run focused backend/period, build and browser/visual checks, preserve unrelated data and report actual results. Stop after Stage 04 for user review.

## Stage 05 scope and public homepage decisions - historical

Implement only the requested public homepage. Preserve the working Stage 04 admin interface and the existing architecture, authentication, schema and demo records.

- Use the user-specified headline exactly: “Keep leads moving. Keep people informed.” Supporting copy exactly: “Ootla brings your pipeline, AI assistance and daily property work into one clear workspace.” Keep forest green, off-white and charcoal, public headings at weight 500 and body copy at weight 400. Preserve the admin's established typography.
- Provide six separate alternating text-and-visual sections for resident AI replies, staff AI reminders, viewing scheduling/Google Calendar, applicant documents/staff review, Yardi readiness and standalone imports. Do not collapse the requested workflow stories into a generic feature-card grid.
- Reuse the actual coded admin shell at full 1480px size, showing approximately half at the far right clipped beyond the viewport. Do not shrink/stretch the entire dashboard into a small frame. At 900px and below, place the unscaled preview below the copy in normal flow with a clipped 430px-high frame to prevent overlap.
- Use only public invented Alex Morgan, Casey Taylor and Robin Lane examples in that inert preview, with record-derived example counts. Never request or expose the private demo/customer dataset. Avoid duplicate page h1/main semantics inside the hidden preview.
- Provide a three-step enquiry/viewing/staff-review illustration with native buttons, click and keyboard controls (arrows, Home/End and native Enter/Space), optional IntersectionObserver enhancement, runtime reduced-motion handling and cleanup on route abort.
- Reduced-motion mode must remove automatic intersection-driven changes, sticky behavior and transitions while keeping all content/manual controls usable.
- Keep **Sign in** and **Explore demo** linked to the real `/admin/login`, preserving normal masked demo fill and backend sign-in.
- Label resident AI, reminders, calendar, applicant documents/review, Yardi and imports illustrative/planned. No live models, upload pipeline, calendar invitation, screening, provider operation or external write is implemented by this stage.
- Keep new homepage/preview/workflow styles scoped; preserve actual admin/login/global styles, server/shared/migrations, seed/session/configuration, environment/lockfile and retained record data.
- No backend, schema, seed/reset, authentication, dependency/install, production deployment or communication change is authorized.
- Run focused build/browser/responsive/motion/privacy checks, verify unchanged admin/data and update progress, then STOP for review. Stage 05 functional, final build, contrast and preservation results passed and are recorded in progress. Stop and await user review; do not advance automatically.

## Stage 05a scope and scenario boundaries - historical

Implement only the public AI/workflow pages and illustrative scenarios within the existing vanilla Vite/TypeScript application.

- Public routes are `/ai-workflows`, `/workflows/leasing` and `/workflows/resident-support`, linked by the shared native-details Workflows menu and footer.
- The resident/reminder/viewing demonstrations are five-step manual scripts (indexes 0–4), not live AI. Selection/replay resets browser memory; advancing shows scripted conversation, resulting example record and staff handoff/history. No network, storage, timer, backend record or outbound action belongs to the scenarios.
- Resident text starts exactly “My bathroom fan has stopped working.” The next scripted question asks which room/access is possible. Thursday 14:00–16:00 remains requested access, never a confirmed visit.
- At index 3 (displayed Step 4 of 5), service request DEMO-104 is Awaiting assignment, technician Unassigned and appointment Not scheduled. Index 4 adds a pending staff task to review/assign and confirm separately. Preserve this distinction in all future stages.
- Reminders remain unsent staff-review drafts; prospect viewing times are requests pending staff availability/confirmation, not booked calendar appointments.
- Leasing illustrates inquiry → viewing request → application → authorized staff review. Screening still requires provider/consent/staff review; AI makes no applicant decision.
- Resident support covers assignments, unsent updates, renewal review and existing-provider payment guidance only. No lease/renewal approval or payment authorization/capture/charge/refund is performed; do not invent a verified payment status.
- Explore demo and Sign in use real `/admin/login`, preserving ordinary authentication.
- Preserve the Stage 05 homepage/preview, Stage 04 protected dashboard, login/security, schema/records, environment, lockfile and dependency versions. No new backend API is authorized; Express only adds the two new public pages to its production route allowlist.
- Run focused route/scenario/keyboard/responsive/privacy/build/preservation checks, report actual results, then STOP for review. Build, seven focused groups, bounded final focus/CTA checks, compiled-route smoke and preservation passed. Results are recorded in progress; STOP awaiting user review, with no automatic next stage.

## Stage 05b scope and truthful public information - historical

Implement only Stage 05b within the existing application; preserve earlier public/admin/authentication/data work.

- The integrations hero is exactly “Yardi-ready integration.”
- Provide seven distinct text-plus-coded-preview sections: Yardi property/customer records, Google Calendar, Google Analytics acquisition, standalone customer/history import, applicant portal, maintenance and existing-provider payment handoff.
- A client must have the licensed Yardi interfaces, permissions and configuration needed for activation. Never claim certification, an active connection or invented interface compatibility.
- A local public Yardi-connected/Standalone selector changes only illustrative content. It must not change organization settings, request private data/API, persist state or connect a provider.
- Keep payment handoff with existing approved providers. No authorization/capture/charge/refund or falsely verified status. Applicant screening still requires provider, consent and staff review.
- The platform page explains Leads/Viewings/Applications/Operations and links to the existing leasing/resident-support/AI workflow pages.
- Use the approved public green/off-white/charcoal design and lighter 500/400 typography while preserving actual admin, homepage, workflows, authentication, data, environment and dependencies.
- Navigation/contact/privacy must be genuine and factual. Do not invent a contact email, legal entity, testimonial, form-delivery capability, compliance certification or privacy-policy guarantee.
- The user approved `hello@ootla.ai` on 2026-10-21. Use exactly `mailto:hello@ootla.ai` and matching label through publicContact(). Clicking opens the visitor email client only; do not add SMTP, send messages, test inbox deliverability or infer company/legal identity. The initial contact-input gap is resolved.
- No migration, installation, seed/reset, environment/dependency change, production deployment or external communication is authorized.
- Run focused build/browser/route/accessibility/privacy and preservation checks, record actual outcomes, then STOP for review. Stage 05b implementation/build, six focused groups, bounded compiled smoke and preservation passed. The approved contact, final build and bounded contact-only checks passed; only user review remains pending; STOP with no automatic Stage 06.

## Stage 06 scope and property/contact authority - historical

Implement Stage 06 only in the working Ootla application; preserve approved overview markup/CSS/sidebar/four metrics, public pages, normal backend authentication and existing users/data.

- Treat the initial portfolio as over 2,700 **properties**, each with separate units. Use server-side search, exact filters, stable sorting and bounded pagination rather than loading a portfolio into the browser.
- Persist property groups, property/unit records, canonical contacts, contact-property links, households/members and minimal application/lease identity relationships. These relationships do not implement applicant/resident portals, screening, payment or full application/lease workflows.
- Backfill one explicit canonical contact per existing lead and preserve original lead columns/identity/timestamps. Email is not unique identity proof and must never trigger automatic contact/history merging. Reuse an existing contact only through an explicit scoped relationship.
- Enforce organization/current-role/assigned-property access on every backend request and audit writes. Shared contacts/households/history must not disclose other assigned properties or other organizations; an organization admin is never a platform superadmin.
- Persist `organization_data_settings.mode` as `standalone|yardi_connected` and configured camelCase field policies; records carry `source_system` (`local|demo|import|yardi`) and typed `source_owned_fields`. Dedicated typed `external_record_mappings` use tenant foreign keys for property/unit/contact/application/lease identifiers. No setting/mapping activates Yardi.
- Source-owned property/unit/contact/application/lease fields remain read-only server-side, including the earlier property PATCH API. Return `409 SOURCE_OWNED_FIELD` rather than overriding authoritative source data. Local unmapped Ootla-owned records may still be added with existing permissions.
- Availability shows its actual source and nullable verification time. Existing creation timestamps are not verification evidence; legacy/demo rows stay unverified. Status/evidence changes clear stale verification unless explicitly verified; future timestamps and demo/unknown verification claims are rejected.
- Additive migration `004_property_contact_foundation.sql` preserves original users/password hashes/memberships and prior columns. Do not reset/reseed the retained database. Existing Stage 03 seeding remains explicit/idempotent; new sample rows carry demo source/unverified availability without overwriting edits.
- Optional `demo:volume` requires isolated local nonproduction controls and exact database confirmation. Stable synthetic fixtures add only missing rows; no startup generation/reset. A retained dry-run is permitted; actual scalability checks use an owned scratch database.
- New workspaces are `/admin/properties` and `/admin/contacts`; property/contact detail is selected by the saved UUID query. Their create/read/update forms reflect actual grants and field ownership; no deletion workflow or full leasing workflow is claimed.
- Final build, ten backend scratch groups, six focused browser groups, source/old-column data preservation, four migration checksums and bounded compiled route/security smoke passed. The retained 3,000-property/6,000-unit dry-run changed nothing; actual volume fixtures remain scratch-only. Stage 06 is complete and awaiting user review. STOP; no Stage 07 or later work.

## Stage 07 scope and lead progression authority - historical

Implement Stage 07 only in the established Ootla application. Reuse canonical contacts, separate properties/units, current roles/source ownership, normal sessions and the approved admin shell.

- Persist lead creation/editing, eligible ownership, source, property interests, preferences, stage and exact next-action date/time. Preserve all earlier users/passwords/records and immutable migrations 001-004; use additive migration 005.
- Provide list and board views with server-side search, intent/stage/property/owner/source/next-action filters, sorting and pagination. Never load all leads into the browser; board cards are the current page and column totals are explicitly labeled.
- Default leasing stages, in order: New inquiry, Contacted, Tour scheduled, Application started, Application submitted, Staff review, Lease pending, Leased, Lost/Closed. Sales uses an independent pipeline: New inquiry, Contacted, Viewing scheduled, Negotiation, Offer pending, Won, Lost/Closed.
- The backend validates transition graphs and milestone evidence, locks current grants/relationships, checks record versions and records the actual actor/membership/timestamp in persistent events and audit records. A direct request or board move cannot bypass those checks.
- Application-specific status stays authoritative on the application record. Creation/editing/reassignment synchronizes only the lead summary atomically; lead movement does not approve, submit or fabricate an application. Saved application evidence gates application-related lead stages.
- Leased requires a matching active local lease, recorded start date and an explicit authorized documentary verification tied to that exact lease version. Lease changes invalidate the current evidence, preserving prior history; explicit re-verification records new evidence. Only organization admins/property managers can verify. Yardi/provider-owned leases cannot receive invented local verification. Full application/lease workflow UIs remain outside this stage.
- Duplicate suggestions never silently merge people by name, shared email or phone. The user explicitly selects a canonical contact or creates a separate person. Canonical details remain editable through Contacts; primary property/contact/intent stay fixed on a linked opportunity.
- Property interests are explicit existing contact-property relationships, maximum 20 including the primary property. The editor has a separate explicit association action. All interests and the owner's eligible current staff membership/property grants are enforced server-side; partial access redacts hidden interests and denies writes spanning them.
- Connect Overview Add lead, View lead and View all leads to persistent routes. Read a bounded three-card follow-up selection without adding panels/charts/widgets or changing the approved four-metric layout. Keep earlier public examples and hello@ootla.ai unchanged.
- Final build, all 12 backend groups, seven isolated write-browser groups, four retained record-read-only browser groups, compiled security smoke and source/old-column data preservation passed. All five migration checksums match; original customer records/passwords are preserved. Stage 07 is complete and awaiting user review; STOP with no automatic Stage 08.

## Stage 08 scope and private lead workspace - historical

Implement Stage 08 only. Reuse Stage 07 identity, interests, preferences, owner, stage and next action inside the shared admin shell. Preserve the approved Overview and public pages.

- Complete the existing /admin/leads?lead=<saved UUID> detail with unified contact/household information, existing lead facts/editors, tasks, protected documents, combined activity timeline and contextual assistance. Keep detailed tools off Overview.
- Additive migration 006 preserves old identities/columns/passwords/timestamps. Tasks, private events and documents link the same organization/property/lead/canonical contact, retaining history through application/lease/resident identity reuse. This does not implement a new conversion or portal workflow.
- Staff can add an internal note, log a described call, record a follow-up handoff and create/edit/assign/complete/reopen a task. Record actual actor/time. Call logging places no call; tasks send no reminder. Handoff records do not approve/reject applicants, mutate application status or verify a lease.
- Every private workspace read/write/download requires current leasing permission and every property interest. Basic read-only/partial-access lead facts remain available with private legacy notes/events/evidence references and note-search matches redacted server-side. Portal identities and other organizations have no private access.
- Combine communications, viewing/application records, staff actions, stage history, lease milestones and trusted provider updates in a server-paginated newest-first timeline with stable ties. Label synthetic communications/tours; requested access is never a confirmed appointment. No browser endpoint can manufacture provider verification; live ingest remains unconfigured.
- Explicit private PostgreSQL attachments accept validated PDF/PNG/JPEG/UTF-8 text up to 2 MiB. Reauthorize attachment downloads; use no-store/nosniff protection and no public file URL. This is not full applicant intake, provider submission, malware scanning or screening.
- Explain matches only from stated budget/location/bedrooms and available units with supported verification within seven days, never future/stale/unverified/demo evidence. Requested move-in date remains context requiring staff confirmation because dated future inventory evidence is unconfigured. Free-text requirements are not parsed into protected characteristics or eligibility scores. Sales gets an inventory/price setup state, not rental matches.
- Contextual AI remains explicitly deterministic simulation and unsent staff guidance. No live model, outbound message, automatic appointment/decision, provider action or payment is enabled.
- Migration 006 is applied locally without reset/reseed. Final build, all 13 backend groups, eight isolated write-browser groups, four retained read-only browser groups and compiled/startup security checks passed. All 85 protected source hashes, original values/counts in 26 tables and six migration checksums match. The existing APP_URL is 7673; development now follows that loopback HTTP origin/strict port rather than hardcoded 5173, preserving .env and security. Stage 08 is complete, awaiting user review; STOP and do not begin another stage.


## Stage 09 scope and persistent task/reminder authority - historical

Implement Stage 09 only in this existing application. Extend the existing task records and Stage 08 task actions rather than maintaining a separate task store. Preserve normal authentication, canonical identity, public pages and the approved Overview composition.

- Persist property-scoped tasks with optional typed lead/contact/application/tour relationships, owner, due timestamp, priority, open/completed/cancelled status, origin, assignment mode, optimistic version and append-only actor/time history. Properties and units remain distinct; linked records must match organization/property/contact/lead context.
- Provide dedicated My tasks, Team tasks and Unassigned views with server-side search, filters, sorting and pagination. Team tasks means accessible organization work; a routing team never grants property or private lead access.
- All task reads/writes require current leasing permission and assigned-property scope; lead-linked tasks additionally require every interest. Organization admins remain organization-scoped; analyst and portal identities do not gain private task access.
- Manual assignment accepts only eligible current staff. Organization admins configure property/team routing; choose an eligible agent by least open work with deterministic ties and concurrency protection. An enabled rule with no selected team uses all eligible property staff; selecting a team narrows the pool. An empty/ineligible selected team or absent/disabled rule leaves work visibly unassigned. Do not silently reroute existing work on refresh or unrelated edits; re-evaluation is explicit.
- Drive the Overview's bounded maximum of three spacious cards from existing open, relevant, actionable tasks. Keep exactly four metrics and detailed queues on Tasks. Dashboard reads must never manufacture tasks, reminders or staff history.
- Run a separate bounded in-app-only worker approximately every 30 seconds. Deduplicate by task, assignment/due generation and recipient; use one persistent notification per reminder, at most three delivery attempts and bounded backoff. No email, SMS, calendar invitation, provider or model request is authorized.
- Cancel obsolete reminders when work is completed/cancelled, its owner or due generation changes, the linked lead closes or its tour is cancelled. Recheck active membership, grants, property/interest access and current related context before delivery and inbox reads.
- Permit recipient-only 15-minute, 1-hour or 1-day snoozes, at most three within seven days of the first notification. Completion cancels a snoozed reminder. Closing a lead/tour makes its follow-up nonactionable; it does not fabricate task completion.
- Keep the original three demo tasks unassigned unless a user deliberately assigns them. No retained reset/reseed, automatic startup seed or refresh-created task is permitted. Reuse normal Fill demo credentials and Sign in.
- Add only migration 007_tasks_reminders.sql; migrations 001-006 remain immutable. Verify original task/customer/password values, relationships, permissions, routing races, overdue dates, completion history, deduplication/retries/cancellation/snooze and backend-instance persistence.
- Task detail displays the exact saved application/tour identifier, status and recorded tour time in its matching canonical context. Related history links do not imply a full application/calendar workflow, staff applicant decision or appointment confirmation.
- Migration 007 is applied locally exactly once without reset/reseed. All 14 backend groups, eight isolated write-browser groups, four retained read-only groups, final 144-module build, compiled security smoke and original-data/source preservation passed. No outstanding failures remain.
- Use the current configured review origin http://127.0.0.1:7673. Report exact routes, deliberate manual test steps, real versus simulated scope, actual checks and migration/start commands. Stage 09 is complete, awaiting user review; completion is not approval. STOP and await the next explicit instruction.
## Application architecture

Use one repository and one root `package.json`:

- `client/`: Vite frontend, HTML, CSS, vanilla TypeScript and page modules.
- `server/`: Node.js, Express, TypeScript, routes, services and database access.
- `shared/`: shared types and useful validation contracts.
- `migrations/`: versioned PostgreSQL SQL migrations.
- `scripts/`: environment, migration, seed and development utilities.
- `public/`: public static assets.
- `docs/`: architecture, setup and progress.
- `design-reference/`: approved design/logo references and the inventory of unavailable source images.

Do not introduce React, Next.js or another frontend framework without an explicit request. The public website, login, admin pages and future applicant/resident portals belong to this same application.

`npm run dev` starts Vite and the TypeScript backend together; Vite proxies `/api`. `npm run build` builds both. `npm start` runs Express serving the compiled frontend and API on the same production origin. Support direct browser navigation and refresh. Unknown API routes must return API 404 responses, and missing assets must return errors rather than frontend HTML. Shut down gracefully and close database connections.

Inspect and preserve the existing Ootla files before editing. Use compatible stable dependencies and record the actual installed versions in the README and lockfile. The selected foundation is a new application, not a framework rewrite.

## PostgreSQL, configuration and authentication

- Use a real `DATABASE_URL` PostgreSQL connection, `pg` pooling, parameterized value queries, versioned migrations with applied records, timestamps, indexes and foreign keys.
- Prompt 00 initial tables: organizations, users, organization memberships, sessions and basic audit events. Stage 02 adds persistent roles, role permissions, a minimal properties authorization registry and property access assignments. Stage 03 adds separate units, leads, tasks, viewings, simulated lead activity and an ownership manifest for synthetic demo seeding/reset. Stage 06 additively extends properties/units with source ownership and introduces canonical contacts/households, minimal application/lease relationships and typed external mappings. Stage 07 adds versioned lead fields, explicit interests, actor events, application summaries and evidence-gated separate pipelines. Stage 08 adds contact-linked private staff events/tasks/documents, trusted provider-update records, combined timeline and transparent suggestions; prior data/schema are preserved.
- Keep databases dedicated to Ootla. Do not modify unrelated databases. Report database functionality as verified only after a real query succeeds.
- Provide explicit, idempotent development/demo seeding. Do not seed, reset records or replace passwords on server startup.
- Keep database credentials out of frontend code and Vite-exposed variables. Ignore secrets, dependencies, local database data and build output.
- Validate server configuration clearly without printing secrets. Document `DATABASE_URL`, `PORT`, `APP_URL`, `SESSION_SECRET`, `DEMO_MODE`, `DEMO_ADMIN_EMAIL`, `DEMO_ADMIN_PASSWORD`, `INTEGRATIONS_MODE` and `OUTBOUND_MODE`.
- Supply separate frontend/backend TypeScript configurations and root commands: `dev`, `build`, `start`, `typecheck`, `db:migrate` and `db:seed`.
- Enforce authentication, active organization membership and permissions on the server. Use maintained password hashing, server-managed sessions, HttpOnly cookies, logout and a current-user endpoint. Configure local HTTP and production HTTPS cookie security appropriately.
- Demo administrator: `admin@demo.ootla.test` / `OotlaDemo!2026`, restricted to a demo organization with no platform-superadmin access.
- The login button **Fill demo credentials** fills the email and masked password only. It must not sign in automatically or bypass the normal endpoint.
- Show demo autofill only after backend confirmation of an isolated nonproduction database without live organizations and a marked demo account whose password matches configuration. Demo mode is limited to `ootla_demo` or `ootla_demo_*` and actual connected-database verification; disabling it also denies existing demo cookies.
- If the database is unavailable or unconfigured, explain setup honestly and never simulate a successful login.

## Initial routes

Public layout: `/`, `/platform`, `/ai-workflows`, `/workflows/leasing`, `/workflows/resident-support`, `/integrations`, `/contact` and `/privacy`.

Staff login: `/admin/login`.

Protected admin layout: `/admin`, `/admin/leads`, `/admin/properties`, `/admin/contacts`, `/admin/applications`, `/admin/calendar`, `/admin/tasks`, `/admin/analytics`, `/admin/ai` and `/admin/integrations`.

The existing foundation routes remain usable, with unfinished CRM pages clearly labeled as empty/setup states. Stage 02 adds real authorization APIs/current role labels. Stage 03 adds read-only synthetic views on overview/leads/properties/units/tasks/calendar/integrations while applications/analytics/AI remain setup states. Those read-only statements describe the earlier stage. Stage 06 adds scoped local property/unit/contact create/edit forms and group/household creation; full application/resident workflows, deletion/import/provider activation remain outside its scope. Stage 07 adds real lead creation/editing, ownership, server-paginated list/board and evidence-checked stage progression on dedicated lead pages; the earlier read-only/pending lead statements are historical. Stage 08 extends saved-lead detail with private staff notes/calls/tasks/attachments/timeline and simulated assistance. Stage 09 adds the real dedicated Tasks directory, routing and in-app reminders; standalone AI and full application/portal workflows remain unconfigured. Do not pretend unfinished modules are functional or create separate landing-page and dashboard projects.

## Product rules

- This is a sales/leads CRM. Conversations support customer records; the application must not become an email marketing platform.
- Support Yardi-connected organizations and standalone organizations importing existing data.
- The initial client has over 2,700 properties. Properties and units are separate entities.
- Their exact Yardi interfaces are not yet known. Prepare modular integration boundaries and clearly labeled demo/simulator behavior without waiting for credentials or inventing live endpoints.
- Yardi remains authoritative for its configured property, lease, resident and accounting records.
- Ootla may guide users to an existing payment provider, open approved provider pages and display verified status. It must not authorize, capture, charge or refund payments.
- Screening requires an approved provider, consent and staff review. AI does not approve or reject applicants.
- Build Ootla-owned AI capabilities. Do not invent an EliseAI commercial API connection.
- Ordinary demo actions must not send real emails, SMS or calendar invitations, request screening, or write to external services.

## Design rules

- The Stage 04 supplied 1586 by 992 approved admin image is authoritative. Preserve its full-width rounded charcoal header, Ootla logo/top navigation, exact four metric labels, light workspace, sidebar beneath the header and spacious follow-up lead cards. Detailed composition is recorded in the Stage 04 decisions and design-reference inventory.
- Keep the overview uncluttered. Detailed tools belong on their dedicated pages.
- Create shared colors, typography, spacing, buttons, forms, cards, status badges, navigation, loading, empty and error states.
- Starting colors: forest green `#237A3B`, charcoal `#10191A`, off-white `#F5F6F5`.
- Public pages use alternating dark/light sections, green branding, original Ootla copy and slightly lighter headings around weight 500. Do not change approved admin typography.
- The homepage hero has text and CTA on the left, approximately half the full-size dashboard at the far right, extending beyond and clipped by the viewport. Do not squeeze a whole dashboard into a small frame. Include a few subtle calendar, home and AI icons.
- Implement responsive interface components, not a screenshot as the application background. Respect reduced-motion preferences.
- Later public content will cover sales/leads, resident-request AI, staff reminders, viewing scheduling and Google Calendar, applicant documents/staff review, Google Analytics, Yardi readiness, standalone imports and operational/maintenance workflows. This foundation establishes layout and routes only.
- The initial request included wordmark and roof/O symbol references, including green-and-white on dark. The original logo binary/source remains unavailable locally, so its editable vector reconstruction remains provisional. The approved admin screenshot is now available in the Stage 04 conversation and is authoritative even though its raster binary is not stored locally. Compare the coded interface to that image; do not claim user approval or exact pixel fidelity prematurely. See `design-reference/README.md`.

## Implementation and verification rules

- Preserve existing data and unrelated changes. If authorized work already exists, inspect it and implement only missing work.
- Keep the demo usable throughout development and label real, illustrative, simulated and unconfigured behavior.
- Run focused startup, build, type and available authentication/database checks. Avoid repeated full regression runs and unnecessary test scaffolding.
- Do not enable paid CI, deploy over production or activate external communications without explicit instructions.
- Stop after completing the current authorized stage. Do not automatically advance to another prompt.

## Required report after every stage

1. What changed.
2. The exact page or URL the user can open.
3. Manual test steps.
4. Checks performed and any failures.
5. What is real, simulated or awaiting configuration.
6. Required migration/start commands.

For this foundation also report the resolved project path, created structure, exact installation/database/start commands, frontend/backend URLs, demo login and credentials, missing configuration, and functional versus placeholder pages.

Then explicitly stop and wait for the user's next instruction.

## Continuity and historical correction

Before each authorized stage, read this brief, architecture and progress record, including the corrections and approved-work register. Record new corrections with their date, affected scope and preservation behavior. Do not invent future numbered stages or infer approval from implementation.

The first documentation files were mistakenly created under `loom_real/docs`. The user's 2026-10-21 correction required relocating them to `Ootla/docs` and removing only those Ootla-specific copies. Preserve all unrelated LoomAgency files, data and working-tree changes. That separate-project decision remains binding for all subsequent work; earlier conversion/reuse directions are superseded by revised Prompt 00.

## Stage 10 scope and preservation decisions - completed, awaiting review

Implement only standalone organization onboarding with CSV import for properties, separate units, canonical contacts and leads. Reuse the existing Vite/vanilla TypeScript, Express, PostgreSQL, real staff sessions and CRM records. XLSX is optional and is not added: the existing stack has no workbook dependency; UTF-8 CSV covers this stage without a new parser/dependency.

The flow is Upload -> Map fields -> Validate -> Review duplicates -> Confirm import -> Reconcile results. Persist batch IDs, source row numbers, validation/decisions/results and stable source mappings. Invalid rows must remain inspectable and have a spreadsheet-safe error report. Larger imports use durable bounded background chunks, with per-row receipts and replay/retry protection. Contact matches require explicit review; never merge on name alone or overwrite existing identities silently.

Only current organization administrators in standalone organizations may import. Source-owned/Yardi records are not overridden; record relationships remain compatible with the same CRM/application schema. Undo is deliberate and conservative: remove only untouched batch-created records, preserving later edits and related staff work, reused contacts, lineage and audits.

Add a separate isolated standalone demo organization through an explicit repeatable DEMO_MODE-gated setup command, with a hashed account password and normal sign-in. Never reset/reseed the original demo or create demo access in production. Keep external integrations/outbound communications simulated. Preserve the approved Overview and public pages. Update progress, report the six required items and STOP after Stage 10.

Stage 10 implementation decisions to preserve in subsequent authorized work:

- `/admin/imports` belongs to the shared admin shell and is reached through Integrations; preserve the five approved sidebar links, four Overview metrics and maximum-three actionable follow-ups. Keep import tools off Overview and retain public styling/examples/contact.
- CSV is UTF-8 with unique nonempty headers, 5 MiB/10,000 rows/100 columns; preserve physical source line numbers even for quoted multiline fields. Batches/rows/decisions/results live in PostgreSQL. List and row/undo responses are server-paginated, default 25/max100. XLSX is intentionally not implemented because CSV covers the authorized scope without a new stack dependency.
- The source name is a stable case-normalized namespace. Import related files in properties → units → contacts → leads order using that same source name and stable source IDs. Dedicated typed external mappings and persisted row receipts prevent replay duplicates. Identical file/source/type returns its saved batch; existing source IDs preserve existing values rather than silently updating them.
- Upload/mapping/validation never creates CRM records. All ambiguous contacts need an explicit create-separate/link/skip decision before confirmation. Link requires reviewed matching email/phone evidence; name-only linkage and silent identity overwrite are forbidden. This stage links identities without performing a destructive merge.
- Only current standalone organization administrators may access batches or confirm work; the worker rechecks its creator's active membership and organization mode. Respect authoritative source ownership and Yardi mapping targets. Imported properties/units/contacts/leads use canonical CRM tables and shared application/lease identities. Unit availability has import provenance with a null verified time. Lead stages begin at New inquiry and never manufacture lease/application evidence.
- Background processing uses durable transactions, at most 100 rows per tick, approximately two-second scheduling, row savepoints, at most three bounded attempts/backoff and deliberate retry. No repeated dashboard request creates or imports records. Preserve successful receipt/mapping IDs on every retry.
- Export errors as batch UUID/source row/status/diagnostic only, with quoting and spreadsheet-formula protection; do not copy raw PII values to the error report. Keep batch/audit history private to the current authorized organization.
- Undo is explicit, previewed and rechecked under locks. Remove only unchanged, unused batch-created records. Snapshots plus monotonically changed revisions, relationship-touch history and restrictive foreign keys retain later staff work even if it was subsequently reverted/deleted. Never delete reused contacts, unrelated mappings or audit/import lineage.
- The separate Ootla Standalone Demo (`ootla-standalone-demo`) is empty until deliberate user import. `demo:standalone` explicitly and repeatably adds only its missing demo organization/settings/user/membership under verified isolated `DEMO_MODE`; never seed/reset at startup. `standalone@demo.ootla.test` / `OotlaDemo!2026` uses Argon2 and normal cookie sign-in. **Fill standalone demo credentials** only fills fields. Preserve the original demo organization, credentials and review records.
- After safe undo, retain IDs/outcomes but omit links to deleted CRM rows; keep real created/retained links. Three focused rendering cases and the final post-correction 147-module client/server build passed without database/network writes or a repeated broad suite. Final focused checks and user review are distinct; record actual results in progress and STOP after Stage 10 without beginning a later prompt.
## Post-Stage 10 approved-behavior correction - login address

The user reported the demo login error ?This request must come from the configured Ootla application.? Preserve exact server Origin/CSRF enforcement. The public config now supplies the running API's appUrl, and login at a different hostname/port blocks credential entry/submission and offers a normal canonical sign-in link. Keep safeReturnTo validation and full navigation across origins. Demo fill still only fills masked fields; normal backend sign-in remains required.

Do not restore old hardcoded ports, broaden accepted origins, overwrite .env/.env.example or reset users. The verified running address for this repair is http://127.0.0.1:7673; saved environment changes require restarting both API and frontend. Focused check: npm.cmd run check:login-origin. No new feature stage is authorized by this repair; stop after reporting it.

## Branding and typography correction - 2026-10-21

The user explicitly requested that the admin dashboard use the landing page's lighter typography and supplied replacement logo/favicon images. This correction supersedes the earlier provisional logo treatment and heavier dashboard heading weights while preserving the approved layout.

- Use the same self-hosted Ootla Inter family on landing/dashboard, with headings/emphasis at 500 and body/navigation at 400. Keep the inert dashboard shown in the landing hero consistent with the real admin interface. Do not restore 650-800 weight dashboard headings/metrics.
- Approved original transparent wordmark: public/brand/ootla-wordmark.png. Approved roof/O icon: public/brand/ootla-icon.png. Both are byte-for-byte copies of the supplied local PNGs. The white-background reference is design-reference/assets/ootla-logo-on-white.png; source filenames, SHA-256 digests and display bounds are recorded in design-reference/assets/ootla-brand-assets.json. These originals are now available locally and supersede earlier statements that logo binaries were unavailable.
- Shared wordmark() renders the supplied artwork across public headers/footers, sign-in, admin and coded product previews. Do not reconstruct the lettering as HTML text or restore the provisional roof SVG. client/brand.css clips transparent canvas without changing the original PNG; dark surfaces retain the original forest-green mark and render its lettering white for visibility.
- Favicon public/brand/favicon.svg embeds the exact supplied icon PNG inside a tighter viewBox. The PNG is a fallback; public/ootla-mark.svg uses the same icon as a compatibility path. No generated/repainted logo is substituted.
- This is a requested visual correction only. No later numbered stage, data reset, authentication change, provider action or deployment is authorized. Stop after reporting it.

## Post-Stage 10 follow-up: staff profile and personal settings

The completed profile-dropdown follow-up authorized useful **View profile**, **Edit profile**, **Settings** and **Sign out** actions in the existing profile dropdown. This is a bounded follow-up, not authorization for Stage 11 or another CRM module.

- Reuse the approved admin shell, local Ootla Inter typography, original supplied PNG branding, real cookie sessions and current server-loaded staff membership/permissions.
- Own-profile routes are `/admin/profile` and `/admin/profile?edit=1`. Persist display name, optional phone number and optional job title. Email, organization and role remain read-only; no self-service privilege or unverified sign-in email change is implemented.
- `/admin/settings` persists the start page after ordinary sign-in (Overview, Leads or authorized My tasks), default Leads list/board view and reduced-motion preference. An explicit safe return destination/view takes priority; device reduced motion is always respected. These are personal membership preferences, not organization administration.
- Account APIs accept only the authenticated staff identity. Never accept a target user/organization or write role/email from these forms. Preserve staff/portal separation, origin protection, permission enforcement and stale-session rejection.
- Individual staff password changes require the current password, a matching new 12?128-character password and real Argon2id hashing. Revoke every session belonging to that user, including other organizations, and require normal sign-in. Password-change attempts are bounded to five per 15 minutes across restarts. Keep both shared demo passwords fixed so review access stays available.
- Use additive migration `009_staff_account.sql`; preserve earlier migrations, users, hashes, CRM history and environment files. GET account views must not create preferences, attempts, tasks or reminders.
- Implementation and focused verification are complete; see the progress log. STOP for review. No subsequent numbered stage is authorized.

## Stage 11 - historical completed authorization

Implement Stage 11 only: a reusable organization-scoped connector layer with declared capabilities, canonical external mappings, field ownership, durable jobs/event receipts, sync cursors, last success, and bounded error/retry handling.

- Reuse existing PostgreSQL identities, source-owned fields, staff sessions/grants and background-worker lifecycle. Keep detailed controls on /admin/integrations; preserve the approved Overview, latest shared font/logo treatment, profile/settings and standalone imports.
- The functional Yardi simulator owns separate synthetic provider records and feeds canonical CRM records only through its adapter/job pathway. Initial property/unit/contact/guest-card import and incremental availability/contact changes must be real durable syncs, with replay, temporary-failure/retry and explicit conflict review.
- Simulator setup/actions require the server-verified isolated DEMO_MODE environment and a demo organization. Do not switch existing organization modes, adopt unrelated customer identities, reset/reseed existing records or claim verified/live Yardi availability.
- Explicitly distinguish Not configured, Demo, Connecting, Live, Degraded and Disconnected. Live requires an implemented licensed interface and approved configuration; Stage 11 must not manufacture a live connection, certification or outbound service.
- Credentials remain encrypted/server-only with an optional separate connector credential key; blank key disables credential storage, not the credential-free simulator. Diagnostics and connection controls require the current organization administrator; no raw credentials/provider payloads or error details are public.
- Use additive migration 010 only; migrations 001?009 and existing users/data remain preserved. No production deployment or external communication is authorized.
- Run focused initial/incremental/retry/duplicate/conflict/permission checks, document exact simulated-change steps and URLs, update progress and STOP. Stage 12 or another stage is not authorized.

Stage 11 completion: all 16 backend groups, 11 isolated browser groups, four retained read-only groups, the 154-module client/server build and bounded compiled security/preservation smoke passed. Additive migration 010 is applied once; all 39 prior business-table fingerprints and ten checksums match. The retained simulator remains Not configured until deliberately connected. See the progress log and README for exact steps. STOP for review; no later stage is authorized.

## Stage 12 - historical completed authorization

Implement Stage 12 only. Inspect authorized client-provided Yardi documentation, configuration and payloads. No authorized specification, sample payload, credentials or property scope was found. Complete adapter/configuration-validation/mapping scaffolding and clear unsupported/not-configured responses; do not invent endpoints, authentication, payloads or write permission. Keep the functional Stage 11 simulator available and missing live setup non-blocking.

Distinguish scaffolding implemented, client mapping tested, credentials configured and live behavior verified independently. Document field ownership for properties, separate units, contacts, applications, leases, residents and payment status; Yardi retains accounting authority. Prepare the pilot checklist for access/scope/permissions/mappings/reconciliation/rollback. Preserve approved UI, users/data/authentication and prior source ownership. No live transport, migration/reset/reseed, deployment, outbound action or later stage is authorized by the missing-input branch. Run focused checks, report remaining client inputs and STOP.

Stage 12 completion - 2026-10-22: unavailable-input scaffolding, strict non-persistent setup validation, seven-domain source ownership and pilot checklist are implemented. All 11 backend, six isolated and four retained browser groups pass; both TypeScript projects/154-module client/server build pass with a session-only one-thread override after host-memory exhaustion. Compiled security/preservation checks pass; all 48 prior business-table fingerprints and ten migration checksums match. No migration/environment/dependency or live integration change. Client mapping/credentials/live behavior remain unverified. See [readiness and ownership](ootla-yardi-readiness.md), [pilot checklist](ootla-yardi-pilot-checklist.md) and progress. STOP for review; no Stage 13.

## Stage 13 - current explicit authorization

Implement Stage 13 only: the dedicated internal Calendar and viewing workflow, using existing viewings/canonical leads and current server permissions. Keep Google Calendar optional/unconfigured.

- Support day/week/agenda and a usable mobile agenda; property IANA timezone, weekly staff availability, duration, buffers, location, assigned staff and status must be real persisted scheduling inputs.
- Support booking/rescheduling/cancellation/completion/no-show with actor/time history, version checks, duplicate-safe requests and transactionally locked constrained slots. A physical staff member cannot overlap across properties; buffers, units/lead constraints and current access must be checked on the backend.
- Store instants in UTC and validate displayed/property-local offsets against the actual timezone, including DST gaps/folds. Never silently use the execution host timezone.
- Update the lead timeline and appropriate early leasing/sales stage only after a successful action. Do not regress advanced/manual stages or manufacture an application/lease milestone. Preserve cancellation/history and existing staff work.
- Use secure expiring/revocable lead/property-scoped public invitations. Return raw tokens only when issued, store digests, avoid token URLs/API queries/referrers and expose available slots without private staff-calendar details. Public booking uses the same conflict-safe service path.
- Keep notifications simulated, visibly labeled and duplicate-safe; no email/SMS/invitation/provider activation. Internal scheduling works without Google.
- Apply only additive migration 011 after focused scratch verification; preserve all previous migrations/users/data, Stage 11/12 integration boundaries and approved Overview/font/logo/profile/import work.
- Existing viewings with unknown duration/staff/timezone remain labeled legacy/read-only with conservative same-property-day conflict handling; do not invent metadata or reset fixtures. Configure new schedules deliberately, never at startup.
- Verify timezone/concurrent conflicts, actions, permissions, public privacy/token lifecycle and persistence. Record exact URLs/lead-to-viewing steps/checks/commands and STOP. No Stage 14 is authorized.

## Stage 14 scope - current authorization

The user explicitly authorizes Stage 14 only: official Google Calendar API OAuth, selected calendars, encrypted server-only tokens, owned-event mapping, duplicate-safe durable synchronization, pagination/incremental cursors/invalid-token recovery, disconnect and revoked-access handling within Ootla's native Calendar. Use current official Google documentation and report actual mocked versus live verification. Demo must operate internally with no real Google requests or invitations. Preserve earlier schema/data/authentication/UI and finish only necessary existing Calendar wiring. No later numbered stage, deployment or live account authorization is implied.

Inspection on entry found Stage 13 scheduling files present but integration/rendering incomplete and migration 011 unapplied. Completing the minimum dependency to connect Google is recorded explicitly; do not claim that the earlier stage passed checks or received user approval. Preserve old viewing facts as read-only legacy metadata. Public capabilities may appear only in an issued URL fragment that the browser immediately removes; no raw token in server paths/query/referrers/persistent browser storage.

Stage 14 final status: implementation and focused local verification complete on2026-10-22;12 backend groups,5 browser groups,162-module build, compiled smoke and original-data preservation passed. Live Google remains unconfigured/unverified. Completion is not user approval; STOP and await the next explicit instruction.

## Logo motion follow-up - 2026-10-23

The user explicitly requested an occasional slight toppling/tilting motion on the roof above the first O, plus subtle animation of the remaining wordmark letters. This is a branding follow-up only, not authorization for Stage 15 or another numbered stage.

- Preserve the supplied original PNG artwork, favicon, shared lighter typography, fixed logo dimensions and approved public/admin layouts. Do not replace the lettering with a font or recreate the logo.
- Keep the first O stationary. Briefly tilt and settle only its roof, followed by a small staggered lift of the remaining o/t/l/a. The current implementation repeats every 18 seconds with a long quiet interval.
- Respect both the operating system's reduced-motion setting and the existing personal Reduce motion preference. Keep the inert dashboard preview on the homepage static.
- Use the exact original unsplit artwork throughout quiet/reduced-motion states; original logo/icon/favicon files remain unchanged. Decorative pieces remain hidden from accessibility APIs under one Ootla label.
- No backend, authentication, database, provider, dependency, deployment or environment change is required. Record focused verification, report the preview URL and STOP for review.

## Contextual compact admin header follow-up - 2026-10-23

The user accepted the occasional logo animation ("very good"), then explicitly requested page-specific header cards, shorter cards and an accordion-style header control. This overrides the original uniform sales-summary cards on every admin page and the old real-card height; it does not authorize another numbered stage.

- Keep exactly four simple cards. Overview retains New leads, Tours booked, Applications and Leases signed with its existing configured/unconfigured meaning. Other pages use actual server-scoped figures relevant to that module; stock counts cover accessible current records rather than the browser's paginated subset. Calendar uses viewing dates and its selected period.
- The real cards are normally94-96px high instead of132px; the narrowest phones may use110px to keep labels/values/explanations legible. Preserve original public-preview sizing, fonts, logo animation and the full-width charcoal layout/sidebar relationship.
- Put an accessible Collapse page summary / Expand page summary chevron beside the header controls. Collapsing hides the visible page title, period and cards, leaving logo, navigation and search/notification/account icons; an accessible page heading remains.
- Remember this cosmetic choice for the current browser tab, scoped to user and organization, across navigation/refresh. Clear it at sign-out and fall back to memory when browser storage is blocked. Never store an authentication user/session/token in browser storage.
- Enforce organization, assigned-property, every-interest and role restrictions on server aggregates. Null with a restriction/configuration explanation is not a fabricated zero. Properties and units stay distinct; timestamped availability is not proof of a current/live provider record.
- No database migration, seed/reset, environment/dependency/provider activation or production deployment is required. Record focused checks and STOP unless the user explicitly requests further work.

## Stage 15 - current authorization (2026-10-23)

The latest explicit instruction authorizes Stage 15 only: a secure applicant portal using canonical applications, separate applicant invitations/sessions/identities, personal details, configured co-applicants, private validated documents, save/resume, consent, submission, next steps, staff progress/lead timeline synchronization and read-only staff preview. Add a separate isolated applicant demo account; test expiry/persistence/uploads/download access/submission. Preserve all existing users/data/authentication, approved logo/typography, contextual compact collapsible header and prior modules. Use only additive migration 013; no production deployment, database reset, real outbound invitations, screening/payment execution or later stage.

The public-site restructuring/OotlaAI messaging/photography request remains pending. Its three assigned agents confirmed they wrote no files before the user switched to Stage 15; no incomplete marketing changes were left in the baseline. Do not resume it automatically. Record exact applicant/staff walkthroughs, checks and migration/start commands, then STOP.

## Pending public-site correction - recorded, not implemented

Before the explicit Stage15-only request, the user requested clearer OotlaAI value across the property lifecycle, including illustrated SMS/phone/AI responses, with original copy rather than an invented EliseAI commercial integration. The product name is OotlaAI; Ootla remains the brand/logo. Every marketing page should have one introductory section, one major green-themed section, then the existing Explore section and footer. Platform should retain its introduction and rephrase the existing Applications feature as the main content; add approximately2-3 real property/viewing photographs across inner pages. These are pending requirements, not completed/approved implementation. All three assigned public-page agents confirmed inspection only/no source edits before the stage switch. Do not automatically resume this work afterStage15.

## Stage 15 final status - 2026-10-23

Implementation and focused local verification complete:10 backend groups,8 isolated browser groups,2 retained read-only browser groups,168-module build, compiled security smoke and original-data/source/migration preservation passed. Additive013 is applied; separate applicant/staff demo accounts and fresh draft are prepared. No live delivery/provider/screening/payment action was enabled. Review walkthrough: docs/ootla-applicant-portal.md. STOP for user feedback; public-site restructuring remains pending and no later stage is authorized.

## Public website and profile-menu follow-up - 2026-10-23

The user explicitly resumed the previously pending public-site correction after Stage 15 and added two account-menu presentation changes. This follow-up is implemented and awaits visual review; it does not authorize Stage 16 or another numbered stage.

- OotlaAI is the application name; Ootla remains the brand and original logo. Use original copy to explain how AI supports each process, including configured SMS conversations, phone/voice assistance, contextual responses, document follow-ups and staff handoff. Do not invent an EliseAI API or suggest unconfigured channels are live.
- Each of the eight marketing routes uses one introductory section, one main forest-green section, the retained Explore CTA and footer. Compact articles, native disclosures and examples belong inside that single main section. This supersedes the earlier multiple alternating content sections. Preserve lighter typography and the full-size, right-clipped coded homepage dashboard.
- Platform keeps its introduction and a rephrased application-follow-through feature as the main presentation, with compact links for Leads, Viewings, Applications and Operations. The homepage presents six selectable AI process examples; preserve its restrained scroll/manual workflow and reduced-motion support. The three manual AI scenarios remain scripted and replayable.
- Three genuine photographs illustrate the inner pages: living-room interior on Platform, apartment exterior on Integrations and residential neighborhood on Resident support. Serve them locally, retain alt text/credit/source/license records in public/photos/sources.json, and label them illustrative rather than customer properties or endorsements.
- Marketing examples send no SMS, make no calls, contact no live AI/provider and change no organization or customer record. Staff own applicant decisions and assignments; requested access is never a confirmed technician appointment. Yardi/accounting authority and existing-provider payment boundaries remain.
- In the authenticated header, order controls Search, Notifications, Collapse/Expand summary, Account. Profile is the farthest-right control. The dropdown identity shows the user's name only, omitting organization and role from that presentation. Retain View profile, Edit profile, Settings and Sign out, all real session and permission checks, exactly four compact contextual cards and collapse persistence.
- Preserve Stage 15 and every earlier application module. No schema, dependency, environment, seed/reset, provider activation or production deployment change is needed. Update progress, report review URLs/checks and STOP.

## Authoritative color and landing-page correction - 2026-10-23

The user corrected the previous follow-up: "green" was a mistake and meant the existing charcoal/dark background. This instruction supersedes every earlier request or implementation note calling for a green section background.

- Use the established charcoal #10191a and off-white #f5f6f2 for full-width marketing sections. Green remains a restrained brand/action accent, not a full section background.
- Inner pages have one light introduction, one charcoal main section, a LIGHT Explore section and a DARK footer. Keep their current content, real destinations, lighter typography and scripted examples.
- The landing page is an explicit exception to the inner-page two-content-section structure: restore the prior six full alternating dark/light process sections, followed by the existing restrained workflow, light Explore and dark footer. Remove the six-tab presentation; preserve the clearer OotlaAI/SMS/phone/process-value copy and the full-size clipped hero dashboard.
- In exactly two landing sections, combine a genuine photograph with the existing coded product preview and subtle floating icons: resident phone support and a property viewing. Preserve visible photo credits, neutral alt text and reduced-motion support. Photographed people are illustrative models, not actual OotlaAI users, customers or testimonials.
- Preserve the three earlier inner-page photographs, original Ootla logo/animation/fonts, far-right name-only profile menu, four contextual compact/collapsible summary cards, working CRM/applicant modules and all server/data/authentication boundaries.
- This is a public presentation correction only, with no new numbered stage, live provider action, migration, reset/seed, environment/dependency change or deployment. Update progress and STOP for visual review.

## Smaller landing photographs, concise copy and public SEO - 2026-10-23

The user explicitly requested smaller landing photographs than the product screenshots, less text-heavy copy and discoverability for real estate AI assistant searches. This follow-up is implemented and awaits review; it does not authorize another numbered stage or deployment.

- The photographs are secondary:56% visual width beside/above100%-width coded product previews. Preserve their credits, two-photo composition, subtle icons, responsive behavior and reduced-motion guards. Keep the full-size clipped hero dashboard unchanged.
- Preserve the approved headline, six full alternating light/charcoal landing sections, inner light/dark/light-Explore/dark-footer pattern, original Ootla branding and the clearer OotlaAI/SMS/phone value. The six process copy/value blocks are now about43% shorter.
- Use natural real estate AI assistant, leasing and property-management language. Preserve truthful setup/simulation, staff decisions, requested-time and provider-ownership boundaries. No competitor-name stuffing, copied copy/assets, fictional testimonials, pricing, certifications or guaranteed search rank.
- Maintain crawlable pre-rendered HTML for the eight public routes, unique metadata, canonical/social/schema, genuine internal links and public-only discovery files within the current vanilla stack. Private/admin/applicant/booking/API routes remain noindex and protected; public content must not populate private HTML.
- PUBLIC_SITE_URL and PUBLIC_SITE_INDEXING are explicit optional build settings; indexing defaults off. A verified HTTPS public origin, matching non-demo production APP_URL and request host are required for live indexing. The actual environment and all deployment/provider settings remain untouched. Do not invent a public domain from the supplied contact email.
- Preserve earlier data, migrations, authentication, applicant workflows, profile menu and admin cards. Run focused SEO/security/visual checks and required build, update progress, report exact URL/setup needs and STOP.

## Hidden photo credits, diagonal composition and concise inner pages - 2026-10-23

The user's latest correction explicitly overrides earlier always-visible attribution and aligned photo/card edges.

- Keep photo credits out of the normal visible layout. Reveal them on hover, keyboard focus or touch; Escape dismisses the credit while retaining visible focus. Preserve photographer/source links, alt text and source/license provenance.
- Maintain a clear diagonal composition: smaller photo at the upper right, larger product preview at the lower left, with distinct left AND right edges and a restrained overlap. Current photo width is56%; product preview is88% desktop/90% narrow layouts. Preserve the approved full-size clipped hero dashboard.
- Make all seven inner marketing pages direct and concise. Edited explanatory copy is roughly one-third shorter, while real-versus-scripted status, licensed-interface setup, source ownership, staff decisions, consent, appointment and payment boundaries remain explicit.
- Remove the global "Skip to content" anchor from client/index.html and generated public/private shells. Do not reintroduce it automatically. Keep semantic main landmarks and existing unrelated applicant navigation intact.
- Preserve charcoal/light section patterns, OotlaAI wording/branding/motion, pre-rendered SEO/noindex boundaries, private data/authentication, admin profile/cards and every completed application module. No migration, dependency, environment, provider or deployment change.
- This is a presentation correction only, not another numbered stage. Verify hover/focus/touch/Escape, diagonal desktop/mobile geometry, content/routes/SEO and normal demo access, update progress and STOP.

## Subtle floating accents and button-only contact - 2026-10-23

The user requested floating icons "here and there" and no visible email address in the Contact us section. This is a public presentation follow-up only; Stage15 remains the last numbered stage.

- Add restrained decorative accents to selected homepage product previews and the shared Explore section. Preserve existing hero/photo icons, diagonal photograph/product hierarchy and charcoal/light sections. Accents must not cover content, capture clicks or enter keyboard/accessibility navigation. Respect reduced-motion preferences.
- Show Contact us as the contact action, with no address printed in the visible page, search description or Organization structured data. The genuine mailto destination uses the previously verified recipient and opens a pre-addressed draft only after user activation. The visitor decides whether to send it; no contact backend or automatic email delivery is introduced.
- Preserve all private CRM/applicant/authentication features, original assets and public SEO/indexing boundaries. No dependency, migration, environment, reset/seed, provider activation or deployment change. Run focused checks, update progress and STOP for review.

## Authorized Stages15–19 batch - 2026-10-23

The attached user request explicitly supersedes the per-stage STOP instruction for this execution only. Complete Stage15,16,17,18,19 sequentially; verify each and update progress before beginning its dependent stage. Stop after19, never begin20. Preserve the established architecture, private authentication/permissions, records and approved presentation. Reuse already-completed work. External screening/payment/signing/AI integrations require verified documentation/configuration; absent those, keep working isolated demo adapters explicit and never activate real outbound actions. Use additive migrations and normal domain services; record actual verification and unresolved external inputs without claiming live behavior. After this batch the normal one-stage STOP rule remains in force.

## Authorized Stages 20-25 batch - 2026-10-24

The attached user request explicitly authorizes this next sequential batch: Stage 20 Ask Ootla/customer conversations, Stage 21 automation/reminders, Stage 22 GA4 reporting, Stage 23 portfolio reporting/AI insights, Stage 24 resident/maintenance/renewals and Stage 25 gated voice foundation. Complete working UI, backend and persistence; verify each dependency before continuing without asking. This supersedes the previous stop-after-19 instruction for this execution only. Finish with one consolidated handover, then STOP before Stage 26.

Ask Ootla (formerly discussed as Stage19A) is part of Stage20. Keep one shared assistant and canonical CRM identities/services. Preserve the clean shell, existing secure sessions/property scope, previous data and all application/screening/payment/lease/AI workflows. Use additive migrations. Default communications remain local; no live calls, SMS, purchases, recordings, real outreach or deployment. Unknown provider APIs stay unsupported; simulator behavior is explicitly labeled. GA4 uses current official read-only APIs and organization-scoped encrypted credentials; no sensitive CRM information is sent to analytics. Report actual stage checks, source/freshness, measured 2,700-property scale observations and remaining client inputs truthfully.

## Authorized final Stages26–28 batch — 2026-10-25

The latest attached request explicitly authorizes26→27→28 sequentially, superseding historical stop-before26/per-stage stops for this batch only. Complete operational settings/permissions/health/audit/retention, one consolidated isolated acceptance pass with material fixes, then verified local deployment/backup/recovery preparation and final documentation. Preserve separate application-demo, resident-demo and original-admin organizations; never weaken isolation. Use immutable additive migrations, normal services and explicit retention configuration with no invented legal period. No automatic reset/reseed, paid CI, real outreach, production replacement, propflows.ca changes or DNS changes. If no accessible explicitly authorized isolated remote preview exists, finish locally and report not deployed. Update progress after each stage; final handover must state simulation/external inputs/incomplete work honestly. STOP after28.


## Production-readiness follow-up - 2026-10-26

The attached f752da15 request explicitly authorizes sequential steps1-7 after the historical Stage28 stop: polished ordinary interface; preserved isolated preview; complete typed environment inventory and append-only missing private entries; documented live integration audit/completion where interfaces are known; operator-controlled real organization/first-admin invitation; configured accessible Ootla deployment or exact local preparation if target inputs are absent; focused verification and final handover, then STOP. Preserve the independent Ootla repository, approved design, existing values/accounts/data/migrations and organization/property scope. Deployment permission applies only to an actually configured accessible Ootla target, not unrelated infrastructure. No real customer/paid-provider test actions. Technical details belong in protected organization-owner administration or operator records. Organization admin remains scoped, not a platform operator. Never mix preview users/jobs/database with customer production or silently substitute scripted AI there.

Confirmed deployment domain (2026-10-26): the user supplied `ootla.ai`. This identifies the intended public customer domain; SSH host/access and a separate preview hostname have not yet been supplied. Do not infer a remote target or claim publication from the domain alone.


## Live/demo branch correction - 2026-10-28

User authorizes two aligned instances: ootla-v1-branch is the customer/live app with Sign in replacing Explore demo and no demo access controls. ootla-v1-demo retains Explore demo and normal masked credential filling. Keep all application features aligned; separate private environments, database roles/records, session secrets/cookies, origins and API ports. Preserve all existing demo records/accounts without reset or reseed. This supersedes the earlier customer-site /try cross-preview CTA requirement: live /try leads to its own staff sign-in. Work only on this split while the user reviews; previous deployment preparation/final production-readiness steps remain pending. See [instance guide](ootla-instances.md).

### Explicit live-organization communication hold - 2026-10-28

Do not send any email to Oodler or its live users until the user explicitly approves. Private local administrator invitation creation is authorized; automatic or test email delivery is not. Keep outbound simulation and live delivery disabled. This constraint persists across subsequent prompts.


## Demo showcase and remote branch publication - 2026-10-28

The user authorizes preloading the isolated demo with representative linked data, making native features and explicit local provider simulations usable, then pushing ootla-v1-branch and ootla-v1-demo to their matching configured remote branches. SQLite is a possibility, not a required rewrite: preserve the working PostgreSQL implementation for actual authentication, tenant isolation, native services and durable-job concurrency. Demo preparation must be deliberate, repeatable and additive; no automatic startup seed, reset, password rotation or overwrite of staff edits. Keep live and demo feature code aligned but private data/configurations separate. No real external email/SMS/call/calendar invitation/payment/provider action is authorized. Oodler/live email hold persists until explicit approval. Do not push private env files, backups, database files or invitation capabilities. No production deployment follows automatically from pushing source.

## Separate demo project name - 2026-10-28

The user names the separate local demo project ootlademo. Its checkout is C:/Users/user/Documents/software/ootlademo on ootla-v1-demo; the live product remains C:/Users/user/Documents/software/Ootla on ootla-v1-branch. Both belong to the existing shared Git repository, with distinct private runtime/database/session settings. This is a folder/project organization correction before further feature work, not authorization to rebuild either project or reseed records. Preserve the Oodler/live email hold.

## Leads page review direction - 2026-10-28 (Q&A, implementation pending)

The user wants to review pages one by one through questions and answers before further changes. On Leads, reduce cognitive load on the individual record; avoid duplicate contact information and navigation to an almost identical unified-contact page. Keep the unified underlying contact identity/history across leads, applications and residents. Replace the directory's separate property/owner search sections and always-visible nine-field form with a unified search plus a compact ecommerce-style filter control. Remove the misleading Find your next conversation heading; it is ordinary saved-CRM filtering, not a Yardi/provider or AI query. The user's intended AI placement is unfinished and needs clarification. The proposed exact tabs, actions and AI placement have not yet been approved; no UI/backend implementation is authorized by this review log alone. Preserve actual filters, permissions, pagination and persistent relationships during eventual simplification.

## Approved Leads simplification - 2026-10-28

The user selected the AI suggestions button and explicitly authorized all proposed Leads simplifications. Implement in the demo project ootlademo for review: one scoped lead search with compact advanced filters and removable chips; compact one-copy lead summary; Activity default with Tasks/Documents/Details secondary views; one Edit details entry point with canonical contact editing; AI/property suggestions inside a button-opened accessible panel. Remove duplicate contact-navigation/prominent repetitive sections, redundant owner/property search blocks and ambiguous Find your next conversation wording. Preserve server-side authorization, source ownership, canonical identity/history, pagination, persistent actions and stage evidence. General design correction for subsequent page-by-page work: fewer visible inputs, precise action names, search where appropriate, and secondary tools revealed when needed; never equate decluttering with deleting underlying business data or weakening permissions. The previous Q&A-pending state is superseded for this agreed Leads work only; do not automatically redesign all other pages or activate live services.

## Approved simplified workspace navigation - 2026-10-28

The user explicitly accepts simpler navigation and corrects Automations to live under Settings, not Tasks. Demo sidebar has six flat entries: Tasks, Reports, Maintenance, AI assistant, Conversations, Settings. Top navigation retains Overview, Leads, Properties, Applications, Calendar; remove duplicate My leads from the real sidebar. Group website Analytics under Reports. Group Organization, Integrations and Automations under Settings alongside Personal settings, preserving current server permissions and URLs/deep links. Hide Voice from ordinary app navigation for now; retain its guarded records and simulator for future activation. Preserve the approved inert marketing/dashboard preview and the full-width header/metrics/profile position. No backend deletion, migration, data reset, live customer operation, automatic branch push or app-wide redesign is authorized by this menu task.

## Client demonstration and actionable task correction - 2026-10-29

The user authorizes demo-only client-presentation cleanup, record-aware confirmed Lead/Task suggestions, task descriptions/search/compact filters and bounded table row controls. Preserve the previous navigation grouping, button-only Lead assistance and separate live checkout. Ordinary workspaces should use concise business wording instead of shipped synthetic/demo scaffolding. Apply exact recognized fixture mappings only at display; preserve unknown staff/customer text, identity emails, private document bytes, raw provenance and audit evidence. Do not imply a real invitation, delivery, appointment, screening, signature or payment merely by removing a label. Operator configuration and unavailable provider actions remain truthful.

Individual Leads now have Activity, Tasks and Documents; the extra Details tab is superseded. Keep household/preferences/milestones/stage tools behind Edit details. Keep canonical contact identity and source ownership enforced by the existing server APIs. Tasks use one search and compact Filters, visible descriptions, and explicit confirmation for status/reassignment/suggested mutations. Completion comments belong in task history and the Lead timeline, not in a replacement task description. Suggestions read authorized structured context and bounded history/metadata, and execute only native, version-checked domain operations after confirmation. Draft email actions save private reviewable drafts without sending; viewing suggestions enter the existing slot-selection/booking workflow. No paid model/provider activation or outbound communications are authorized. Anthropic is not required; the existing optional model transport is OpenAI, while this isolated runtime keeps inference simulated.

The deliberate repeatable demo:polish-tasks command may replace only the exact shipped empty/generic descriptions of the eleven known task seed keys through the normal task service. Preserve every other field/staff edit/status/owner and append normal audit/history. No startup reset or migration is authorized. Keep server-side search/pagination and rows-per-page controls on full record tables; fixed metric comparisons and bounded option/slot pickers are not full unbounded tables.

## Maintenance and shared control refinement - 2026-10-29

The user authorizes only this demo UI refinement: Reports moves immediately before Settings, preserving all other items/routes/permissions. Maintenance queue uses one saved-record search with exact placeholder Search maintenance requests and compact Filters; remove standalone property/staff lookup inputs from the queue. Search must remain server-scoped/paginated and cover request ID/reference, issue, resident, property, unit and assigned staff. Preserve actual statuses/assignments in table/details and normal sidebar/browser navigation; no dedicated queue Back button. Administrative/detail tools remain progressively disclosed.

Rows per page belongs in a compact intrinsic-width control beside paging, with usable mobile wrapping and bounded scrolling filter menus. Reuse the pure shared renderer plus separate browser controller; preserve filter/sort/query state, reset the relevant page on search/size changes and avoid whole-page top jumps.

The user's clarification explicitly applies pilot zero cards to EVERY admin page. PREVIEW_ZERO_SUMMARY_CARDS is a server-only explicit setting, defaultfalse; enable only in a non-production DEMO_MODE runtime and after verifying the actual isolated demo database. The authenticated overview emits the presentation marker while returning real counts unchanged. This is a display override, never a record update or query-string flag. Live configuration cannot enable it. Header summary values must be numeric; replace status/assignee/preference text values with actual scoped numeric counts. Empty authorized results return0; unavailable/private values remain marked Unavailable instead of inventing accessible data. Keep real request status/assigned staff on record views. Preserve the previous client-presentation cleanup, demo/live separation and no-email hold. STOP after focused checks and review handoff.


## Maintenance request detail refinement - 2026-10-29

The user authorizes only the selected Maintenance request view cleanup in the isolated ootlademo project. This supersedes earlier notes that kept queue lookup/administration tools inside request details. Keep the existing Maintenance directory, navigation, permissions, actual records and pilot summary-card setting intact. No new correspondence feature or numbered stage is authorized here.

- Remove the saved-record explanatory paragraph, queue search/filter/rows-per-page tools, resident invitation/renewal publishing, emergency-guidance configuration and duplicated administration/list controls from the detail layout. Preserve their underlying authorization, appointment confirmation and emergency-routing rules/services.
- Show a compact request summary with its real reference/category/location, actual resident, linked property/address/city/unit where recorded, status/priority/created date, description and authorized attachments. Canonical linked records supply names and property information; missing values remain explicitly unrecorded, never invented.
- Keep assignment/status controls concise. Use the short helper Your timezone without a visible IANA timezone identifier. Resolve the user's browser timezone because the current account preferences have no stored timezone setting. Display and interpret staff detail date inputs in that zone, store UTC instants, preserve unchanged instants including seconds/daylight-saving offsets, and reject ambiguous or nonexistent edited local times rather than guessing.
- Requested access is visibly unconfirmed and separate from confirmed appointments. Preserve explicit appointment confirmation and backend evidence/version checks. Keep internal notes private to authorized staff; previous resident updates remain read-only history. Reserve a clean Resident correspondence section below request information for the next prompt, without adding a composer or outbound action.
- Verify canonical linked details, assignment/date persistence, private-note/file access, retained emergency routing and responsive detail layout. Update progress, report the selected-request URL and STOP. Preserve the live-project/no-email hold; do not seed/reset/migrate/push/deploy or activate providers.


## Maintenance resident correspondence - 2026-10-29

The user now authorizes filling the reserved Maintenance section with Conversation. This supersedes only the prior correspondence-placeholder restriction. Keep the approved compact request summary/assignment/timezone/private notes, directory controls, pilot card display, existing data and separate live instance unchanged.

Reuse existing request-scoped maintenance_messages and resident-portal inbound messaging as the authoritative thread, and the shared communications transport/outbox/idempotency infrastructure for outgoing replies. Do not create duplicate contacts/leads, publish a public property channel or copy message bodies into a separate inbox merely to support maintenance. All organization/property/resident/author checks remain server-enforced; never infer thread membership from an email/name/subject match. Internal notes and private attachments must never be copied to correspondence.

Show the authorized canonical resident name/email, chronological messages with resident/staff identities, readable user-time timestamps and actual channel-specific states. The repository currently has no implemented email sender, email credentials/schema, verified inbound-email parser or authenticated delivery callbacks; no external provider IDs or successful email delivery may be invented. Until those dependencies are implemented/configured and activated explicitly, support real authenticated resident-portal replies and saved private drafts, including draft-only email composition where an authorized address exists. Available in resident portal does not mean email sent/delivered/read. Do not add an unverified email webhook or recipient chosen by the browser.

Use additive migrations only when needed to extend the shared outbox/draft metadata safely, preserving every original migration and record. Back up the isolated demo before applying changes; no customer/live database, provider activation or tenant test email is authorized. The Oodler email hold persists.

Replies update only the conversation locally. Preserve drafts/selection and other unsaved request fields on failures, duplicate retries and polling; no full-route reload. Keep reading position for older messages, bounded cursor pagination, private-note separation and an unobtrusive new-message indication. Verify native reply/incoming persistence, exact request threading, failed-send/draft behavior, deduplication, access and desktop/mobile interaction using owned isolated records. Update progress, report exact test URLs, actual transport limitations and required migration/start commands, then STOP.


## Property Renewals pilot refinement - 2026-10-29

The user authorizes only this pilot refinement: inspect the legacy Maintenance resident-access/approved-terms forms, remove those standalone forms from Maintenance, provide a compact Renewals list/detail and move necessary access management to a protected resident/lease administration page. Preserve the earlier Maintenance Conversation, private notes, assignment/timezone rules, directory/navigation and pilot zero cards.

The actual existing model stores approved resident_renewal_offers with active/expiry fields and canonical active/draft/ended leases. It has no accepted, signed or completed renewal lifecycle. Use computed current/expired/not_published/inactive information and real staff tasks; never equate published guidance or a completed task with a completed renewal. Keep explicit approval/publication behind concise contextual controls; never show a large default publishing/configuration form. Active lease and actual organization/property permissions/source ownership must be rechecked server-side. Yardi remains authoritative; local text cannot be labeled provider_verified or overwrite provider-owned lease data.

Renewals belongs under Properties at /admin/renewals. Resident invitations/grants belong under Settings at /admin/resident-access, accessible to appropriately scoped organization admins and property managers, with no platform-admin expansion. Keep existing protected APIs compatible while removing their unrelated Maintenance UI. Search/filter/sort/pagination must be server-scoped, bounded and reuse the compact pattern. Lease dates stay date-only; approval/task times use the resolved user timezone. Related links use canonical record IDs.

Prepare the existing isolated main demo with five append-only coherent synthetic examples, reusing its two properties and adding separate preview units/contacts/leases/resident relationships where old lease dates cannot be changed safely. Dates are relative to first preparation; repeated preparation is a true no-op even after staff edits. Current/expired/superseded information is preloaded historical preview snapshot data on new synthetic relationships, not an automatic publishing action on existing leases or a notification. Label synthetic terms clearly. Demonstrate upcoming expiry, terms preparation, current information for resident review, expired information needing follow-up and an actual completed staff follow-up on an ended lease. Do not invent completed-renewal acceptance/signature evidence. Resident previews show only authorized active, published and unexpired information.

Back up and preserve all original records, users, offers, leases, configuration and29immutable migrations. No live lease change, automatic offer publication service, invitation delivery, real notification, provider activation, push/deployment or next-stage work is authorized. Give exact demo account/routes and a short walkthrough, report focused checks/limitations/commands, update progress and STOP. The Oodler/live email hold persists.

## Compact Reports pilot refinement - 2026-10-29

The user requested a Reports-only presentation and interaction refinement in the existing isolated demo. Preserve prior approved pages, private authentication, organization/property/role scope, source ownership, the separate live checkout and the existing preview-only zero summary-card setting.

- Remove the large introductory report implementation paragraph. Preserve metric/cohort/date/provenance definitions in a concise optional explanation panel, not a prominent implementation warning.
- Replace expanded report scope with the established bounded Filters popover. Keep the same inclusive UTC date calculations and intersecting property/group/region/staff/team parameters, concise active summary/chips and Clear. Remote option searching remains scoped and bounded inside the popover.
- Keep Current stage and cohort age definitions unchanged. Use a table search and compact table Filters for existing sort/attention parameters, directly above its table. Table filters remain distinct from full-scope period counts and cohort conversion denominators.
- Keep one compact Rows per page control beside its matching pagination through the shared renderer. Disable secondary lower administrative forms through documented conditional rendering; retain their source renderer, protected handlers and reporting services for deliberate future reuse. SHOW_SECONDARY_REPORT_ADMINISTRATION=false currently gates Property region configuration. Do not hide interactive forms with CSS.
- Apply report queries, table pages/views and report actions locally to their affected regions. Preserve the current shell, user position, selected filters and URL/browser-history behavior; refresh actual affected aggregates and assistant context without a full page reload. Failed operations retain valid records and selected controls rather than inventing counts.
- Keep Website analytics separate from CRM outcomes and preserve authorized CSV exports. No reporting-service calculation, definition, schema, data preparation, external communication, dependency or deployment change is authorized. Verify exact before/after same-query facts/exports, scope denial and desktop/mobile interaction, update progress and STOP.

## Interactive Calendar pilot refinement - 2026-10-29

The user requested a real clickable Calendar as the primary page, a selected-date popup to inspect bookings and schedule a viewing, concise Availability and Google Calendar buttons, and removal of visible timezone identifiers such as Africa/Lagos. This is a Calendar refinement only; preserve the completed CRM, Reports, Renewals, Maintenance, shared shell, existing data and separate live checkout.

- Default the native page to an actual month grid, retaining week/day/agenda alternatives. Month queries cover six complete Monday-first civil weeks in the resolved display timezone. Keep protected scoped/paginated backend queries and bounded period loading; selected-date bookings page independently rather than implying unseen rows are absent.
- Clicking a date opens a keyboard-accessible modal with actual authorized records and a concise viewing composer. Reuse real property/lead/staff/unit options, staff availability, verified offered slot instants, durable bookings, conflict/idempotency checks and timeline/stage behavior. Do not create cosmetic events or treat a requested date as a confirmed appointment. Preserve entered fields after failures and recheck slots after conflicts.
- Render staff-facing Calendar times in the resolved user timezone, using the short label Your timezone without visible IANA identifiers. Keep actual property timezone storage, recurring weekly property-local hours, UTC instants, offsets and daylight-saving handling intact; never silently replace a property's timezone merely to hide its identifier.
- Keep Availability behind its existing protected feature button. Google Calendar is a feature button leading to Sync with your Google Calendar and explicit personal sign-in/selection controls. Reuse the actual per-membership OAuth/session binding, encrypted server-side tokens, selected calendars and Ootla-owned event mappings. Do not connect another staff account, assume universal write access or turn external private events into CRM viewings.
- Preserve deliberate Google consent and current isolation gates. The retained demo cannot make Google authorization/provider calls or real invitations; its action shows an honest setup state. Configured eligible non-demo staff can use the existing official OAuth transport, then select calendars for busy-time checks and a writable destination for their assigned Ootla viewings. Native read-only Busy overlays use only the current staff member's existing privacy-filtered cache; unavailable sync must not block local scheduling.
- Calendar navigation, popup saves and subsequent refreshes retain the shared shell, current filters and reading position. Keep initial/failed/revoked states truthful. No new dependency, schema migration, reset/seed, live email/provider activation, deployment or branch push is authorized. Verify desktop/mobile, keyboard, dates/timezone/DST, concurrency, permissions, selected-day persistence and Google personal scope. Update progress and STOP.

## Page-jump correction and modest Calendar resize - 2026-10-29

The user authorizes only a modest Calendar height reduction and fixing action-induced page jumps across the existing application, then STOP. Inspect the actual event, router, rendering, focus and scroll-container causes before changing them. Preserve normal intentional navigation, authentication redirects, application permissions, original data, prior UI work and the separate live checkout.

- Ordinary Submit/Send/Apply/Ask actions must use the existing async API paths, local busy guards and stable request keys. Non-submit actions use type=button rather than hash links or implicit form submission. Do not add a blanket preventDefault handler that breaks valid forms or OAuth/payment destinations.
- Remove unnecessary mutation-triggered navigation and whole-root loaders/replacement. Maintenance status/assignment/notes and renewal publication update their actual affected sections from authoritative records. Keep private Conversation, unsent forms and surrounding mounted DOM. Same-entity filters/pagination/other saves use a small keyed DOM update of changed nodes; opening a different page or record keeps ordinary navigation/focus behavior.
- Do not use a global forced scroll, repeated timers or scroll restoration to conceal the cause. Keep document and nested scroll containers mounted. Compensate once for actual local layout displacement where needed. Never focus a success/error block in a way that scrolls the whole page; concise inline status/error announcements preserve values and intentional validation/authentication focus.
- Ask Ootla keeps its drawer, context, messages and composer mounted. Update only changed message/action sections. Preserve drafts and cursor position on failures or in-flight edits. Follow new messages only if the reader was near the actual drawer bottom; otherwise provide a deliberate unobtrusive catch-up action. Task confirmations remain explicit, duplicate-safe, scoped and authoritative.
- Keep selected report/filter/page state and correct CRM outcome definitions. Preserve email/provider setup limitations and real-versus-native delivery claims. No backend permission, booking/renewal lifecycle, model, provider activation, migration, seed/reset, environment, dependency, live notification or deployment change is authorized.
- Reduce the month Calendar's cell height modestly (about 15-18 percent) while preserving real dates, readable interactions, mobile layout, timezone handling and the selected-day booking popup.
- Verify from a scrolled position: Maintenance change, staff assignment, native request reply/draft, Reports filters, pagination, renewal publication, Ask question and confirmed assistant task. Check no document reload/top jump/duplicate operation, correct updates, retained drafts and useful errors using disposable isolated mutations. Include targeted shared-navigation checks, focused type/build checks and original-record preservation; avoid repeated full regression runs. Update progress and STOP.

## Populated demo and actual summary counts - 2026-10-29

The user now requests meaningful populated cards and actionable pending information instead of all-zero summaries. This explicitly supersedes the earlier pilot instruction to force zeros across every admin page. Set PREVIEW_ZERO_SUMMARY_CARDS=false in the isolated demo and retain the safe false default in .env.example. Cards must display their actual authorized database-backed counts, including genuine zeros for empty categories; never hard-code positive numbers, invent provider verification/delivery, change metric definitions or alter records merely to inflate cards.

Inspect and reuse the existing broad showcase before adding fixtures. Preserve existing users/passwords, records, staff edits, approved layouts, compact controls and page-jump fixes. Add only a small current, linked pipeline where useful: new synthetic prospects, meaningful follow-up tasks and real future internal viewings through the existing booking pathway. Preparation must be deliberate, additive, repeatable without duplicates and confined by actual demo-database and simulation guards. Dates are relative to first preparation and never repeatedly shifted over staff work. No reset, startup reseed, migration, provider activation, live customer change, real tenant communications, branch push or deployment is authorized. Keep the separate standalone import examples separate. Back up and verify original record preservation, check actual cards/links on desktop/mobile, update progress and STOP.

## Clarification: numeric card values, not zeroed records - 2026-10-29

The user clarifies that the summary-card fix concerns numeric VALUES: status phrases such as Awaiting deployment/Awaiting assignment/Unassigned must never replace a count. Show the actual authorized number, using0for missing/non-numeric values or genuinely empty results. Keep populated nonzero counts and PREVIEW_ZERO_SUMMARY_CARDS=false. Do not reset/reseed data or force every card to0. This clarification supersedes any interpretation of the earlier pilot requirement that flattened all card values tozero. Retain metric labels, useful availability context and actual status/assignee text in tables/details.

Use the shared numeric presentation guard for initial cards and direct card refreshes; never stringify a status as the metric or render Unavailable/a dash as its value. Preserve permissions and the distinction between unavailable context and a genuine empty count. No new feature, live checkout/configuration change, data mutation or provider/outbound activation is authorized. Run focused renderer/browser/type/build checks, update progress and STOP.

## Compact floating Ask Ootla - 2026-10-29

The user authorizes only redesigning the existing staff assistant. Preserve all current backend endpoints, server-side organization/property/record permissions, saved conversations, sources, confirmations, idempotency and working actions. Remove Ask Ootla from desktop/mobile headers and provide one green, accessible bottom-right staff launcher. It remains available across staff navigation and is never created on public, login, applicant or resident pages. Authentication/account/organization changes must dispose the staff UI.

Use a compact approximately420px desktop chat above its launcher, bounded by the viewport, and a responsive mobile sheet with safe-area/keyboard handling. Keep header controls to Ask Ootla, New conversation, History and Close. Keep the composer pinned while messages scroll; close/reopen preserves conversation/draft/reading state. Existing conversations retain their original authorized context; deliberate New conversation uses the current staff page's context. Do not silently retarget a saved conversation while navigating.

Remove the private-staff subtitle, Active context card, property search/picker, context-change warning, permanent green explanation, inline history accordion and permanent collection of prompts. Empty chat says How can I help today? with at most3useful suggestions; show messages/composer once a conversation starts. Prompt labels must describe actual existing behavior (Viewing options queries availability rather than claiming a booked-viewing list). History loads only on request through the existing authorized paginated service. Keep necessary optional task preview inputs compact and collapsed, with explicit saved-action confirmation.

Preserve the recent page-jump, numeric-card, populated-data, Calendar and navigation corrections. No backend/schema/dependency/provider/configuration/live checkout change, seed/reset, real outbound communication, deployment or branch push is authorized. Verify desktop/mobile layout, keyboard, reopened conversation, staff navigation, permission boundaries and one existing confirmed action using disposable records; keep retained inspection read-only. Update progress and STOP.

## Ask Ootla grounded response generation - 2026-10-29

The user authorizes this response-generation refinement only, preserving the compact floating assistant, saved conversations, permissions and working confirmed actions. Inspect Stage19 and actual provider selection; substantive priorities, summaries, checklists and capability answers must pass authorized tool facts and approved knowledge through the existing configured model when live inference is eligible. Structured results remain context, while validated model prose is the final answer. Preserve source links and never invent completed actions. Keep the same rate/token/cost ledger and duplicate protection for organization-wide questions; an additive nullable property reference may support this internal staff-only ledger use without relaxing public property requests or creating an unmetered path.

Use concise direct language, useful bullets and one sensible supported next step. Avoid routine internal-process/permission/scope boilerplate, repeated greetings, serialized records and hard-coded examples. No live inference failure may silently use scripted demo answers. A brief truthful limitation plus useful actual native records is acceptable, clearly distinguished from AI generation; technical diagnostics belong in protected traces.

Resolve user timezone per message, humanize routine dates with shared helpers and preserve date-only values, stored UTC timestamps and scheduling calculations. Do not expose routine ISO strings or IANA labels; explicit timezone settings and genuine cross-timezone clarification remain available. Preserve user-authored messages, links and historical records.

Inspect only relevant private configuration safely, add truly missing keys without overwriting values and document exact setup. The current demo has every AI key present, provider=simulated and blank model/key, so preserve private .env bytes. Retain the existing live-in-demo prohibition and require a separately authorized non-demo runtime for paid inference. Do not activate providers, copy credentials, change live/Oodler data, send messages, reset/seed, push or deploy. Controlled test transports establish code routing, never actual external live verification. Record actual evidence/remaining setup in progress and STOP.
## Pending-work register and continued prompts - 2026-10-30

The user asks to note all pending work for later while continuing with their prompts. Maintain [the consolidated pending-work register](ootla-pending-work.md), distinguishing missing implementation, existing code awaiting configuration, actual external verification, optional extensions and deliberately disabled features. Inspect it with progress/actual code before later prompts. Recording an item is not authorization to implement it, activate providers or deploy. Do not rebuild completed stages from stale handovers. Preserve the current simpler UI, separate live/demo instances, immutable data/migrations and Oodler/live no-email hold. Execute only the next explicit prompt and stop for review.
## Conversational Ask references and white table cards - 2026-10-30

The user authorizes only this refinement. Ask defaults to all authorized properties within the current organization, without a property-selection form. Current page/selected record is a per-message helpful hint, not a permanent conversation lock. Authorized explicit property/address/unit/person/lead/application/Maintenance references override hints; resolve server-side with bounded searches, compact ambiguity choices, unavailable responses that disclose no restricted matches, and revalidated conversational/ordinal references. Preserve the same conversation/draft while navigating. Support several authorized properties with honest bounded results.

Use existing metered inference/native readers, source links, private unsent drafts, Calendar offered slots and confirmed task creation/assignment/status/priority changes. Recheck current role/property/canonical links and versions immediately before execution, preserve duplicate-safe retries and keep read-only questions free of confirmation. No model SQL, applicant decisions, payments, invented availability or outbound sending. Preserve source freshness, knowledge/history rechecks and retention for new metadata. Keep remaining provider setup pending in the existing register; no live inference or email activation is authorized.

All actual admin record tables use white card surfaces through shared styles, preserving compact controls, responsive scrolling, semantic status styling, the approved shell and public previews. Work only in ootlademo; preserve live/Oodler/no-email hold, records, unrelated dirty changes and original migrations. Apply only a necessary additive migration after backup/isolated checks; update documentation/progress, report working interactions and STOP. Details: [conversational reference guide](ootla-ask-conversational-references.md).
## Compact Ask Ootla History and persisted removal - 2026-10-30

The user authorizes this History refinement only. Keep History behind the floating assistant header, with readable escaped titles, Today/Yesterday/older-date groups, short local times and an accessible New conversation control. Opening History must preserve the active conversation, draft and reading position. Use per-row accessible Delete with a compact confirmation and useful failure/retry feedback.

Persist removal using exact server-session author/membership/organization and current record permissions, never client-supplied identity. Removed threads stay absent on refresh and cannot be revived by delayed responses, pending confirmations or create-key retries. Deleting the active thread returns to a clean new conversation; deleting another preserves the active draft. Retain business records, already completed actions and required operational/audit data. Explain history removal separately from permanent erasure under configured retention; do not invent a retention period.

Preserve current orchestration, scoped sources, confirmations, real data, unrelated changes and the separate live checkout/Oodler email hold. Apply only the backed-up additive032 history tombstone migration in the isolated demo, verify focused browser/security/concurrency/preservation behavior and the required build, update progress and STOP. Guide: [Ask Ootla History](ootla-ask-history.md).

## Ask Ootla scrolling and interaction refinement - 2026-10-30

The user authorizes only fixing the existing floating staff chat's scrolling and interactions. Keep its header and composer fixed within the bounded window and one conversation/history scrolling area; remove nested scrolling caused by composer, setup panels or clarification controls. Preserve mobile keyboard clearance and drafts, show chronological messages with the latest exchange on conversation opening, and preserve the same window's recent reading position. Explicit sending reveals the submitted turn and response area; follow new content only while appropriate, respect deliberate reading of older messages and offer a compact Jump to latest control. Never move the surrounding application document for chat events, confirmations or open/close.

Use a small truthful pending indicator, prevent duplicate sends, support Enter to send/Shift+Enter newline with composition safety, and place retry feedback beside the originating turn. Reuse existing transport: current Ask replies are complete validated JSON, not streaming, so do not simulate streaming or typing delays. Responses, retries, drafts and pending operations must remain tied to their originating thread when switching/history/deletion occurs. Browser cancellation does not undo committed server/provider work. Preserve existing request/confirmation keys, current permissions, deleted-thread checks and business action confirmations.

Verify the cumulative approved design: one staff-only bottom-right launcher/no header launcher, no context/search setup panel, existing grounded provider routing and automatic authorized references, readable dates, deletable History, fixed composer, sensible independent scrolling and unchanged security. Preserve private environment, all data/migrations, unrelated work, separate live checkout and Oodler no-email hold. No new provider activation, fake live inference, seed/reset, schema change or deployment is authorized. Run focused checks plus the required build, document remaining real-provider setup and STOP.

## Approved contextual lead-task follow-ups - 2026-10-30

Keep the three added isolated demo leasing agents available through actual memberships, property permissions and normal selectors; do not grant organization/platform administration. Preparation is deliberate and idempotent, never a startup reset. Task actions must reflect the current description and authorized lead preferences, timeline, document metadata and related tasks. Preserve editable addressed drafts, private comments, explicit completion confirmation, native Calendar conflict checks and duplicate-safe action receipts. Never copy internal notes into customer email. Current demo email is local preview processing only; actual email and configured live model verification remain separate gates. Maya's four historical entries retain their event identity/meaning/timestamps; real subsequent work may add entries. Preserve all unrelated Ask work and pending verification. See docs/ootla-lead-followups.md.

## Authorized next refinement - lead editing and viewing handoff - 2026-10-30

After completing the task follow-up feature, replace property/unit search in Edit Lead Opportunity with permission-scoped preference-based AI Suggested properties. End the editor at Edit staff notes (plus essential save/error controls); conditionally disable the lower household/preferences/milestones block. Schedule viewing must open Calendar directly for the lead, without a preliminary filter form. Keep native constrained-slot conflict protection; never overwrite existing bookings. Ask Yes/No about client email before saving and trigger only after successful booking through supported transport. Do not imply external delivery when unavailable. Default All Leads to10rows with visible adjustable Rows per page. Complete only these refinements, focused checks/build, then STOP.

## Approved lead editor and Calendar correction - 2026-10-30

Keep All Leads at a default10rows with visible compact adjustable pagination. Edit Lead Opportunity uses AI Suggested properties from the established organization/property-scoped saved-preference and verified-availability matcher; do not restore Find a property/Find a unit forms. Edit staff notes is the last details section. Keep showExtendedLeadEditor=false until a later explicit request; do not delete household/milestone services or records. Schedule viewing on View Lead opens the actual calendar grid with that lead/property and a date popup, without a preliminary filter form. Preserve native conflict locks and existing bookings. Require a Yes/No email choice before save, prepare only after a successful reservation, reuse the shared durable outbox and exact booking receipt, and show actual supported status. Current demo preview processing sends no external email; actual customer email transport remains pending and its draft must be kept. See docs/ootla-lead-editing-calendar.md. STOP after this prompt; no further stage is authorized.

## Approved lead task follow-up refinements - 2026-10-30

Preserve the existing contextual task popup, saved author-bound addressed email drafts, editable review/preview-send, private comments and explicit completion confirmation. Opening a saved draft must not create another event or discard reviewed text. Suggestions use the task description/current lead, bounded authorized timeline/document metadata/related tasks, actual application checklist status and existing viewings; do not offer the same generic actions for every task or propose a duplicate booking. Do not expose private file contents/internal notes in customer emails. Read/check exact current source versions before saving model/native drafts. Closed prospect work must not suggest new outreach or bookings.

Task Calendar handoff goes directly to the actual calendar grid with the exact lead/task/property and a task-only Agreed next step field. Save it with task history and lead next action only on successful conflict-safe booking; leave the task open until explicitly completed. Preserve Yes/No notification and truthful transport status. Wire modal actions before rendering their controls, and bind close/refresh callbacks to the correct dialog identity. No new schema, provider activation, live checkout changes, emails to Oodler or continuation into other stages is authorized by this prompt. Update focused checks/progress and STOP.

## Editor-only layout reaffirmation - 2026-10-30

The user's repeated Edit Lead Details instruction confirms the existing approved layout: Opportunity has AI Suggested properties instead of Find a property/Find a unit; match authorized organization inventory against actual saved preferences and recently verified availability; finish at Edit staff notes plus essential save/error controls. Keep the lower household/preferences/milestones component conditionally disabled. If no preferences are recorded, explain that adding stated preferences narrows the available choices; never infer or fabricate customer facts to fill them. Fresh desktop/mobile verification passed without a source/data change. Preserve this approved layout in later prompts and STOP after the current request.

## Schedule viewing and list-size reaffirmation - 2026-10-30

The repeated prompt confirms the existing approved behavior: View Lead Schedule viewing must open the actual lead-scoped Calendar grid and date popup directly, with no preliminary filter form. Preserve native constrained-slot conflict rejection and existing bookings. Require Yes/No client notification before save and process only after a successful booking, with exact retry protection. Current isolated email is preview processing; actual sending requires the pending implemented/configured email provider and must not be claimed as live. All Leads defaults to10rows while the existing clearly visible compact Rows per page lets staff choose another size. Preserve unrelated paging defaults and working modules. Focused service/browser verification passed again; do not recreate these features or activate external communications from a later generic prompt. STOP after the current request.

## Approved Properties UI refinement - 2026-10-30

Keep Properties creation in explicit Add a property/Add a property group buttons opening the existing forms in native modals. Use one compact Search properties bar with Filters on its right, active-filter chips/Clear all and existing server-scoped search/filter/sort/pagination; do not restore the expanded Search your portfolio form or a duplicate page-size field. Preserve async updates, scroll, drafts, inline errors, keyboard focus/Escape and mobile viewport bounds.

On property detail, Add a unit and each Edit unit are buttons opening the existing unit forms in modals. Remove the requested availability-guarantee explanatory paragraph, the paragraph beneath Units and the whole Property-system references section from this page. Preserve actual source/evidence/verification display, mappings, backend permissions and field ownership; removing a display panel does not delete mapping data or unlock Yardi-owned fields. Keep properties separate from units. The separate Contacts page is outside this cleanup. Preserve all other working UI and services.

Verified six isolated desktop/mobile browser groups, real persistence/error/ownership behavior and the required full build. No schema, private environment, business data or live checkout changes are authorized/needed by this refinement. Preview /admin/properties and its existing ?property= detail routes. Complete this prompt only and STOP; see the progress log for commands/evidence.

## Approved Contacts model and household retirement - 2026-10-30

This explicit user correction supersedes all earlier household requirements. Use Contacts as the product/navigation name. Keep one simple top search bar, small Find a property and Add a contact buttons opening modal workflows, compact pagination, white tables and the existing server-scoped contact/property behavior. Remove unnecessary explanatory copy and the requested single-identity subtitle on contact detail.

Households is retired across active UI, APIs, selection/creation contracts, lead assistance context and dependent workflows. Do not restore household navigation, panels, creation forms, automatic co-applicant households or demo seed households. Application participants retain independent contact identities, explicit property relationships and individual grants; co-applicants are still supported without a household prerequisite. New leases use canonical contact/application/property/unit/lead relationships directly. Keep staff/portal permissions and source ownership intact.

Preserve all pre-existing contact/lead/application/lease/resident records and historical links. Archive old household tables/pointers internally; do not delete, null or recreate historical data. Migration035 removes only active household membership prerequisites and makes the obsolete demo setup reference optional. Import undo must still retain records with archived references. All original migration files remain immutable. The local demo migration was backed up, tested and applied; no live checkout or external action is authorized. Five service and five desktop/mobile browser check groups plus the full build passed. Update progress and STOP after this correction; later stages must retain the contact-based model.

## Approved Applications, Conversations, Reports and dedicated AI cleanup - 2026-10-30

In the isolated ootlademo/ootla-v1-demo checkout, Applications detail must omit Secure invitations, Document requirements, Screening and staff review, Applicants and documents, and Payments from the page layout. Keep their protected APIs, permissions, private files, invitation/participant/screening/payment records and lease workflow intact. The retained management renderer is conditionally disabled in source, not hidden with CSS. Application progress/history and read-only staff preview remain.

An opened Conversations record is a chronological customer/staff chat with a compact header, actual origin, message states and a simple supported-channel composer. Do not restore Staff workspace, directory/configuration panels or private staff notes inside that chat. Private notes remain in their protected records. Preserve exact request keys, outbox receipts, access checks, draft review and original channel routing. Phone records link to their exact protected phone session; they must never send through website chat. Unsupported real email/SMS/telephony remain pending provider work, not newly working transports.

Remove the entire Metric definitions & reporting notes block from Reports. Preserve compact scope/cohort filters, accurate definitions/calculations where used by the report itself, counts, exports and authorized query behavior.

The dedicated /admin/ai page uses a property dropdown, up to three suggested questions, a persistent chronological chat, New chat and an Ask Ootla composer. Reuse the existing protected /api/ask/threads provider/orchestration, source references, history and explicit action confirmations. Remove the knowledge editor and unrelated setup/information panels. Keep the floating assistant's existing behavior separate. The selected property supplies the dedicated page's default scope; explicit authorized names/comparisons and conversational references retain their existing precedence. A property change must not require losing the conversation or draft. Search more authorized dropdown options only on request and paginate server-side. Retain native failure/retry receipts, readable dates, independent transcript scrolling and small-screen clearance for Send. Do not claim configured live inference in the current isolated environment.

No new schema, seeding, reset, private environment change, provider activation, customer email, live-checkout change, commit/push or deployment is authorized by this refinement. Preserve the latest Contacts/household retirement, property modals and approved shared shell. Run focused checks/build, update progress and STOP.

## Approved holistic review and local live parity - 2026-10-31

The user authorizes reviewing accumulated work/pending features and replicating the approved demo feature changes into the separate live project, with no live demo text/access/sample data. Keep shared application source aligned, preserving each instance marker/safe defaults/private environment/database and the Oodler no-email hold. Do not copy credentials, fixture records or cookies into customer data, reset the database, grant platform administration or claim unverified providers are live. Functional simulator/preparation tools remain guarded for isolated demo/test use; public marketing illustrations remain clearly identified examples.

Live's existing database has no sample CRM/demo accounts; preserve its customer organization/admin. Apply only backed-up approved additive migrations029-035. Keep recent simplified Contacts/property/lead/task/Calendar/Reports/Applications/Conversations and Ask behavior. Customer Integrations must show actual readiness without simulator-only controls. Reserved demo lead/availability sources are unavailable to customer writes. Both project builds and current isolated customer/channel/AI/browser acceptance checks are required. Review provider configuration separately from missing implementations and external acceptance.

The current holistic report/pending register supersede older completion notes. P20 targeted acceptance is complete; P19 local source parity is complete, but publication/deployment remains pending. The existing customer admin invitation is expired/inactive; do not reset its password, impersonate the user or send email. Use the existing deliberate reissue/acceptance workflow when requested. No new external integrations, future product features, Git commit/push, production deployment or DNS change is authorized automatically. Update progress and STOP for review.

## Reaffirmed live replication and competitive review - 2026-10-31

Carry every approved shared demo feature/UI correction into the local ootla-v1-branch while preserving its live marker, safe defaults and private/customer data separation. This supersedes earlier refinement-specific limits that left those feature changes demo-only. Demo baseline3452d66 is already published; this follow-through commits the replicated work on the local live branch. It does not authorize deployment, customer email, account reset/impersonation or provider activation. Keep the approved simplified UI and contact-based model.

The EliseAI/DashQ comparison is an audit, not an instruction to implement every competitor feature. Maintain docs/ootla-competitive-audit.md and the pending register. Preserve Ootla's staff applicant decisions, provider payment handoffs, Yardi accounting ownership and absence of bulk email marketing. Complete only this replication/audit and STOP.
