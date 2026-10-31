# Ootla pending work

Updated 2026-10-31 (Africa/Lagos). This is the consolidated follow-up register for the existing application, based on the progress log, current setup/activation guides and a read-only implementation audit. IDs below are tracking references, not new numbered stages. Recording an item does not authorize implementation, provider activation or deployment. Continue only with the user's next explicit prompt.

The current refinement checkout is `C:/Users/user/Documents/software/ootlademo` on `ootla-v1-demo`. The separate live checkout is `C:/Users/user/Documents/software/Ootla` on `ootla-v1-branch`. Native PostgreSQL-backed CRM/authentication, portals, scheduling, tasks, imports, reporting and the recent UI/Ask corrections already exist; do not rebuild them from historical pending notes. This register is the current index; detailed evidence remains in the linked guides and [progress log](ootla-progress.md).

## Implemented integrations awaiting configuration and external verification

| ID | Follow-up | Remaining gate |
| --- | --- | --- |
| P01 | Real Ask Ootla model inference | Response-generation routing and conversational authorized record resolution are implemented locally; see [reference guide](ootla-ask-conversational-references.md). Controlled-transport tests establish code behavior only. The current isolated demo has no model/key and intentionally blocks live inference. Supply approved model/API-project access, private credentials, verified token prices, budgets and organization policy in an authorized non-demo runtime, then verify real grounded responses, costs and failure behavior. [Exact setup](ootla-ai-response-setup.md). |
| P02 | Google Calendar | OAuth, encrypted tokens, selected calendars, owned-event mapping and durable synchronization exist. Configure the authorized Cloud project/client/redirect/key, staff grant and selected calendars; verify actual initial/delta sync, rescheduling/cancellation, revocation and duplicate protection. Local booking already works independently. [Calendar guide](ootla-google-calendar.md), [pilot UI](ootla-calendar-pilot.md). |
| P03 | Google Analytics | Read-only GA4 OAuth/Admin/Data reporting exists. Configure client credentials, grant/property access and any CRM property mapping; compare real reports and verify pagination, thresholds, revocation and failure states. This does not automatically install website tracking or upload CRM conversions. [Analytics guide](ootla-google-analytics.md). |

## Missing live provider implementations and their prerequisites

Adding a credential cannot supply the implementations below. Use the existing connector/communications/domain services and approved provider contracts; never invent vendor endpoints, payloads, permissions or successful outcomes. Full setup gates are in the [nine-service activation register](ootla-live-activation-checklist.md).

| ID | Follow-up | Existing foundation and required work |
| --- | --- | --- |
| P04 | Client Yardi transport and mappings | Connector interfaces, jobs, mappings, ownership rules and the functional synthetic provider already exist. Obtain the exact licensed interface/version, authorized documentation, authentication, property scope, sanitized samples, pagination/change contracts and permitted operations. Implement only supported transport/mappings, reconcile a limited-property pilot and verify initial/incremental/retry/conflict behavior. Resident and payment-status ingestion remain unsupported. Properties remain separate from units; accounting remains authoritative in Yardi. [Readiness](ootla-yardi-readiness.md), [pilot checklist](ootla-yardi-pilot-checklist.md). |
| P05 | Real email and SMS | Native conversations, outbox, consent, drafts, idempotency and in-app replies exist. Select/document the provider, implement authenticated sending/inbound processing, verified exact-request/thread mapping and delivery callbacks, then verify failures, deduplication, consent and actual statuses. Maintenance email currently preserves drafts; native resident-portal replies already work. No real tenant tests or Oodler emails without approval. [Maintenance correspondence](ootla-maintenance-conversations.md). |
| P06 | Live screening provider | Consent, durable coordination, synthetic results and explicit staff decisions exist. Obtain an approved vendor/interface, request/result/callback authentication, mapping and client-approved review/retention requirements; implement and verify that contract. AI must never approve or reject applicants. [Screening guide](ootla-screening.md). |
| P07 | Electronic signing provider | Lease evidence/manual attestation, synthetic milestones and move-in continuity exist. Select the provider, templates/documents/signers and authenticated signature-evidence/callback contract before implementing and verifying live signing. Manual attestations are not verified e-signatures. [Activation register](ootla-live-activation-checklist.md). |
| P08 | Existing-provider payment-status verification | Approved destination handoff and isolated applicant examples exist. Implement documented read-only status/callback authentication, identity/reference mappings, freshness and reconciliation for the approved provider/Yardi interface. Verify resident handoff configuration separately; its current preview external handoff is unavailable. Redirect returns never prove payment. Ootla must not authorize, capture, charge or refund funds. [Payment boundaries](ootla-payment-handoff.md). |
| P09 | Optional phone/speech integration | Hidden/default-off local transcript simulation is implemented. Real telephony, ASR/TTS, caller verification, numbers, authenticated callbacks and connected staff transfer need approved providers/contracts, consent/retention and explicit scope. No real audio/call/recording capability is claimed. Keep Voice hidden until requested. [Voice guide](ootla-voice.md). |

