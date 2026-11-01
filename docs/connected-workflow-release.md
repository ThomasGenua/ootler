# Connected workflow release

Apply migration **026_connected_workflows.sql** after 024 and 025. The five new staff workspaces are under **More workspaces**.

## Review replies

`/admin/review-queue` lists accessible drafts, their recipients and channel permission. Staff can edit a draft, skip it, or select up to 20 for a fresh preview. Approval covers the exact recipient, channel, subject, body and record version shown. Each item passes the existing current-access, channel-consent, composer, source-version and delivery checks at send time. Results distinguish sent, simulated, failed, uncertain and blocked items. A partial batch does not resend successful messages; uncertain outcomes still require provider reconciliation.

## Prospect journeys

`/admin/prospect-journeys` prepares property options and an optional viewing invitation alongside an existing or new application. Use the application workspace to issue the normal private applicant invitation. Once accepted, the primary applicant can sign in to `/applicant/journey`, compare units, save preferences, book/change/cancel a viewing, check missing items, upload documents and continue the application.

Journey access requires an active verified primary application participant, the current applicant session, and enabled application access. It never adopts an identity from a submitted email. Co-applicants retain their existing application access and do not inherit the primary prospect’s shortlists or booking capability. Existing shortlist and booking expiration, issuer-access, availability and revocation checks still apply. Booking invitations last seven days; shortlist access lasts thirty days. Staff can prepare a new journey when these expire. Preparation can leave a reusable application or shortlist if a later booking prerequisite fails; it does not send invitations.

## Lead routing

Administrators choose a property, staff members, working windows/timezone, active-lead capacity and temporary absence. Enabled policies assign new website inquiries that have no explicit eligible form owner. Current membership, leasing permission and access to every lead property interest are checked. The eligible available staff member with the lowest capacity use is selected, with a deterministic tie-break. No eligible capacity means the lead stays unassigned with a recorded reason.

`/admin/lead-routing` also previews up to 50 existing active leads. Approval rechecks the proposal, current versions and available capacity. Assignment history preserves previous owner, new owner, actor/time and reason. Existing conversation ownership stays independent during reviewed reassignment; new inquiries initially use their routed lead owner. Capacity counts active leads across the organization. Routing does not change applicant outcomes or use personal applicant traits.

## Sequence performance

`/admin/sequence-reports` shows enrollment cohorts, generated steps, unsent drafts, live sends/delivery, delivery issues, simulated sends, replies, bookings, applications and stop reasons. Outcomes are observed between a live send and the next live sent step, through now. They are descriptive associations, not causal attribution. Current lead/property access limits every report.

The API now starts the bounded sequence processor every minute and awaits it during shutdown, alongside the existing follow-up worker. Concurrent instances retain database locks and persistent step receipts. The one-shot `npm run sequences:process` command remains available; a separate schedule is no longer required when the API stays running.

## Mobile field work

`/admin/field` presents tours and draft inspections. Tour notes autosave; inspection observations save as drafts, while completion always requires explicit review. Inspection photo inputs support mobile camera capture. During a connection loss, notes and up to 32 MiB of queued photos are encrypted in IndexedDB with a key held only in this browser tab. Reconnection retries saved requests and deduplicates photo bytes. Drafts are scoped to the signed-in organization/user, expire after 24 hours and are removed on staff sign-out. Closing the tab loses its encryption key; this is connection-loss recovery, not an offline installation of the whole application.

Access is checked again by the server on sync. Stale records stop syncing and preserve the local draft for review; they never overwrite a newer record automatically. Queued photos must upload before an inspection can be completed. Tour notes belong to their staff author and are separate from reviewed post-tour feedback.

## Release setup

1. Back up the intended database using the existing release procedure, then run `npm run db:migrate` (compiled container: `node dist/server/scripts/migrate.js`). Readiness requires all 26 migrations.
2. Configure `CLAMAV_HOST` and `CLAMAV_PORT` for a trusted private daemon. `deploy/compose.clamav.yaml` is a host-side option: select a reviewed supported official image in `CLAMAV_IMAGE`, keep the signature volume and join the app to its private network. No daemon port is published. Verify clamd accepts at least 20 MiB streams and keeps signature updates healthy. See the [official ClamAV Docker instructions](https://docs.clamav.net/manual/Installing/Docker.html) for supported images, signature persistence and memory needs.
3. Run `npm run release:check` (container: `node dist/server/scripts/release-check.js`). This reads schema readiness and submits a harmless connectivity probe to the configured scanner. It does not migrate, seed, send messages or change customer records.
4. Deploy/restart the application and verify `/api/ready`, login, a private upload/preview and sequence processing in the intended environment.

On 2026-11-01, the owner confirmed that `https://ootla.ai` runs on their own server. The public site responded behind Cloudflare, but `/api/ready` returned the older API-not-found response. Server access, the application directory and the existing process/container configuration must be identified before applying live migrations or configuring the scanner. Preserve the existing reverse proxy, database and secret configuration; use the container commands above only if that matches the server's deployment method. This branch does not claim those live operations were performed.

## Validation

`npm run check:connected-workflows` uses uniquely owned disposable fixtures for batch approval/replay, recipient changes, lead routing and public inquiry assignment, sequence attribution windows, verified applicant journey access, private booking, field-note recovery, offline inspection/photo sync and revoked access. It uses simulated delivery, not live messages. Existing build, release, calendar, operations, productivity and Bento/browser suites remain required CI checks.
