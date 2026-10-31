# Live and demo review instances

The user authorized this split on 2026-10-28. Both branches contain the same application features and authentication. Differences are the checked-in instance defaults and private runtime/database configuration. Branch names do not enforce security: the backend's DEMO_MODE, actual database-isolation checks, organization permissions and sessions do.

| Instance | Branch | Checkout | Local website | API | Database / role |
| --- | --- | --- | --- | --- | --- |
| Live app configuration | ootla-v1-branch | C:/Users/user/Documents/software/Ootla | http://localhost:7674 | http://127.0.0.1:3101 | ootla_live / ootla_live |
| ootlademo | ootla-v1-demo | C:/Users/user/Documents/software/ootlademo | http://127.0.0.1:7673 | http://127.0.0.1:3100 | retained ootla_demo / ootla |

These are local review instances. https://ootla.ai is the intended public customer domain; this change does not publish or modify that server. No public preview hostname was invented.

## What visitors see

The live site has Sign in links to /admin/login and no Explore demo or credential-fill controls. A legacy /try request stays on the same live instance and redirects to its normal sign-in. Demo credentials and demo sessions are rejected by the live backend.

The demo site has Explore demo links to /try, which opens its own /admin/login. Fill demo credentials fills the email and masked password only. The normal Sign in action creates a real database session. Existing demo properties, units, leads, applications, applicant/resident accounts and history are preserved; no startup reset or reseed occurs. Product examples remain labeled examples.

## Start the pair

Use two PowerShell terminals. In the original Ootla checkout:

~~~powershell
cd C:\Users\user\Documents\software\Ootla
npm run db:local
npm run dev
~~~

Then in the demo checkout:

~~~powershell
cd C:\Users\user\Documents\software\ootlademo
npm run dev
~~~

Open http://localhost:7674/ for live-style pages and http://127.0.0.1:7673/ for the review demo. The same commands work after a restart. If a port is already occupied, use the running instance or stop its own development terminal; the app does not choose an unrelated port silently. Ctrl+C stops that terminal's API/frontend. Stop both app instances before npm run db:local:stop.

## Configuration and data preservation

Tracked ootla.instance.json selects .env.live for the live branch and .env for the demo branch. An explicit OOTLA_ENV_FILE still takes precedence. Missing selected private files fail without falling back to another instance. Production uses explicit/preloaded configuration, never an implicit development file.

The original checkout's .env is preserved byte-for-byte as the retained demo/cluster configuration. The live application selects its new ignored .env.live. The demo worktree has its own ignored copy of the original .env. Secrets, runtime evidence, databases and node_modules are never committed. Safe examples are in deploy/local/. npm run env:setup creates only a missing selected file and does not overwrite either account/data environment.

The PostgreSQL cluster remains solely in the original checkout's .local/postgres directory on loopback port55439. db:local resolves Git's common main checkout even when called from the demo worktree, avoiding a second accidental cluster. The live role/database are new and restricted; the preview role cannot connect to the customer database. The new role has no access to preview tables. Each API's seven existing workers use only its selected database. There is no extra worker service, automatic migration, seed, reset, real email/SMS or paid provider action.

The new customer database has no demo users or sample CRM data. At the user's request it contains the standalone organization Oodler and a pending first administrator, thomasgenua@oodler.ca. The supplied email is also used as the initial display name; it can be edited in Profile. Organization timezone initially uses UTC and can be changed in organization settings. The administrator chooses a password using the private local invitation, then signs in normally. The reviewed extension permits this only in production customer runtimes or a development customer runtime with loopback HTTP origin, bind and database; demo, remote development and mixed databases remain refused.

The private invitation result is C:/Users/user/AppData/Local/Ootla/Invitations/oodler-administrator-invitation.json, outside both checkouts. It expires after48hours. No email was sent. The user explicitly prohibited any email to Oodler/live users until approval; preserve that hold in future changes. No outbound provider was activated. If the invitation expires, use the existing explicit reissue operation with a fresh request UUID; do not reset passwords or reseed.

## Build and subsequent corrections

From either checkout, npm run build performs the established client/server type checks and builds that checkout. Both builds default to safe Sign in HTML; server-verified demo isolation changes marked public access regions for the demo response. Development SSR and browser navigation use the same verified public access endpoint. Public caches never decide demo authorization.

Keep shared feature corrections on both branches. Preserve each branch's ootla.instance.json and .env.example when carrying fixes across; never copy private env files, databases or cookies between a live runtime and a demo runtime. The root main branch is the earlier checkpoint and is not changed by this split unless the user requests it.

## Focused review

