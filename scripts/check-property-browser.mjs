import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';

// Stage 06: existing retained local demo, normal UI sign-in and read-only records.
// The only writes are this check's normal server session and its audit entries.
// No seed/reset, customer-record form submission, external request or provider call.
const base = new URL(process.env.OOTLA_CHECK_URL || 'http://127.0.0.1:5173');
assert(base.hostname === '127.0.0.1' && base.port === '5173', 'Use the project-owned local preview only.');
const browser = await chromium.launch({ headless: true, channel: process.env.OOTLA_BROWSER_CHANNEL || 'chrome' });
const context = await browser.newContext({ viewport: { width: 1586, height: 1050 }, reducedMotion: 'reduce' });
const page = await context.newPage();
page.setDefaultTimeout(12000);
const errors = [];
const external = [];
const mutationRequests = [];
const foundationRequests = [];
const demoDataRequests = [];
const responseChecks = [];
let phase = 'foundation';
let signedIn = false;
let passed = 0;
const pass = title => { passed += 1; console.log('PASS ' + title); };
page.on('pageerror', error => errors.push(error.message));
page.on('request', request => {
  const url = new URL(request.url());
  if (/^https?:$/.test(url.protocol) && url.origin !== base.origin) external.push(url.origin + url.pathname);
  if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) mutationRequests.push(request.method() + ' ' + url.pathname);
  if (phase === 'foundation' && url.pathname === '/api/demo/data') demoDataRequests.push(url.pathname);
  if (url.pathname.startsWith('/api/property-foundation')) foundationRequests.push(url.pathname + url.search);
});
page.on('response', response => {
  const url = new URL(response.url());
  if (!url.pathname.startsWith('/api/property-foundation') || response.request().method() !== 'GET') return;
  responseChecks.push((async () => {
    assert.equal(response.status(), 200, 'The bounded foundation read succeeds: ' + url.pathname);
    const body = await response.json();
    if (Array.isArray(body.items)) assert(body.items.length <= 100, 'A directory/group response stays bounded.');
    for (const key of ['units', 'leads', 'history']) if (body[key]?.items) assert(body[key].items.length <= 100, key + ' stays bounded.');
    if (body.staff) assert(body.staff.length <= 50, 'Assigned staff stay bounded.');
  })());
});
await mkdir('.local/screenshots', { recursive: true });
async function go(path) {
  const response = await page.goto(new URL(path, base).href);
  assert.equal(response?.status(), 200);
  await expect(page.locator('[data-property-workspace]')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
}
async function read(path) {
  const response = await page.request.get(new URL(path, base).href);
  assert.equal(response.status(), 200);
  return response.json();
}
async function noOverflow(width, path) {
  const size = await page.evaluate(() => ({ full: document.documentElement.scrollWidth, view: innerWidth }));
  assert(size.full <= size.view + 1, path + ' overflows at ' + width + 'px: ' + JSON.stringify(size));
}
async function labels() {
  const missing = await page.locator('[data-property-workspace]').evaluate(root => [...root.querySelectorAll('input,select,textarea')].filter(input => input.type !== 'hidden' && !input.labels?.length && !input.getAttribute('aria-label')).map(input => input.id || input.name));
  assert.deepEqual(missing, [], 'Every new form control has an accessible label.');
}
async function logOut() {
  await page.goto(new URL('/admin/properties', base).href);
  await expect(page.locator('[data-property-workspace]')).toBeVisible();
  await page.getByRole('button', { name: 'Account menu', exact: true }).click();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page).toHaveURL(new URL('/admin/login', base).href);
  signedIn = false;
}
try {
  await page.goto(new URL('/admin/properties', base).href);
  await expect(page).toHaveURL(/\/admin\/login\?returnTo=/);
  await page.getByRole('button', { name: 'Fill demo credentials', exact: true }).click();
  await expect(page.getByLabel('Email address')).toHaveValue('admin@demo.ootla.test');
  await expect(page.getByLabel('Password', { exact: true })).toHaveAttribute('type', 'password');
  assert.equal(mutationRequests.length, 0, 'Fill does not authenticate.');
  await page.getByRole('button', { name: /Sign in/ }).click();
  await expect(page.locator('[data-property-workspace]')).toBeVisible();
  signedIn = true;
  await expect(page.locator('#workspace-title')).toHaveText('Properties');
  const baseline = await read('/api/property-foundation/properties?pageSize=25');
  assert.equal(baseline.total, 3, 'The retained demo has three distinct properties.');
  assert.equal(baseline.items.reduce((sum, item) => sum + item.unitCount, 0), 6, 'The six retained units are counted separately.');
  await expect(page.locator('[data-property-record]')).toHaveCount(3);
  assert.equal(demoDataRequests.length, 0, 'Properties does not download the entire legacy demo payload.');
  pass('normal database-backed login; three properties and six separate units; bounded API');

  const createSummary = page.locator('#property-editor > summary');
  await createSummary.focus(); await page.keyboard.press('Enter');
  await expect(page.getByLabel('Property name', { exact: true })).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Property name', { exact: true })).toBeFocused();
  assert.equal(await page.locator('#property-editor form').evaluate(form => form.checkValidity()), false, 'Empty required name prevents creation.');
  await createSummary.focus(); await page.keyboard.press('Enter');
  await labels();
  await page.getByLabel('Search properties', { exact: true }).fill('Harbor');
  await page.getByRole('button', { name: 'Apply filters', exact: true }).click();
  await expect(page).toHaveURL(/q=Harbor/);
  await expect(page.locator('[data-property-record]')).toHaveCount(1);
  assert(foundationRequests.some(path => /\/properties\?.*q=Harbor/.test(path)), 'Search is sent to the server.');
  await page.getByRole('link', { name: 'Clear filters', exact: true }).click();
  await expect(page.locator('[data-property-record]')).toHaveCount(3);
  await page.getByLabel('Sort by', { exact: true }).selectOption('name_desc');
  await page.getByLabel('Properties per page', { exact: true }).selectOption('1');
  await page.getByRole('button', { name: 'Apply filters', exact: true }).click();
  await expect(page).toHaveURL(/sort=name_desc/);
  await expect(page.locator('[data-property-record]')).toHaveCount(1);
  const firstId = await page.locator('[data-property-record]').getAttribute('data-property-record');
  await page.getByRole('navigation', { name: 'Directory pagination', exact: true }).getByRole('link', { name: 'Next', exact: true }).click();
  await expect(page).toHaveURL(/page=2/);
  await expect(page.locator('[data-property-record]')).toHaveCount(1);
  assert.notEqual(await page.locator('[data-property-record]').getAttribute('data-property-record'), firstId);
  assert(foundationRequests.some(path => /pageSize=1/.test(path) && /page=2/.test(path)), 'Next requests the next server page.');
  const property = baseline.items[0];
  await go('/admin/properties?city=' + encodeURIComponent(property.city));
  assert((await page.locator('[data-property-record]').count()) >= 1);
  await expect(page.locator('#property-city-filter')).toHaveValue(property.city);
  await go('/admin/properties?availability=unverified');
  await expect(page.getByLabel('Availability', { exact: true })).toHaveValue('unverified');
  pass('keyboard disclosures, required fields, server search/filters/sorting, distinct paginated results');

  const propertyDetailPath = '/admin/properties?property=' + encodeURIComponent(property.id);
  await go(propertyDetailPath);
  const propertyDetail = await read('/api/property-foundation/properties/' + property.id);
  await expect(page.locator('.pw-heading h2')).toHaveText(property.name);
  await expect(page.getByRole('heading', { name: 'Units', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Assigned staff', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Related leads', exact: true })).toBeVisible();
  await expect(page.locator('[data-unit-record]')).toHaveCount(propertyDetail.units.items.length);
  assert(propertyDetail.units.items.every(unit => unit.propertyId === property.id), 'Units remain related to the actual property.');
  for (const unit of propertyDetail.units.items) {
    const row = page.locator('[data-unit-record="' + unit.id + '"]');
    await expect(row).toContainText(unit.label);
    if (unit.lastVerifiedAt === null) await expect(row).toContainText('Not verified');
  }
  await page.getByText('Add a unit', { exact: true }).click();
  await expect(page.getByLabel('Unit label', { exact: true }).first()).toBeVisible();
  await expect(page.locator('input[name="verifyAvailability"]').first()).not.toBeChecked();
  assert.equal(await page.locator('#unit-editor-new form').evaluate(form => form.checkValidity()), false, 'The empty unit label prevents creation.');
  await page.getByText('Add a unit', { exact: true }).click();
  await labels();
  const related = propertyDetail.leads.items.find(lead => lead.contactId);
  assert(related, 'An existing lead has a canonical contact relationship.');
  await page.getByRole('link', { name: 'Open unified contact', exact: true }).first().click();
  await expect(page).toHaveURL(new RegExp('contact=' + related.contactId));
  const contactDetailPath = '/admin/contacts?contact=' + encodeURIComponent(related.contactId);
  const contactDetail = await read('/api/property-foundation/contacts/' + related.contactId);
  await expect(page.locator('.pw-heading h2')).toHaveText(contactDetail.contact.displayName);
  const beforeHistory = await page.locator('[data-contact-history]').allTextContents();
  assert(beforeHistory.length > 0, 'The canonical contact exposes retained related history.');
  assert(contactDetail.history.items.some(item => item.kind === 'lead' && item.propertyId === property.id));
  await page.reload();
  await expect(page.locator('[data-property-workspace]')).toBeVisible();
  assert.deepEqual(await page.locator('[data-contact-history]').allTextContents(), beforeHistory, 'Refresh preserves the exact canonical relationship history.');
  assert.equal(new URL(page.url()).searchParams.get('contact'), related.contactId);
  await labels();
  pass('persisted unit/property links, availability provenance, assigned staff, canonical contact/history and refresh');

  await go('/admin/contacts');
  await expect(page.locator('[data-contact-record]')).toHaveCount(3);
  await page.getByLabel('Name, email or phone', { exact: true }).fill('Maya');
  await page.getByRole('button', { name: 'Search contacts', exact: true }).click();
  await expect(page).toHaveURL(/q=Maya/);
  await expect(page.locator('[data-contact-record]')).toHaveCount(1);
  await expect(page.locator('[data-contact-record]')).toContainText('Maya Chen');
  await go('/admin/contacts?pageSize=1');
  await expect(page.locator('[data-contact-record]')).toHaveCount(1);
  const firstContact = await page.locator('[data-contact-record]').getAttribute('data-contact-record');
  await page.getByRole('navigation', { name: 'Directory pagination', exact: true }).getByRole('link', { name: 'Next', exact: true }).click();
  await expect(page).toHaveURL(/page=2/);
  await expect(page.locator('[data-contact-record]')).toHaveCount(1);
  assert.notEqual(await page.locator('[data-contact-record]').getAttribute('data-contact-record'), firstContact);
  await page.getByText('Add a contact', { exact: true }).click();
  await expect(page.getByLabel('Full name', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Property associated with this contact', { exact: true })).toHaveAttribute('required', '');
  assert.equal(await page.locator('form[data-created="contact"]').evaluate(form => form.checkValidity()), false);
  await labels();
  pass('contact search/pagination, explicit property association, identity form labels and native validation');

  const routes = [['/admin/properties', 'properties'], [propertyDetailPath, 'detail'], [contactDetailPath, 'contact'], ['/admin/contacts', 'contacts']];
  for (const width of [320, 390, 768, 1586]) {
    await page.setViewportSize({ width, height: width < 700 ? 844 : 1050 });
    for (const [route, slug] of routes) {
      await go(route); await noOverflow(width, route); await labels();
      if ((width === 390 || width === 1586) && slug !== 'contacts') await page.screenshot({ path: '.local/screenshots/stage06-' + slug + '-' + (width === 390 ? 'mobile' : 'desktop') + '.png', fullPage: true });
    }
  }
  pass('responsive property/detail/contact layouts at 320/390/768/1586px with labeled keyboard controls');

  phase = 'overview';
  await page.goto(new URL('/admin', base).href);
  await expect(page.locator('#workspace-title')).toContainText('Demo');
  await expect(page.locator('.b-summary .b-stat')).toHaveCount(4);
  await expect(page.locator('.b-summary .b-stat>span')).toHaveText(['New leads', 'Tours booked', 'Applications', 'Leases signed']);
  await expect(page.locator('[data-pipeline]')).toBeVisible();
  phase = 'foundation';
  await logOut();
  const denied = await page.request.get(new URL('/api/property-foundation/properties', base).href);
  assert.equal(denied.status(), 401, 'Logout revokes access to the new protected endpoints.');
  await page.goto(new URL('/admin/contacts', base).href);
  await expect(page).toHaveURL(/\/admin\/login\?returnTo=/);
  // Wait for all captured response assertions before checking final privacy invariants.
  await Promise.all(responseChecks);
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  assert.deepEqual(demoDataRequests, [], 'Foundation routes never download the full demo record set.');
  assert.deepEqual(mutationRequests, ['POST /api/auth/login', 'POST /api/auth/logout'], 'Only this test session is created and revoked.');
  assert(foundationRequests.length > 0);
  pass('approved overview preserved, logout/anonymous denial, bounded reads, no customer writes or external requests');
  console.log('Stage 06 property browser: ' + passed + ' focused groups passed.');
} finally {
  if (signedIn) {
    try { await page.request.post(new URL('/api/auth/logout', base).href, { headers: { Origin: base.origin } }); }
    catch { /* Browser closure is still guaranteed below; root reports any failed phase. */ }
  }
  await context.close();
  await browser.close();
}