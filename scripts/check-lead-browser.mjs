import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';

// By default this check reads the retained local demo only. Record creation and
// editing require a separately provisioned owned Stage 07 scratch database and
// preview. Never point the mutation mode at the retained review environment.
const base = new URL(process.env.OOTLA_CHECK_URL || 'http://127.0.0.1:5173');
assert(base.protocol === 'http:' && base.hostname === '127.0.0.1' && base.port, 'Use an explicit project-owned loopback preview.');
const scratchName = process.env.OOTLA_CHECK_DATABASE || '';
const mutate = Boolean(scratchName);
if (mutate) {
  assert(/^ootla_demo_stage07_browser_[a-f0-9]{32}$/.test(scratchName), 'Record writes require the uniquely owned Stage 07 browser scratch database name.');
  assert(base.port !== '5173' && base.port !== '3100', 'Never mutate the retained preview or retained API.');
}
const browser = await chromium.launch({ headless: true, channel: process.env.OOTLA_BROWSER_CHANNEL || 'chrome' });
const context = await browser.newContext({ viewport: { width: 1586, height: 1050 }, reducedMotion: 'reduce' });
const page = await context.newPage();
page.setDefaultTimeout(15000);
const errors = [], external = [], mutations = [], legacyDemoReads = [], leadQueries = [], pending = [];
let phase = 'leads', signedIn = false, groups = 0;
const pass = title => { groups += 1; console.log('PASS ' + title); };
page.on('pageerror', issue => errors.push(issue.message));
page.on('request', request => {
  const url = new URL(request.url());
  if (/^https?:$/.test(url.protocol) && url.origin !== base.origin) external.push(url.origin + url.pathname);
  if (!['GET','HEAD','OPTIONS'].includes(request.method())) mutations.push(request.method() + ' ' + url.pathname);
  if (phase === 'leads' && url.pathname === '/api/demo/data') legacyDemoReads.push(url.pathname);
  if (url.pathname === '/api/leads') leadQueries.push(url.search);
});
page.on('response', response => {
  const url = new URL(response.url());
  if (response.request().method() !== 'GET' || !url.pathname.startsWith('/api/leads') || response.status() !== 200) return;
  pending.push((async () => {
    const data = await response.json();
    if (Array.isArray(data.items)) assert(data.items.length <= 100, 'Lead page stays bounded.');
    if (data.events?.items) assert(data.events.items.length <= 100, 'Lead history stays bounded.');
    if (data.owners) { assert(data.owners.length <= 25); assert(data.units.length <= 25); assert(data.properties.length <= 25); }
  })());
});
await mkdir('.local/screenshots', { recursive: true });
async function go(path) {
  const response = await page.goto(new URL(path, base).href);
  assert.equal(response?.status(), 200);
  await expect(page.locator('[data-lead-workspace]')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
}
async function read(path) {
  const response = await page.request.get(new URL(path, base).href);
  assert.equal(response.status(), 200, path);
  return response.json();
}
async function labels() {
  const absent = await page.locator('[data-lead-workspace]').evaluate(root => [...root.querySelectorAll('input,select,textarea')].filter(control => control.type !== 'hidden' && !control.labels?.length && !control.getAttribute('aria-label')).map(control => control.id || control.name));
  assert.deepEqual(absent, [], 'Every Stage 07 control has a native label.');
}
async function noOverflow(width, path) {
  const size = await page.evaluate(() => ({ full: document.documentElement.scrollWidth, view: innerWidth }));
  assert(size.full <= size.view + 1, path + ' overflow at ' + width + 'px: ' + JSON.stringify(size));
}
async function signOut() {
  await page.getByRole('button', { name: 'Account menu', exact: true }).click();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/login$/);
  signedIn = false;
}
try {
  await page.goto(new URL('/admin/leads', base).href);
  await expect(page).toHaveURL(/\/admin\/login\?returnTo=/);
  await page.getByRole('button', { name: 'Fill demo credentials', exact: true }).click();
  await expect(page.getByLabel('Password', { exact: true })).toHaveAttribute('type', 'password');
  assert.equal(mutations.length, 0, 'Credential filling does not authenticate.');
  await page.getByRole('button', { name: /Sign in/ }).click();
  await expect(page.locator('[data-lead-workspace]')).toBeVisible(); signedIn = true;
  const baseline = await read('/api/leads?pageSize=25');
  assert(baseline.items.length >= 3, 'Existing saved demo leads remain available.');
  const properties = await read('/api/property-foundation/properties?pageSize=25');
  const primary = properties.items.find(item => item.name === 'Harbor House') ?? properties.items[0];
  const secondary = properties.items.find(item => item.id !== primary.id);
  assert(primary && secondary);
  const initialContacts = await read('/api/property-foundation/contacts?pageSize=1');
  await expect(page.locator('[data-lead-record]')).toHaveCount(baseline.items.length);
  await labels();
  assert.equal(legacyDemoReads.length, 0, 'Lead views do not load the entire legacy demo payload.');
  pass('normal database-backed login; persisted leads; bounded API; accessible labels');

  await page.locator('[data-lead-workspace]').getByLabel('Search leads', { exact: true }).fill('Maya');
  await page.getByRole('button', { name: 'Apply filters', exact: true }).click();
  await expect(page).toHaveURL(/q=Maya/);
  await expect(page.locator('[data-lead-record]')).toHaveCount(1);
  assert(leadQueries.some(query => /q=Maya/.test(query)), 'Search reaches the backend.');
  await page.getByRole('link', { name: 'Clear filters', exact: true }).click();
  await page.getByLabel('Leads per page', { exact: true }).selectOption('1');
  await page.getByLabel('Sort by', { exact: true }).selectOption('name_asc');
  await page.getByRole('button', { name: 'Apply filters', exact: true }).click();
  await expect(page.locator('[data-lead-record]')).toHaveCount(1);
  const first = await page.locator('[data-lead-record]').getAttribute('data-lead-record');
  await page.getByRole('navigation', { name: 'Lead directory pagination', exact: true }).getByRole('link', { name: 'Next', exact: true }).click();
  assert.notEqual(await page.locator('[data-lead-record]').getAttribute('data-lead-record'), first);
  await page.getByRole('link', { name: 'Board view', exact: true }).click();
  await expect(page.locator('[data-lead-record]')).toHaveCount(1);
  await expect(page.getByText('Board cards show only this server page', { exact: false })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Leasing pipeline', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Sales pipeline', exact: true })).toBeVisible();
  pass('server search, sorting and pagination; board pages distinguish column totals from loaded cards');

  let detailId = baseline.items[0].id;
  if (mutate) {
    const unique = randomUUID().slice(0, 8);
    const name = 'Stage 07 Browser ' + unique;
    const email = 'stage07-browser-' + unique + '@example.test';
    await go('/admin/leads?view=new');
    await page.getByRole('link', { name: 'Choose ' + primary.name, exact: true }).click();
    await expect(page.locator('[data-lead-form="create"]')).toBeVisible();
    assert.equal(await page.locator('[data-lead-form="create"]').evaluate(form => form.checkValidity()), false, 'Required contact name prevents an empty lead.');
    const options = await read('/api/leads/options?' + new URLSearchParams({ propertyId: primary.id, pageSize: '25' }));
    const owner = options.owners.find(item => item.name === 'Stage 07 Browser Agent') ?? options.owners[0];
    assert(owner, 'The scratch environment has an eligible assigned owner.');
    await page.getByLabel('Contact full name', { exact: true }).fill(name);
    await page.getByLabel('Contact email (optional)', { exact: true }).fill(email);
    await page.getByLabel('Contact phone (optional)', { exact: true }).fill('+15550007007');
    await page.getByRole('button', { name: 'Check duplicate suggestions', exact: true }).click();
    await expect(page.locator('[data-duplicate-results]')).toContainText('possible matches');
    await page.getByLabel('Lead owner', { exact: true }).selectOption(owner.membershipId);
    await page.getByLabel('Lead source', { exact: true }).selectOption('referral');
    await page.getByLabel('Preferred bedrooms (optional)', { exact: true }).fill('2');
    await page.getByLabel('Minimum budget (optional)', { exact: true }).fill('1200');
    await page.getByLabel('Maximum budget (optional)', { exact: true }).fill('2500');
    await page.getByLabel('Next action', { exact: true }).fill('Call to discuss property interests');
    await page.getByLabel('Next-action date and time', { exact: true }).fill('2027-01-12T14:30');
    await page.getByLabel('Preferred locations', { exact: true }).fill('Harbor, Oak');
    await page.getByLabel('Other preferences', { exact: true }).fill('A quiet workspace and a balcony.');
    await page.getByLabel('Staff notes', { exact: true }).fill('Owned browser scratch record; no outbound action.');
    await page.locator('input[name="interestPropertyIds"][value="' + secondary.id + '"]').check();
    await labels();
    await page.getByRole('button', { name: 'Create lead', exact: true }).click();
    await expect(page).toHaveURL(/lead=[a-f0-9-]+&saved=lead/);
    detailId = new URL(page.url()).searchParams.get('lead');
    let created = (await read('/api/leads/' + detailId)).lead;
    assert.equal(created.name, name); assert.equal(created.owner.membershipId, owner.membershipId);
    assert.equal(created.source, 'referral'); assert.equal(created.preferences.bedrooms, 2);
    assert.equal(created.preferences.budgetMin, 1200); assert.equal(created.interestPropertyIds.length, 2);
    assert(created.nextActionAt); assert.equal(created.stage, 'new_inquiry');
    await page.goto(new URL('/admin/leads?view=record&lead='+detailId,base).href); await expect(page.locator('[data-lead-workspace]')).toBeVisible();
    await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
    await expect(page.getByText(owner.name, { exact: true }).first()).toBeVisible();
    pass('create real lead with owner, source, two property interests, preferences and next-action date; refresh persistence');

    const editSummary = page.locator('#lead-editor > summary');
    await editSummary.focus(); await page.keyboard.press('Enter');
    await page.keyboard.press('Tab'); await expect(page.getByLabel('Lead owner', { exact: true })).toBeFocused();
    const thirdProperty = properties.items.find(item => item.id !== primary.id && item.id !== secondary.id);
    if (thirdProperty) {
      await page.locator('input[name="interestPropertyIds"][value="' + thirdProperty.id + '"]').check();
      await page.getByRole('button', { name: 'Associate contact with selected properties', exact: true }).click();
      await expect(page.locator('[data-association-status]')).toContainText('Contact relationships saved');
      assert((await read('/api/property-foundation/contacts/' + created.contactId)).contact.propertyIds.includes(thirdProperty.id));
    }
    await page.getByLabel('Lead source', { exact: true }).selectOption('website');
    await page.getByLabel('Next action', { exact: true }).fill('Confirm the viewing request with staff');
    await page.getByRole('button', { name: 'Save lead', exact: true }).click();
    await expect(page.locator('[data-event-kind="lead_updated"]')).toHaveCount(1);
    await page.getByLabel('Next stage', { exact: true }).selectOption('contacted');
    await page.getByLabel('Reason or handoff note (optional)', { exact: true }).fill('Staff contacted this person in the scripted browser test.');
    await page.getByRole('button', { name: 'Change stage', exact: true }).click();
    await expect(page.locator('[data-event-kind="stage_changed"]')).toHaveCount(1);
    await page.goto(new URL('/admin/leads?view=record&lead='+detailId,base).href); await expect(page.locator('[data-lead-workspace]')).toBeVisible();
    created = (await read('/api/leads/' + detailId)).lead;
    assert.equal(created.stage, 'contacted'); assert.equal(created.source, 'website');
    if (thirdProperty) assert(created.interestPropertyIds.includes(thirdProperty.id), 'Explicitly associated additional property interest persists.');
    assert.equal(created.nextAction, 'Confirm the viewing request with staff');
    assert(!created.allowedStages.some(stage => stage.key === 'leased'), 'Leased is not offered without a verified milestone.');
    const denied = await page.request.patch(new URL('/api/leads/' + detailId + '/stage', base).href, { headers: { Origin: base.origin }, data: { version: created.version, stage: 'leased', reason: 'Testing milestone denial in owned scratch only.' } });
    assert.equal(denied.status(), 409, 'The backend rejects a forced leased transition.');
    assert.equal((await read('/api/leads/' + detailId)).lead.stage, 'contacted');
    const history = (await read('/api/leads/' + detailId)).events.items.find(event => event.kind === 'stage_changed');
    assert(history.actor.id && history.actor.name && history.occurredAt, 'Transition actor and timestamp persist.');
    const unifiedHistory = await read('/api/property-foundation/contacts/' + created.contactId + '/history?pageSize=25');
    assert(unifiedHistory.items.length <= 25, 'Unified contact history remains paginated.');
    assert(unifiedHistory.items.some(item => item.kind === 'activity' && item.summary.startsWith('Lead stage:') && item.summary.toLowerCase().includes('contacted') && item.summary.includes(history.actor.name) && item.occurredAt === history.occurredAt), 'The unified contact retains the real stage actor and timestamp.');
    pass('edit, keyboard access, actor/timestamp stage history, refresh and backend denial of unverified Leased');

    await go('/admin/leads?view=new&propertyId=' + primary.id);
    await page.getByLabel('Opportunity type', { exact: true }).selectOption('sales');
    await page.getByLabel('Contact full name', { exact: true }).fill(name);
    await page.getByLabel('Contact email (optional)', { exact: true }).fill(email);
    await page.getByRole('button', { name: 'Check duplicate suggestions', exact: true }).click();
    const suggestion = page.locator('.lw-suggestion').filter({ has: page.getByRole('heading', { name, exact: true }) });
    await expect(suggestion).toHaveCount(1);
    await suggestion.getByRole('button', { name: 'Use this existing contact', exact: true }).click();
    await expect(page.locator('[data-selected-contact]')).toContainText(name);
    await expect(page.getByLabel('Contact full name', { exact: true })).toBeDisabled();
    await page.getByRole('button', { name: 'Create lead', exact: true }).click();
    await expect(page).toHaveURL(/lead=[a-f0-9-]+&saved=lead/);
    const salesId = new URL(page.url()).searchParams.get('lead');
    const sales = (await read('/api/leads/' + salesId)).lead;
    assert.equal(sales.contactId, created.contactId, 'Explicit selection reuses one identity.');
    assert.equal(sales.intent, 'sales');
    assert(!sales.allowedStages.some(stage => /^application_|^staff_review$|^leased$/.test(stage.key)));
    assert.equal((await read('/api/property-foundation/contacts?pageSize=1')).total, initialContacts.total + 1, 'Two opportunities reuse one new contact without silent merging.');
    await go('/admin/leads?view=board&intent=sales&q=' + encodeURIComponent(name));
    const card = page.locator('[data-lead-record="' + salesId + '"]');
    await card.getByLabel('Move ' + name + ' to stage', { exact: true }).selectOption('contacted');
    await card.getByRole('button', { name: 'Change stage', exact: true }).click();
    await expect(page.locator('[data-board-stage="contacted"] [data-lead-record="' + salesId + '"]')).toBeVisible();
    assert.equal((await read('/api/leads/' + salesId)).lead.stage, 'contacted');
    pass('duplicate suggestions require explicit identity choice; independent sales pipeline; accessible board stage persistence');
  } else console.log('INFO read-only mode: create/edit/stage and duplicate-selection checks require the owned browser scratch environment.');

  const routes = [
    ['/admin/leads', 'list'], ['/admin/leads?view=board', 'board'],
    ['/admin/leads?view=record&lead=' + detailId, 'detail'], ['/admin/leads?view=new&propertyId=' + primary.id, 'create'],
  ];
  for (const width of [320, 390, 768, 1586]) {
    await page.setViewportSize({ width, height: width < 700 ? 900 : 1050 });
    for (const [path, name] of routes) {
      await go(path); await labels(); await noOverflow(width, path);
      if (width === 390 || (width === 1586 && name !== 'create')) await page.screenshot({ path: '.local/screenshots/stage07-' + name + '-' + (width === 390 ? 'mobile' : 'desktop') + '.png', fullPage: true });
    }
  }
  pass('list, board, detail and creation at 320/390/768/1586px; labeled controls and reduced-motion compatibility');

  phase = 'overview';
  await page.setViewportSize({ width: 1586, height: 1050 });
  await page.goto(new URL('/admin', base).href);
  await expect(page.locator('.b-summary .b-stat')).toHaveCount(4);
  await expect(page.locator('[data-pipeline]')).toBeVisible();
  await page.getByRole('link', { name: /Add lead/, exact: false }).click();
  await expect(page).toHaveURL(/\/admin\/leads\?view=new/);
  await expect(page.getByRole('heading', { name: 'Add a lead', exact: true })).toBeVisible();
  await page.goto(new URL('/admin', base).href);
  await expect(page.locator('[data-pipeline]')).toBeVisible();
  await page.getByRole('link', { name: 'Leads', exact: true }).click();
  await expect(page.locator('[data-lead-workspace]')).toBeVisible();
  await signOut();
  assert.equal((await page.request.get(new URL('/api/leads', base).href)).status(), 401);
  await Promise.all(pending);
  assert.deepEqual(errors, [], 'No uncaught client exceptions.');
  assert.deepEqual(external, [], 'No external requests or communications.');
  assert.deepEqual(legacyDemoReads, [], 'New lead pages never request the legacy whole demo payload.');
  if (!mutate) assert(mutations.every(item => /^POST \/api\/auth\/(login|logout)$/.test(item)), 'Read-only mode changes only its normal session.');
  pass('Bento overview keeps four metrics and pipeline; Add lead/Leads navigation works, logout denies API and no outbound actions');
  console.log('Stage 07 focused browser check: ' + groups + ' groups passed (' + (mutate ? 'owned scratch create/edit mode' : 'retained-demo read-only mode') + ').');
} finally {
  if (signedIn) { try { await page.request.post(new URL('/api/auth/logout', base).href, { headers: { Origin: base.origin } }); } catch {} }
  await context.close(); await browser.close();
}