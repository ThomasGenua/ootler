import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';

// Retained demo checks are read-only; every record write requires an owned scratch database.
const retained = new URL(process.env.APP_URL || 'http://127.0.0.1:7673');
const base = new URL(process.env.OOTLA_CHECK_URL || retained.href);
assert(base.protocol === 'http:' && base.hostname === '127.0.0.1' && base.port, 'Use the project-owned loopback preview.');
const scratch = process.env.OOTLA_CHECK_DATABASE || '';
const mutate = Boolean(scratch);
if (mutate) {
  assert(/^ootla_demo_stage09_browser_[a-f0-9]{32}$/.test(scratch), 'Writes require a uniquely owned Stage 09 browser database.');
  assert(!['5173', '7673', '3100'].includes(base.port), 'Never mutate a retained preview port.');
  assert.notEqual(base.origin, retained.origin, 'Never mutate the configured retained origin.');
}
const browser = await chromium.launch({ headless: true, channel: process.env.OOTLA_BROWSER_CHANNEL || 'chrome' });
const context = await browser.newContext({ viewport: { width: 1586, height: 1050 }, reducedMotion: 'reduce' });
const page = await context.newPage();
page.setDefaultTimeout(15000);
const issues = [], external = [], mutations = [], unbounded = [], legacy = [], pending = [];
let signedIn = false, phase = 'tasks', groups = 0;
const pass = text => { groups += 1; console.log('PASS ' + text); };
const url = path => new URL(path, base).href;
const workspace = () => page.locator('[data-task-workspace]');
page.on('pageerror', error => issues.push(error.message));
page.on('request', request => {
  const target = new URL(request.url());
  if (/^https?:$/.test(target.protocol) && target.origin !== base.origin) external.push(target.origin + target.pathname);
  if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) mutations.push(request.method() + ' ' + target.pathname);
  if (phase === 'tasks' && target.pathname === '/api/demo/data') legacy.push(target.pathname);
});
page.on('response', response => {
  const target = new URL(response.url());
  if (response.request().method() !== 'GET' || response.status() !== 200 || !target.pathname.startsWith('/api/tasks')) return;
  pending.push((async () => {
    let body;
    try { body = await response.json(); }
    catch (error) {
      // A navigation may discard an already observed response after the app read it.
      if (/No resource with given identifier|Response body is not available|Target.*closed/.test(error.message)) return;
      issues.push('Task response inspection: ' + error.message); return;
    }
    for (const item of [body, body.history]) if (item?.items && item.items.length > 100) unbounded.push(target.pathname);
    for (const key of ['owners', 'teams', 'rules', 'tours', 'applications']) if (Array.isArray(body[key]) && body[key].length > 100) unbounded.push(target.pathname + '/' + key);
  })());
});
async function read(path) { const response = await page.request.get(url(path)); assert.equal(response.status(), 200, path); return response.json(); }
async function go(query = '') { await page.goto(url('/admin/tasks' + query)); await expect(workspace()).toBeVisible(); await page.evaluate(() => document.fonts.ready); }
async function labels() {
  const missing = await workspace().evaluate(root => [...root.querySelectorAll('input,select,textarea')].filter(control => control.type !== 'hidden' && !control.labels?.length && !control.getAttribute('aria-label')).map(control => control.id || control.name));
  assert.deepEqual(missing, [], 'Every task control has a native label.');
}
async function datetime(offset) { return page.evaluate(minutes => { const date = new Date(Date.now() + minutes * 60000); return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16); }, offset); }
async function createTask(property, options, title, extra = {}) {
  assert(mutate);
  await go('?view=new&propertyId=' + property.id);
  const form = workspace().locator('[data-task-form="create"]');
  await form.getByLabel('Task title', { exact: true }).fill(title);
  await form.getByLabel('Due date and time', { exact: true }).fill(await datetime(extra.minutes ?? -30));
  await form.getByLabel('Priority', { exact: true }).selectOption(extra.priority ?? 'high');
  await form.getByLabel('Assignment method', { exact: true }).selectOption(extra.routing ? 'routing' : 'manual');
  if (!extra.routing) await form.getByLabel('Assigned owner', { exact: true }).selectOption(extra.ownerId ?? options.owners[0]?.membershipId ?? '');
  await form.getByLabel('Internal task details', { exact: true }).fill('Private Stage 09 verification <escaped>');
  if (extra.tourId) { await form.getByLabel('Related record type', { exact: true }).selectOption('tour'); await form.getByLabel('Related tour', { exact: true }).selectOption(extra.tourId); }
  else if (extra.applicationId) { await form.getByLabel('Related record type', { exact: true }).selectOption('application'); await form.getByLabel('Related application', { exact: true }).selectOption(extra.applicationId); }
  else if (extra.leadId) { await form.getByLabel('Related record type', { exact: true }).selectOption('lead'); await form.getByLabel('Related lead', { exact: true }).selectOption(extra.leadId); }
  await form.getByRole('button', { name: 'Create task', exact: true }).click();
  await expect(page).toHaveURL(/task=.*saved=created/);
  await expect(workspace().getByRole('heading', { name: title, exact: true })).toBeVisible();
  const taskId = new URL(page.url()).searchParams.get('task');
  assert(taskId); return (await read('/api/tasks/' + taskId)).task;
}
async function saveStatus(status, title) {
  const form = workspace().locator('[data-task-form="status"][data-status="' + status + '"]');
  await form.getByRole('button', { name: title + ':', exact: false }).click();
  await expect(page).toHaveURL(/saved=status/); await expect(workspace()).toBeVisible();
}
await mkdir('.local/screenshots', { recursive: true });
try {
  await page.goto(url('/admin/tasks?view=team'));
  await expect(page).toHaveURL(/\/admin\/login\?returnTo=/);
  await page.getByRole('button', { name: 'Fill demo credentials', exact: true }).click();
  await expect(page.getByLabel('Password', { exact: true })).toHaveAttribute('type', 'password');
  assert.equal(mutations.length, 0, 'Demo fill never authenticates.');
  await page.getByRole('button', { name: /Sign in/ }).click();
  await expect(workspace()).toBeVisible(); signedIn = true;
  await expect(workspace().getByRole('heading', { name: 'Team tasks', exact: true })).toBeVisible();
  const tasks = await read('/api/tasks?view=team&pageSize=100');
  const properties = await read('/api/property-foundation/properties?pageSize=25');
  assert(properties.items.length && tasks.total >= 3, 'Existing property and task records remain.');
  const options = await read('/api/tasks/options?propertyId=' + properties.items[0].id);
  const current = await read('/api/auth/me');
  const user = current.user ?? current;
  await labels(); assert.equal(legacy.length, 0);
  await go('?view=my');
  const mine = await read('/api/tasks?view=my');
  assert(mine.items.every(task => task.owner?.membershipId === user.membershipId), 'My tasks contains only the current member assignments.');
  await expect(workspace().getByRole('heading', { name: 'My tasks', exact: true })).toBeVisible();
  pass('normal sign-in, bounded real Team/My task views, private scope and labeled controls');

  await go('?view=team&pageSize=1');
  const first = await workspace().locator('[data-task-record]').first().getAttribute('data-task-record');
  await workspace().getByRole('link', { name: 'Next', exact: true }).click();
  await expect(page).toHaveURL(/page=2/); await expect(workspace()).toBeVisible();
  const second = await workspace().locator('[data-task-record]').first().getAttribute('data-task-record');
  assert.notEqual(first, second);
  await workspace().getByLabel('Search tasks', { exact: true }).fill(tasks.items[0].title);
  await workspace().getByRole('button', { name: 'Apply filters', exact: true }).click();
  await expect(workspace().locator('[data-task-record]')).toHaveCount(1);
  await workspace().locator('[data-task-record] .tw-task-title').click();
  await expect(workspace().getByRole('heading', { name: 'Task context', exact: true })).toBeVisible();
  await expect(workspace().getByRole('heading', { name: 'Completion and assignment history', exact: true })).toBeVisible();
  await page.reload(); await expect(workspace()).toBeVisible(); await labels();
  pass('server search and pagination, distinct result pages, related context and refresh persistence');

  if (mutate) {
    const token = randomUUID().slice(0, 8);
    const property = properties.items[0];
    const owned = options.owners.find(owner => owner.membershipId === user.membershipId); assert(owned);
    const task = await createTask(property, options, 'Stage 09 follow-up ' + token, { ownerId: owned.membershipId });
    assert.equal(task.owner.membershipId, owned.membershipId); assert.equal(task.priority, 'high'); assert.equal(task.overdue, true); assert.equal(task.origin, 'manual');
    await page.reload(); await expect(workspace()).toBeVisible();
    await expect(workspace().locator('.tw-task-details').filter({ hasText: 'Private Stage 09 verification <escaped>' })).toBeVisible();
    assert.equal(await workspace().locator('escaped').count(), 0);
    const edit = workspace().locator('[data-task-form="edit"]');
    await edit.getByLabel('Priority', { exact: true }).selectOption('urgent');
    await edit.getByLabel('Due date and time', { exact: true }).fill(await datetime(-10));
    await edit.getByRole('button', { name: 'Save task changes', exact: true }).click();
    await expect(page).toHaveURL(/saved=edit/);
    const edited = await read('/api/tasks/' + task.id); assert.equal(edited.task.priority, 'urgent');
    await saveStatus('completed', 'Complete task');
    const complete = await read('/api/tasks/' + task.id); assert.equal(complete.task.status, 'completed'); assert(complete.task.completedAt); assert(complete.history.items.some(event => event.kind === 'completed' && event.actor));
    await page.reload(); await expect(workspace()).toBeVisible();
    await saveStatus('open', 'Reopen task');
    assert((await read('/api/tasks/' + task.id)).history.items.some(event => event.kind === 'reopened'));
    const dates = await workspace().locator('[data-task-event]').evaluateAll(items => items.map(item => Date.parse(item.dataset.occurredAt)));
    assert(dates.every((when, index) => !index || dates[index - 1] >= when));
    pass('create, assign, edit, overdue dates, completion/reopening history and exact refresh persistence');

    const leadDirectory = await read('/api/leads?propertyId=' + property.id + '&pageSize=25');
    const lead = leadDirectory.items[0]; assert(lead);
    const leadTask = await createTask(property, options, 'Stage 09 lead task ' + token, { ownerId: owned.membershipId, leadId: lead.id, minutes: 30 });
    assert.equal(leadTask.leadId, lead.id); assert.equal(leadTask.contactId, lead.contactId);
    await workspace().getByRole('link', { name: 'Open related record', exact: true }).click();
    await expect(page.locator('[data-lead-workspace08]')).toBeVisible();
    await expect(page.locator('#lead08-tasks')).toContainText(leadTask.title);
    const related = await read('/api/tasks/related-options?propertyId=' + property.id);
    assert(related.tours.length, 'The owned demo has a tour record for this property.');
    const tourTask = await createTask(property, options, 'Stage 09 tour context ' + token, { ownerId: owned.membershipId, tourId: related.tours[0].id, minutes: 60 });
    assert.equal(tourTask.tourId, related.tours[0].id);
    const linked = workspace().locator('[data-task-linked-record="tour"]');
    await expect(linked).toContainText(related.tours[0].id);
    await expect(linked).toContainText('Recorded tour time');
    await expect(linked).toContainText('A task does not create or confirm');
    await expect(linked.locator('time')).toHaveAttribute('datetime', related.tours[0].startsAt);
    pass('lead task keeps canonical contact history; tour task shows its exact saved identity, status and time without inventing confirmation');

    await go('?view=routing');
    const createTeamDetails = workspace().locator('[data-task-team-editor="new"]');
    await createTeamDetails.locator(':scope > summary').click();
    const createTeam = createTeamDetails.locator('form');
    const teamName = 'Stage 09 empty team ' + token;
    await createTeam.getByLabel('Team name', { exact: true }).fill(teamName);
    await createTeam.getByRole('button', { name: 'Create team', exact: true }).click();
    await expect(page).toHaveURL(/saved=team/); await expect(workspace()).toBeVisible();
    const updatedOptions = await read('/api/tasks/options');
    const team = updatedOptions.teams.find(item => item.name === teamName); assert(team); assert.equal(team.membershipIds.length, 0);
    await go('?view=routing&propertyId=' + property.id);
    const routing = workspace().locator('[data-task-form="routing"]');
    await routing.getByLabel('Routing team', { exact: true }).selectOption(team.id);
    await routing.getByLabel('Enable this property', { exact: false }).check();
    await routing.getByRole('button', { name: 'Save property routing', exact: true }).click();
    await expect(page).toHaveURL(/saved=routing/);
    const routed = await createTask(property, options, 'Stage 09 unassigned routing ' + token, { routing: true });
    assert.equal(routed.owner, null); assert(routed.assignmentNotice); assert.equal(routed.assignment, 'routing');
    await go('?view=unassigned&q=' + encodeURIComponent(routed.title));
    await expect(workspace().locator('[data-task-record]')).toHaveCount(1);
    await expect(workspace().locator('[data-task-record]')).toContainText('Unassigned');
    await go('?view=routing&propertyId=' + property.id);
    const editTeamDetails = workspace().locator('[data-task-team-editor="' + team.id + '"]');
    await editTeamDetails.locator(':scope > summary').click();
    await editTeamDetails.locator('input[name="membershipIds"][value="' + owned.membershipId + '"]').check();
    await editTeamDetails.getByRole('button', { name: 'Save team', exact: true }).click();
    await expect(page).toHaveURL(/saved=team/);
    const assigned = await createTask(property, options, 'Stage 09 eligible routing ' + token, { routing: true, minutes: 60 });
    assert.equal(assigned.owner?.membershipId, owned.membershipId);
    pass('team/routing configuration, no eligible agent fallback remains Unassigned, explicit routing chooses property-authorized staff');

    // The real bounded worker processes this overdue owned task; no browser pump exists.
    const reminderTask = await createTask(property, options, 'Stage 09 reminder ' + token, { ownerId: owned.membershipId, minutes: -1 });
    await expect.poll(async () => (await read('/api/tasks/reminders?pageSize=100')).items.some(item => item.taskId === reminderTask.id), { timeout: 45000, intervals: [1000, 3000, 5000] }).toBe(true);
    await go('?view=reminders');
    let reminder = (await read('/api/tasks/reminders?pageSize=100')).items.find(item => item.taskId === reminderTask.id); assert(reminder);
    const card = workspace().locator('[data-task-reminder="' + reminder.id + '"]');
    await card.getByLabel('Snooze duration for ' + reminderTask.title, { exact: true }).selectOption('15');
    await card.getByRole('button', { name: 'Snooze reminder', exact: true }).click();
    await expect(page).toHaveURL(/saved=snooze/);
    reminder = (await read('/api/tasks/reminders?pageSize=100')).items.find(item => item.taskId === reminderTask.id);
    assert.equal(reminder.status, 'snoozed'); assert.equal(reminder.snoozeCount, 1);
    await workspace().locator('[data-task-reminder="' + reminder.id + '"]').getByRole('button', { name: 'Complete task:', exact: false }).click();
    await expect(page).toHaveURL(/saved=reminder-complete/);
    assert.equal((await read('/api/tasks/' + reminderTask.id)).task.status, 'completed');
    assert(!(await read('/api/tasks/reminders?pageSize=100')).items.some(item => item.taskId === reminderTask.id));
    const beforeRefresh = (await read('/api/tasks?view=team&status=all')).total;
    await page.reload(); await expect(workspace()).toBeVisible(); await page.reload(); await expect(workspace()).toBeVisible();
    assert.equal((await read('/api/tasks?view=team&status=all')).total, beforeRefresh);
    pass('real in-app worker delivery, permitted snooze, immediate completion cancellation and refresh duplicate prevention');
  }

  for (const path of ['?view=new', '?view=routing', '?view=reminders']) { await go(path); await labels(); }
  await go('?view=team');
  await page.screenshot({ path: '.local/screenshots/stage09-tasks-desktop.png', fullPage: true });
  for (const width of [320, 390, 768, 1586]) {
    await page.setViewportSize({ width, height: 1050 });
    for (const path of ['?view=team', '?view=new', '?view=routing', '?view=reminders']) {
      await go(path); await labels();
      const size = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
      assert(size.scroll <= size.client, path + ' has no page overflow at ' + width + ': ' + JSON.stringify(size));
    }
    if (width === 390) await page.screenshot({ path: '.local/screenshots/stage09-reminders-mobile.png', fullPage: true });
  }
  await page.setViewportSize({ width: 1586, height: 1050 }); await go('?view=routing');
  await page.screenshot({ path: '.local/screenshots/stage09-routing-desktop.png', fullPage: true });
  await go('?view=new&propertyId=' + properties.items[0].id);
  await workspace().getByLabel('Related record type', { exact: true }).focus(); await page.keyboard.press('ArrowDown');
  await labels();
  pass('320/390/768/1586 responsive task, creation, routing and reminder pages; native labels and keyboard controls');

  phase = 'overview';
  await page.goto(url('/admin')); await expect(page.locator('[data-staff-shell]')).toBeVisible();
  assert.equal(await page.locator('.b-summary .b-stat').count(), 4, 'Overview retains exactly four approved metrics.');
  await expect(page.locator('[data-pipeline]')).toBeVisible();
  await page.goto(url('/admin/tasks?view=team')); await expect(workspace()).toBeVisible();
  await page.getByRole('button', { name: 'Account menu', exact: true }).click();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/login/); signedIn = false;
  assert.equal((await page.request.get(url('/api/tasks'))).status(), 401);
  await Promise.all(pending);
  assert.deepEqual(issues, []); assert.deepEqual(external, []); assert.deepEqual(unbounded, []); assert.deepEqual(legacy, []);
  if (!mutate) assert(mutations.every(item => /^POST \/api\/auth\/(login|logout)$/.test(item)), 'Retained preview records are read-only.');
  pass('approved uncluttered overview, normal logout, protected API, bounded requests and no external communication');
  console.log('PASS all ' + groups + ' task browser groups (' + (mutate ? 'owned isolated write environment' : 'retained read-only demo') + ')');
} finally {
  if (signedIn) await page.request.post(url('/api/auth/logout'), { headers: { Origin: base.origin } }).catch(() => {});
  await context.close(); await browser.close();
}