## Product extensions and optional engineering work

These are recorded decisions for later prompts, not broken completed stages or automatic commitments.

| ID | Item | Current boundary / prerequisite |
| --- | --- | --- |
| P10 | Full renewal acceptance/signing/completion lifecycle | Renewals currently shows real lease dates, approved information, correspondence/history and staff tasks. It has no resident acceptance, signed-renewal or completed-renewal lifecycle. Define supported states, staff/provider evidence and ownership before extending it. A completed follow-up task is not a completed renewal. [Renewals guide](ootla-renewals-pilot.md). |
| P11 | Automatic PDF/OCR extraction and indexing | Private validated documents and explicitly reviewed/approved source text exist. Automatic PDF parsing/OCR/binary indexing are absent. Any later implementation must preserve private-file access, source approval, retirement and exclusion of identity/screening material from general retrieval. [Operational controls](ootla-operational-controls.md). |
| P12 | External malware scanning | No external malware-scanning service is implemented/configured. Existing file validation/private storage remain. Select an appropriate service and define failure/quarantine behavior if this is requested. [Operational controls](ootla-operational-controls.md). |
| P13 | Comprehensive CRM/audit archival or deletion | Selective configurable content retention exists. Own Ask chat history removal is implemented separately ([History guide](ootla-ask-history.md)); it is not permanent erasure. Whole-person/core CRM/audit archival/deletion, downloaded exports and backup handling require approved client policies and relationship/audit-preservation rules; no retention period is invented. [Operational controls](ootla-operational-controls.md). |
| P14 | Automatic interrupted-Ask history repair | Running/expired retries are truthful and duplicate safe; expired accounting settles conservatively. Historical assistant answers are not automatically reconstructed after a crash. A deliberate new question is supported. Any future recovery must never automatically repeat paid inference or domain actions. [AI setup](ootla-ai-response-setup.md). |
| P15 | Bundle and hosted performance optimization | The existing large shared-client-chunk advisory remains (945.58KB in the current verified build). Consider code splitting and profile real hosted latency, large-file/history load and production concurrency when requested. Local scale checks are not a production service-level promise. [Historical benchmark limits](ootla-final-handover.md). |

## Deployment, release and client acceptance

| ID | Follow-up | Current boundary / prerequisite |
| --- | --- | --- |
| P16 | Actual hosted customer/demo deployment | Apache/systemd/build/environment guidance is prepared. `ootla.ai` is the supplied customer domain; target SSH access and a separate public preview hostname/deployment have not been verified in this work. Authorize the exact target and release before deploying or changing DNS/TLS. Preserve isolated databases/roles/secrets/cookies and no demo access on customer pages. [Apache guide](ootla-apache-demo.md), [instance guide](ootla-instances.md). |
| P17 | Target security, recovery and rollback acceptance | Verify actual VPS TLS/reverse proxy, database TLS/ACLs, Linux process supervision/signals, key custody, backups/restore/rollback, resource limits and monitoring on the authorized target. Local isolated recovery tests already exist; repeat only the target-specific acceptance that is needed. [Activation prerequisites](ootla-live-activation-checklist.md). |
| P18 | Customer administrator activation and operational sign-off | Operator-controlled organization/admin provisioning is implemented. Local Oodler provisioning is preserved. The2026-10-31 read-only audit verifies0active administrators,1inactive administrator and1expired invitation; existing operator-controlled reissue/acceptance is required. No password was reset or email sent. Hosted access remains unverified. If necessary, deliberately reissue an expired invitation using the existing operation; never reset/reseed or assume a missing provisioning feature. Agree client operational owners, policies and pilot acceptance. [Instance guide](ootla-instances.md). |
| P19 | Approved demo-to-live feature parity and release | Shared local feature/migration parity and the local live-branch commit are complete on2026-10-31. Demo feature baseline3452d66 was already pushed. Private settings/data remain separate; customer runtime has no demo access/sample records. Remote publication of the live branch, hosted release and production acceptance remain pending. See [holistic review](ootla-holistic-review.md), [competitive audit](ootla-competitive-audit.md), [instance guide](ootla-instances.md) and [progress](ootla-progress.md). |

