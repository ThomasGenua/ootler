import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';

// The retained preview is read-only. Mutation mode requires the deliberately
// provisioned, uniquely owned Stage 08 browser database and separate loopback port.
const configuredRetainedOrigin = new URL(process.env.APP_URL || 'http://127.0.0.1:5173');
const base = new URL(process.env.OOTLA_CHECK_URL || configuredRetainedOrigin.href);
assert(base.protocol === 'http:' && base.hostname === '127.0.0.1' && base.port, 'Use a project-owned loopback preview.');
const scratch = process.env.OOTLA_CHECK_DATABASE || '';
const mutate = Boolean(scratch);
if (mutate) {
  assert(/^ootla_demo_stage08_browser_[a-f0-9]{32}$/.test(scratch), 'Writes require the uniquely owned Stage 08 browser database.');
  assert(!['5173','3100'].includes(base.port), 'Never mutate the retained review environment.');
  assert.notEqual(base.origin, configuredRetainedOrigin.origin, 'Never mutate the configured retained application origin.');
}
const browser = await chromium.launch({ headless: true, channel: process.env.OOTLA_BROWSER_CHANNEL || 'chrome' });
const context = await browser.newContext({ viewport: { width: 1586, height: 1050 }, reducedMotion: 'reduce' });
const page = await context.newPage();
page.setDefaultTimeout(15000);
const errors = [], external = [], mutations = [], legacyReads = [], pending = [];
let signedIn = false, phase = 'workspace', groups = 0;
const pass = title => { groups += 1; console.log('PASS ' + title); };
page.on('pageerror', issue => errors.push(issue.message));
page.on('request', request => {
  const url = new URL(request.url());
  if (/^https?:$/.test(url.protocol) && url.origin !== base.origin) external.push(url.origin + url.pathname);
  if (!['GET','HEAD','OPTIONS'].includes(request.method())) mutations.push(request.method() + ' ' + url.pathname);
  if (phase === 'workspace' && url.pathname === '/api/demo/data') legacyReads.push(url.pathname);
});
page.on('response', response => {
  const url = new URL(response.url());
  if (response.request().method() !== 'GET' || response.status() !== 200 || !url.pathname.startsWith('/api/lead-workspaces/')) return;
  if (url.pathname.endsWith('/download')) return;
  pending.push((async () => {
    const body = await response.json();
    for (const data of [body, body.tasks, body.documents, body.timeline, body.suggestions]) if (data?.items) assert(data.items.length <= 100, 'Workspace pages stay bounded.');
    if (body.owners) assert(body.owners.length <= 50, 'Task owner choices stay bounded.');
  })());
});
const workspace = () => page.locator('[data-lead-workspace08][data-workspace-lead]');
const url = path => new URL(path, base).href;
async function read(path) { const response = await page.request.get(url(path)); assert.equal(response.status(), 200, path); return response.json(); }
async function write(path, body, method = 'POST') {
  assert(mutate, 'No retained record writes.');
  const response = await page.request.fetch(url(path), { method, data: body, headers: { Origin: base.origin } });
  assert(response.ok(), method + ' ' + path + ' returned ' + response.status());
  return response.json();
}
async function go(leadId, extra = '') {
  const response = await page.goto(url('/admin/leads?view=record&lead=' + leadId + extra));
  assert.equal(response?.status(), 200);
  await expect(workspace()).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
}
async function labels() {
  const absent = await workspace().evaluate(root => [...root.querySelectorAll('input,select,textarea')].filter(control => control.type !== 'hidden' && !control.labels?.length && !control.getAttribute('aria-label')).map(control => control.id || control.name));
  assert.deepEqual(absent, [], 'Every workspace control has a native label.');
}
async function timelineOrder() {
  const dates = await workspace().locator('[data-workspace-event]').evaluateAll(items => items.map(item => Date.parse(item.dataset.occurredAt)));
  assert(dates.length && dates.every(Number.isFinite));
  assert(dates.every((date, index) => !index || dates[index - 1] >= date), 'Timeline events are newest first.');
}
async function save(form, button, expected) {
  await form.getByRole('button', { name: button, exact: true }).click();
  await expect(page).toHaveURL(new RegExp('saved08=' + expected));
  await expect(workspace()).toBeVisible();
}
await mkdir('.local/screenshots', { recursive: true });
try {
  await page.goto(url('/admin/leads'));
  await expect(page).toHaveURL(/\/admin\/login\?returnTo=/);
  await page.getByRole('button', { name: 'Fill demo credentials', exact: true }).click();
  await expect(page.getByLabel('Password', { exact: true })).toHaveAttribute('type', 'password');
  assert.equal(mutations.length, 0, 'Filling credentials never authenticates.');
  await page.getByRole('button', { name: /Sign in/ }).click();
  await expect(page.locator('[data-lead-workspace]')).toBeVisible(); signedIn = true;
  const directory = await read('/api/leads?pageSize=25');
  const lead = directory.items.find(item => item.name === 'Maya Chen') ?? directory.items[0];
  assert(lead, 'The retained synthetic lead remains available.');
  await go(lead.id);
  const initial = await read('/api/lead-workspaces/' + lead.id);
  assert.equal(initial.leadDetail.lead.contactId, lead.contactId);
  assert.equal(initial.contact.contact.id, lead.contactId);
  for (const title of ['Contact & household','Private staff actions','Follow-up tasks','Private documents','Activity timeline','Contextual AI assistance','Property suggestions']) await expect(workspace().getByRole('heading', { name: title, exact: true })).toBeVisible();
  await expect(workspace().locator('.l08-notice').filter({hasText:'deterministic guidance from saved lead context'})).toBeVisible();
  await expect(workspace().getByText('No verified matches available.', { exact: true })).toBeVisible();
  await expect(page.locator('#lead-editor')).toBeAttached();
  await labels(); await timelineOrder();
  assert.equal(legacyReads.length, 0);
  pass('normal authenticated lead detail; canonical contact; household, staff, task and document sections; bounded data and truthful setup states');

  const aiSummary = workspace().locator('[data-ai-simulation] > summary');
  await aiSummary.focus(); await page.keyboard.press('Enter');
  await expect(workspace().locator('.l08-drafts')).toBeVisible();
  assert(initial.ai.drafts.length > 0, 'Contextual simulation contains staff-review guidance.');
  await expect(workspace().getByText('These deterministic examples use the saved lead context.', { exact: false })).toBeVisible();
  await labels();
  pass('keyboard-operated contextual AI simulation; explicit staff review; no live provider actions');

  let documentPath = null;
  if (mutate) {
    const token = randomUUID().slice(0,8), note = 'Private Stage 08 note ' + token + ' <not HTML>';
    await workspace().locator('[data-note-editor] > summary').click();
    const noteForm = workspace().locator('[data-workspace-form="note"]');
    await noteForm.getByLabel('Internal note', { exact: true }).fill(note);
    await save(noteForm, 'Save internal note', 'note');
    await expect(workspace().locator('#lead08-timeline')).toContainText(note);
    assert.equal(await workspace().locator('not').count(), 0, 'User note content is escaped.');
    await page.reload(); await expect(workspace()).toBeVisible();
    await expect(workspace().locator('#lead08-timeline')).toContainText(note);
    const call = 'Call discussed stated move-in preference ' + token;
    await workspace().locator('[data-call-editor] > summary').click();
    const callForm = workspace().locator('[data-workspace-form="call"]');
    await callForm.getByLabel('Call direction', { exact: true }).selectOption('inbound');
    await callForm.getByLabel('Call outcome', { exact: true }).selectOption('connected');
    await callForm.getByLabel('Duration in minutes (optional)', { exact: true }).fill('7');
    await callForm.getByLabel('Call summary', { exact: true }).fill(call);
    await save(callForm, 'Save call log', 'call');
    await expect(workspace().locator('#lead08-timeline')).toContainText(call);
    await expect(workspace().locator('[data-event-kind="call"]').first()).toContainText('Inbound call / Connected / 7 minutes');
    pass('private note and inbound call log persist through refresh, include timeline actors and escape user text');

    await workspace().locator('[data-task-create-editor] > summary').click();
    const create = workspace().locator('[data-workspace-form="task-create"]');
    assert.equal(await create.evaluate(form => form.checkValidity()), false, 'A follow-up needs its title and due date.');
    const owners = initial.owners;
    assert(owners.length);
    const title = 'Arrange staff follow-up ' + token;
    await create.getByLabel('Follow-up task title', { exact: true }).fill(title);
    await create.getByLabel('Follow-up task owner', { exact: true }).selectOption(owners[0].membershipId);
    await create.getByLabel('Follow-up due date and time', { exact: true }).fill('2027-02-12T10:30');
    await create.getByLabel('Follow-up details (optional)', { exact: true }).fill('Confirm the prospect\u2019s requested time before scheduling.');
    await save(create, 'Create follow-up task', 'task-create');
    let task = workspace().locator('[data-workspace-task]').filter({ has: page.getByRole('heading', { name: title, exact: true }) });
    await expect(task).toContainText(owners[0].name);
    const taskId = await task.getAttribute('data-workspace-task');
    await page.reload(); await expect(workspace()).toBeVisible();
    task = workspace().locator('[data-workspace-task="' + taskId + '"]');
    await expect(task).toContainText(title);
    await task.locator('details > summary').click();
    const edit = task.locator('[data-workspace-form="task-edit"]');
    await edit.getByLabel('Task details (optional)', { exact: true }).fill('Updated staff instruction ' + token);
    await save(edit, 'Save task changes', 'task-edit');
    task = workspace().locator('[data-workspace-task="' + taskId + '"]');
    await expect(task).toContainText('Updated staff instruction ' + token);
    await task.getByRole('button', { name: 'Mark complete', exact: true }).click();
    await expect(page).toHaveURL(/saved08=task-status/);
    await expect(workspace().locator('[data-workspace-task="' + taskId + '"]')).toContainText('Completed');
    await workspace().locator('[data-workspace-task="' + taskId + '"]').getByRole('button', { name: 'Reopen task', exact: true }).click();
    await expect(workspace().locator('[data-workspace-task="' + taskId + '"]').getByRole('button', { name: 'Mark complete', exact: true })).toBeVisible();
    const afterTask = await read('/api/lead-workspaces/' + lead.id + '/tasks?pageSize=100');
    const savedTask = afterTask.items.find(item => item.id === taskId);
    assert.equal(savedTask.status, 'open'); assert.equal(savedTask.owner.membershipId, owners[0].membershipId); assert(savedTask.version >= 4);
    pass('assigned follow-up task creation, editing, completion and reopening persist with due dates, versions and refresh');

    await workspace().locator('[data-decision-editor] > summary').click();
    const decision = workspace().locator('[data-workspace-form="decision"]');
    await decision.getByLabel('Staff handoff or follow-up decision', { exact: true }).fill('Staff will confirm dates before making a viewing arrangement ' + token);
    await save(decision, 'Save staff decision', 'decision');
    await expect(workspace().locator('[data-event-kind="staff_decision"]')).toBeVisible();
    await workspace().locator('[data-document-editor] > summary').click();
    const docForm = workspace().locator('[data-workspace-form="document"]');
    const fileName = 'stage08-private-' + token + '.txt', fileBody = 'Owned browser test document ' + token + '\nNo real applicant information.';
    await docForm.getByLabel('Document file', { exact: true }).setInputFiles({ name: fileName, mimeType: 'text/plain', buffer: Buffer.from(fileBody) });
    await save(docForm, 'Upload private document', 'document');
    const doc = workspace().locator('[data-workspace-document]').filter({ hasText: fileName });
    await expect(doc).toBeVisible();
    documentPath = await doc.getByRole('link', { name: 'Download ' + fileName, exact: true }).getAttribute('href');
    assert(documentPath.startsWith('/api/lead-workspaces/' + lead.id + '/documents/'));
    const downloadEvent = page.waitForEvent('download');
    await doc.getByRole('link', { name: 'Download ' + fileName, exact: true }).click();
    const download = await downloadEvent;
    assert.equal(download.suggestedFilename(), fileName);
    const stream = await download.createReadStream(); assert(stream);
    const chunks = []; for await (const chunk of stream) chunks.push(chunk);
    assert.equal(Buffer.concat(chunks).toString('utf8'), fileBody);
    await page.reload(); await expect(workspace()).toBeVisible();
    await expect(workspace().locator('[data-workspace-document]').filter({ hasText: fileName })).toBeVisible();
    await workspace().locator('[data-document-editor] > summary').click();
    const tooLarge = workspace().locator('[data-workspace-form="document"]');
    const countBefore = mutations.length;
    await tooLarge.getByLabel('Document file', { exact: true }).setInputFiles({ name: 'too-large.txt', mimeType: 'text/plain', buffer: Buffer.alloc(20*1024*1024+1, 'a') });
    await tooLarge.getByRole('button', { name: 'Upload private document', exact: true }).click();
    await expect(tooLarge.locator('[data-workspace-error]')).toContainText('no larger than 20 MiB');
    assert.equal(mutations.length, countBefore, 'Oversized browser upload is rejected before a request.');
    pass('staff handoff history; private text upload, authorized native download, exact bytes, refresh persistence and upload size validation');

    const property = await read('/api/property-foundation/properties/' + lead.propertyId);
    const unit = property.units.items[0]; assert(unit);
    const verifiedAt = new Date().toISOString();
    await write('/api/property-foundation/properties/' + lead.propertyId + '/units/' + unit.id, { status: 'available', availabilitySource: 'staff_reported', lastVerifiedAt: verifiedAt }, 'PATCH');
    const current = (await read('/api/leads/' + lead.id)).lead;
    await write('/api/leads/' + lead.id, { version: current.version, preferences: { bedrooms: unit.bedrooms, budgetMin: Math.max(0, unit.monthlyRent-100), budgetMax: unit.monthlyRent+100, locations: property.property.city ? [property.property.city] : [], moveInOn: '2027-03-10', requirements: 'Stated preferences only.' } }, 'PATCH');
    await go(lead.id, '&workspacePageSize=100');
    const suggestions = await read('/api/lead-workspaces/' + lead.id + '/suggestions?pageSize=100');
    const match = suggestions.items.find(item => item.unitId === unit.id); assert(match, 'A unit matching the stated criteria and verified evidence is suggested.');
    assert.equal(match.moveInDateConfirmed, false); assert(match.reasons.length); assert(match.cautions.length);
    await expect(workspace().locator('[data-property-suggestion="' + unit.id + '"]')).toContainText('requested move-in date is not confirmed');
    await timelineOrder();
    await expect(workspace().locator('#lead08-timeline')).toContainText('Open \u2192 Completed');
    await expect(workspace().locator('#lead08-timeline')).toContainText('Completed \u2192 Open');
    const events = await read('/api/lead-workspaces/' + lead.id + '/timeline?pageSize=100');
    for (const kind of ['note','call','staff_decision','task_created','task_updated','document_uploaded']) assert(events.items.some(event => event.kind === kind), 'Timeline contains ' + kind);
    assert(events.items.some(event => event.kind === 'communication' || event.kind === 'tour'), 'Existing related timeline records are included.');
    assert(events.items.every(event => event.actor || event.simulated || event.provenance === 'record'));
    pass('combined timeline order and provenance; explained budget/location/bedroom matches use verified availability while move-in remains unconfirmed');
  } else console.log('INFO read-only retained mode: staff writes and upload persistence are exercised only in the owned Stage 08 browser environment.');

  await go(lead.id, '&workspacePageSize=1');
  const firstTimelineId = await workspace().locator('[data-workspace-event]').first().getAttribute('data-workspace-event');
  const data = await read('/api/lead-workspaces/' + lead.id + '?pageSize=1');
  if (data.timeline.total > 1) {
    await workspace().getByRole('navigation', { name: 'Activity timeline pagination', exact: true }).getByRole('link', { name: 'Next', exact: true }).click();
    await expect(page).toHaveURL(/timelinePage=2/);
    assert.notEqual(await workspace().locator('[data-workspace-event]').first().getAttribute('data-workspace-event'), firstTimelineId);
  }
  for (const width of [320,390,768,1586]) {
    await page.setViewportSize({ width, height: width < 700 ? 900 : 1050 });
    await go(lead.id); await labels(); await timelineOrder();
    const size = await page.evaluate(() => ({ full: document.documentElement.scrollWidth, view: innerWidth }));
    assert(size.full <= size.view+1, 'Lead detail overflow at ' + width + ': ' + JSON.stringify(size));
    if (width === 390 || width === 1586) {
      const kind = width === 390 ? 'mobile' : 'desktop';
      await page.screenshot({ path: '.local/screenshots/stage08-lead-' + kind + '.png', fullPage: true });
      await workspace().locator('#lead08-timeline').screenshot({ path: '.local/screenshots/stage08-timeline-' + kind + '.png' });
    }
  }
  pass('server-paged timeline; labeled controls, keyboard access, reduced-motion preference and 320/390/768/1586px layouts');

  phase = 'overview';
  await page.goto(url('/admin'));
  await expect(page.locator('.b-summary .b-stat')).toHaveCount(4);
  await expect(page.locator('[data-pipeline]')).toBeVisible();
  assert.equal(await page.locator('[data-lead-workspace08]').count(), 0, 'Overview stays uncluttered.');
  await page.getByRole('button', { name: 'Account menu', exact: true }).click();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/login$/); signedIn = false;
  assert.equal((await page.request.get(url('/api/lead-workspaces/' + lead.id))).status(), 401);
  if (documentPath) assert.equal((await page.request.get(url(documentPath))).status(), 401, 'Logged-out document download is denied.');
  await Promise.all(pending);
  assert.deepEqual(errors, [], 'No uncaught browser exceptions.');
  assert.deepEqual(external, [], 'No external or outbound requests.');
  assert.deepEqual(legacyReads, [], 'Lead detail does not load the whole legacy demo data payload.');
  if (!mutate) assert(mutations.every(item => /^POST \/api\/auth\/(login|logout)$/.test(item)), 'Retained mode changes only its own normal session.');
  pass('Bento overview retains four metrics and pipeline; normal logout denies workspace/documents; no outbound actions');
  console.log('Stage 08 focused browser check: ' + groups + ' groups passed (' + (mutate ? 'owned scratch write mode' : 'retained-demo read-only mode') + ').');
} finally {
  if (signedIn) { try { await page.request.post(url('/api/auth/logout'), { headers: { Origin: base.origin } }); } catch {} }
  await context.close(); await browser.close();
}