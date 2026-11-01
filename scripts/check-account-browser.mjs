import 'dotenv/config';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';

const retained = new URL(process.env.APP_URL || 'http://127.0.0.1:7673');
const base = new URL(process.env.OOTLA_CHECK_URL || retained.href);
assert(base.protocol === 'http:' && base.hostname === '127.0.0.1' && base.port, 'Use the project-owned loopback preview.');
const scratch = process.env.OOTLA_CHECK_DATABASE || '';
const mutate = Boolean(scratch);
if (mutate) {
  assert(/^ootla_demo_account_browser_[a-f0-9]{32}$/.test(scratch), 'Writes require an owned account browser database.');
  assert(!['5173', '7673', '3100'].includes(base.port), 'Never write through a retained preview port.');
  assert.notEqual(base.origin, retained.origin, 'Never mutate the configured retained origin.');
}
const browser = await chromium.launch({ headless: true, channel: process.env.OOTLA_BROWSER_CHANNEL || 'chrome' });
const context = await browser.newContext({ viewport: { width: 1586, height: 1050 } });
const page = await context.newPage();
page.setDefaultTimeout(15000);
const errors = [], outside = [], legacy = [], writes = [];
let groups = 0, peer;
const pass = text => { groups += 1; console.log('PASS ' + text); };
const url = path => new URL(path, base).href;
const workspace = () => page.locator('[data-account-workspace]');
page.on('pageerror', error => errors.push(error.message));
page.on('request', request => {
  const target = new URL(request.url());
  if (/^https?:$/.test(target.protocol) && target.origin !== base.origin) outside.push(target.origin + target.pathname);
  if (target.pathname === '/api/demo/data') legacy.push(target.pathname);
  if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) writes.push(request.method() + ' ' + target.pathname);
});
async function read(path) { const response = await page.request.get(url(path)); assert.equal(response.status(), 200, path); return response.json(); }
async function go(path) { await page.goto(url(path)); await expect(workspace()).toBeVisible(); }
async function signIn(target, email = 'account-check@example.test', password = 'AccountCheck!2026', path = '/admin/login?returnTo=%2Fadmin%2Fprofile') {
  await target.goto(url(path));
  await target.getByLabel('Email address', { exact: true }).fill(email);
  await target.getByLabel('Password', { exact: true }).fill(password);
  await expect(target.getByRole('button', { name: /Sign in/ })).toBeEnabled();
  await target.getByRole('button', { name: /Sign in/ }).click();
  await expect(target.locator('[data-staff-shell]')).toBeVisible();
}
async function signOut() { const response = await page.request.post(url('/api/auth/logout'), { headers: { Origin: base.origin } }); assert.equal(response.status(), 204); }
async function labels() {
  const missing = await workspace().evaluate(root => [...root.querySelectorAll('input,select,textarea')].filter(control => control.type !== 'hidden' && !control.labels?.length && !control.getAttribute('aria-label')).map(control => control.name));
  assert.deepEqual(missing, []);
}
try {
  await page.goto(url('/admin/profile'));
  await expect(page).toHaveURL(/\/admin\/login\?returnTo=%2Fadmin%2Fprofile/);
  if (mutate) await signIn(page);
  else {
    await page.getByRole('button', { name: 'Fill demo credentials', exact: true }).click();
    assert.equal(writes.length, 0, 'Filling credentials does not authenticate.');
    await page.getByRole('button', { name: /Sign in/ }).click();
    await expect(workspace()).toBeVisible();
  }
  await expect(workspace().getByRole('heading', { name: 'Your profile', exact: true })).toBeVisible();
  const account = await read('/api/account');
  await expect(workspace()).toContainText(account.profile.email);
  await expect(workspace()).toContainText(account.profile.organization.name);
  assert.equal(await workspace().locator('input[name=email],select[name=role],select[name=organizationId]').count(), 0);
  pass('protected profile route, normal sign-in and read-only email/organization/role context');

  const menu = page.getByRole('button', { name: 'Account menu', exact: true });
  await menu.focus(); await page.keyboard.press('Enter');
  await expect(menu).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('#b-account').getByRole('link', { name: 'My profile', exact: true })).toBeVisible();
  await expect(page.locator('#b-account').getByRole('link', { name: 'Settings', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(menu).toHaveAttribute('aria-expanded', 'false');
  await expect(menu).toBeFocused();
  await menu.click();
  await page.locator('#b-account').getByRole('link', { name: 'My profile', exact: true }).click();
  await workspace().getByRole('link', { name: 'Edit profile', exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/profile\?edit=1/);
  await expect(workspace().getByRole('heading', { name: 'Edit your profile', exact: true })).toBeVisible();
  await labels();
  await menu.click();
  await page.locator('#b-account').getByRole('link', { name: 'Settings', exact: true }).click();
  await expect(page.locator('#workspace-title')).toHaveText('Settings');
  await labels();
  assert.equal(legacy.length, 0, 'Account pages do not load unrelated demonstration customer records.');
  pass('profile dropdown destinations, keyboard Enter/Escape and native labeled forms');

  if (mutate) {
    await go('/admin/profile?edit=1');
    const profile = workspace().locator('[data-account-form=profile]');
    await profile.getByLabel('Display name', { exact: true }).fill('Account Reviewer');
    await profile.getByLabel('Phone number', { exact: true }).fill('+44 7700 123456');
    await profile.getByLabel('Job title', { exact: true }).fill('Leasing <review>');
    await profile.getByRole('button', { name: 'Save profile', exact: true }).click();
    await expect(page).toHaveURL(/saved=profile/);
    await expect(workspace().getByRole('status')).toContainText('Your profile has been saved.');
    await expect(workspace()).toContainText('Leasing <review>');
    assert.equal(await workspace().locator('review').count(), 0);
    await expect(page.locator('.b-rail-profile .b-avatar')).toHaveText('AR');
    await page.reload(); await expect(workspace()).toBeVisible();
    const saved = await read('/api/account');
    assert.equal(saved.profile.displayName, 'Account Reviewer');
    assert.equal(saved.profile.phone, '+44 7700 123456');
    assert.equal(saved.profile.jobTitle, 'Leasing <review>');
    assert.equal(saved.profile.email, account.profile.email);
    pass('real profile updates, HTML-safe display, header identity and refresh persistence');

    await go('/admin/profile?edit=1');
    const current = await read('/api/account');
    const response = await page.request.patch(url('/api/account/profile'), { headers: { Origin: base.origin }, data: { version: current.profile.version, displayName: current.profile.displayName, phone: current.profile.phone, jobTitle: 'Reviewed in another session' } });
    assert.equal(response.status(), 200);
    await workspace().getByLabel('Job title', { exact: true }).fill('Stale edit must not overwrite');
    await workspace().getByRole('button', { name: 'Save profile', exact: true }).click();
    await expect(workspace().locator('[data-account-error]')).not.toBeEmpty();
    await expect(workspace().getByRole('link', { name: 'Reload current information', exact: true })).toBeVisible();
    assert.equal((await read('/api/account')).profile.jobTitle, 'Reviewed in another session');
    await workspace().getByRole('link', { name: 'Reload current information', exact: true }).click();
    await expect(workspace().getByLabel('Job title', { exact: true })).toHaveValue('Reviewed in another session');
    pass('conflicting profile edit is rejected and recovery loads the current version');

    await go('/admin/settings');
    const preferences = workspace().locator('[data-account-form=preferences]');
    await preferences.getByLabel('Start page after sign-in', { exact: true }).selectOption('/admin/tasks');
    await preferences.getByLabel('Default leads view', { exact: true }).selectOption('board');
    await preferences.getByLabel('Motion', { exact: true }).selectOption('reduce');
    await preferences.getByRole('button', { name: 'Save preferences', exact: true }).click();
    await expect(page).toHaveURL(/saved=preferences/);
    await expect(workspace().getByRole('status')).toContainText('Your workspace preferences have been saved.');
    await expect(page.locator('body')).toHaveAttribute('data-account-motion', 'reduce');
    await page.reload(); await expect(workspace()).toBeVisible();
    assert.equal((await read('/api/account')).preferences.leadView, 'board');
    await page.goto(url('/admin/leads'));
    await expect(page.locator('nav[aria-label="Lead views"] a[aria-current=page]')).toHaveText('Board view');
    await page.goto(url('/admin/leads?view=list'));
    await expect(page.locator('nav[aria-label="Lead views"] a[aria-current=page]')).toHaveText('List view');
    await signOut();
    await signIn(page, undefined, undefined, '/admin/login');
    await expect(page).toHaveURL(url('/admin/tasks'));
    await expect(page.locator('[data-task-workspace]')).toBeVisible();
    await signOut();
    await signIn(page, undefined, undefined, '/admin/login?returnTo=%2Fadmin%2Fsettings');
    await expect(page).toHaveURL(url('/admin/settings'));
    pass('persistent preferences control default page, explicit return route, default leads view and reduced motion');

    peer = await browser.newContext();
    const peerPage = await peer.newPage();
    await signIn(peerPage);
    await go('/admin/settings');
    const password = workspace().locator('[data-account-form=password]');
    await expect(password.getByLabel('Current password', { exact: true })).toHaveAttribute('autocomplete', 'current-password');
    await expect(password.getByLabel('New password', { exact: true })).toHaveAttribute('autocomplete', 'new-password');
    await password.getByLabel('Current password', { exact: true }).fill('WrongCurrent!2026');
    await password.getByLabel('New password', { exact: true }).fill('AccountChanged!2026');
    await password.getByLabel('Confirm new password', { exact: true }).fill('AccountChanged!2026');
    await password.getByRole('button', { name: 'Change password and sign out', exact: true }).click();
    await expect(password.locator('[data-account-error]')).not.toBeEmpty();
    await expect(password.getByLabel('Current password', { exact: true })).toHaveValue('');
    assert.equal((await peerPage.request.get(url('/api/auth/me'))).status(), 200);
    await password.getByLabel('Current password', { exact: true }).fill('AccountCheck!2026');
    await password.getByLabel('New password', { exact: true }).fill('AccountChanged!2026');
    await password.getByLabel('Confirm new password', { exact: true }).fill('AccountChanged!2026');
    await password.getByRole('button', { name: 'Change password and sign out', exact: true }).click();
    await expect(page).toHaveURL(/\/admin\/login\?passwordChanged=1/);
    await expect(page.getByRole('status').filter({ hasText: /new password|password.*changed|password.*updated/i })).toBeVisible();
    assert.equal((await peerPage.request.get(url('/api/auth/me'))).status(), 401, 'Password changes revoke other sessions.');
    await signIn(page, 'account-check@example.test', 'AccountChanged!2026');
    await expect(workspace()).toBeVisible();
    pass('incorrect current password is denied, successful change revokes all sessions and normal new-password sign-in works');
    await signOut();
    await page.goto(url('/admin/login?returnTo=%2Fadmin%2Fsettings'));
    await page.getByRole('button', { name: 'Fill demo credentials', exact: true }).click();
    await page.getByRole('button', { name: /Sign in/ }).click();
    await expect(workspace()).toBeVisible();
  } else await go('/admin/settings');

  const shared = await read('/api/account');
  assert.equal(shared.access.canChangePassword, false);
  await expect(workspace().locator('[data-account-form=password]')).toHaveCount(0);
  await expect(workspace().locator('.ac-security-note')).toBeVisible();
  await expect(workspace().getByRole('heading', { name: 'Password and security', exact: true })).toBeVisible();
  pass('shared demo password remains fixed and settings accurately explains the guard');

  await mkdir('.local/screenshots', { recursive: true });
  for (const width of [320, 390, 768, 1586]) {
    await page.setViewportSize({ width, height: 1000 });
    await go('/admin/profile?edit=1'); await labels();
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Profile page fits ' + width + 'px');
    await page.getByRole('button', { name: 'Account menu', exact: true }).click();
    await expect(page.locator('#b-account').getByRole('link', { name: 'Settings', exact: true })).toBeVisible();
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Open account menu fits ' + width + 'px');
    await page.locator('#b-account').getByRole('link', { name: 'Settings', exact: true }).click();
    await labels();
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Settings page fits ' + width + 'px');
    if (width === 390 || width === 1586) await page.screenshot({ path: '.local/screenshots/account-settings-' + width + (mutate ? '-isolated' : '-retained') + '.png', fullPage: true });
  }
  await page.getByRole('button', { name: 'Account menu', exact: true }).click();
  await page.locator('#b-account').getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/login/);
  assert.equal((await page.request.get(url('/api/auth/me'))).status(), 401);
  if (!mutate) assert.equal(writes.filter(item => item.startsWith('PATCH /api/account')).length, 0, 'Retained account checks never change customer or account data.');
  assert.deepEqual(errors, []); assert.deepEqual(outside, []);
  pass('320/390/768/1586 layouts, account menu bounds, accessible controls, normal dropdown sign-out and no external actions or browser errors');
  console.log('Account browser checks passed: ' + groups + ' groups (' + (mutate ? 'owned scratch writes' : 'retained demo read-only') + ').');
} finally {
  await page.request.post(url('/api/auth/logout'), { headers: { Origin: base.origin } }).catch(() => {});
  await peer?.close(); await context.close(); await browser.close();
}