## Deliberately deferred or excluded

- Voice remains hidden/default-off. Recording is unsupported; do not enable it from a later generic cleanup prompt.
- The extra secondary Reports administration component remains conditionally disabled, not CSS-hidden. Primary compact filters/reporting continue to work. Re-enable only if requested.
- XLSX import was optional and intentionally omitted; CSV import already works. Add XLSX only if a later prompt establishes the need.
- SQLite was optional, not a required rewrite. Preserve the working PostgreSQL-backed demo, authentication, permissions and durable concurrency.
- No EliseAI commercial API is planned or invented. Ootla owns its AI orchestration.
- Payment execution and AI applicant decisions remain outside product scope, not backlog features.

## Carry-forward rules

1. Inspect this register, the latest progress entries and actual implementation before each prompt. Older handovers are historical; their account counts, migration counts, layout descriptions and pending lists may have been superseded.
2. Keep implementation, configuration, external verification and user acceptance distinct. Close a gate only with its corresponding evidence; mark changed decisions with a date and prompt reference.
3. Preserve the approved simpler UI, native features, real numeric counts, data, authentication and organization/property isolation. Do not restore removed clutter to implement a later item.
4. Do not send email to Oodler/live users until the user explicitly approves. No provider activation, real tenant outreach, automatic seed/reset, paid CI or production replacement follows from recording this list.
5. Complete only the next explicitly authorized prompt and stop for review. No backlog work is started automatically.

## P20 - Interrupted Ask scroll acceptance - 2026-10-30

The earlier independent Ask scroll refinement has passing partial groups, but its lost-ack task confirmation and remaining long-response/mobile acceptance were interrupted. Preserve those changes and receipts; finish the targeted acceptance in a later prompt. The current task-follow-up checks do not establish completion of that separate Ask feature.

Task email drafting now reuses configured model synthesis where eligible, and isolated preview email uses the shared outbox. P01 actual inference acceptance and P05 real outbound email remain open; no external provider was activated.

Viewing notifications now reuse saved viewing receipts/shared outbox and keep unavailable-transport drafts. The isolated preview path was verified; P05 real email delivery remains unimplemented and unconfigured. No automatic later delivery is enabled.

The 2026-10-30 lead task follow-up refinement verified record-based contextual drafts, saved-draft reopening, actual checklist/viewing context and confirmed native actions. P01 actual external model verification and P05 real email transport remain open. No provider credentials or live-mode changes were made.

## 2026-10-31 holistic review update

See [the full review and local live parity report](ootla-holistic-review.md). Native CRM/services remain implemented; do not rebuild them as provider gates. Both local databases now have35 matching migrations, with zero original business-record mutations or private-file changes. Live has no demo users/organizations/seed records; only its existing customer organization and inactive first admin remain. The hosted domain is unchanged.

**P20 resolved:** all9 targeted floating assistant groups are verified across the initial6and final3 checks. Lost-ack task confirmation, long-response scrolling and mobile keyboard bounds passed. An intentional hard reload is followed by opening the launcher in the check, rather than assuming it opens itself. Real provider inference remains P01.

