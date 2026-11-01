import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { createApp } from '../server/app.js';
import { loadConfig } from '../server/config/env.js';
import { Database } from '../server/db/pool.js';
import { requireIsolatedDemo } from '../server/services/demo-environment.js';
import { hashPassword } from '../server/services/passwords.js';
import type { AdminOverview, DashboardPeriod } from '../shared/contracts.js';

// Only uniquely owned fixtures are written and removed. No seed, reset, or retained record update.
const source = loadConfig();
const databaseUrl = new URL(source.databaseUrl);
assert(source.demoMode && !source.production && databaseUrl.hostname === '127.0.0.1' && databaseUrl.port === '55439'
  && databaseUrl.username === 'ootla' && !databaseUrl.search && !databaseUrl.hash,
  'Run dashboard checks only against the project-owned isolated local demo database.');
const config = { ...source, nodeEnv: 'test' as const, production: false, appUrl: 'http://ootla.test' };
const database = new Database(config);
const runId = randomUUID();
const organizationIds = [randomUUID(), randomUUID()];
const userIds = [randomUUID(), randomUUID()];
const membershipIds = [randomUUID(), randomUUID()];
const propertyIds = [randomUUID(), randomUUID(), randomUUID()];
const password = `Dashboard-${randomUUID()}!`;
const emails = userIds.map((id) => `stage04-${id}@demo.ootla.test`);
let ownsFixtures = false;
let groups = 0;
let phase = 'local database isolation';
let closeApi: (() => Promise<void>) | undefined;
let before: Record<string, string> | undefined;
const pass = (label: string) => { groups += 1; console.log(`PASS ${label}`); };

async function snapshot(): Promise<Record<string, string>> {
  const hashes: Record<string, string> = {};
  // Fixed internal table allowlist. Fingerprints prevent logging retained data or password hashes.
  for (const table of ['organizations', 'users', 'organization_memberships', 'properties', 'units', 'leads', 'tasks', 'viewings', 'lead_activities', 'demo_seed_records']) {
    hashes[table] = (await database.query<{ hash: string }>(
      `SELECT md5(COALESCE(json_agg(t ORDER BY t::text)::text,'[]')) AS hash FROM (SELECT * FROM ${table}) t`,
    )).rows[0]!.hash;
  }
  return hashes;
}
async function start() {
  const db = new Database(config);
  const app = createApp(config, db);
  const server = await new Promise<ReturnType<typeof app.listen>>((resolve, reject) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
    listener.once('error', reject);
  });
  closeApi = async () => {
    server.closeIdleConnections();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await db.close();
  };
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return {
    request: (route: string, cookie = '') => fetch(base + route, { headers: cookie ? { Cookie: cookie } : {} }),
    login: async (index: number) => {
      const response = await fetch(base + '/api/auth/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Origin: config.appUrl },
        body: JSON.stringify({ email: emails[index], password }),
      });
      assert.equal(response.status, 200, 'Normal database-backed fixture login failed.');
      const cookie = response.headers.get('set-cookie')?.split(';')[0];
      assert(cookie, 'Expected the normal server session cookie.');
      return cookie;
    },
  };
}

type RecordFixture = { organizationId: string; propertyId: string; createdAt: Date; status?: string };
const leadFixtures: RecordFixture[] = [];
const viewingFixtures: RecordFixture[] = [];

