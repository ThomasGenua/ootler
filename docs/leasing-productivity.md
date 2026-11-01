# Leasing productivity

These workspaces extend the Bento dashboard and use the existing organization, property-interest, staff-role and session checks. Apply migrations **024** and **025** before releasing this version.

## Staff workflows

- **Post-tour follow-up:** open a completed tour or no-show in Calendar, then choose **Prepare post-tour follow-up**. Record interest, next step and notes; review the task and email text before saving. Each viewing has one follow-up task and one draft, protected against retries. Rebooking opens Calendar with the lead and property selected. Recording feedback does not move an application or verify a lease.
- **Ask Ootla:** select a lead and ask to book a tour, reschedule a tour, or change its owner. Choose an eligible owner and an offered time, save the preview, then approve. Approval rechecks access, versions, availability and conflicts. Repeating a successful approval returns the saved record. No assistant action sends email or SMS.
- **Dashboard:** choose a property and **My work** or **Team**, then use **Customize dashboard** to hide or reorder tiles. **Save dashboard view** persists the layout and filters for this user and organization. Summary totals, pipeline, tasks, tours and activity use the selected scope. Tour ownership refers to the assigned viewing staff; applications and signatures use the lead owner.
- **Conversion insights:** compare equal lead-creation windows, see observed outcomes, completed stage durations and current-stage ages, and open no-shows, stalled leads and recently lost leads. Older cohorts have had more time to convert. Missing historical transition data stays unknown. The no-show denominator is completed plus no-show tours in the selected period.
- **Team workload:** compare active leads, open/overdue tasks and tours in the next seven days. Select leads, choose staff, preview the reassignment and confirm. Every selected lead version and the target staff member’s full property access are checked again.

Find the new workspaces under **More workspaces**. Dashboard shortcuts also open workload and conversion reports.

## Private unit shortlists

Create a shortlist for an active leasing prospect using up to eight units in their recorded property interests. Units must be reported available, verified within seven days, and clear of unfinished turnover or inspection repairs when shared. The interface returns a private link for staff to share; it does not send it.

Links expire after 1–30 days and can be revoked. Only a digest is stored in the shortlist table. The token is carried in the URL fragment, removed from the address bar, and sent in an authorization header. Responses contain the selected unit information, without the lead’s personal or application information. Access is rechecked against the issuer’s current membership and property assignments. Changed availability is shown honestly; unavailable units cannot receive a new viewing request.

Prospects can submit preferences and suitable viewing times. A viewing request creates a staff task, with idempotent response handling. It does not reserve inventory or book a calendar slot.

## Property setup templates

Organization administrators can snapshot a source property’s calendar settings, response business hours and targets, selected message templates, and inspection checklists. The snapshot is immutable. Applying it requires a fresh target preview and explicit confirmation. Changed target settings invalidate that preview.

The target’s existing timezone, meeting location, public-booking setting and escalation manager are retained. A new calendar keeps public booking disabled. Staff-specific availability and access assignments are not copied. Finish or reschedule future managed viewings before applying calendar changes. Copied message templates and checklists are named for the target property and remain editable through their existing workspaces.

## Follow-up sequences

Administrators can define up to eight steps, each waiting 1–720 hours after enrollment or the previous generated step. Preview the timing and draft text, then enroll selected active leads at the sequence property. Enrollment is explicit; saving a sequence does not activate it.

Each due step creates a task and optionally an **unsent** Resend/Twilio-compatible draft. Delivery still requires the existing Messages review, consent and send action. A prospect reply, stage change, closure, channel opt-out or unavailable administrator stops the sequence. Untouched generated tasks and drafts are cancelled; staff-edited work is preserved. Paused enrollments still receive stop checks. Resuming an overdue enrollment makes its next step eligible on the next worker run.

Run the bounded worker regularly, for example every minute:

```sh
npm run sequences:process
```

It uses row locks and persistent step receipts so concurrent workers and retries cannot duplicate work. **Process due steps** in the workspace runs one batch manually. No scheduled service is provisioned by this code change.

## Documents and malware checks

Private uploads now accept PDF, PNG, JPEG and UTF-8 text up to **20 MiB**. Existing content-type/signature validation remains in place. This covers lead and application documents, resident requests and published documents, vendor files, maintenance photos and inspection photos. Files remain in private PostgreSQL bytea storage; this release does not introduce an external storage account.

Configure a trusted private ClamAV daemon before enabling live uploads and previews:

```dotenv
CLAMAV_HOST=your-private-clamd-host
CLAMAV_PORT=3310
```

The adapter implements [ClamAV’s INSTREAM protocol](https://docs.clamav.net/manual/Usage/ClamdProtocol.html), with bounded chunks, a 15-second deadline and four concurrent scans per process. Configure clamd’s `StreamMaxLength` and scanning limits to accommodate the upload limit, keep signatures updated, and restrict its unauthenticated TCP port to the application’s private network.

Rejected files are not saved. A missing, busy or unavailable scanner fails closed. Scan attestations are tied to the exact file bytes and transaction. Resident publication rescans the exact version being shared. Preview routes reuse the owning service’s authorization, scan the file, and return inline content with no-store and sandbox headers. Preview links open a separate browser tab.

Old files retain `legacy_unscanned` provenance. They are not relabeled as clean. Only a verified, non-production isolated demo can use the deterministic test adapter without ClamAV; the UI labels these **Demo check only**. That adapter is not antivirus and cannot run against a live organization.

## Verification

`npm run check:productivity` uses disposable local fixtures and checks the nine feature areas, including private-link revocation, scoped metrics, stale approvals, concurrent sequence processing, draft cancellation, large uploads, scanner failures, authenticated previews and responsive browser journeys. It does not send external messages. The existing release, calendar, operations and Bento checks remain part of CI.