**P21 - Historical verification runner modernization (deferred):** several older stage-specific scripts encode outdated migration counts/UI/response assumptions (for example the startup check's fixed26-migration baseline). Maintain a clearly selected current acceptance entry point and update old checks when their scope is next changed. The current customer, production-AI, native-channel, instance and assistant checks listed in the review passed; this item does not imply a failed current product security check or authorize a testing/framework rewrite.

No provider activation, live tenant communication, future feature implementation, commit/push or production deployment follows automatically from this audit. The Oodler no-email hold remains in force.

## Demo-to-live follow-through and competitor audit - 2026-10-31

The user reaffirmed replication of all approved demo features to ootla-v1-branch and requested comparison against EliseAI and DashQ. See [the sourced competitive audit](ootla-competitive-audit.md). Before this update, all719 shared tracked files matched; only the live safe .env.example and instance marker intentionally differed. Demo commit3452d66 was already published. This follow-through records the replicated source on the local live branch; hosted deployment and any later remote release remain separate. Preserve original data, private settings and the Oodler no-email hold.

P19's local source/migration replication is complete. Current checks confirm35 matching migrations,69 original live rows preserved exactly, zero customer demo accounts/seed rows and continued database-role separation. The existing live administrator remains inactive with an expired invitation (P18); no reset/reissue/email is performed. P01/P02/P03 remain activation/external-verification gates. P04-P09 include genuinely missing live transports, not settings that can be fixed by supplying keys alone.

The additional items below are optional competitive gaps for future explicit prompts. They do not authorize feature implementation, restore retired UI/Households, or expand payment/AI-decision authority.

| ID | Additional gap | Boundary and dependencies |
| --- | --- | --- |
| P22 | Validated bilingual/localized experience | No full staff/portal localization or accepted bilingual channel flow; obtain pilot language requirements and translate/test UI, dates, templates and policies. |
| P23 | Public customer inventory/ILS connections | Brand site/native inquiry and booking exist. Per-client inventory storefronts and licensed listing-service booking/synchronization are absent; separate scope with authoritative data and channel contracts. |
| P24 | Secure self-guided touring | Native viewing scheduling exists; smart-lock/lockbox access, tour identity checks and guided building maps do not. Requires approved hardware/provider and operating/access policies. |
| P25 | Field/mobile operations beyond responsive web | Optional technician/mobile application, time/location tracking, vendor lifecycle, inspections and unit-turn boards are absent. Preserve working responsive queues; establish a concrete need before a new app. |
| P26 | Entry notices, community notices and amenities | Prospect viewing emails are not occupied-unit resident notices. No general notice-of-entry, building announcement or amenity booking workflow exists. Define authorized occupancy, jurisdiction-specific staff-approved timing/templates, resources and real delivery first. |
| P27 | Lease-to-ledger audits and centralized fee disclosures | No automatic signed-term extraction, charge reconciliation or complete fee/quote catalogue; needs P04/P11 and permitted authoritative reads. Keep accounting in Yardi. |
| P28 | Expanded operations/attribution intelligence | Current cohort reports remain valid. Verified channel metrics, ad-spend attribution, AI outcome/handoff measures and predictive exposure are additional work, dependent on authentic provider outcomes. |
| P29 | Independent enterprise assurance evidence | No equivalent external audit/certification package was provided. P17 target acceptance and an agreed assurance program remain separate from existing working technical controls. Do not invent certification. |
| P30 | Supported external developer API | Existing protected internal APIs are not a customer-facing versioned developer program with scoped credentials/contracts. Optional separately authorized integration product. |
| P31 | Specialized regulated-housing workflows | No program-specific voucher/recertification engine; decide client/program scope and approved staff/provider process before extending general applications. AI decisions remain excluded. |
| P32 | Authoritative delinquency-support workflow | Payment handoff exists; verified rent ledgers, arrears queues and approved plan/reminder processes do not. Depends on P04/P05/P08 and client policy; no payment execution or independent accounting authority. |

Competitor payment capture/refunds/autopay, AI applicant approval, bulk-marketing audiences and outsourced staffing are documented differences, not automatically accepted Ootla backlog features. See the audit for current official sources and recommendation order.