try {
  assert.equal(await database.state(), 'ready', 'Apply the existing migrations before this check.');
  await requireIsolatedDemo(config, database);
  before = await snapshot();
  const dates = (await database.query<{ now: Date; month: Date; week: Date }>(`
    SELECT NOW() AS now,
      date_trunc('month',NOW() AT TIME ZONE 'Africa/Lagos') AT TIME ZONE 'Africa/Lagos' AS month,
      date_trunc('week',NOW() AT TIME ZONE 'Africa/Lagos') AT TIME ZONE 'Africa/Lagos' AS week
  `)).rows[0]!;
  // Millisecond precision keeps exact-boundary fixtures meaningful when serialized through JS dates.
  assert.equal(dates.month.getUTCHours(), 23, 'Lagos midnight must be the preceding UTC 23:00.');
  assert.equal(dates.week.getUTCHours(), 23);
  const fixtureDates = [
    new Date(dates.now.getTime() - 1_000), dates.month, new Date(dates.month.getTime() - 1),
    dates.week, new Date(dates.week.getTime() - 1), new Date(dates.now.getTime() + 7 * 86_400_000),
  ];
  phase = 'owned record fixtures';
  const passwordHash = await hashPassword(password);
  await database.transaction(async (client) => {
    for (const [index, id] of organizationIds.entries()) {
      await client.query("INSERT INTO organizations(id,name,slug,environment) VALUES($1,$2,$3,'demo')",
        [id, `Stage 04 dashboard ${index}`, `stage04-${runId}-${index}`]);
    }
    for (const [index, id] of userIds.entries()) {
      await client.query('INSERT INTO users(id,email,display_name,password_hash) VALUES($1,$2,$3,$4)',
        [id, emails[index], `Stage 04 ${index === 0 ? 'administrator' : 'agent'}`, passwordHash]);
      await client.query('INSERT INTO organization_memberships(id,organization_id,user_id,role) VALUES($1,$2,$3,$4)',
        [membershipIds[index], organizationIds[0], id, index === 0 ? 'organization_admin' : 'leasing_agent']);
    }
    for (const [index, id] of propertyIds.entries()) {
      await client.query('INSERT INTO properties(id,organization_id,name) VALUES($1,$2,$3)',
        [id, organizationIds[index === 2 ? 1 : 0], `Stage 04 ${index}`]);
    }
    await client.query('INSERT INTO property_access_assignments(organization_id,membership_id,property_id) VALUES($1,$2,$3)',
      [organizationIds[0], membershipIds[1], propertyIds[0]]);
    for (const [propertyIndex, propertyId] of propertyIds.entries()) {
      const organizationId = organizationIds[propertyIndex === 2 ? 1 : 0]!;
      for (const [dateIndex, createdAt] of fixtureDates.entries()) {
        const leadId = randomUUID();
        await client.query(`INSERT INTO leads(id,organization_id,property_id,display_name,email,status,intent,created_at)
          VALUES($1,$2,$3,$4,$5,'new','leasing',$6)`,
          [leadId, organizationId, propertyId, `Stage 04 boundary ${dateIndex}`, `lead-${leadId}@example.test`, createdAt]);
        leadFixtures.push({ organizationId, propertyId, createdAt });
        const status = dateIndex === 0 ? 'completed' : 'scheduled';
        await client.query(`INSERT INTO viewings(id,organization_id,property_id,lead_id,starts_at,status,created_at)
          VALUES($1,$2,$3,$4,$5,$6,$7)`,
          [randomUUID(), organizationId, propertyId, leadId, new Date(dates.now.getTime() + 86_400_000), status, createdAt]);
        viewingFixtures.push({ organizationId, propertyId, createdAt, status });
        if (dateIndex === 0) {
          // A cancelled viewing must never inflate Tours booked.
          await client.query(`INSERT INTO viewings(id,organization_id,property_id,lead_id,starts_at,status,created_at)
            VALUES($1,$2,$3,$4,$5,'cancelled',$6)`,
            [randomUUID(), organizationId, propertyId, leadId, dates.now, createdAt]);
          viewingFixtures.push({ organizationId, propertyId, createdAt, status: 'cancelled' });
        }
      }
    }
  });
  ownsFixtures = true;
  const api = await start();
  const admin = await api.login(0);
  const agent = await api.login(1);
  const expected = (rows: RecordFixture[], period: DashboardPeriod, assignedOnly = false) => rows.filter((row) => {
    const start = period === 'all' ? null : dates[period];
    return row.organizationId === organizationIds[0] && (!assignedOnly || row.propertyId === propertyIds[0])
      && row.status !== 'cancelled' && (!start || row.createdAt >= start && row.createdAt <= dates.now);
  }).length;
  phase = 'database-backed period metrics';
  for (const period of ['month', 'week', 'all'] as const) {
    const response = await api.request(`/api/admin/overview?period=${period}`, admin);
    assert.equal(response.status, 200);
    const overview = await response.json() as AdminOverview;
    assert.deepEqual(overview.dashboard, {
      period, timeZone: 'Africa/Lagos',
      metrics: { newLeads: expected(leadFixtures, period), toursBooked: expected(viewingFixtures, period), applications: 0, leasesSigned: 0 },
    }, `Incorrect administrator metrics for ${period}.`);
    assert.deepEqual(overview.counts, { leads: 12, properties: 2, tasks: 0, applications: 0 }, 'Legacy count contracts must remain unchanged.');
    const scopedResponse = await api.request(`/api/organizations/${organizationIds[0]}/overview?period=${period}`, admin);
    assert.equal(scopedResponse.status, 200);
    assert.deepEqual((await scopedResponse.json() as AdminOverview).dashboard, overview.dashboard);
  }
  pass('Lagos month/week boundaries, all-time records, future-date exclusion and cancelled tours use persisted records');
  phase = 'property and organization permissions';
  for (const period of ['month', 'week', 'all'] as const) {
    const response = await api.request(`/api/admin/overview?period=${period}`, agent);
    assert.equal(response.status, 200);
    const overview = await response.json() as AdminOverview;
    assert.deepEqual(overview.dashboard.metrics, {
      newLeads: expected(leadFixtures, period, true), toursBooked: expected(viewingFixtures, period, true), applications: 0, leasesSigned: 0,
    });
    assert.equal(overview.counts.leads, 6);
  }
  assert.equal((await api.request(`/api/organizations/${organizationIds[1]}/overview?period=all`, admin)).status, 403);
  assert.equal((await api.request(`/api/organizations/${organizationIds[1]}/overview?period=all`, agent)).status, 403);
  pass('organization isolation and assigned-property permissions apply to every metric period');
  phase = 'period validation and normal authentication';
  const defaultOverview = await (await api.request('/api/admin/overview', admin)).json() as AdminOverview;
  assert.equal(defaultOverview.dashboard.period, 'month');
  for (const suffix of ['?period=invalid', '?period=', '?period=week&period=all', '?period=MONTH']) {
    assert.equal((await api.request(`/api/admin/overview${suffix}`, admin)).status, 400, `Invalid period accepted: ${suffix}`);
    assert.equal((await api.request(`/api/organizations/${organizationIds[0]}/overview${suffix}`, admin)).status, 400);
  }
  assert.equal((await api.request('/api/admin/overview?period=month')).status, 401);
  assert.equal((await api.request(`/api/organizations/${organizationIds[0]}/overview?period=all`)).status, 401);
  pass('authenticated period validation, month default, unconfigured metrics and legacy response compatibility');
} catch {
  console.error(`FAIL Stage 04 dashboard check during ${phase}. Raw database and credential details are omitted.`);
  process.exitCode = 1;
} finally {
  let cleanupFailed = false;
  try { await closeApi?.(); } catch { cleanupFailed = true; }
  try {
    if (ownsFixtures) {
      await database.transaction(async (client) => {
        try{
        await client.query('DELETE FROM audit_events WHERE organization_id=ANY($1::uuid[]) OR actor_user_id=ANY($2::uuid[])', [organizationIds, userIds]);
        await client.query('DELETE FROM viewings WHERE organization_id=ANY($1::uuid[])', [organizationIds]);
        await client.query('DELETE FROM lead_stage_observations WHERE organization_id=ANY($1::uuid[])',[organizationIds]);
        await client.query('DELETE FROM leads WHERE organization_id=ANY($1::uuid[])', [organizationIds]);
        await client.query('DELETE FROM contact_property_links WHERE organization_id=ANY($1::uuid[])',[organizationIds]);
        await client.query('DELETE FROM contacts WHERE organization_id=ANY($1::uuid[])',[organizationIds]);
        await client.query('DELETE FROM properties WHERE organization_id=ANY($1::uuid[])',[organizationIds]);
        await client.query('DELETE FROM users WHERE id=ANY($1::uuid[])', [userIds]);
        await client.query('DELETE FROM organizations WHERE id=ANY($1::uuid[])', [organizationIds]);
        }catch(error){console.error('Fixture constraint:',(error as {constraint?:string}).constraint,(error as {code?:string}).code);throw error;}
      });
      assert.equal((await database.query('SELECT id FROM organizations WHERE id=ANY($1::uuid[])', [organizationIds])).rowCount, 0);
    }
    if (before) assert.deepEqual(await snapshot(), before, 'Retained identities and portfolio records must remain unchanged.');
    pass('owned fixture cleanup preserves all retained identities, password hashes and portfolio records');
  } catch(error) { console.error('Cleanup detail:',error instanceof Error?error.message.split('\n')[0]:'Unknown'); cleanupFailed = true; }
  await database.close();
  if (cleanupFailed) {
    console.error('FAIL Stage 04 dashboard fixture cleanup or preservation check.');
    process.exitCode = 1;
  }
}
if (!process.exitCode) console.log(`Stage 04 dashboard checks complete: ${groups} groups passed.`);

