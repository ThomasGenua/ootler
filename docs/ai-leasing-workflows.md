# AI leasing workflows

This release builds on connected workflows (migration 026 / PR #10) and adds migration **027_ai_leasing_workflows.sql**. It does not activate the production provider or deploy to ootla.ai.

## Knowledge imports and publication

Open **More workspaces → Knowledge imports** and select a property. Organization administrators can import a PDF, PNG/JPEG, UTF-8 text file (up to 6 MiB), pasted text (40,000 characters), or one approved HTTPS website page. Configure exact website origins first. Website imports pin a validated public IPv4 address, reject private/reserved addresses, validate every redirect, accept only HTML/text, and bound duration and response size. JavaScript pages, authenticated sources and recursive crawling are not supported; paste approved text when necessary.

Files pass the existing private scanner before processing. Imports retain the original source privately and show proposed facts with quotations and page references. Model-supplied PDF/image quotations and page references require human verification against the original; they are not independently certified OCR results. The administrator selects and edits facts, then saves drafts. Publication is a separate reviewed action. Explicitly approve each reference for prospect answers and optionally set an expiry. Existing references default to staff-only. Editing reference text clears prospect approval and requires a new publication review. History retains each version, publication scope, expiry and editor. Expired references are excluded from both the existing staff assistant and the new concierge. Questions that need staff confirmation appear in the knowledge gap queue.

## Leasing concierge and inbox suggestions

The property setting enables the concierge on existing `/inquire?form=…` pages, including the existing allowed-origin embed. Both organization AI configuration and an active publishing administrator are required for live responses. No new public form is published by this release.

Visitors can ask questions, inspect supporting references, compare up to eight recently verified available units, and request a tour or staff help through the inquiry form. The concierge uses only published prospect-approved references and fresh inventory clear of incomplete turnover/inspection repairs. It does not expose private staff references or existing customer identities. Unit prices are reported monthly rent, not a complete fee quote; availability is not a reservation. A tour request becomes an inquiry for staff, not a confirmed appointment.

Chat capabilities stay in page memory, expire after 24 hours and allow up to twelve exchanges. Retries reuse the response only while cited sources remain current; changed sources are removed from retry responses. The context and current publishing authority are checked again after generation. Unsupported answers fall back to staff confirmation; invalid source identifiers reject the output. This verifies the references used, not the semantic truth of every model sentence.

Choosing **Ask the leasing team** prepares the normal contact form. Nothing is submitted until the visitor reviews contact/channel permission and chooses **Send inquiry**. The latest six exchanges (bounded to 3,500 characters) accompany the new inquiry. A fresh unverified contact is created using existing intake rules; email matching never adopts an existing identity. Email/SMS delivery remains under the existing reviewed messaging workflow.

In a staff conversation, **Prepare an AI reply** uses the latest five inbound messages and current prospect-approved references after explicit review of the processing notice. Staff can inspect sources and copy the suggestion into the existing reply editor, then edit/save/send through the normal separate actions. Private team notes, screening data and attachments are excluded.

## Application document assistance

On an editable applicant application, open **Use AI to help fill my details** beneath an uploaded document. Each request requires agreement to process that specific document with the configured provider. Only the signed-in participant's own active checklist document is eligible. Files are rescanned and limited to 6 MiB for AI processing.

The assistant suggests only name, phone, current address and preferred move-in date, with supporting passages/pages and warnings about uncertainty. It does not extract financial or screening fields, establish authenticity, score applicants or decide applications. Applicants choose individual suggestions and confirm comparison with the original. **Copy selected suggestions** fills their browser form; **Save details** is still required. Current participant version, file hash, grant, session and application editability are rechecked. Replaced files, changed details, submitted/provider-owned applications and revoked grants stop the action. Staff preview has no extraction controls.

## Daily briefing

Ask Ootla displays a compact current-work snapshot when opened, with links to real records. This initial read uses no model. **Daily briefing** supports My work/Team and property filters, shows up to thirty attention items and ten tours in the next two days, and offers an explicitly requested AI explanation. The model receives work types, due dates, urgency and action labels; names, message bodies and documents are excluded. Recommendations reference server-provided records and do not execute changes. Records are checked again before returning the generated briefing. This is a current operational snapshot, not a causal prediction or applicant ranking.

## Configuration, usage and evaluation

Reuse `AI_ENABLED`, `OPENAI_API_KEY`, the explicit `OPENAI_MODEL`, and the organization switch in **AI workspace**. Select a model supporting structured outputs and the document/image input types you enable. No model was silently selected or upgraded. Use the scanner configuration from the connected workflow release. Requests use the [Responses structured-output contract](https://developers.openai.com/api/docs/guides/structured-outputs) and [file inputs](https://developers.openai.com/api/docs/guides/file-inputs), `store:false`, no tools, a 45-second timeout, a 4,000-output-token limit and a bounded response reader. `store:false` is not a zero-retention guarantee; provider/account data controls still apply.

Persistent limits are 200 requests per organization per rolling day, 20 per identified user per rolling hour and 60 shared public requests per organization per rolling hour. Chat starts also have a hashed-IP limit. Retries are idempotent; failed/pending requests require a new key. **AI usage & feedback** reports model/demo separation, completed/failed/pending counts, provider token usage, latency and feedback for the last thirty days. Token totals do not estimate dollar cost without model/account pricing. Inputs are not written into general request logs. Private source files, extraction results, knowledge versions and usage records remain in the application database under existing backup/access controls; this release does not add automatic retention deletion or promise a data-retention period.

Verified isolated demos use explicitly labeled deterministic text fixtures, never a live model. Demo PDF/image imports report that extraction requires a configured provider.

`npm run check:ai-workflows` runs mocked live API contracts and isolated database/browser tests for import review, publication, expiry, source changes, private-source exclusion, handoff, document ownership, explicit save, revoked access, usage limits, and 1024/768/390-pixel layouts. It sends no live messages or model requests. It joins the existing regression suites in CI. Run `npm run build` before `check:operations-browser`; that regression suite serves the compiled production client against its isolated API/database, avoiding development-module reloads during long browser journeys.

`npm run ai:evaluate` lists the synthetic quality checks without sending requests. Setting `OOTLA_AI_EVAL_LIVE=true` runs five synthetic provider calls using the configured model and saves a local report under `.local/ai-evaluation/latest.json`. It checks known facts, unknown fees, missing sources and instruction injection. Review all outputs and representative property PDFs/images before live activation; automated string checks are regression signals, not an accuracy certification. Live model quality and account-specific file support were not verified during implementation.

For rollout, back up the intended database, apply all migrations through 027, build/deploy the reviewed branch, run `release:check`, then verify authentication, private uploads, source publication and a synthetic concierge/application journey. Ootla's own-server access and application directory are still needed for live deployment.
