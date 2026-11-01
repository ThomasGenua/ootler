# Ootla UI overhaul — demo

## Current authority and checkout

Updated 2026-11-01. The user explicitly moved redesign implementation to C:/Users/user/Documents/software/ootlademo on ootla-v1-demo. The separate Ootla/ootla-v1-branch checkout is not modified by this stage. Preserve the existing Vite/vanilla TypeScript, Express and PostgreSQL architecture, records, sessions, permissions and workflows.

Six approved Downloads references establish warm ivory, terracotta and espresso: landing (551ecb9f), Ask compact/labeled variants (3a66c9e1 / 2da11725), Maintenance detail (8e63c48c), Lead detail (23ec0ef2) and bento Overview (1b9acd20). The full inventory from the preceding inspection was written in the separate Ootla checkout. That inventory is not proof that newer live-only modules exist in this older demo; inspect this checkout before each next stage.

New visuals supersede historical green/full-width-header visual requirements, not product/security rules. No reset/reseed, destructive migration, demo credential change, production deployment, paid operation or live communication. Do only the explicitly requested stage and stop.

## Shared design system — implementation

The shared foundation is client/design-system.css, imported after existing module styles in client/main.ts. Semantic tokens, component styling and one compatibility bridge apply centrally; existing domain CSS retains its layouts and controllers. There is no new framework/dependency, route rewrite or backend change.

Starting palette: canvas #FBF4E9; accent #C85135; espresso #29221D; surface #FFFFFF; clay #F6E4D7. Primary white-label controls and links use deeper #B6432A, hover #A63923. Text/muted/borders/fields/focus/error/warning/success/disabled/overlay tokens, spacing, typography, radii, shadows and motion are defined centrally. Existing green/charcoal variable names are compatibility aliases, not changes to business-status semantics.

The existing licensed self-hosted InterVariable.woff2 remains the font (public/fonts/Inter-LICENSE.txt). Marketing headings use500; interface labels500; work headings600; body400. Controls are compact, cards normally18px, dialogs22px. Mobile touch controls are44px where appropriate. No decorative gradients are added.

The logo retains the supplied transparent artwork's roof/O/letter geometry. Palette masks give it a terracotta roof and espresso or white ink, with the existing intermittent animation and reduced-motion behavior. Original PNG sources and demo credential helpers are preserved. Clean vector branding/exact reference photographs remain separate later asset work.

client/lib/design-system.ts provides escaped labels and reusable button/icon, field/search/select/filter/menu, card/summary, tabs/badges, table, native dialog/drawer/confirmation, toast/skeleton/state, avatar/attachment helpers. Explicit content HTML parameters accept trusted component composition only; escape record content. Keyboard tabs/menus/dialog bindings reuse AbortSignal and existing containDialogFocus; existing business controllers are not rebound.

Existing tablePagination and its controller remain canonical. Central styling applies white table frames, bounded menus and compact pagination; no query/status/record behavior changes.

## Representative components

Open http://127.0.0.1:7673/design-system.html while the existing Vite demo runs. The workbench is a separate development-only HTML entry, noindex/nofollow, excluded from production build output/routes. Its explicit sample content and local interactions have no CRM or outbound effects.

Try Tab focus, filter/menu Escape, arrow/Home/End tabs, dialog/drawer/confirmation focus trapping and return, toast/empty/error/loading, numeric summaries, attachment preview, table pagination and mobile layouts. The existing public/admin pages receive shared appearance centrally; this stage does not implement the later rail, bento or page-specific compositions.

## Verification

Run npm run check:design-system for focused Playwright checks and contrast measurements. It blocks external browser requests and business API writes; only its own normal demo sign-in/logout are allowed. Observations/screenshots are ignored under .local/design-system-check. Use the existing normal demo helper; credentials are unchanged.

Required build: npm run build (client/server TypeScript, Vite, compiled server). No installation, migration, seed/reset or restart is needed for these UI changes. Existing non-failing bundle-size/plugin-timing advisories remain. Comprehensive regression is reserved for final redesign acceptance.

The first workbench request exposed the existing Vite SEO route guard's unknown-HTML404. Added a narrow development-only exception and bypassed public-document transformation for this workbench; production allowlists and public SEO behavior are preserved. No extra server or runtime environment change.

Final focused outcomes and any corrected failures are recorded in ootla-progress.md.

## Progress

- [x] Inspect actual demo checkout, instructions, styling, helpers and runtime.
- [x] Shared semantic tokens, type, spacing, surfaces and compatibility bridge.
- [x] Reusable render/keyboard/dialog components.
- [x] Development workbench and focused check command.
- [x] Initial client/server type and build checks.
- [x] Final browser/contrast/mobile acceptance and compiled-client refresh after corrections.
- [ ] Shared navigation/shell redesign (future explicit stage).
- [ ] Bento Overview, Lead, Ask and Maintenance page compositions (future stages).
- [ ] Remaining public/CRM/admin/auth/portal layouts (future stages).
- [ ] Final comprehensive regression.

STOP after the shared-system stage; await the next prompt.


### Final shared-system acceptance — 2026-11-01

All 12 focused check groups pass: semantic contrast/font/logo; buttons/fields/focus/search; filters/menus; keyboard tabs; dialogs/drawer/confirmation and focus return; feedback/avatars/attachments; shared pagination/no page jump; 320/390px/reduced motion; normal demo login and read-only Tasks/Properties/Leads/Maintenance desktop/mobile; 20 public contrast samples across homepage/platform/integrations; workbench build exclusion; zero business writes/external traffic/browser exceptions.

Measured contrast: white/action 5.49:1; espresso/canvas 14.33:1; muted/canvas 5.58:1; action/canvas 5.02:1; control boundary/white 3.43:1; focus/white 7.12:1; error 6.41:1; warning 6.19:1; success 6.64:1. These verify tested semantic pairs, not every legacy text fragment across all routes.

Corrected initial headline specificity, light Explore link/dark paragraph contrast, semantic destructive variants, actual summary-metric surfaces and record-link aliases. Inverse focus applies to dark controls rather than white popovers inside headers. Explicit existing pagination Apply behavior is preserved. Theme host is on initial HTML to avoid the old palette before JavaScript. Existing exact artwork/animation is retained; separate future page composition is not started.

npm run build passed client/server type checks, Vite and server compilation. After final CSS selector/HTML-only corrections, the Vite client was rebuilt successfully. Existing large-chunk advisory remains; no dependency/environment/database/migration change. Comprehensive regression deferred as requested. Final evidence: .local/design-system-check/observations.json and screenshots. STOP.
