import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';

const retained = new URL(process.env.APP_URL || 'http://127.0.0.1:7673');
const base = new URL(process.env.OOTLA_CHECK_URL || retained.href);
assert(base.protocol === 'http:' && base.hostname === '127.0.0.1' && base.port, 'Use the owned loopback preview.');
const scratch = process.env.OOTLA_CHECK_DATABASE || '', mutate = Boolean(scratch);
if (mutate) {
  assert(/^ootla_demo_stage10_browser_[a-f0-9]{32}$/.test(scratch), 'Writes require a uniquely owned Stage 10 browser database.');
  assert(!['5173', '7673', '3100'].includes(base.port));
  assert.notEqual(base.origin, retained.origin, 'Never mutate the retained configured origin.');
}
const browser = await chromium.launch({ headless: true, channel: process.env.OOTLA_BROWSER_CHANNEL || 'chrome' });
const context = await browser.newContext({ viewport: { width: 1586, height: 1050 }, reducedMotion: 'reduce' });
const page = await context.newPage(); page.setDefaultTimeout(18000);
const issues = [], external = [], mutations = [], unbounded = [], legacy = [], pending = [];
let signedIn = false, groups = 0, phase = 'imports';
const url = path => new URL(path, base).href;
const pass = text => { groups += 1; console.log('PASS ' + text); };
const workspace = () => page.locator('[data-import-workspace]');
page.on('pageerror', error => issues.push(error.message));
page.on('request', request => {
  const target = new URL(request.url());
  if (/^https?:$/.test(target.protocol) && target.origin !== base.origin) external.push(target.origin + target.pathname);
  if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) mutations.push(request.method() + ' ' + target.pathname);
  if (phase === 'imports' && target.pathname === '/api/demo/data') legacy.push(target.pathname);
});
page.on('response', response => {
  const target = new URL(response.url());
  if (response.status() !== 200 || !target.pathname.startsWith('/api/imports')) return;
  if ((response.headers()['content-type'] || '').includes('application/json')) pending.push((async () => {
    let body;
    try { body = await response.json(); }
    catch (error) { if (/No resource with given identifier|Response body is not available|Target.*closed/.test(error.message)) return; issues.push(error.message); return; }
    for (const list of [body, body.rows]) if (list?.items?.length > 100) unbounded.push(target.pathname);
  })());
});
async function read(path) { const response = await page.request.get(url(path)); assert.equal(response.status(), 200, path); return response.json(); }
async function go(query = '') { phase = 'imports'; await page.goto(url('/admin/imports' + query)); await expect(workspace()).toBeVisible(); }
async function labels() {
  assert.deepEqual(await workspace().evaluate(root => [...root.querySelectorAll('input,select,textarea')].filter(item => item.type !== 'hidden' && !item.labels?.length && !item.getAttribute('aria-label')).map(item => item.id || item.name)), []);
}
function parseCsv(text) {
  const rows = []; let row = [], cell = '', quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"') { if (quoted && text[index + 1] === '"') { cell += '"'; index += 1; } else quoted = !quoted; }
    else if (char === ',' && !quoted) { row.push(cell); cell = ''; }
    else if ((char === '\n' || char === '\r') && !quoted) { if (char === '\r' && text[index + 1] === '\n') index += 1; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += char;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); } return rows;
}
const token = randomUUID().slice(0, 8), source = 'Stage10 browser ' + token;
async function upload(entity, csv, filename, mapping = {}) {
  assert(mutate); await go('?view=new');
  const form = workspace().locator('[data-import-form="upload"]');
  await form.getByLabel('Record type', { exact: true }).selectOption(entity);
  await form.getByLabel('Source name', { exact: true }).fill(source);
  await form.getByLabel('CSV file', { exact: true }).setInputFiles({ name: filename, mimeType: 'text/csv', buffer: Buffer.from(csv, 'utf8') });
  await form.getByRole('button', { name: 'Upload and map fields', exact: true }).click();
  await expect(page).toHaveURL(/batch=/); await expect(workspace()).toBeVisible();
  const id = new URL(page.url()).searchParams.get('batch'); assert(id);
  let detail = await read('/api/imports/' + id);
  if (!['uploaded', 'mapped', 'review'].includes(detail.batch.status)) return detail;
  const mapper = workspace().locator('[data-import-form="map"]'); await expect(mapper).toBeVisible();
  for (const [key, header] of Object.entries(mapping)) await mapper.locator('[name="map.' + key + '"]').selectOption(header);
  await labels(); await mapper.getByRole('button', { name: 'Save field mapping', exact: true }).click();
  await expect(workspace().getByRole('heading', { name: 'Validate before importing', exact: true })).toBeVisible();
  await workspace().getByRole('button', { name: 'Validate rows', exact: true }).click();
  await expect(page).toHaveURL(/step=(duplicates|confirm)/); await expect(workspace()).toBeVisible();
  return read('/api/imports/' + id);
}
async function finish(id) {
  await go('?batch=' + id + '&step=confirm');
  const form = workspace().locator('[data-import-form="confirm"]');
  await form.getByLabel('I reviewed this batch', { exact: false }).check();
  await form.getByRole('button', { name: 'Confirm import', exact: true }).click();
  await expect(workspace().getByRole('heading', { name: 'Reconcile import results', exact: true })).toBeVisible();
  await expect.poll(async () => (await read('/api/imports/' + id)).batch.status, { timeout: 60000, intervals: [500, 1500, 3000] }).toBe('completed');
  await go('?batch=' + id + '&step=results'); return read('/api/imports/' + id);
}
async function decision(id, row, action, existingId) {
  await go('?batch=' + id + '&step=duplicates&rows=duplicates');
  const form = workspace().locator('[data-import-form="decision"][data-row-id="' + row.id + '"]');
  await form.getByLabel('Decision for source row ' + row.rowNumber, { exact: true }).selectOption(action);
  if (existingId) await form.getByLabel('Reviewed existing contact for row ' + row.rowNumber, { exact: true }).selectOption(existingId);
  await form.getByRole('button', { name: 'Save row decision', exact: true }).click();
  await expect(page).toHaveURL(/saved=decision/); await expect(workspace()).toBeVisible();
}
await mkdir('.local/screenshots', { recursive: true });
try {
  await page.goto(url('/admin/imports'));
  await expect(page).toHaveURL(/\/admin\/login\?returnTo=/);
  await page.getByRole('button', { name: 'Fill standalone demo credentials', exact: true }).click();
  await expect(page.getByLabel('Password', { exact: true })).toHaveAttribute('type', 'password');
  await expect(page.getByLabel('Email address', { exact: true })).toHaveValue('standalone@demo.ootla.test');
  assert.equal(mutations.length, 0, 'Filling demo credentials never authenticates.');
  await page.getByRole('button', { name: /Sign in/ }).click();
  await expect(workspace()).toBeVisible(); signedIn = true;
  const onboarding = await read('/api/imports/onboarding'), user = (await read('/api/auth/me')).user;
  assert.equal(onboarding.organization.mode, 'standalone'); assert.equal(onboarding.canImport, true);
  assert.equal(onboarding.organization.name, 'Ootla Standalone Demo');
  assert.equal(user.organization.id, onboarding.organization.id); await labels();
  const batchesBefore = await read('/api/imports?pageSize=25');
  assert(batchesBefore.items.length <= 25); assert.equal(legacy.length, 0);
  const downloadEvent = page.waitForEvent('download');
  await workspace().getByRole('button', { name: 'Download properties CSV', exact: true }).click();
  const template = await downloadEvent; assert.equal(template.suggestedFilename(), 'ootla-properties-example.csv');
  assert.equal(mutations.filter(item => item.startsWith('POST /api/imports')).length, 0);
  pass('normal protected sign-in, separate standalone membership, real bounded onboarding and local-only CSV templates');

  let propertyBatch, contactBatch, duplicateBatch, unitBatch, leadBatch, relatedProperty;
  if (mutate) {
    const invalids = Array.from({ length: 27 }, (_, index) => 'BAD-' + index + ',,' + (index === 0 ? '=1+1' : 'Unknown') + ',Example City,apartment');
    const propertiesCsv = 'Original ID,Property title,Street,City,Kind\r\nP1,Import Cedar ' + token + ',1 Example Road,Example City,apartment\r\nP2,Import Maple ' + token + ',2 Example Road,Example City,house\r\nP3,Import Untouched ' + token + ',3 Example Road,Example City,apartment\r\n' + invalids.join('\r\n') + '\r\n';
    let detail = await upload('properties', propertiesCsv, 'properties-' + token + '.csv', { sourceId: 'Original ID', name: 'Property title', address: 'Street', city: 'City', type: 'Kind' });
    propertyBatch = detail.batch.id; assert.equal(detail.batch.rowCount, 30); assert.equal(detail.batch.counts.invalid, 27);
    await go('?batch=' + propertyBatch + '&step=duplicates&rows=invalid');
    await expect(workspace().locator('[data-import-row]')).toHaveCount(25);
    const first = await workspace().locator('[data-import-row]').first().getAttribute('data-row-number'); assert.equal(first, '5');
    await workspace().getByRole('link', { name: 'Next', exact: true }).click();
    await expect(page).toHaveURL(/page=2/); await expect(workspace().locator('[data-import-row]')).toHaveCount(2);
    assert.notEqual(await workspace().locator('[data-import-row]').first().getAttribute('data-row-number'), first);
    const report = await page.request.get(url('/api/imports/' + propertyBatch + '/errors.csv'));
    assert.equal(report.status(), 200); assert.match(report.headers()['content-disposition'], /attachment/);
    const reportRows = parseCsv(await report.text());
    assert(reportRows.length > 1); assert(reportRows.some(row => row.includes(propertyBatch)), 'Safe error report retains its batch ID.');
    assert(reportRows.flat().every(cell => !/^[\s\u0000-\u001f]*[=+@-]/.test(cell)), 'Export cells cannot run spreadsheet formulas.');
    detail = await finish(propertyBatch); assert.equal(detail.batch.counts.created, 3);
    assert.equal(detail.batch.counts.invalid, 27);
    await page.reload(); await expect(workspace()).toBeVisible();
    const properties = await read('/api/property-foundation/properties?pageSize=100'); assert.equal(properties.total, 3);
    relatedProperty = properties.items.find(item => item.name === 'Import Cedar ' + token); assert(relatedProperty);
    pass('upload, custom mapping, validation, mixed valid/invalid rows, physical line numbers, server pagination and safe error CSV');

    detail = await upload('units', 'sourceId,propertySourceId,label,bedrooms,monthlyRent,status\r\nU1,P1,1A,2,1800,available\r\nU2,missing,2A,1,900,available\r\n', 'units-' + token + '.csv');
    unitBatch = detail.batch.id; assert.equal(detail.batch.counts.invalid, 1);
    detail = await finish(unitBatch); assert.equal(detail.batch.counts.created, 1);
    const propertyDetail = await read('/api/property-foundation/properties/' + relatedProperty.id);
    assert.equal(propertyDetail.units.total, 1); const unit = propertyDetail.units.items[0];
    assert.equal(unit.source, 'import'); assert.equal(unit.lastVerifiedAt, null); assert.equal(unit.availabilitySource, 'import');
    phase = 'crm'; await page.goto(url('/admin/properties?property=' + relatedProperty.id));
    await expect(page.locator('[data-property-results]')).toBeVisible();
    await expect(page.locator('[data-unit-record="' + unit.id + '"]')).toContainText('Not verified');
    pass('separate unit/property identities, reference validation and imported unverified availability in the real Properties module');

    detail = await upload('contacts', 'sourceId,displayName,email,phone,propertySourceId\r\nC1,Taylor Example,' + token + '-taylor@example.test,,P1\r\nC2,Morgan Example,' + token + '-morgan@example.test,,P1\r\nBAD,=SUM(1+1),invalid email,,P1\r\n', 'contacts-' + token + '.csv');
    contactBatch = detail.batch.id; assert.equal(detail.batch.counts.invalid, 1);
    detail = await finish(contactBatch); assert.equal(detail.batch.counts.created, 2);
    const contacts = await read('/api/property-foundation/contacts?pageSize=100'); assert.equal(contacts.total, 2);
    const taylor = contacts.items.find(item => item.displayName === 'Taylor Example'); assert(taylor);
    const duplicatesCsv = 'sourceId,displayName,email,phone,propertySourceId\r\nC3,Taylor Example,' + token + '-separate@example.test,,P1\r\nC4,Reviewed name,' + token + '-taylor@example.test,,P1\r\nC5,Skipped person,' + token + '-morgan@example.test,,P1\r\n';
    detail = await upload('contacts', duplicatesCsv, 'contact-review-' + token + '.csv'); duplicateBatch = detail.batch.id;
    assert.equal(detail.batch.counts.needs_review, 3);
    const reviewRows = (await read('/api/imports/' + duplicateBatch + '/rows?view=duplicates&pageSize=100')).items;
    const nameOnly = reviewRows.find(row => row.normalized.sourceId === 'C3'), reuse = reviewRows.find(row => row.normalized.sourceId === 'C4'), skip = reviewRows.find(row => row.normalized.sourceId === 'C5');
    assert(nameOnly && reuse && skip);
    await go('?batch=' + duplicateBatch + '&step=duplicates&rows=duplicates');
    const nameForm = workspace().locator('[data-import-form="decision"][data-row-id="' + nameOnly.id + '"]');
    await expect(nameForm.locator('option[value="use_existing"]')).toHaveCount(0);
    await decision(duplicateBatch, nameOnly, 'create'); await decision(duplicateBatch, reuse, 'use_existing', taylor.id); await decision(duplicateBatch, skip, 'skip');
    detail = await finish(duplicateBatch); assert.equal(detail.batch.counts.created, 1); assert.equal(detail.batch.counts.linked, 1); assert.equal(detail.batch.counts.skipped, 1);
    assert.equal((await read('/api/property-foundation/contacts?pageSize=100')).total, 3);
    const originalContact = await read('/api/property-foundation/contacts/' + taylor.id); assert.equal(originalContact.contact.displayName, 'Taylor Example');
    pass('explicit duplicate review, no name-only identity link, deliberate existing contact reuse, separate contact creation and skip');

    detail = await upload('leads', 'sourceId,propertySourceId,contactSourceId,unitSourceId,intent,stage,nextAction,nextActionAt\r\nL1,P1,C1,U1,leasing,new_inquiry,Arrange a viewing,\r\nL2,P1,C1,U1,leasing,leased,Do not accept an unverified lease,\r\n', 'leads-' + token + '.csv');
    leadBatch = detail.batch.id; assert.equal(detail.batch.counts.invalid, 1);
    detail = await finish(leadBatch); assert.equal(detail.batch.counts.created, 1);
    const leads = await read('/api/leads?pageSize=100'); assert.equal(leads.total, 1);
    const lead = leads.items[0]; assert.equal(lead.contactId, taylor.id); assert.equal(lead.propertyId, relatedProperty.id); assert.equal(lead.stage, 'new_inquiry');
    phase = 'crm'; await page.goto(url('/admin/leads?view=record&lead=' + lead.id));
    await expect(page.locator('[data-lead-workspace]')).toBeVisible();
    const contactAfter = await read('/api/property-foundation/contacts/' + taylor.id); assert(contactAfter.history.items.some(item => item.kind === 'lead'));
    pass('imported leads share canonical contact, property and unit relationships and use the existing lead/application CRM foundation');

    await go('?batch=' + duplicateBatch + '&step=results');
    await workspace().locator('.im-retry > summary').click();
    const retry = workspace().locator('[data-import-form="retry"]');
    await retry.getByLabel('Retry unfinished rows', { exact: false }).check();
    await retry.getByRole('button', { name: 'Retry batch safely', exact: true }).click();
    await expect.poll(async () => (await read('/api/imports/' + duplicateBatch)).batch.status, { timeout: 60000, intervals: [500, 1500, 3000] }).toBe('completed');
    assert.equal((await read('/api/property-foundation/contacts?pageSize=100')).total, 3);
    detail = await upload('contacts', duplicatesCsv, 'contact-review-' + token + '.csv');
    if (detail.batch.id !== duplicateBatch) { if (detail.batch.status === 'review' && detail.batch.canConfirm) detail = await finish(detail.batch.id); }
    assert.equal((await read('/api/property-foundation/contacts?pageSize=100')).total, 3);
    pass('safe saved-batch retry and identical file resubmission preserve record identities without duplicate contact creation');

    const maple = properties.items.find(item => item.name === 'Import Maple ' + token), untouched = properties.items.find(item => item.name === 'Import Untouched ' + token); assert(maple && untouched);
    phase = 'crm'; await page.goto(url('/admin/properties?property=' + maple.id));
    await expect(page.locator('[data-property-results]')).toBeVisible();
    const editor = page.locator('details.pw-editor').filter({ has: page.getByText('Edit property details', { exact: true }) });
    await editor.locator(':scope > summary').click();
    await editor.getByLabel('Property name', { exact: true }).fill('Staff edited Maple ' + token);
    await editor.getByRole('button', { name: 'Save property', exact: true }).click();
    await expect(page).toHaveURL(/saved=property/);
    await go('?batch=' + propertyBatch + '&step=results');
    await workspace().getByRole('link', { name: 'Preview safe undo', exact: true }).click();
    await expect(workspace().getByRole('heading', { name: 'Review safe undo', exact: true })).toBeVisible();
    const preview = await page.request.post(url('/api/imports/' + propertyBatch + '/undo-preview'), { headers: { Origin: base.origin }, data: {} }); assert.equal(preview.status(), 200);
    const undo = await preview.json(); assert.equal(undo.eligible, 1); assert.equal(undo.retained, 2);
    const undoForm = workspace().locator('[data-import-form="undo"]');
    await undoForm.getByLabel('Remove only the eligible', { exact: false }).check();
    await undoForm.getByRole('button', { name: 'Confirm safe undo', exact: true }).click();
    await expect(page).toHaveURL(/saved=undone/); await expect(workspace()).toBeVisible();
    assert.equal((await read('/api/property-foundation/properties?pageSize=100')).total, 2);
    assert.equal((await read('/api/property-foundation/properties/' + maple.id)).property.name, 'Staff edited Maple ' + token);
    assert.equal((await read('/api/property-foundation/properties/' + relatedProperty.id)).units.total, 1);
    assert.equal((await page.request.get(url('/api/property-foundation/properties/' + untouched.id))).status(), 404);
    pass('safe undo previews real dependencies, removes only untouched created records and preserves subsequent staff edits and related CRM work');
  }

  await go(); await page.screenshot({ path: '.local/screenshots/stage10-imports-desktop.png', fullPage: true });
  for (const width of [320, 390, 768, 1586]) {
    await page.setViewportSize({ width, height: 1050 });
    const paths = ['', ...(propertyBatch ? ['?batch=' + propertyBatch + '&step=results&rows=invalid', '?batch=' + duplicateBatch + '&step=results', '?batch=' + leadBatch + '&step=results'] : [])];
    for (const query of paths) { await go(query); await labels(); const size = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth })); assert(size.scroll <= size.client, query + ' no page overflow at ' + width + ': ' + JSON.stringify(size)); }
    if (width === 390) await page.screenshot({ path: '.local/screenshots/stage10-imports-mobile.png', fullPage: true });
  }
  await go(); await workspace().getByLabel('Record type', { exact: true }).focus(); await page.keyboard.press('ArrowDown'); await expect(workspace().getByLabel('Record type', { exact: true })).toHaveValue('units');
  await page.setViewportSize({ width: 1586, height: 1050 });
  pass('320/390/768/1586 responsive import and result views, native labels, keyboard controls and reduced-motion usability');

  phase = 'other'; await page.goto(url('/admin/integrations')); await expect(page.locator('[data-staff-shell]')).toBeVisible();
  await page.getByRole('link', { name: 'Open customer-data import', exact: true }).click(); await expect(workspace()).toBeVisible();
  phase = 'overview'; await page.goto(url('/admin')); await expect(page.locator('[data-staff-shell]')).toBeVisible();
  assert.equal(await page.locator('.b-summary .b-stat').count(), 4); await expect(page.locator('[data-pipeline]')).toBeVisible();
  await page.getByRole('button', { name: 'Account menu', exact: true }).click(); await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/login/); signedIn = false;
  assert.equal((await page.request.get(url('/api/imports/onboarding'))).status(), 401);
  await Promise.all(pending);
  assert.deepEqual(issues, []); assert.deepEqual(external, []); assert.deepEqual(unbounded, []); assert.deepEqual(legacy, []);
  if (!mutate) assert(mutations.every(item => /^POST \/api\/auth\/(login|logout)$/.test(item)), 'Retained preview CRM records remain read-only.');
  pass('genuine integrations navigation, unchanged overview, logout/private import API protection, bounded data and no external actions');
  console.log('PASS all ' + groups + ' import browser groups (' + (mutate ? 'owned isolated write environment' : 'retained read-only demo') + ')');
} finally {
  if (signedIn) await page.request.post(url('/api/auth/logout'), { headers: { Origin: base.origin } }).catch(() => {});
  await context.close(); await browser.close();
}
