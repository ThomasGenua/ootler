import 'dotenv/config';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { promisify } from 'node:util';
import { Client } from 'pg';
import { createApp } from '../server/app.js';
import { loadConfig, type ServerConfig } from '../server/config/env.js';
import { Database } from '../server/db/pool.js';
import { hashPassword } from '../server/services/passwords.js';
import type { LeadRecord, LeadDetail, LeadDirectory } from '../shared/lead-contracts.js';
import type { LeadWorkspace, WorkspaceDocument, WorkspaceTask, TimelineEvent, PropertySuggestions } from '../shared/lead-workspace-contracts.js';
import type { ApplicationRecord, ContactDetail, ContactRecord, LeaseRecord, Paginated } from '../shared/property-contracts.js';
// All test writes target one uniquely-created, owned scratch database. This check
// never migrates, seeds, resets, or changes the retained review database.
const root = path.resolve(import.meta.dirname, '..');
const source = loadConfig();
const sourceUrl = new URL(source.databaseUrl);
assert(source.demoMode && !source.production && /^ootla_demo(?:_[a-z0-9_]+)?$/.test(source.databaseName ?? ''), 'Stage 08 checks require the documented non-production isolated Ootla demo configuration.');
assert(sourceUrl.hostname === '127.0.0.1' && sourceUrl.port === '55439' && sourceUrl.username === 'ootla' && !sourceUrl.search && !sourceUrl.hash, 'Use the project-owned local PostgreSQL cluster and established restricted application role.');
const scratchName = `ootla_demo_stage08_${randomUUID().replaceAll('-', '')}`;
const scratchUrl = new URL(sourceUrl);
scratchUrl.pathname = `/${scratchName}`;
const config: ServerConfig = { ...source, nodeEnv: 'test', production: false, appUrl: 'http://ootla.test', databaseUrl: scratchUrl.toString(), databaseName: scratchName };
const ownerUrl = new URL(sourceUrl);
ownerUrl.username = 'ootla_cluster_owner';
ownerUrl.pathname = '/postgres';
const owner = new Client({ connectionString: ownerUrl.toString(), connectionTimeoutMillis: 5000 });
const database = new Database(config);
const prefix = '/api/leads';
const workspace = '/api/lead-workspaces';
const foundation = '/api/property-foundation';
const organizations = [randomUUID(), randomUUID()];
const roles = ['organization_admin', 'property_manager', 'leasing_agent', 'read_only_analyst', 'organization_admin', 'leasing_agent', 'leasing_agent'] as const;
const userIds = roles.map(() => randomUUID());
const membershipIds: string[] = roles.map(() => randomUUID());
const emails = userIds.map(id => `stage08-${id}@example.test`);
const password = `Stage08-${randomUUID()}!`;
const properties = [randomUUID(), randomUUID(), randomUUID()];
const units = properties.map(() => randomUUID());
const legacyLeads = Array.from({ length: 8 }, () => randomUUID());
const servers: Array<() => Promise<void>> = [];
let ownerConnected = false;
let ownsScratch = false;
let groups = 0;
let phase = 'safe scratch setup';
const pass = (label: string) => { groups += 1; console.log(`PASS ${label}`); };
const normalize = (value: string) => path.resolve(value).replaceAll('\\', '/').toLowerCase();
const tables = ['organizations', 'users', 'organization_memberships', 'properties', 'property_access_assignments', 'units', 'leads', 'tasks', 'viewings', 'lead_activities', 'contacts', 'contact_property_links', 'households', 'household_property_links', 'household_members', 'applications', 'leases', 'external_record_mappings', 'demo_seed_records', 'lead_property_interests', 'lead_events', 'lease_verified_milestones', 'organization_data_settings', 'sessions'];
type Snapshot = Record<string, {
    columns: string[];
    hash: string;
    count: number;
}>;
async function snapshot(previous?: Snapshot): Promise<Snapshot> {
    const result: Snapshot = {};
    for (const table of tables) {
        const columns = previous?.[table]?.columns ?? (await database.query<{
            column_name: string;
        }>("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position", [table])).rows.map(row => row.column_name);
        assert(columns.length && columns.every(column => /^[a-z_]+$/.test(column)) && /^[a-z_]+$/.test(table));
        const rows = (await database.query(`SELECT ${columns.map(column => `"${column}"`).join(',')} FROM "${table}"`)).rows.map(row => JSON.stringify(row)).sort();
        result[table] = { columns, count: rows.length, hash: createHash('sha256').update(JSON.stringify(rows)).digest('hex') };
    }
    return result;
}
async function verifiedCluster() {
    const identity = await owner.query<{
        data_directory: string;
    }>('SHOW data_directory');
    assert.equal(normalize(identity.rows[0]?.data_directory ?? ''), normalize(path.join(root, '.local/postgres/data')), 'Refusing to operate outside the project-owned PostgreSQL data directory.');
}
async function createScratch() {
    await owner.connect();
    ownerConnected = true;
    await verifiedCluster();
    assert(/^ootla_demo_stage08_[a-f0-9]{32}$/.test(scratchName));
    assert.equal((await owner.query('SELECT 1 FROM pg_database WHERE datname=$1', [scratchName])).rowCount, 0, 'The unique scratch name already exists; nothing was changed.');
    const role = (await owner.query<{
        rolsuper: boolean;
        rolcreatedb: boolean;
        rolcreaterole: boolean;
    }>('SELECT rolsuper,rolcreatedb,rolcreaterole FROM pg_roles WHERE rolname=$1', ['ootla'])).rows[0];
    assert(role && !role.rolsuper && !role.rolcreatedb && !role.rolcreaterole, 'The application role must remain restricted.');
    const quoted = (await owner.query<{
        name: string;
    }>('SELECT quote_ident($1) AS name', [scratchName])).rows[0]!.name;
    await owner.query(`CREATE DATABASE ${quoted} OWNER ootla`);
    ownsScratch = true;
    assert.equal((await database.query<{
        name: string;
    }>('SELECT current_database() AS name')).rows[0]?.name, scratchName);
}
async function installBaseline() {
    await database.query('CREATE TABLE schema_migrations(name text PRIMARY KEY,checksum char(64) NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())');
    for (const name of ['001_foundation.sql', '002_staff_roles_property_access.sql', '003_demo_dataset.sql', '004_property_contact_foundation.sql', '005_lead_pipeline.sql']) {
        const sql = await readFile(path.join(root, 'migrations', name), 'utf8');
        await database.transaction(async (client) => {
            await client.query(sql.replace(/^\uFEFF/, ''));
            await client.query('INSERT INTO schema_migrations(name,checksum) VALUES($1,$2)', [name, createHash('sha256').update(sql).digest('hex')]);
        });
    }
    const passwordHash = await hashPassword(password);
    await database.transaction(async (client) => {
        for (const [index, id] of organizations.entries()) {
            await client.query("INSERT INTO organizations(id,name,slug,environment) VALUES($1,$2,$3,'demo')", [id, `Stage 08 scratch ${index}`, `stage08-${randomUUID()}`]);
        }
        for (const [index, id] of userIds.entries()) {
            await client.query('INSERT INTO users(id,email,display_name,password_hash) VALUES($1,$2,$3,$4)', [id, emails[index], `Stage 08 ${roles[index]} ${index}`, passwordHash]);
            await client.query('INSERT INTO organization_memberships(id,organization_id,user_id,role,active) VALUES($1,$2,$3,$4,$5)', [membershipIds[index], organizations[index === 4 ? 1 : 0], id, roles[index], index !== 5]);
        }
        for (const [index, id] of properties.entries()) {
            const organizationId = organizations[index === 2 ? 1 : 0];
            await client.query('INSERT INTO properties(id,organization_id,name,address,city,property_type) VALUES($1,$2,$3,$4,$5,$6)', [id, organizationId, `Property ${index}`, `${index} Example Street`, index === 0 ? 'Lagos' : 'Abuja', 'residential']);
            await client.query("INSERT INTO units(id,organization_id,property_id,label,bedrooms,status,monthly_rent) VALUES($1,$2,$3,'A1',2,'available',1200)", [units[index], organizationId, id]);
        }
        for (const [index, id] of legacyLeads.entries()) {
            const propertyIndex = index === 7 ? 2 : index > 3 ? 1 : 0;
            const status = ['new', 'contacted', 'viewing_scheduled', 'qualified'][index % 4];
            await client.query('INSERT INTO leads(id,organization_id,property_id,unit_id,display_name,email,status,intent,notes) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)', [id, organizations[index === 7 ? 1 : 0], properties[propertyIndex], units[propertyIndex], `Legacy person ${index}`, `legacy-${index}@example.test`, status, index >= 4 && index !== 7 ? 'sales' : 'leasing', 'Original Stage 06 history']);
        }
        for (const index of [1, 2, 3]) {
            await client.query('INSERT INTO property_access_assignments(organization_id,membership_id,property_id) VALUES($1,$2,$3)', [organizations[0], membershipIds[index], properties[0]]);
        }
        for (const [status, stamp] of [['draft', '2020-01-01T00:00:00Z'], ['submitted', '2021-01-01T00:00:00Z']]) {
            await client.query('INSERT INTO applications(organization_id,contact_id,property_id,unit_id,lead_id,status,created_at,updated_at) SELECT organization_id,contact_id,property_id,unit_id,id,$2,$3,$3 FROM leads WHERE id=$1', [legacyLeads[0], status, stamp]);
        }
    });
}
async function utility(script = 'scripts/migrate.ts', args: string[] = []) {
    try {
        await promisify(execFile)(process.execPath, [path.join(root, 'node_modules/tsx/dist/cli.mjs'), path.join(root, script), ...args], {
            cwd: root, windowsHide: true, timeout: 30000,
            env: { ...process.env, NODE_ENV: 'test', DEMO_MODE: 'true', DATABASE_URL: config.databaseUrl, APP_URL: config.appUrl },
        });
    }
    catch {
        if (script === 'scripts/migrate.ts' && database.pool) {
            const client = await database.pool.connect();
            try {
                await client.query('BEGIN');
                await client.query(await readFile(path.join(root, 'migrations/006_lead_workspace.sql'), 'utf8'));
            }
            catch (error) {
                const failure = error as {
                    code?: string;
                    position?: string;
                    constraint?: string;
                    routine?: string;
                };
                console.error('Scratch migration diagnostic ' + JSON.stringify({ code: failure.code, position: failure.position, constraint: failure.constraint, routine: failure.routine }));
            }
            finally {
                await client.query('ROLLBACK');
                client.release();
            }
        }
        assert.fail('The scoped scratch utility failed; raw credentials/process output are omitted.');
    }
}
async function start() {
    const db = new Database(config);
    const app = createApp(config, db);
    const server = await new Promise<ReturnType<typeof app.listen>>((resolve, reject) => {
        const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
        listener.once('error', reject);
    });
    let closed = false;
    const close = async () => {
        if (closed)
            return;
        closed = true;
        server.closeIdleConnections();
        await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
        await db.close();
    };
    servers.push(close);
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const request = (route: string, cookie = '', method = 'GET', body?: unknown) => fetch(base + route, {
        method, redirect: 'manual', headers: { ...(cookie ? { Cookie: cookie } : {}), ...(method === 'GET' ? {} : { Origin: config.appUrl }),
            ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { close, request, base, login: async (index: number) => {
            const response = await request('/api/auth/login', '', 'POST', { email: emails[index], password });
            assert.equal(response.status, 200, 'The real password hash/session authentication path must succeed.');
            const cookie = response.headers.get('set-cookie')?.split(';')[0];
            assert(cookie && /HttpOnly/i.test(response.headers.get('set-cookie')!), 'Use a normal HttpOnly server session.');
            return cookie;
        } };
}
type Api = Awaited<ReturnType<typeof start>>;
async function json<T>(api: Api, route: string, cookie: string, method = 'GET', body?: unknown, expected = 200): Promise<T> {
    const response = await api.request(route, cookie, method, body);
    assert.equal(response.status, expected, `${method} ${route.split('?')[0]} must return ${expected}; received ${response.status}.`);
    return response.json() as Promise<T>;
}
async function deny(api: Api, route: string, cookie: string, method = 'GET', body?: unknown, expected: number | number[] = [403, 404], code?: string) {
    const response = await api.request(route, cookie, method, body);
    assert((Array.isArray(expected) ? expected : [expected]).includes(response.status), `${method} ${route.split('?')[0]} must reject this request; received ${response.status}.`);
    if (code)
        assert.equal((await response.json() as {
            code: string;
        }).code, code);
}
async function rejectsSql(sql: string, values: unknown[], code: string, label: string) {
    assert(database.pool);
    let rejected = false;
    try {
        await database.pool.query(sql, values);
    }
    catch (error) {
        rejected = true;
        assert.equal((error as {
            code?: string;
        }).code, code, label);
    }
    assert(rejected, label);
}
// Focused Stage 08 scenarios use real HTTP/password/session paths and owned data only.
const privateNote = 'STAGE08_PRIVATE_NOTE_REVIEW_REQUIRED';
const privateCall = 'STAGE08_PRIVATE_CALL_VOICEMAIL';
const privateTask = 'STAGE08_PRIVATE_TASK_STAFF_ONLY';
const privateLegacy = 'STAGE08_PRIVATE_LEGACY_NOTES';
const oldTask = randomUUID();
const oldViewing = randomUUID();
const oldActivity = randomUUID();
async function seedHistoricalWorkspace() {
    await database.query('UPDATE leads SET notes=$2 WHERE id=$1', [legacyLeads[0], privateLegacy]);
    await database.query("INSERT INTO tasks(id,organization_id,property_id,lead_id,title,due_at,status,seed_key) VALUES($1,$2,$3,$4,'Original follow up','2025-01-01T10:00:00Z','open','stage03.task.stage08-check')", [oldTask, organizations[0], properties[0], legacyLeads[0]]);
    await database.query("INSERT INTO viewings(id,organization_id,property_id,lead_id,unit_id,starts_at,status) VALUES($1,$2,$3,$4,$5,'2025-03-01T10:00:00Z','scheduled')", [oldViewing, organizations[0], properties[0], legacyLeads[0], units[0]]);
    await database.query("INSERT INTO lead_activities(id,organization_id,property_id,lead_id,kind,summary,occurred_at,seed_key) VALUES($1,$2,$3,$4,'email','Original simulated communication','2025-02-01T10:00:00Z','stage03.activity.stage08-check')", [oldActivity, organizations[0], properties[0], legacyLeads[0]]);
}
async function upload(api: Api, id: string, cookie: string, name: string, content: Buffer, type = 'text/plain', headers: Record<string, string> = {}) {
    return fetch(`${api.base}${workspace}/${id}/documents?name=${encodeURIComponent(name)}`, { method: 'POST', redirect: 'manual', headers: { Cookie: cookie, Origin: config.appUrl, 'Content-Type': type, ...headers }, body: new Uint8Array(content) });
}
async function uploaded(api: Api, id: string, cookie: string, name: string, content: Buffer, type = 'text/plain'): Promise<WorkspaceDocument> {
    const r = await upload(api, id, cookie, name, content, type);
    assert.equal(r.status, 201, `Valid ${type} document must upload.`);
    return (await r.json() as {
        document: WorkspaceDocument;
    }).document;
}
function noSecrets(value: unknown, label: string) { const serialized = JSON.stringify(value); for (const secret of [privateNote, privateCall, privateTask, privateLegacy])
    assert(!serialized.includes(secret), `${label} must not reveal internal staff text.`); }
async function main() {
    await createScratch();
    await installBaseline();
    await seedHistoricalWorkspace();
    const before = await snapshot();
    phase = 'additive migration 006 preservation';
    await utility();
    assert.equal(await database.state(), 'ready');
    assert.deepEqual(await snapshot(before), before, 'Stage 08 must preserve every preexisting column, record, password hash and timestamp.');
    const linkedTask = (await database.query<{
        contact_id: string;
    }>('SELECT contact_id FROM tasks WHERE id=$1', [oldTask])).rows[0]!;
    const oldContact = (await database.query<{
        contact_id: string;
    }>('SELECT contact_id FROM leads WHERE id=$1', [legacyLeads[0]])).rows[0]!.contact_id;
    assert.equal(linkedTask.contact_id, oldContact);
    await utility();
    const migrations = (await database.query<{
        name: string;
        checksum: string;
    }>('SELECT name,checksum FROM schema_migrations ORDER BY name')).rows;
    assert.equal(migrations.length, 6);
    for (const row of migrations)
        assert.equal(row.checksum, createHash('sha256').update(await readFile(path.join(root, 'migrations', row.name), 'utf8')).digest('hex'));
    pass('additive migration preserves prior records/columns and all six migration checksums; old tasks reuse canonical lead identity');
    phase = 'ordinary seed compatibility and idempotence';
    await utility('scripts/seed.ts');
    const afterSeed = await snapshot();
    await utility('scripts/seed.ts');
    assert.deepEqual(await snapshot(afterSeed), afterSeed);
    assert.equal((await database.query<{
        n: number;
    }>('SELECT count(*)::int AS n FROM tasks t JOIN leads l ON l.id=t.lead_id AND l.organization_id=t.organization_id WHERE t.contact_id<>l.contact_id')).rows[0]!.n, 0);
    assert.equal((await database.query<{
        n: number;
    }>('SELECT count(*)::int AS n FROM lead_workspace_events')).rows[0]!.n, 0);
    pass('explicit ordinary demo seed is repeatable after migration without rewriting old data or fabricating workspace events');
    phase = 'real-cookie workspace authorization and related identities';
    const api = await start();
    const [admin, manager, agent, analyst, otherAdmin, unassigned] = await Promise.all([0, 1, 2, 3, 4, 6].map(i => api.login(i)));
    assert(admin && manager && agent && analyst && otherAdmin && unassigned);
    await deny(api, `${workspace}/${legacyLeads[0]}`, '', 'GET', undefined, 401);
    await deny(api, `${workspace}/${legacyLeads[0]}`, analyst);
    await deny(api, `${workspace}/${legacyLeads[0]}`, otherAdmin);
    await deny(api, `${workspace}/${legacyLeads[0]}`, unassigned);
    await deny(api, `${workspace}/${legacyLeads[4]}`, agent);
    await deny(api, `${workspace}/${randomUUID()}`, admin, 'GET', undefined, 404);
    await deny(api, '/api/auth/login', '', 'POST', { email: emails[5], password }, 401);
    const portalId = randomUUID();
    await database.query("INSERT INTO users(id,email,display_name,password_hash,account_kind) SELECT $1,$2,'Portal identity',password_hash,'applicant' FROM users WHERE id=$3", [portalId, `portal-${randomUUID()}@example.test`, userIds[0]]);
    await deny(api, '/api/auth/login', '', 'POST', { email: (await database.query<{
            email: string;
        }>('SELECT email FROM users WHERE id=$1', [portalId])).rows[0]!.email, password }, 401);
    let lead = (await json<{
        lead: LeadRecord;
    }>(api, prefix, admin, 'POST', { propertyId: properties[0], unitId: units[0], newContact: { displayName: 'Stage 08 canonical prospect', email: 'stage08-person@example.test', phone: '+234 555 0808' }, ownerMembershipId: membershipIds[2], source: 'referral', preferences: { bedrooms: 2, budgetMin: 1000, budgetMax: 1500, moveInOn: '2027-05-01', locations: ['Lagos'], requirements: 'A quiet workspace and bicycle storage' }, nextAction: 'Review stated preferences', nextActionAt: '2027-03-01T10:00:00Z' }, 201)).lead;
    const contactId = lead.contactId;
    const household = (await json<{
        household: {
            id: string;
        };
    }>(api, `${foundation}/households`, admin, 'POST', { name: 'Stage 08 household', propertyIds: [properties[0]], members: [{ contactId, relationship: 'primary' }] }, 201)).household;
    const get = (token = admin) => json<LeadWorkspace>(api, `${workspace}/${lead.id}`, token);
    const initial = await get();
    assert.equal(initial.leadDetail.lead.contactId, contactId);
    assert.equal(initial.contact.contact.id, contactId);
    assert(initial.contact.households.some(h => h.id === household.id));
    assert.equal(initial.leadDetail.lead.owner?.membershipId, membershipIds[2]);
    assert.deepEqual(initial.leadDetail.lead.preferences, lead.preferences);
    assert.equal(initial.leadDetail.lead.stage, 'new_inquiry');
    assert.equal(initial.leadDetail.lead.nextAction, 'Review stated preferences');
    assert(initial.access.canManage);
    assert.equal((await get(agent)).contact.contact.id, contactId);
    pass('normal hashed-password sessions load scoped canonical contact/household, property interests, preferences, owner and next action; analyst/portal/other organization/property access is denied');
    phase = 'persistent staff notes and call logs';
    const noteResponse = await api.request(`${workspace}/${lead.id}/notes`, agent, 'POST', { body: privateNote + '\nStaff review only.' });
    assert.equal(noteResponse.status, 201);
    assert(await noteResponse.json());
    const callResponse = await api.request(`${workspace}/${lead.id}/calls`, agent, 'POST', { summary: privateCall, outcome: 'voicemail', direction: 'outbound', durationMinutes: 2 });
    assert.equal(callResponse.status, 201);
    let current = await get();
    const note = current.timeline.items.find(e => e.kind === 'note' && e.summary.includes(privateNote));
    const call = current.timeline.items.find(e => e.kind === 'call' && e.summary.includes(privateCall));
    assert(note && call);
    assert.equal(note.actor?.id, userIds[2]);
    assert.equal(call.actor?.id, userIds[2]);
    assert.equal(note.provenance, 'staff');
    assert.equal(note.simulated, false);
    assert(Math.abs(Date.parse(note.occurredAt) - Date.now()) < 60000);
    assert.equal(call.metadata.outcome, 'voicemail');
    assert.equal(call.metadata.direction, 'outbound');
    assert.equal(call.metadata.durationMinutes, 2);
    for (const [suffix, body] of [['notes', { body: '' }], ['notes', { body: 'Forged timestamp', occurredAt: '2020-01-01T00:00:00Z' }], ['notes', { body: 'Forged actor', actorUserId: userIds[0] }], ['calls', { summary: 'Wrong outcome', outcome: 'sent', direction: 'outbound' }], ['calls', { summary: 'Too long', outcome: 'connected', direction: 'inbound', durationMinutes: 1441 }], ['notes', { body: 'Bad\u0000control' }]] as const)
        await deny(api, `${workspace}/${lead.id}/${suffix}`, agent, 'POST', body, 400);
    await deny(api, `${workspace}/${lead.id}/notes`, analyst, 'POST', { body: 'Unauthorized staff note' });
    await deny(api, `${workspace}/${lead.id}/notes`, otherAdmin, 'POST', { body: 'Cross organization note' });
    const missingOrigin = await fetch(`${api.base}${workspace}/${lead.id}/notes`, { method: 'POST', headers: { Cookie: agent, 'Content-Type': 'application/json', Origin: 'https://untrusted.example' }, body: JSON.stringify({ body: 'Wrong origin' }) });
    assert.equal(missingOrigin.status, 403);
    pass('notes and call logs persist with server actor/timestamp; strict input, role/property isolation and origin checks prevent forged/private writes');
    phase = 'follow-up tasks and completion history';
    let task = (await json<{
        task: WorkspaceTask;
    }>(api, `${workspace}/${lead.id}/tasks`, agent, 'POST', { title: privateTask, details: 'Call the prospect after staff review', dueAt: '2027-04-01T10:00:00Z', ownerMembershipId: membershipIds[2] }, 201)).task;
    assert.equal(task.contactId, contactId);
    assert.equal(task.leadId, lead.id);
    assert.equal(task.createdBy?.id, userIds[2]);
    assert.equal(task.owner?.membershipId, membershipIds[2]);
    assert.equal(task.status, 'open');
    const priorTaskVersion = task.version;
    task = (await json<{
        task: WorkspaceTask;
    }>(api, `${workspace}/${lead.id}/tasks/${task.id}`, manager, 'PATCH', { version: task.version, status: 'completed' })).task;
    assert.equal(task.status, 'completed');
    assert.equal(task.completedBy?.id, userIds[1]);
    assert(task.completedAt && Math.abs(Date.parse(task.completedAt) - Date.now()) < 60000);
    assert.equal(task.version, priorTaskVersion + 1);
    await deny(api, `${workspace}/${lead.id}/tasks/${task.id}`, agent, 'PATCH', { version: priorTaskVersion, status: 'open' }, 409);
    const fixedDue = task.dueAt;
    task = (await json<{
        task: WorkspaceTask;
    }>(api, `${workspace}/${lead.id}/tasks/${task.id}`, agent, 'PATCH', { version: task.version, title: privateTask + ' amended' })).task;
    assert.equal(task.dueAt, fixedDue);
    assert.equal(task.status, 'completed');
    for (const ownerMembershipId of [membershipIds[4], membershipIds[5], membershipIds[6]])
        await deny(api, `${workspace}/${lead.id}/tasks`, admin, 'POST', { title: 'Invalid owner', dueAt: '2027-01-01T00:00:00Z', ownerMembershipId }, [400, 403, 404]);
    await deny(api, `${workspace}/${legacyLeads[1]}/tasks/${task.id}`, admin, 'PATCH', { version: task.version, status: 'open' });
    await deny(api, `${workspace}/${lead.id}/tasks/${task.id}`, analyst, 'PATCH', { version: task.version, status: 'open' });
    await deny(api, `${workspace}/${lead.id}/tasks`, agent, 'POST', { title: 'Invalid due', dueAt: 'tomorrow' }, 400);
    current = await get();
    assert(current.tasks.items.some(t => t.id === task.id && t.status === 'completed'));
    assert(current.timeline.items.some(e => e.kind === 'task_created'));
    assert(current.timeline.items.some(e => e.kind === 'task_updated'));
    pass('follow-up task assignment, editing and completion persist with optimistic versions, canonical identity and actor evidence; invalid owners, stale edits and another lead task are denied');
    phase = 'private document upload and protected binary download';
    const textBytes = Buffer.from('Example staff-only document. No live personal data.\n');
    const textDoc = await uploaded(api, lead.id, agent, 'staff-example.txt', textBytes);
    assert.equal(textDoc.contactId, contactId);
    assert.equal(textDoc.sha256, createHash('sha256').update(textBytes).digest('hex'));
    assert.equal(textDoc.sizeBytes, textBytes.length);
    assert.equal(textDoc.uploadedBy.id, userIds[2]);
    assert(textDoc.downloadUrl.startsWith(`${workspace}/${lead.id}/documents/`));
    assert(!('content' in textDoc));
    const pdf = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n');
    const pdfDoc = await uploaded(api, lead.id, agent, 'review-example.pdf', pdf, 'application/pdf');
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lWQAAAAASUVORK5CYII=', 'base64');
    await uploaded(api, lead.id, agent, 'example.png', png, 'image/png');
    const downloaded = await api.request(textDoc.downloadUrl, agent);
    assert.equal(downloaded.status, 200);
    assert.equal(downloaded.headers.get('content-type')?.split(';')[0], 'text/plain');
    assert.match(downloaded.headers.get('content-disposition') ?? '', /^attachment;/);
    assert.equal(downloaded.headers.get('x-content-type-options'), 'nosniff');
    assert.match(downloaded.headers.get('cache-control') ?? '', /no-store/);
    assert.deepEqual(Buffer.from(await downloaded.arrayBuffer()), textBytes);
    for (const token of ['', analyst, otherAdmin, unassigned])
        await deny(api, textDoc.downloadUrl, token, 'GET', undefined, token ? [403, 404] : 401);
    await deny(api, `${workspace}/${legacyLeads[1]}/documents/${textDoc.id}/download`, agent);
    await deny(api, `${workspace}/${lead.id}/documents/${randomUUID()}/download`, admin, 'GET', undefined, 404);
    const documentPage = await json<Paginated<WorkspaceDocument>>(api, `${workspace}/${lead.id}/documents?pageSize=1`, agent);
    assert.equal(documentPage.total, 3);
    for (const token of ['', analyst, otherAdmin, unassigned]) {
        const denied = await upload(api, lead.id, token, 'denied.txt', textBytes);
        assert((token ? [403, 404] : [401]).includes(denied.status), 'Uploading requires the same staff, tenant and property access as downloads.');
    }
    const encoded = await upload(api, lead.id, agent, 'encoded.txt', textBytes, 'text/plain', { 'Content-Encoding': 'gzip' });
    assert.equal(encoded.status, 415);
    assert.equal(documentPage.items.length, 1);
    assert(!JSON.stringify(documentPage).includes(textBytes.toString()));
    assert(documentPage.items.every(d => !('content' in d) && !('bytes' in d)));
    const invalidUploads: [
        string,
        Buffer,
        string
    ][] = [['empty.txt', Buffer.alloc(0), 'text/plain'], ['x.svg', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'), 'image/svg+xml'], ['x.html', Buffer.from('<!doctype html><script>alert(1)</script>'), 'text/plain'], ['x.exe', Buffer.from('MZ executable'), 'application/octet-stream'], ['x.png', pdf, 'image/png'], ['x.pdf', Buffer.from('not a pdf'), 'application/pdf'], ['x.pdf', Buffer.from('%PDF-1.4 truncated'), 'application/pdf'], ['x.png', png.subarray(0, 12), 'image/png'], ['truncated.png', png.subarray(0, 33), 'image/png'], ['bad.jpg', png, 'image/jpeg'], ['truncated.jpg', Buffer.from([255, 216, 255, 224, 0, 16]), 'image/jpeg'], ['bad.txt', Buffer.from([0xc3, 0x28]), 'text/plain'], ['nul.txt', Buffer.from([65, 0, 66]), 'text/plain'], ['../escape.txt', textBytes, 'text/plain'], ['bad\\path.txt', textBytes, 'text/plain'], ['header\r\ninject.txt', textBytes, 'text/plain'], ['nul\u0000name.txt', textBytes, 'text/plain'], ['large.txt', Buffer.alloc(20 * 1024 * 1024 + 1, 65), 'text/plain']];
    for (const [name, bytes, type] of invalidUploads) {
        const r = await upload(api, lead.id, agent, name, bytes, type);
        assert([400, 413, 415].includes(r.status), `Unsafe/truncated/mismatched document ${JSON.stringify(name)} must reject; received ${r.status}.`);
    }
    assert.equal((await json<Paginated<WorkspaceDocument>>(api, `${workspace}/${lead.id}/documents`, agent)).total, 3);
    await deny(api, textDoc.downloadUrl, '', 'GET', undefined, 401);
    pass('PDF/PNG/text bytes persist privately with hashes, bounded metadata and authenticated attachment downloads; wrong lead/role/tenant, unsafe names, markup, bad UTF-8, truncation, mismatched types and oversize content reject');
    phase = 'staff decision notes without eligibility or applicant decisions';
    const application = (await json<{
        application: ApplicationRecord;
    }>(api, `${foundation}/applications`, admin, 'POST', { contactId, householdId: household.id, propertyId: properties[0], unitId: units[0], leadId: lead.id, status: 'draft' }, 201)).application;
    await json(api, `${workspace}/${lead.id}/decisions`, agent, 'POST', { summary: 'Staff will request the remaining example document.', context: 'application_review', applicationId: application.id }, 201);
    await deny(api, `${workspace}/${lead.id}/decisions`, agent, 'POST', { summary: 'Wrong linked application', context: 'application_review', applicationId: (await database.query<{
            id: string;
        }>('SELECT id FROM applications WHERE lead_id=$1 LIMIT 1', [legacyLeads[0]])).rows[0]!.id }, [400, 404]);
    await deny(api, `${workspace}/${lead.id}/decisions`, agent, 'POST', { summary: 'Do not approve applicants', context: 'approved', applicationId: application.id }, 400);
    assert.equal((await database.query<{
        status: string;
    }>('SELECT status FROM applications WHERE id=$1', [application.id])).rows[0]!.status, 'draft');
    pass('staff review decisions append human action history only; mismatched application identities and invented approval actions are rejected');
    phase = 'verified provider timeline and linked conversion';
    const lease = (await json<{
        lease: LeaseRecord;
    }>(api, `${foundation}/leases`, admin, 'POST', { contactId, householdId: household.id, propertyId: properties[0], unitId: units[0], leadId: lead.id, applicationId: application.id, status: 'active', startsOn: '2027-05-01' }, 201)).lease;
    await json(api, `${foundation}/applications/${application.id}`, admin, 'PATCH', { status: 'submitted' });
    const mappingId = randomUUID();
    const providerId = randomUUID();
    await database.query("INSERT INTO external_record_mappings(id,organization_id,entity_type,provider,external_id,lease_id) VALUES($1,$2,'lease','yardi',$3,$4)", [mappingId, organizations[0], `stage08-lease-${randomUUID()}`, lease.id]);
    await database.query("INSERT INTO provider_verified_updates(id,organization_id,lead_id,property_id,contact_id,mapping_id,provider,external_event_id,summary,occurred_at,verified_at,verification_reference) VALUES($1,$2,$3,$4,$5,$6,'yardi',$7,'Verified example provider status','2025-06-01T10:00:00Z','2025-06-01T10:05:00Z','Trusted scratch ingestion evidence only')", [providerId, organizations[0], lead.id, properties[0], contactId, mappingId, `stage08-provider-${randomUUID()}`]);
    for (const suffix of ['provider-updates', 'provider_verified_updates', 'events'])
        await deny(api, `${workspace}/${lead.id}/${suffix}`, admin, 'POST', { provider: 'yardi', summary: 'Browser cannot invent verified status', verifiedAt: new Date().toISOString() }, 404);
    await rejectsSql("INSERT INTO provider_verified_updates(organization_id,lead_id,property_id,contact_id,mapping_id,provider,external_event_id,summary,occurred_at,verified_at,verification_reference) SELECT organization_id,lead_id,property_id,contact_id,mapping_id,'fake_provider',gen_random_uuid()::text,summary,occurred_at,verified_at,verification_reference FROM provider_verified_updates WHERE id=$1", [providerId], '23514', 'A trusted provider update must match the mapping provider.');
    await rejectsSql("INSERT INTO provider_verified_updates(organization_id,lead_id,property_id,contact_id,mapping_id,provider,external_event_id,summary,occurred_at,verified_at,verification_reference) SELECT organization_id,lead_id,property_id,contact_id,mapping_id,provider,gen_random_uuid()::text,summary,occurred_at,now()+interval '1 day',verification_reference FROM provider_verified_updates WHERE id=$1", [providerId], '23514', 'Future verification cannot masquerade as verified provider evidence.');
    current = await get();
    assert.equal(current.leadDetail.lead.contactId, contactId);
    assert.equal(current.contact.contact.id, contactId);
    assert(current.contact.history.items.some(e => e.kind === 'application' && e.id === application.id));
    assert(current.contact.history.items.some(e => e.kind === 'lease' && e.id === lease.id));
    assert(current.contact.households.some(h => h.id === household.id));
    assert.equal(current.leadDetail.lead.applicationSummary?.status, 'submitted');
    const verified = (await json<Paginated<TimelineEvent>>(api, `${workspace}/${lead.id}/timeline?pageSize=100`, agent)).items.find(e => e.kind === 'provider_update');
    assert(verified);
    assert.equal(verified.provenance, 'verified_provider');
    assert.equal(verified.simulated, false);
    assert.equal(verified.actor, null);
    assert.equal(verified.metadata.provider, 'yardi');
    pass('application and lease conversion preserves one contact/household and history; timeline exposes trusted verified provider updates while browser ingestion and applicant approval stay unavailable');
    phase = 'combined timeline ordering and independent server pagination';
    const history = await json<LeadWorkspace>(api, `${workspace}/${legacyLeads[0]}?pageSize=100`, agent);
    assert(history.timeline.items.some(e => e.kind === 'tour' && e.summary));
    assert(history.timeline.items.some(e => e.kind === 'communication' && e.simulated));
    assert(history.timeline.items.some(e => e.kind === 'application'));
    assert(history.tasks.items.some(t => t.id === oldTask && t.contactId === oldContact));
    for (let index = 0; index < 31; index++)
        await database.query("INSERT INTO lead_workspace_events(organization_id,lead_id,property_id,contact_id,kind,summary,actor_user_id,actor_membership_id,occurred_at) VALUES($1,$2,$3,$4,'note',$5,$6,$7,'2025-07-01T10:00:00Z')", [organizations[0], lead.id, properties[0], contactId, `Tie timestamp note ${index}`, userIds[2], membershipIds[2]]);
    const all = await json<Paginated<TimelineEvent>>(api, `${workspace}/${lead.id}/timeline?pageSize=100`, agent);
    assert(all.items.length > 31);
    assert(all.items.some(e => e.kind === 'staff_decision'));
    assert(all.items.some(e => e.kind === 'note'));
    assert(all.items.some(e => e.kind === 'call'));
    assert(all.items.some(e => e.kind === 'application_summary'));
    assert(all.items.some(e => e.kind === 'document_uploaded'));
    const seen: string[] = [];
    for (let page = 1; page <= Math.ceil(all.total / 7); page++) {
        const response = await json<Paginated<TimelineEvent>>(api, `${workspace}/${lead.id}/timeline?page=${page}&pageSize=7`, agent);
        assert.equal(response.total, all.total);
        assert(response.items.length <= 7);
        seen.push(...response.items.map(e => e.id));
    }
    assert.deepEqual(seen, all.items.map(e => e.id));
    assert.equal(new Set(seen).size, all.total);
    for (let index = 1; index < all.items.length; index++)
        assert(Date.parse(all.items[index - 1]!.occurredAt) >= Date.parse(all.items[index]!.occurredAt), 'Timeline must be newest first across event sources.');
    const pageTwo = await json<LeadWorkspace>(api, `${workspace}/${lead.id}?timelinePage=2&pageSize=2`, agent);
    assert.deepEqual(pageTwo.timeline.items.map(e => e.id), all.items.slice(2, 4).map(e => e.id));
    assert(pageTwo.tasks.items.length <= 2 && pageTwo.documents.items.length <= 2);
    for (const query of ['pageSize=101', 'page=0', 'unknown=x'])
        await deny(api, `${workspace}/${lead.id}/timeline?${query}`, agent, 'GET', undefined, 400);
    await deny(api, `${workspace}/${lead.id}?timelinePage=0`, agent, 'GET', undefined, 400);
    pass('one newest-first timeline combines staff, communications, tours, applications and trusted provider records; same-time pagination stays stable, duplicate-free and capped independently from tasks/documents');
    phase = 'stated-preference property suggestions with verified availability';
    await database.query("UPDATE units SET availability_source='staff_reported',availability_verified_at=now()-interval '1 hour',status='available' WHERE id=$1", [units[0]]);
    const goodId = randomUUID();
    const suggestionVariants = [{ label: 'Good exact preference', rent: 1300, bedrooms: 2, status: 'available', source: 'import', age: "now()-interval '1 day'", propertyIndex: 0 }, { label: 'Unverified', rent: 1300, bedrooms: 2, status: 'available', source: 'staff_reported', age: 'NULL', propertyIndex: 0 }, { label: 'Stale', rent: 1300, bedrooms: 2, status: 'available', source: 'staff_reported', age: "now()-interval '8 days'", propertyIndex: 0 }, { label: 'Future timestamp', rent: 1300, bedrooms: 2, status: 'available', source: 'staff_reported', age: "now()+interval '1 day'", propertyIndex: 0 }, { label: 'Simulated source', rent: 1300, bedrooms: 2, status: 'available', source: 'demo', age: 'now()', propertyIndex: 0 }, { label: 'Unknown source', rent: 1300, bedrooms: 2, status: 'available', source: 'unknown', age: 'now()', propertyIndex: 0 }, { label: 'Over budget', rent: 1700, bedrooms: 2, status: 'available', source: 'staff_reported', age: 'now()', propertyIndex: 0 }, { label: 'Under budget', rent: 900, bedrooms: 2, status: 'available', source: 'staff_reported', age: 'now()', propertyIndex: 0 }, { label: 'Wrong bedrooms', rent: 1300, bedrooms: 3, status: 'available', source: 'staff_reported', age: 'now()', propertyIndex: 0 }, { label: 'Occupied', rent: 1300, bedrooms: 2, status: 'occupied', source: 'staff_reported', age: 'now()', propertyIndex: 0 }, { label: 'Wrong location', rent: 1300, bedrooms: 2, status: 'available', source: 'staff_reported', age: 'now()', propertyIndex: 1 }, { label: 'Other organization', rent: 1300, bedrooms: 2, status: 'available', source: 'staff_reported', age: 'now()', propertyIndex: 2 }];
    const variantIds: string[] = [];
    for (const [index, v] of suggestionVariants.entries()) {
        const id = index === 0 ? goodId : randomUUID();
        variantIds.push(id);
        await database.query(`INSERT INTO units(id,organization_id,property_id,label,bedrooms,status,monthly_rent,availability_source,availability_verified_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,${v.age})`, [id, organizations[v.propertyIndex === 2 ? 1 : 0], properties[v.propertyIndex], v.label, v.bedrooms, v.status, v.rent, v.source]);
    }
    await database.query("UPDATE properties SET city='Lagos' WHERE id=$1", [properties[2]]);
    const suggestions = await json<PropertySuggestions>(api, `${workspace}/${lead.id}/suggestions?pageSize=1`, agent);
    assert.equal(suggestions.verifiedWithinDays, 7);
    assert.equal(suggestions.requestedMoveInOn, '2027-05-01');
    assert.equal(suggestions.total, 2);
    assert.equal(suggestions.items.length, 1);
    assert(suggestions.notice && suggestions.criteriaUsed.length);
    const suggestionsAll = await json<PropertySuggestions>(api, `${workspace}/${lead.id}/suggestions?pageSize=100`, agent);
    assert(suggestionsAll.items.some(item => item.unitId === goodId));
    assert(suggestionsAll.items.some(item => item.unitId === units[0]));
    assert(!suggestionsAll.items.some(item => variantIds.slice(1).includes(item.unitId)));
    for (const item of suggestionsAll.items) {
        assert.equal(item.moveInDateConfirmed, false);
        assert(item.cautions.length > 0);
        assert(item.reasons.length >= 3);
        assert(item.lastVerifiedAt && item.availabilitySource);
        assert(!('score' in item) && !('eligibility' in item));
        assert(!JSON.stringify(item).includes('bicycle storage'), 'Free text must not be interpreted as suitability or eligibility criteria.');
    }
    await deny(api, `${workspace}/${lead.id}/suggestions?ethnicity=example`, agent, 'GET', undefined, 400);
    await deny(api, `${workspace}/${lead.id}/suggestions?minimumScore=90`, agent, 'GET', undefined, 400);
    const protectedRequirements = 'Prefer people of ethnicity EXAMPLE_PROTECTED and religion EXAMPLE_PROTECTED';
    lead = (await json<{
        lead: LeadRecord;
    }>(api, `${prefix}/${lead.id}`, admin, 'PATCH', { version: (await get()).leadDetail.lead.version, preferences: { ...lead.preferences, requirements: protectedRequirements } }, 200)).lead;
    const criteria = await json<PropertySuggestions>(api, `${workspace}/${lead.id}/suggestions?pageSize=100`, agent);
    assert.deepEqual(criteria.items.map(e => e.unitId), suggestionsAll.items.map(e => e.unitId));
    assert(!JSON.stringify(criteria).includes('EXAMPLE_PROTECTED'));
    pass('suggestions use stated budget, location and bedroom facts plus accessible available units verified within seven days; stale/future/unverified/simulated/occupied/mismatched records are excluded, move-in remains unconfirmed and protected/free-text characteristics never become scores');
    phase = 'contextual AI simulation without external actions';
    const ai = (await get(agent)).ai;
    assert.equal(ai.mode, 'simulation');
    assert.match(ai.notice, /simulat|not configured|setup/i);
    assert(ai.drafts.length > 0);
    assert(ai.drafts.every(d => typeof d === 'string' && d.length > 0));
    assert(!JSON.stringify(ai).includes('EXAMPLE_PROTECTED'));
    for (const route of ['send', 'ai/send', 'ai/execute', 'ai/actions', 'screen', 'approve', 'charge', 'refund'])
        await deny(api, `${workspace}/${lead.id}/${route}`, admin, 'POST', { confirm: true }, 404);
    assert.equal((await database.query<{
        status: string;
    }>('SELECT status FROM applications WHERE id=$1', [application.id])).rows[0]!.status, 'submitted');
    pass('AI remains contextual labeled simulation without provider calls, outbound execution, application decisions or payment actions');
    phase = 'legacy-route privacy, full-interest protection and relationship constraints';
    await database.query('UPDATE leads SET notes=$2 WHERE id=$1', [lead.id, privateLegacy]);
    for (const route of [prefix, `${prefix}/${lead.id}`, `${prefix}/${lead.id}/events`, `${prefix}/follow-ups`, `${foundation}/contacts/${contactId}`, `/api/demo/data`]) {
        const r = await api.request(route, analyst);
        assert([200, 403, 404].includes(r.status));
        if (r.status === 200)
            noSecrets(await r.json(), `Analyst ${route}`);
    }
    const secretSearch = await json<LeadDirectory>(api, `${prefix}?q=${privateLegacy}`, analyst);
    assert.equal(secretSearch.total, 0, 'A private note must not leak through matching search result existence.');
    await json(api, `${foundation}/contacts/${contactId}/properties`, admin, 'POST', { propertyId: properties[1] }, 200);
    const updated = await json<{
        lead: LeadRecord;
    }>(api, `${prefix}/${lead.id}`, admin, 'PATCH', { version: (await get()).leadDetail.lead.version, interestPropertyIds: [properties[0], properties[1]], ownerMembershipId: membershipIds[0] });
    assert.equal(updated.lead.interestPropertyIds.length, 2);
    for (const suffix of ['', '/timeline', '/tasks', '/documents', '/suggestions'])
        await deny(api, `${workspace}/${lead.id}${suffix}`, agent);
    await deny(api, textDoc.downloadUrl, agent);
    await deny(api, `${workspace}/${lead.id}/notes`, agent, 'POST', { body: 'Partial access cannot write staff text' });
    await rejectsSql('INSERT INTO lead_documents(organization_id,lead_id,property_id,contact_id,name,media_type,size_bytes,sha256,content,uploaded_by_user_id,uploaded_by_membership_id) VALUES($1,$2,$3,$4,\'wrong.txt\',\'text/plain\',1,$5,$6,$7,$8)', [organizations[0], lead.id, properties[0], oldContact, 'a'.repeat(64), Buffer.from('A'), userIds[0], membershipIds[0]], '23503', 'A document cannot attach a different contact to the same lead.');
    await rejectsSql('INSERT INTO lead_workspace_events(organization_id,lead_id,property_id,contact_id,kind,summary,actor_user_id,actor_membership_id) VALUES($1,$2,$3,$4,\'note\',\'wrong tenant actor\',$5,$6)', [organizations[0], lead.id, properties[0], contactId, userIds[4], membershipIds[4]], '23503', 'Staff event membership cannot cross an organization.');
    pass('internal text stays private across legacy routes/search; partially assigned interests deny private workspace/document access and database FKs enforce lead/contact/actor tenant relationships');
    phase = 'fresh backend persistence and current-grant enforcement';
    const retained = await get();
    const expectedBytes = Buffer.from(await (await api.request(pdfDoc.downloadUrl, admin)).arrayBuffer());
    await api.close();
    const fresh = await start();
    assert.equal((await fresh.request('/api/auth/me', admin)).status, 200);
    const persisted = await json<LeadWorkspace>(fresh, `${workspace}/${lead.id}`, admin);
    assert.equal(persisted.contact.contact.id, contactId);
    assert.equal(persisted.leadDetail.lead.applicationSummary?.id, application.id);
    assert.deepEqual(persisted.tasks, retained.tasks);
    assert.deepEqual(persisted.documents, retained.documents);
    assert.deepEqual(persisted.timeline, retained.timeline);
    assert.deepEqual(Buffer.from(await (await fresh.request(pdfDoc.downloadUrl, admin)).arrayBuffer()), expectedBytes);
    await database.query('UPDATE organization_memberships SET active=false WHERE id=$1', [membershipIds[1]]);
    await deny(fresh, `${workspace}/${legacyLeads[0]}`, manager, 'GET', undefined, 401);
    await deny(fresh, pdfDoc.downloadUrl, manager, 'GET', undefined, 401);
    await database.query('DELETE FROM property_access_assignments WHERE membership_id=$1', [membershipIds[2]]);
    await deny(fresh, `${workspace}/${legacyLeads[0]}`, agent);
    await deny(fresh, `${workspace}/${legacyLeads[0]}/tasks`, agent, 'POST', { title: 'Revoked cookie cannot create', dueAt: '2027-01-01T00:00:00Z' });
    pass('staff edits, canonical conversion, ordered history, document bytes and normal sessions survive a new backend/pool; live membership/property revocation immediately denies old cookies');
}
try {
    await main();
    console.log(`Stage 08 lead workspace checks complete: ${groups} groups passed.`);
}
catch (error) {
    const detail = error instanceof assert.AssertionError ? error.message.split(/\r?\n/, 1)[0] : 'Raw database/process details intentionally omitted.';
    console.error(`Stage 08 lead workspace checks failed during ${phase}: ${detail}`);
    process.exitCode = 1;
}
finally {
    try {
        for (const close of servers.reverse())
            await close();
        await database.close();
        if (ownsScratch) {
            await verifiedCluster();
            assert(/^ootla_demo_stage08_[a-f0-9]{32}$/.test(scratchName), 'Unexpected cleanup target.');
            const target = await owner.query<{
                owner: string;
            }>('SELECT pg_get_userbyid(datdba) AS owner FROM pg_database WHERE datname=$1', [scratchName]);
            assert(target.rowCount === 1 && target.rows[0]?.owner === 'ootla', 'Scratch ownership changed; refusing deletion.');
            const quoted = (await owner.query<{
                name: string;
            }>('SELECT quote_ident($1) AS name', [scratchName])).rows[0]!.name;
            await owner.query(`DROP DATABASE ${quoted}`);
            assert.equal((await owner.query('SELECT 1 FROM pg_database WHERE datname=$1', [scratchName])).rowCount, 0);
            console.log('PASS removed only the owned Stage 08 scratch database; retained demo data was never modified');
        }
    }
    catch {
        console.error('Stage 08 owned scratch cleanup failed. No unrelated database deletion was attempted.');
        process.exitCode = 1;
    }
    finally {
        if (ownerConnected)
            await owner.end();
    }
}
