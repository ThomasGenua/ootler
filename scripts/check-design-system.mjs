import assert from 'node:assert/strict';
import {mkdir, readFile, writeFile, readdir, access} from 'node:fs/promises';
import path from 'node:path';
import {chromium, expect} from '@playwright/test';

// Presentation-only checks. Do not seed/reset records or invoke outbound services.
// The browser blocks all non-local traffic and API writes except its own normal
// login/logout. The component workbench has no access to business operations.
const base = new URL(process.env.OOTLA_CHECK_URL || 'http://127.0.0.1:7673');
const output = path.resolve('.local/design-system-check');
await mkdir(output, {recursive: true});
const browser = await chromium.launch({headless: true, channel: process.env.OOTLA_BROWSER_CHANNEL || 'chrome'});
const context = await browser.newContext({viewport: {width: 1440, height: 1000}, reducedMotion: 'no-preference'});
const page = await context.newPage();
const observations = {base: base.origin, checks: [], contrast: [], routes: [], blockedWrites: [], externalRequests: [], pageErrors: [], sessionOpened: false, build: ''};
const record = message => {observations.checks.push(message); console.log('PASS ' + message);};
let allowedLogin = false;
let allowedLogout = false;
page.on('pageerror', error => observations.pageErrors.push(error.message));
await context.route('**/*', async route => {
  const request = route.request(), url = new URL(request.url());
  if (/^https?:$/.test(url.protocol) && url.origin !== base.origin) {
    observations.externalRequests.push(url.origin + url.pathname);
    return route.abort('blockedbyclient');
  }
  if (url.pathname.startsWith('/api/') && !['GET', 'HEAD', 'OPTIONS'].includes(request.method())) {
    const auth = request.method() === 'POST' && ((allowedLogin && url.pathname === '/api/auth/login') || (allowedLogout && url.pathname === '/api/auth/logout'));
    if (!auth) {
      observations.blockedWrites.push(request.method() + ' ' + url.pathname);
      return route.abort('blockedbyclient');
    }
  }
  return route.continue();
});
const cssRgb = value => {
  if (/^#[\da-f]{6}$/i.test(value.trim())) return [1, 3, 5].map(start => parseInt(value.trim().slice(start, start + 2), 16));
  const numbers = value.match(/[\d.]+/g)?.map(Number);
  assert(numbers?.length >= 3, 'Expected an RGB or six-digit hexadecimal color, received ' + value);
  return numbers.slice(0, 3);
};
const luminance = color => cssRgb(color).map(channel => channel / 255).map(channel => channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4).reduce((total, channel, index) => total + channel * [.2126, .7152, .0722][index], 0);
const contrast = (foreground, background) => {
  const values = [luminance(foreground), luminance(background)].sort((a, b) => a - b);
  return (values[1] + .05) / (values[0] + .05);
};
async function focusVisible(locator) {
  const result = await locator.evaluate(element => {
    const style = getComputedStyle(element);
    return {width: parseFloat(style.outlineWidth), style: style.outlineStyle, color: style.outlineColor};
  });
  assert(result.width >= 2 && result.style !== 'none', 'Keyboard focus has an outline at least two pixels wide.');
  return result;
}
async function noOverflow(label) {
  const result = await page.evaluate(() => ({width: innerWidth, overflow: document.documentElement.scrollWidth - innerWidth}));
  assert(result.overflow <= 1, label + ' stays within the ' + result.width + 'px viewport (overflow ' + result.overflow + 'px).');
}
async function screenshot(name) {await page.screenshot({path: path.join(output, name + '.png'), fullPage: true});}
async function bounded(locator, label) {
  const geometry = await locator.evaluate(element => {
    const box = element.getBoundingClientRect(), style = getComputedStyle(element);
    return {left: box.left, right: box.right, width: box.width, height: box.height, viewport: innerWidth, viewportHeight: innerHeight, maxHeight: parseFloat(style.maxHeight), overflowY: style.overflowY};
  });
  assert(geometry.left >= -1 && geometry.right <= geometry.viewport + 1, label + ' fits the viewport.');
  return geometry;
}
async function checkTokenContrast() {
  const tokens = await page.evaluate(() => {
    const style = getComputedStyle(document.documentElement), names = ['canvas', 'accent', 'action', 'text', 'text-muted', 'border-control', 'focus', 'focus-ring', 'error', 'error-surface', 'warning', 'warning-surface', 'success', 'success-surface', 'surface', 'pale-clay', 'clay'];
    return Object.fromEntries(names.map(name => [name, style.getPropertyValue('--color-' + name).trim()]));
  });
  const token = (...names) => {
    for (const name of names) if (tokens[name]) return tokens[name];
    assert.fail('Missing semantic token: --color-' + names.join(' or --color-'));
  };
  assert.equal(token('canvas').toUpperCase(), '#FBF4E9');
  assert.equal(token('accent').toUpperCase(), '#C85135');
  assert.equal(token('action').toUpperCase(), '#B6432A');
  const pairs = [
    ['Primary label', '#FFFFFF', token('action'), 4.5],
    ['Body on canvas', token('text'), token('canvas'), 4.5],
    ['Body on card', token('text'), token('surface'), 4.5],
    ['Muted on canvas', token('text-muted'), token('canvas'), 4.5],
    ['Muted on card', token('text-muted'), token('surface'), 4.5],
    ['Action link', token('action'), token('canvas'), 4.5],
    ['Input boundary', token('border-control'), token('surface'), 3],
    ['Focus on card', token('focus-ring', 'focus'), token('surface'), 3],
    ['Error label', token('error'), token('error-surface'), 4.5],
    ['Warning label', token('warning'), token('warning-surface'), 4.5],
    ['Success label', token('success'), token('success-surface'), 4.5],
  ];
  for (const [name, foreground, background, minimum] of pairs) {
    const ratio = contrast(foreground, background);
    observations.contrast.push({name, foreground, background, ratio: Number(ratio.toFixed(2)), minimum});
    assert(ratio >= minimum, name + ' contrast ' + ratio.toFixed(2) + ':1 meets ' + minimum + ':1.');
  }
  assert(contrast('#FFFFFF', token('accent')) < 4.5, 'Starting accent is decorative; readable white controls use the deeper action token.');
  const appearance = await page.evaluate(() => ({background: getComputedStyle(document.body).backgroundColor, font: getComputedStyle(document.body).fontFamily, headingWeight: getComputedStyle(document.querySelector('.ds-marketing-heading')).fontWeight}));
  assert.deepEqual(cssRgb(appearance.background), cssRgb(token('canvas')));
  assert(/Inter/.test(appearance.font), 'Existing self-hosted Inter is used.');
  assert(Number(appearance.headingWeight) <= 500, 'Marketing heading is light/medium weight.');
  const rendered = await page.locator('.ds-button--primary').first().evaluate(element => ({color: getComputedStyle(element).color, background: getComputedStyle(element).backgroundColor}));
  assert(contrast(rendered.color, rendered.background) >= 4.5, 'Rendered primary button meets text contrast.');
  const brand = page.getByRole('img', {name: 'Ootla', exact: true});
  await expect(brand.locator('.brand-still .brand-roof')).toHaveCount(1);
  await expect(brand.locator('.brand-still .brand-first-o')).toHaveCount(1);
  await expect(brand.locator('.brand-motion .brand-roof')).toHaveCount(1);
  const pieces = await brand.evaluate(element => {
    const read = selector => {const style = getComputedStyle(element.querySelector(selector)); return {background: style.backgroundColor, mask: style.maskImage || style.webkitMaskImage, animation: style.animationName};};
    return {roof: read('.brand-still .brand-roof'), initial: read('.brand-still .brand-first-o'), motionRoof: read('.brand-motion .brand-roof')};
  });
  assert.deepEqual(cssRgb(pieces.roof.background), cssRgb(token('accent')), 'Roof keeps the terracotta brand accent.');
  assert.deepEqual(cssRgb(pieces.initial.background), cssRgb(token('text')), 'Initial O uses espresso.');
  assert(pieces.roof.mask.includes('ootla-wordmark.png') && pieces.initial.mask.includes('ootla-wordmark.png'), 'Palette masks preserve the original supplied logo artwork.');
  assert.equal(pieces.motionRoof.animation, 'ootla-roof-tip', 'Existing occasional roof-tip animation is retained.');
  record('Semantic colors, AA text contrast, 3:1 control/focus contrast, licensed Inter, lighter headings and original roof/O logo geometry');
}
async function checkWorkbench() {
  await page.goto(new URL('/design-system.html', base).href);
  await expect(page.getByRole('heading', {name: 'Ootla design system', exact: true})).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator('meta[name=robots]')).toHaveAttribute('content', 'noindex, nofollow');
  assert.equal(await page.locator('form').count(), 2, 'Workbench has only local search and pagination forms.');
  await checkTokenContrast();
  const primary = page.getByRole('button', {name: 'Add lead', exact: true});
  await primary.focus(); await page.keyboard.press('Tab'); await page.keyboard.press('Shift+Tab');
  await expect(primary).toBeFocused(); await focusVisible(primary);
  await expect(page.locator('#sample-name')).toHaveAccessibleName('Name');
  await page.locator('#sample-name').fill('Example person');
  await expect(page.locator('#sample-name')).toHaveValue('Example person');
  await expect(page.locator('#sample-error')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('#sample-error')).toHaveAttribute('aria-describedby', 'sample-error-error');
  await expect(page.getByRole('button', {name: 'Saving…', exact: true})).toBeDisabled();
  await expect(page.getByRole('button', {name: 'Search records', exact: true})).toHaveAccessibleName('Search records');
  const urlBefore = page.url();
  await page.locator('#sample-search').fill('Harbor House');
  await page.locator('#sample-search-form').getByRole('button', {name: 'Search', exact: true}).click();
  await expect(page.locator('#workbench-status')).toContainText('Harbor House');
  assert.equal(page.url(), urlBefore, 'Search is local without document navigation.');
  record('Buttons, icon labels, disabled state, input labels/errors, keyboard focus and local search');

  const menu = page.locator('details').filter({has: page.locator('#sample-menu')});
  await menu.locator('summary').focus(); await page.keyboard.press('Enter');
  await expect(menu).toHaveAttribute('open', '');
  const menuGeometry = await bounded(page.locator('#sample-menu'), 'Record menu');
  assert(Number.isFinite(menuGeometry.maxHeight) && ['auto', 'scroll'].includes(menuGeometry.overflowY), 'Menus have a bounded scroll area.');
  await page.keyboard.press('Escape'); await expect(menu).not.toHaveAttribute('open', '');
  await expect(menu.locator('summary')).toBeFocused();
  const filter = page.locator('details').filter({has: page.locator('#sample-filter-panel')});
  await filter.locator('summary').click();
  await page.locator('#sample-status').selectOption('open');
  await filter.getByRole('button', {name: 'Apply filters', exact: true}).click();
  await expect(filter).not.toHaveAttribute('open', '');
  await expect(page.locator('#sample-status')).toHaveValue('open');
  record('Compact filters retain their selection; native menus open with keyboard and close with Escape');

  const activity = page.getByRole('tab', {name: 'Activity', exact: true});
  await activity.focus(); await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', {name: 'Tasks', exact: true})).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#record-sections-tasks-panel')).toBeVisible();
  await expect(page.locator('#record-sections-activity-panel')).toBeHidden();
  await page.keyboard.press('End');
  await expect(page.getByRole('tab', {name: 'Documents', exact: true})).toBeFocused();
  await page.keyboard.press('Home'); await expect(activity).toBeFocused();
  record('Tabs support Arrow, Home and End keys with one selected panel');

  const openDialog = page.getByRole('button', {name: 'Open dialog', exact: true});
  await openDialog.click();
  const dialog = page.locator('#sample-dialog');
  await expect(dialog).toBeVisible(); await bounded(dialog, 'Dialog');
  await expect(dialog.getByRole('heading')).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(dialog.getByRole('button', {name: 'Save changes', exact: true})).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(dialog.getByRole('button', {name: 'Close Edit details', exact: true})).toBeFocused();
  await page.keyboard.press('Escape'); await expect(dialog).toBeHidden(); await expect(openDialog).toBeFocused();
  await page.getByRole('button', {name: 'Open drawer', exact: true}).click();
  await expect(page.locator('#sample-drawer')).toBeVisible(); await bounded(page.locator('#sample-drawer'), 'Drawer');
  await page.locator('#sample-drawer').getByRole('button', {name: 'Done', exact: true}).click();
  await expect(page.locator('#sample-drawer')).toBeHidden();
  await page.getByRole('button', {name: 'Confirm action', exact: true}).click();
  await expect(page.locator('#sample-confirm')).toHaveAttribute('role', 'alertdialog');
  await page.locator('#sample-confirm').getByRole('button', {name: 'Cancel', exact: true}).click();
  await page.getByRole('button', {name: 'Confirm action', exact: true}).click();
  await page.locator('#sample-confirm').getByRole('button', {name: 'Complete task', exact: true}).click();
  await expect(page.locator('#workbench-status')).toContainText('Example task completed.');
  record('Native modal dialog, focus containment/restoration, drawer and explicit confirmation');

  await page.getByRole('button', {name: 'Show toast', exact: true}).click();
  await expect(page.locator('#workbench-toast [role=status]')).toBeVisible();
  await page.getByRole('button', {name: 'Dismiss toast', exact: true}).click();
  await expect(page.locator('#workbench-toast')).toBeEmpty();
  await expect(page.locator('.ds-skeleton')).toHaveAttribute('role', 'status');
  await expect(page.locator('.ds-state--error')).toHaveAttribute('role', 'alert');
  await expect(page.locator('.ds-avatar').first()).toHaveAccessibleName('Maya Chen');
  await expect(page.locator('.ds-attachment img')).toHaveAttribute('alt', 'Sunlit apartment interior');
  await expect(page.locator('.ds-summary .ds-metric')).toHaveCount(4);
  record('Accessible toasts, skeleton, empty/error states, numeric summary, avatars and attachment preview');

  await page.locator('#tables').scrollIntoViewIfNeeded();
  const documentIdentity = await page.evaluate(() => {window.__designDocumentIdentity = Math.random(); return window.__designDocumentIdentity;});
  const scrollBefore = await page.evaluate(() => scrollY);
  await expect(page.locator('#sample-table tbody tr')).toHaveCount(10);
  await page.locator('#sample-table').getByRole('link', {name: 'Next', exact: true}).click();
  await expect(page.locator('#sample-table tbody tr')).toHaveCount(10);
  await expect(page.locator('.table-pagination-count')).toHaveText('11–20 of 24');
  assert.equal(await page.evaluate(() => window.__designDocumentIdentity), documentIdentity, 'Pagination did not replace the document.');
  assert(Math.abs(await page.evaluate(() => scrollY) - scrollBefore) < 140, 'Pagination preserves nearby reading position.');
  await page.getByLabel('Rows per page', {exact: true}).selectOption('25');
  await page.locator('.table-page-size').getByRole('button', {name: 'Apply', exact: true}).click();
  await expect(page.locator('#sample-table tbody tr')).toHaveCount(24);
  await expect(page.locator('.table-pagination-count')).toHaveText('1–24 of 24');
  const selectorWidth = await page.getByLabel('Rows per page', {exact: true}).evaluate(element => element.getBoundingClientRect().width);
  assert(selectorWidth <= 120, 'Rows per page is compact.');
  record('Real shared pagination, ten-row default, page-size reset and no document reload/page jump');
  await page.evaluate(() => scrollTo({top: 0, behavior: 'instant'}));
  await screenshot('workbench-desktop');

  for (const width of [390, 320]) {
    await page.setViewportSize({width, height: 844});
    await noOverflow('Workbench');
    await bounded(page.locator('.ds-table-frame'), 'Table scrolling frame');
    await page.locator('#tables').scrollIntoViewIfNeeded();
    await bounded(page.locator('.table-pagination'), 'Compact pagination');
    await page.getByRole('button', {name: 'Open dialog', exact: true}).click();
    await bounded(dialog, 'Mobile dialog');
    await dialog.getByRole('button', {name: 'Close Edit details', exact: true}).click();
    await page.getByRole('button', {name: 'Open drawer', exact: true}).click();
    await bounded(page.locator('#sample-drawer'), 'Mobile drawer');
    await page.keyboard.press('Escape');
    await menu.locator('summary').click();
    await bounded(page.locator('#sample-menu'), 'Mobile menu');
    await page.keyboard.press('Escape');
    await page.evaluate(() => scrollTo({top: 0, behavior: 'instant'}));
    await screenshot('workbench-' + width);
  }
  await page.emulateMedia({reducedMotion: 'reduce'});
  const animations = await page.locator('.ds-skeleton span, .wordmark .brand-piece').evaluateAll(elements => elements.map(element => ({animation: getComputedStyle(element).animationName, duration: parseFloat(getComputedStyle(element).animationDuration)})));
  assert(animations.every(animation => animation.animation === 'none' || animation.duration <= .001), 'Reduced motion removes skeleton and logo animation.');
  record('390px/320px responsive controls, bounded tables/pagination/overlays and reduced motion');
}
async function checkExistingRoutes() {
  await page.setViewportSize({width: 1440, height: 1000});
  await page.goto(new URL('/admin/login', base).href);
  await expect(page.locator('#login-form')).toBeVisible();
  await expect(page.locator('#login-password')).toHaveAttribute('type', 'password');
  await screenshot('login-desktop');
  await expect(page.locator('#login-submit')).toBeEnabled();
  const fill = page.locator('#fill-demo');
  if (!await fill.isVisible()) {
    observations.routes.push({route: '/admin/login', result: 'Login rendered. Staff routes skipped: isolated demo login helper is not available.'});
    return;
  }
  await fill.click();
  allowedLogin = true;
  try {
    await page.locator('#login-form').getByRole('button', {name: /Sign in to your workspace/}).click();
    await expect(page.locator('.admin-app')).toBeVisible();
    observations.sessionOpened = true;
  } finally {allowedLogin = false;}
  for (const route of ['/admin/tasks', '/admin/properties', '/admin/leads', '/admin/maintenance']) {
    await page.goto(new URL(route, base).href);
    await expect(page.locator('.admin-app')).toBeVisible();
    await expect(page.locator('#main-content')).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await noOverflow(route);
    const tables = await page.locator('table').evaluateAll(elements => elements.map(element => getComputedStyle(element).backgroundColor));
    assert(tables.every(color => color === 'rgb(255, 255, 255)'), route + ' tables have white card surfaces.');
    const summaries=await page.locator('.summary-metric').evaluateAll(elements=>elements.map(element=>getComputedStyle(element).backgroundColor));
    assert(summaries.length===4 && summaries.every(color=>color==='rgb(59, 50, 43)'),route+' uses warm shared summary surfaces.');
    const recordLink=page.locator('table a:not([class*="button"])').first();
    if(await recordLink.count())assert.equal(await recordLink.evaluate(element=>getComputedStyle(element).color),'rgb(182, 67, 42)',route+' record links use the shared action shade.');
    const canvas = await page.locator('.admin-app').evaluate(element => getComputedStyle(element).backgroundColor);
    observations.routes.push({route, desktop: 'passed', tables: tables.length, canvas});
    await screenshot(route.replaceAll('/', '-').slice(1) + '-desktop');
    await page.setViewportSize({width: 390, height: 844});
    await noOverflow(route + ' mobile');
    for (const selector of await page.locator('.table-page-size select').all()) assert(await selector.evaluate(element => element.getBoundingClientRect().width) <= 120, route + ' mobile page-size dropdown remains compact.');
    await screenshot(route.replaceAll('/', '-').slice(1) + '-390');
    await page.setViewportSize({width: 1440, height: 1000});
  }
  record('Existing normal demo login and read-only Tasks, Properties, Leads and Maintenance desktop/mobile routes');
}
async function checkPublicContrast() {
  await page.setViewportSize({width: 1440, height: 1000});
  let checked = 0;
  for (const route of ['/', '/platform', '/integrations']) {
    await page.goto(new URL(route, base).href);
    await expect(page.locator('#main-content')).toBeVisible();
    const targets = await page.locator('.public-explore .text-link-light, .home-band-dark .story-copy>p, .public-section-dark .detail-copy p, .public-primary .detail-copy p, .public-primary-heading>p, .button-primary').evaluateAll(elements => {
      const rgba = value => {const values = value.match(/[\d.]+/g)?.map(Number) ?? []; return [values[0] ?? 0, values[1] ?? 0, values[2] ?? 0, values[3] ?? 1];};
      const blend = (fg, bg) => fg.slice(0, 3).map((value, index) => value * fg[3] + bg[index] * (1 - fg[3]));
      return elements.filter(element => element.getClientRects().length > 0).map(element => {
        const ancestors = []; for (let node = element; node; node = node.parentElement) ancestors.push(node);
        let background = [255, 255, 255];
        for (const node of ancestors.reverse()) background = blend(rgba(getComputedStyle(node).backgroundColor), background);
        const style = getComputedStyle(element);
        return {className: element.className, text: element.textContent.trim().slice(0, 90), foreground: style.color, background: 'rgb(' + background.map(Math.round).join(', ') + ')'};
      });
    });
    assert(targets.length, route + ' has representative public colors to check.');
    for (const target of targets) {
      const ratio = contrast(target.foreground, target.background);
      observations.contrast.push({name: route + ' ' + target.className, ...target, ratio: Number(ratio.toFixed(2)), minimum: 4.5});
      assert(ratio >= 4.5, route + ' ' + target.className + ' contrast ' + ratio.toFixed(2) + ':1 for ' + target.text);
      checked += 1;
    }
    await noOverflow(route + ' public desktop');
    await screenshot((route === '/' ? 'home' : route.slice(1)) + '-desktop');
    await page.setViewportSize({width: 390, height: 844});
    await noOverflow(route + ' public mobile');
    await page.setViewportSize({width: 1440, height: 1000});
  }
  record('Rendered public CTA/dark-copy/Explore contrast (' + checked + ' text elements), homepage/platform/integrations responsive bounds');
}
async function checkBuildExclusion() {
  const dist = path.resolve('dist/client');
  try {await access(dist);} catch {observations.build = 'No compiled client present; exclusion check awaits the required build.'; return;}
  const paths = [];
  async function walk(directory) {for (const entry of await readdir(directory, {withFileTypes: true})) {const target = path.join(directory, entry.name); if (entry.isDirectory()) await walk(target); else paths.push(target);}}
  await walk(dist);
  assert(!paths.some(file => /design-system(?:-preview)?\.(?:html|[cm]?js)$/.test(path.basename(file))), 'Workbench entry is not emitted in the application build.');
  for (const file of paths.filter(file => /\.(?:html|[cm]?js)$/.test(file))) {
    const source = await readFile(file, 'utf8');
    assert(!source.includes('Ootla design system — development workbench') && !source.includes('Representative components. Example content only'), 'Workbench content does not enter the production bundle.');
  }
  observations.build = 'Workbench HTML and component showcase excluded from compiled application.';
  record(observations.build);
}
try {
  await checkWorkbench();
  await checkExistingRoutes();
  await checkPublicContrast();
  await checkBuildExclusion();
  assert.deepEqual(observations.externalRequests, [], 'No external network requests were attempted.');
  assert.deepEqual(observations.blockedWrites, [], 'No business API writes were attempted.');
  assert.deepEqual(observations.pageErrors, [], 'No uncaught browser errors.');
  record('No business writes, external traffic or uncaught browser errors');
} catch (error) {
  observations.failure = error.stack || String(error);
  await screenshot('failure').catch(() => {});
  throw error;
} finally {
  if (observations.sessionOpened) {
    allowedLogout = true;
    try {
      const logout = await context.request.post(new URL('/api/auth/logout', base).href, {headers: {Origin: base.origin}});
      observations.logoutStatus = logout.status();
    } finally {allowedLogout = false;}
  }
  await writeFile(path.join(output, 'observations.json'), JSON.stringify(observations, null, 2) + '\n');
  await browser.close();
}