1. Open every public page on live: the access CTA says Sign in and goes to /admin/login. Its staff, applicant and resident sign-in pages expose no demo fill controls.
2. Open the demo homepage, choose Explore demo, then Fill demo credentials. The password remains masked and no sign-in happens until you press Sign in.
3. Refresh /admin after demo login and open Properties, Leads, Applications, Calendar and Tasks. Existing records and normal permissions remain available.
4. Sign out. The live instance continues to reject demo credentials/cookies. Neither instance can read the other's records through its database role.
5. Repeat on a narrow mobile viewport and using keyboard navigation. No dashboard layout or approved branding was replaced.

## Verification result - 2026-10-28

The required production build/client+server types passed with the existing large-client-chunk advisory. Seven isolated instance-selection checks, two existing environment-setup checks, six focused public renderer/SSR checks, six isolated local first-administrator checks and16 compiled public HTTP responses across both verified databases passed. The same compiled build produced the correct live/demo presentation, with no private runtime keys/passwords in the15 public text/bundle files scanned. Database-role checks deny demo access to the customer database and customer access to demo records. Preservation confirms299 original rows across140business tables, all28migration checksums, eight original environment values plus exact bytes, and44 approved source assets unchanged. All seven actual two-instance browser/auth groups passed, including normal demo login/refresh/logout and live rejection of demo cookies/passwords. Eight desktop/mobile screenshots were reviewed. Zero outside browser requests, browser exceptions or emails occurred.

## Populated demo follow-up - 2026-10-28

The user separately authorized representative demo preloading and pushing both matching branches. Use the [showcase guide](ootla-demo-showcase.md) for records, accounts and deliberate action walkthroughs. The retained main workspace now has seven properties and fourteen distinct units, fifteen leads, five applications, twelve tasks and two lease-workflow examples, including synthetic connector records; counts can change through normal review actions. The standalone workspace has four reconciled real CSV batches creating two properties, two units, two contacts and two leads, with one intentional invalid contact row for error review.

From the demo checkout only, `npm run demo:prepare` adds missing examples once and preserves staff edits on repeats. Keep the existing PostgreSQL database: native sessions, migrations, SQL services and durable job/concurrent booking controls use it. SQLite was considered optional; no second incompatible database implementation was introduced. A Git push publishes source and the deliberate preparation command, not `.env`, databases, private invitation links or backups. New servers must select the isolated demo environment, install/migrate and run preparation explicitly. Live retains Sign in only, no demo accounts/data, and no approved live communications.

## Separate local project folders - 2026-10-28

The demo project is now named ootlademo and its preserved linked worktree lives in C:/Users/user/Documents/software/ootlademo on ootla-v1-demo. The live product remains C:/Users/user/Documents/software/Ootla on ootla-v1-branch. These share one Git repository/origin while keeping separate working folders, private environments, databases and session scopes. The old Ootla-demo path was moved with git worktree move, not recreated or reseeded. Only the demo process restarted; live and the shared PostgreSQL cluster stayed running. No feature implementation, database migration or external communication is part of this folder organization.

Optional editor workspace files beside the folders are C:/Users/user/Documents/software/ootlademo.code-workspace and C:/Users/user/Documents/software/Ootla-live.code-workspace. Open the corresponding workspace when making corrections so the target folder/branch is clear. The workspaces are local editor files and contain no credentials.

## Shared feature parity review - 2026-10-31

The approved accumulated shared refinements now exist in both local worktrees. Customer migrations029-035 were applied after a verified backup; both databases have35. Source/assets/contracts/migrations match, while instance markers, private files, safe live/demo defaults and data intentionally remain separate. Live has0demo users/seed records and0sample CRM rows. Demo preparation/reset was not run. The original69customer rows are preserved; the current first admin is inactive and its invitation has expired. No email or account reset occurred. Use the existing deliberate private reissue/acceptance operation before normal customer sign-in.

The customer website remains http://localhost:7674 and demo http://127.0.0.1:7673 . Live has Sign in only and denies demo credentials/cookies. Actual hosting at ootla.ai is unchanged; no source commit/push or deployment was performed. See [holistic review](ootla-holistic-review.md) and [pending work](ootla-pending-work.md) for current evidence/provider limits. Do not treat earlier migration/count/status entries as current or enable live providers merely to hide setup states.

## Live branch replication follow-through - 2026-10-31

Demo feature commit3452d66 is published on ootla-v1-demo. The same approved shared features and migrations are now recorded on the local ootla-v1-branch; runtime environment examples/markers intentionally differ. The two databases, roles, cookies and private files remain separate. Publication of any later live release and hosted deployment are distinct from this local branch commit. No production/DNS/provider/email change occurred. See the latest progress entry and competitive audit; keep P18 administrator activation and provider gates explicit.
