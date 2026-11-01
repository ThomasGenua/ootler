import assert from 'node:assert/strict';
import {mkdir, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {chromium, expect as baseExpect} from '@playwright/test';

// This check uses the existing isolated demo without changing business records.
// Only its own ordinary login/logout may write; external requests are blocked.
const base = new URL(process.env.OOTLA_CHECK_URL || 'http://127.0.0.1:7673');
assert(['localhost', '127.0.0.1', '[::1]'].includes(base.hostname), 'Use an isolated loopback demo.');
const output = path.resolve('.local/admin-shell-check');
await mkdir(output, {recursive: true});
const expect = baseExpect.configure({timeout: 20000});
const observations = {base: base.origin, checks: [], routes: [], screenshots: [], externalRequests: [], blockedWrites: [], errors: [], serverErrors: [], sessionOpened: false};
const record = text => {observations.checks.push(text); console.log('PASS ' + text);};
const browser = await chromium.launch({headless: true, channel: process.env.OOTLA_BROWSER_CHANNEL || 'chrome'});
const context = await browser.newContext({viewport: {width: 1440, height: 1000}, reducedMotion: 'reduce'});
let page;
let documentRequests = 0;
let allowAuth = false;
await context.route('**/*', async route => {
  const request = route.request(), url = new URL(request.url());
  if (/^https?:$/.test(url.protocol) && url.origin !== base.origin) {
    observations.externalRequests.push(url.origin + url.pathname);
    return route.abort('blockedbyclient');
  }
  if (url.pathname.startsWith('/api/') && !['GET', 'HEAD', 'OPTIONS'].includes(request.method())) {
    const normalAuth = allowAuth && request.method() === 'POST' && ['/api/auth/login', '/api/auth/logout'].includes(url.pathname);
    if (!normalAuth) {
      observations.blockedWrites.push(request.method() + ' ' + url.pathname);
      return route.abort('blockedbyclient');
    }
  }
  return route.continue();
});
const routes = [
  ['/admin', 'Overview', '/admin'],
  ['/admin/leads', 'Leads', '/admin/leads'],
  ['/admin/properties', 'Properties', '/admin/properties'],
  ['/admin/contacts', 'Contacts', '/admin/properties'],
  ['/admin/renewals', 'Property renewals', '/admin/properties'],
  ['/admin/applications', 'Applications', '/admin/applications'],
  ['/admin/calendar', 'Calendar', '/admin/calendar'],
  ['/admin/tasks', 'My tasks', '/admin/tasks'],
  ['/admin/maintenance', 'Maintenance', '/admin/maintenance'],
  ['/admin/conversations', 'Conversations', '/admin/conversations'],
  ['/admin/ai', 'Ask Ootla', '/admin/ai'],
  ['/admin/reports', 'Reports', '/admin/reports'],
  ['/admin/analytics', 'Analytics', '/admin/reports'],
  ['/admin/settings', 'Settings', '/admin/settings'],
  ['/admin/profile', 'My profile', '/admin/settings'],
  ['/admin/organization', 'Organization', '/admin/settings'],
  ['/admin/integrations', 'Integrations', '/admin/settings'],
  ['/admin/imports', 'Customer-data import', '/admin/settings'],
  ['/admin/automations', 'Automations', '/admin/settings'],
  ['/admin/resident-access', 'Resident access', '/admin/settings'],
  ['/admin/integration-health', 'Integration health', '/admin/settings'],
  ['/admin/audit', 'Audit history', '/admin/settings'],
  ['/admin/voice', 'Voice', '/admin/settings'],
];
const rail = () => page.locator('.admin-rail');
const nav = () => page.locator('.admin-rail-nav');
const header = () => page.locator('.admin-utility-header');
const viewportBounds = async (locator, name) => {
  const rect = await locator.evaluate(element => {const r = element.getBoundingClientRect(); return {left:r.left, right:r.right, top:r.top, bottom:r.bottom, viewportWidth:innerWidth, viewportHeight:innerHeight};});
  assert(rect.left >= -1 && rect.right <= rect.viewportWidth + 1 && rect.top >= -1 && rect.bottom <= rect.viewportHeight + 1, name + ' stays inside the viewport: ' + JSON.stringify(rect));
};
const noOverflow = async label => {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  if(overflow>1)observations.overflow=await page.locator('body *').evaluateAll(elements=>elements.filter(element=>{const r=element.getBoundingClientRect();return r.width&&r.right>innerWidth+1&&getComputedStyle(element).position!=='fixed';}).slice(0,12).map(element=>{const r=element.getBoundingClientRect();return {tag:element.tagName,className:element.className,left:r.left,right:r.right,width:r.width};}));
  assert(overflow <= 1, label + ' has no document horizontal overflow (' + overflow + 'px).');
};
const screenshot = async name => {
  const filename = name + '.png';
  await page.screenshot({path: path.join(output, filename), fullPage: true});
  observations.screenshots.push(filename);
};
const open = async (route, title, active) => {
  await page.goto(new URL(route, base).href);
  await expect(page.locator('.admin-shell-v2')).toBeVisible();
  if (title) await expect(page.locator('#workspace-title')).toHaveText(title);
  await expect(page.locator('main')).not.toContainText('This workspace could not be opened');
  if (active) {
    await expect(nav().locator('[aria-current="page"]')).toHaveCount(1);
    await expect(nav().locator('[aria-current="page"]')).toHaveAttribute('href', active);
  }
};
async function checkDirectoryAction() {
  await open('/admin/maintenance?pageSize=10', 'Maintenance', '/admin/maintenance');
  const response = await page.request.get(new URL('/api/maintenance?pageSize=10', base).href);
  assert.equal(response.status(), 200);
  const directory = await response.json();
  assert(directory.items.length, 'Existing isolated demo has a maintenance request for the read-only form test.');
  const property = directory.items[0].property.name;
  const search = page.locator('[data-maintenance-search]');
  await expect(search).toBeVisible();
  await page.locator('[data-maintenance-filters] summary').click();
  await page.locator('[data-maintenance-filter] [name="status"]').selectOption('all');
  await page.locator('[data-maintenance-filter] button[type="submit"]').click();
  await expect(page.locator('#app')).not.toHaveAttribute('data-refresh-pending','true');
  await expect(page.locator('#main-content')).not.toHaveAttribute('aria-busy','true');
  // Existing domain filters preserve their open state; shell work must not
  // change that behavior merely to satisfy a presentation check.
  if(await page.locator('[data-maintenance-filters]').getAttribute('open')!==null)await page.locator('[data-maintenance-filters] summary').click();
  await page.locator('#maintenance-search').fill(property);
  await page.locator('#maintenance-search').focus();
  await page.evaluate(() => {
    window.__shellFormRoot = document.querySelector('.admin-app');
    window.__shellFormHeader = document.querySelector('.admin-utility-header');
    window.__shellFormRail = document.querySelector('.admin-rail');
    window.__shellFormLauncher = document.querySelector('.ask-floating-launcher');
    window.scrollTo({top: Math.min(240, document.documentElement.scrollHeight-innerHeight), behavior:'instant'});
  });
  const before = await page.evaluate(() => ({top: scrollY, max: document.documentElement.scrollHeight-innerHeight}));
  assert(before.top>20,'The representative directory action starts away from the top of a scrollable page.');
  const documentsBefore = documentRequests;
  const expected = page.waitForResponse(r => {
    const url = new URL(r.url());
    return url.pathname === '/api/maintenance' && url.searchParams.get('q') === property;
  });
  // Submit by keyboard so the action does not first scroll a button into view.
  await page.locator('#maintenance-search').press('Enter');
  const result = await expected;
  assert.equal(result.status(), 200);
  const filtered = await result.json();
  await expect(page.locator('#app')).not.toHaveAttribute('data-refresh-pending','true');
  await expect(page.locator('#main-content')).not.toHaveAttribute('aria-busy','true');
  await expect(page.locator('#maintenance-search')).toHaveValue(property);
  await expect.poll(() => new URL(page.url()).searchParams.get('q')).toBe(property);
  assert.equal(new URL(page.url()).searchParams.get('pageSize'), '10');
  assert(!new URL(page.url()).searchParams.has('page') || new URL(page.url()).searchParams.get('page') === '1');
  await expect(page.locator('[data-maintenance-results] table tbody tr')).toHaveCount(filtered.items.length);
  await expect(page.locator('[data-maintenance-results] table')).toContainText(property);
  assert.equal(documentRequests, documentsBefore, 'Searching does not request a new document.');
  const after = await page.evaluate(() => ({
    top:scrollY, max:document.documentElement.scrollHeight-innerHeight,
    sameRoot:window.__shellFormRoot===document.querySelector('.admin-app'),
    sameHeader:window.__shellFormHeader===document.querySelector('.admin-utility-header'),
    sameRail:window.__shellFormRail===document.querySelector('.admin-rail'),
    sameLauncher:window.__shellFormLauncher===document.querySelector('.ask-floating-launcher'),
  }));
  assert(after.sameRoot && after.sameHeader && after.sameRail && after.sameLauncher, 'Searching retains the surrounding shell DOM and assistant.');
  assert(Math.abs(after.top-Math.min(before.top,after.max))<=5, 'Directory search preserves the page position unless the shorter result bounds it.');
  const sizes = page.locator('[data-maintenance-results-pagination] select[name="pageSize"]');
  await sizes.selectOption('25');
  await expect.poll(() => new URL(page.url()).searchParams.get('pageSize')).toBe('25');
  await expect(page.locator('#app')).not.toHaveAttribute('data-refresh-pending','true');
  await expect(page.locator('#main-content')).not.toHaveAttribute('aria-busy','true');
  await expect(page.locator('#maintenance-search')).toHaveValue(property);
  assert.equal(documentRequests, documentsBefore, 'Changing rows per page does not reload the document.');
  observations.formAction={route:'/admin/maintenance',query:property,matchedRows:filtered.items.length,documentsRequested:0,beforeScroll:before.top,afterScroll:after.top,shellDomPreserved:true,filtersPreserved:true,businessWrites:0};
  record('Maintenance search and rows-per-page use real scoped GET results, retain filters, shell DOM and scroll without document navigation');
  await screenshot('maintenance-filtered-desktop');
}
async function checkShell() {
  await open('/admin', 'Overview', '/admin');
  await expect(page.locator('[data-action="admin-menu"]')).toBeHidden();
  const navNames = ['Overview','Leads','Properties','Applications','Calendar','Tasks','Maintenance','Conversations','AI assistant','Reports','Settings'];
  await expect(nav().locator('a')).toHaveText(navNames);
  await expect(page.locator('.admin-top-nav')).toHaveCount(0);
  await expect(header().locator('[data-ask-ootla], [data-action="ask-ootla"]')).toHaveCount(0);
  await expect(page.locator('.ask-floating-launcher')).toHaveCount(1);
  assert.equal(await header().locator('.admin-header-actions>button[data-action]').last().getAttribute('data-action'), 'account-menu', 'Profile is the final utility control.');
  await expect(header().locator('[data-action="lead-search"]')).toBeVisible();
  await expect(header().locator('[data-action="notifications"]')).toBeVisible();
  await expect(header().locator('[data-action="account-menu"]')).toBeVisible();
  await expect(page.locator('main h1')).toHaveCount(0);
  await expect(page.locator('h1#workspace-title')).toHaveCount(1);
  await expect(nav().locator('a[href="/admin/voice"]')).toHaveCount(0);
  await viewportBounds(rail(), 'Desktop navigation rail');
  await viewportBounds(page.locator('.ask-floating-launcher'), 'Floating assistant');
  await noOverflow('Overview desktop');
  await screenshot('overview-desktop');
  record('One compact utility header, one labeled rail, one page title and one floating assistant; Reports immediately before Settings');

  // Primary destinations use the SPA links; every retained inner route is also
  // exercised directly so a secondary page cannot silently lose its parent state.
  for (const [route, title, active] of routes) {
    if (route === active) {
      await page.evaluate(() => {window.__shellLauncher = document.querySelector('.ask-floating-launcher');});
      const documentsBefore = documentRequests;
      await nav().locator('a[href="'+route+'"]').click();
      await expect(page.locator('#workspace-title')).toHaveText(title);
      await expect(nav().locator('[aria-current="page"]')).toHaveAttribute('href',active);
      assert.equal(documentRequests, documentsBefore, route+' uses application navigation without a document reload.');
      assert(await page.evaluate(() => window.__shellLauncher===document.querySelector('.ask-floating-launcher')), 'Assistant launcher survives staff navigation.');
    } else await open(route,title,active);
    await expect(page.locator('.admin-shell-v2')).toBeVisible();
    await expect(page.locator('.ask-floating-launcher')).toHaveCount(1);
    await expect(page.locator('main')).not.toContainText('This workspace could not be opened');
    observations.routes.push({route,title,active});
  }
  await open('/admin/properties','Properties','/admin/properties');
  const propertySections=page.getByRole('navigation',{name:'Property and customer records',exact:true});
  await expect(propertySections.locator('a[href="/admin/contacts"]')).toBeVisible();
  await expect(propertySections.locator('a[href="/admin/renewals"]')).toBeVisible();
  await open('/admin/settings','Settings','/admin/settings');
  const settings=page.locator('[data-workspace-navigation="settings"]');
  for(const route of ['/admin/organization','/admin/integrations','/admin/resident-access','/admin/automations'])await expect(settings.locator('a[href="'+route+'"]').first()).toBeVisible();
  await open('/admin/reports','Reports','/admin/reports');
  await expect(page.locator('[data-workspace-navigation="reports"] a[href="/admin/analytics"]')).toBeVisible();
  record('All 23 existing staff routes load with their correct active parent; primary navigation preserves the floating assistant');
}
async function checkOverviewFilters(){
  await page.setViewportSize({width:1440,height:600});
  await open('/admin?period=week','Overview','/admin');
  await expect(page.locator('[data-action="admin-menu"]')).toBeHidden();
  const filters=page.locator('[data-shell-actions] .ds-filter');
  await expect(filters).toBeVisible();await filters.locator('summary').click();
  const checkbox=filters.locator('input[name="stage"]').first();
  const stage=await checkbox.inputValue();
  const toggle=async(checked)=>{
    await checkbox.evaluate(element=>element.focus({preventScroll:true}));
    await page.evaluate(()=>{
      window.__overviewRoot=document.querySelector('.admin-app');
      window.__overviewHeader=document.querySelector('.admin-utility-header');
      window.__overviewRail=document.querySelector('.admin-rail');
      window.__overviewLauncher=document.querySelector('.ask-floating-launcher');
      window.scrollTo({top:Math.min(180,document.documentElement.scrollHeight-innerHeight),behavior:'instant'});
    });
    const before=await page.evaluate(()=>scrollY),documentsBefore=documentRequests;
    const response=page.waitForResponse(response=>{
      const url=new URL(response.url());
      return url.pathname==='/api/tasks/follow-ups'&&(checked?url.searchParams.get('stages')===stage:!url.searchParams.has('stages'));
    });
    await page.keyboard.press('Space');
    const result=await response;assert.equal(result.status(),200);const data=await result.json();
    await expect(page.locator('#app')).not.toHaveAttribute('data-refresh-pending','true');
    await expect(page.locator('#main-content')).not.toHaveAttribute('aria-busy','true');
    await expect(checkbox).toBeChecked({checked});
    assert.equal(new URL(page.url()).searchParams.get('period'),'week','Changing the stage retains the selected period.');
    assert.equal(new URL(page.url()).searchParams.get('stages'),checked?stage:null);
    await expect(page.locator('[data-actionable-task]')).toHaveCount(Math.min(3,data.items.length));
    assert.equal(documentRequests,documentsBefore,'Overview filtering does not load a new document.');
    const after=await page.evaluate(()=>({top:scrollY,max:Math.max(0,document.documentElement.scrollHeight-innerHeight),
      app:window.__overviewRoot===document.querySelector('.admin-app'),header:window.__overviewHeader===document.querySelector('.admin-utility-header'),rail:window.__overviewRail===document.querySelector('.admin-rail'),launcher:window.__overviewLauncher===document.querySelector('.ask-floating-launcher')}));
    assert(after.app&&after.header&&after.rail&&after.launcher,'Overview filtering preserves the shell and floating assistant DOM.');
    assert(Math.abs(after.top-Math.min(before,after.max))<=5,'Overview filtering preserves scroll unless shorter results bound it.');
    return {checked,beforeScroll:before,afterScroll:after.top,records:data.items.length};
  };
  const selected=await toggle(true),cleared=await toggle(false);
  observations.overviewFilters={stage,selected,cleared,periodPreserved:true,documentRequests:0,shellDomPreserved:true};
  await screenshot('overview-filters-restored');
  record('Overview compact stage filters use genuine GET updates, retain period and shell identity, preserve bounded scroll, and restore after unchecking; desktop mobile-menu control stays hidden');
}
async function checkDesktopRail() {
  await open('/admin/tasks','My tasks','/admin/tasks');
  const toggle=page.locator('[data-action="rail-collapse"]');
  await expect(toggle).toBeVisible();
  const initial=await rail().evaluate(element=>element.getBoundingClientRect().width);
  await toggle.focus();await page.keyboard.press('Enter');
  await expect(toggle).toHaveAttribute('aria-expanded','false');
  await expect.poll(()=>rail().evaluate(element=>element.getBoundingClientRect().width)).toBeLessThan(initial-20);
  const collapsed=await rail().evaluate(element=>element.getBoundingClientRect().width);
  const focused=await toggle.evaluate(element=>{const s=getComputedStyle(element);return {width:parseFloat(s.outlineWidth),style:s.outlineStyle};});
  assert(focused.width>=2&&focused.style!=='none','Rail toggle has visible keyboard focus.');
  await page.reload();
  await expect(page.locator('.admin-shell-v2')).toBeVisible();
  await expect.poll(()=>rail().evaluate(element=>element.getBoundingClientRect().width)).toBeLessThan(initial-20);
  await expect(nav().locator('a[href="/admin/tasks"]')).toHaveAttribute('aria-current','page');
  await screenshot('rail-collapsed');
  await page.locator('[data-action="rail-collapse"]').click();
  await expect.poll(()=>rail().evaluate(element=>element.getBoundingClientRect().width)).toBeGreaterThan(collapsed+20);
  await page.setViewportSize({width:1440,height:600});
  await viewportBounds(rail(),'Short desktop rail');
  await nav().locator('a[href="/admin/settings"]').scrollIntoViewIfNeeded();
  await expect(nav().locator('a[href="/admin/settings"]')).toBeVisible();
  await viewportBounds(nav().locator('a[href="/admin/settings"]'),'Settings on a short screen');
  await screenshot('desktop-short');
  record('Desktop rail collapses by keyboard, persists after reload and keeps its final destination reachable on a short screen');
}
async function checkMobile() {
  for(const width of [390,320]){
    await page.setViewportSize({width,height:600});
    await open('/admin/maintenance','Maintenance','/admin/maintenance');
    const menu=page.locator('[data-action="admin-menu"]');
    await expect(menu).toBeVisible();
    await expect(menu).toHaveAttribute('aria-expanded','false');
    await expect(nav()).not.toBeVisible();
    await menu.focus();await page.keyboard.press('Enter');
    await expect(menu).toHaveAttribute('aria-expanded','true');
    await expect(nav()).toBeVisible();
    await expect(rail()).toHaveAttribute('role','dialog');
    await expect(rail()).toHaveAttribute('aria-modal','true');
    await viewportBounds(rail(),width+'px mobile drawer');
    assert(await page.evaluate(()=>document.querySelector('.admin-rail').contains(document.activeElement)), 'Opening mobile navigation moves focus into the drawer.');
    // Many tab presses exercise focus containment without depending on icon or
    // link counts. The visible close control must remain reachable.
    for(let i=0;i<18;i++){await page.keyboard.press('Tab');assert(await page.evaluate(()=>document.querySelector('.admin-rail').contains(document.activeElement)),'Mobile drawer traps Tab focus.');}
    await nav().locator('a[href="/admin/settings"]').scrollIntoViewIfNeeded();
    await viewportBounds(nav().locator('a[href="/admin/settings"]'),'Mobile Settings destination');
    await screenshot('mobile-'+width+'-drawer');
    await page.keyboard.press('Escape');
    await expect(menu).toHaveAttribute('aria-expanded','false');await expect(menu).toBeFocused();
    await expect(nav()).not.toBeVisible();
    await noOverflow('Mobile '+width+'px maintenance');
    await viewportBounds(page.locator('.ask-floating-launcher'),'Mobile Ask Ootla');
    await menu.click();
    await nav().locator('a[href="/admin/leads"]').click();
    await expect(page.locator('#workspace-title')).toHaveText('Leads');
    await expect(page.locator('[data-action="admin-menu"]')).toHaveAttribute('aria-expanded','false');
    await expect(nav()).not.toBeVisible();
    await noOverflow('Mobile '+width+'px leads');
    await screenshot('mobile-'+width+'-leads');
  }
  record('390px and 320px short-screen mobile navigation opens by keyboard, contains focus, scrolls, closes with Escape, returns focus and closes after navigation');
}
async function checkAssistantAndPopovers() {
  await page.setViewportSize({width:1440,height:900});
  await open('/admin/maintenance','Maintenance','/admin/maintenance');
  const launcher=page.locator('.ask-floating-launcher');
  await launcher.click();
  await expect(page.locator('#ask-ootla-dialog')).toBeVisible();
  await page.locator('#ask-question').fill('Unsent shell review draft');
  await page.locator('[data-ask-close]').click();
  await nav().locator('a[href="/admin/leads"]').click();
  await expect(page.locator('#workspace-title')).toHaveText('Leads');
  await launcher.click();await expect(page.locator('#ask-question')).toHaveValue('Unsent shell review draft');
  await page.locator('[data-ask-close]').click();
  await nav().locator('a[href="/admin/ai"]').click();
  await expect(page.locator('#workspace-title')).toHaveText('Ask Ootla');
  await expect(page.locator('[data-ai-request]')).toBeVisible();
  await expect(page.locator('.ask-floating-launcher')).toHaveCount(1);
  await header().locator('[data-action="account-menu"]').click();
  await expect(page.locator('#account-menu')).toBeVisible();
  await expect(page.locator('#account-menu a[href="/admin/profile"]')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#account-menu')).toBeHidden();
  await expect(header().locator('[data-action="account-menu"]')).toBeFocused();
  await header().locator('[data-action="lead-search"]').click();
  await expect(page.locator('#lead-search-input')).toBeFocused();
  await page.keyboard.press('Escape');await expect(page.locator('#lead-search-panel')).toBeHidden();
  record('Floating Ask keeps an unsent draft across staff navigation; full assistant remains separate; utility menus retain keyboard dismissal');
}
async function checkAnonymousBoundaries() {
  allowAuth=true;
  try{const logout=await context.request.post(new URL('/api/auth/logout',base).href,{headers:{Origin:base.origin}});assert.equal(logout.status(),204);observations.sessionOpened=false;}finally{allowAuth=false;}
  await page.goto(new URL('/admin/maintenance',base).href);
  await expect(page).toHaveURL(/\/admin\/login\?returnTo=/);
  await expect(page.locator('.admin-rail,.ask-floating-launcher')).toHaveCount(0);
  for(const route of ['/applicant/login','/resident/login']){
    await page.goto(new URL(route,base).href);await expect(page.locator('#main-content')).toBeVisible();
    await expect(page.locator('.admin-rail,.ask-floating-launcher')).toHaveCount(0);
  }
  record('Anonymous staff requests still require authentication; applicant/resident login pages have no staff rail or staff assistant');
}
try {
  const configResponse=await fetch(new URL('/api/config',base));assert.equal(configResponse.status,200);
  const config=await configResponse.json();
  assert(config.demoEnabled&&config.demoCredentials&&config.databaseReady&&new URL(config.appUrl).origin===base.origin,'Use the ready isolated demo with its existing credential helper.');
  page=await context.newPage();
  page.on('pageerror',error=>observations.errors.push(error.message));
  page.on('request',request=>{if(request.resourceType()==='document')documentRequests++;});
  page.on('response',response=>{if(response.status()>=500&&new URL(response.url()).pathname.startsWith('/api/'))observations.serverErrors.push(response.status()+' '+new URL(response.url()).pathname);});
  allowAuth=true;
  try{assert.equal((await context.request.post(new URL('/api/auth/login',base).href,{headers:{Origin:base.origin},data:config.demoCredentials})).status(),200);observations.sessionOpened=true;}finally{allowAuth=false;}
  const me=await context.request.get(new URL('/api/auth/me',base).href);assert.equal(me.status(),200);assert.equal((await me.json()).user.organization.role,'organization_admin');
  if(process.argv.includes('--mobile-only'))await checkMobile();
  else if(process.argv.includes('--overview-only'))await checkOverviewFilters();
  else{
    await checkShell();
    await checkOverviewFilters();
    await checkDesktopRail();
    await page.setViewportSize({width:1440,height:600});
    await checkDirectoryAction();
    await checkMobile();
    await checkAssistantAndPopovers();
  }
  await checkAnonymousBoundaries();
  assert.deepEqual(observations.blockedWrites,[],'No business writes attempted.');
  assert.deepEqual(observations.externalRequests,[],'No external service traffic attempted.');
  assert.deepEqual(observations.errors,[],'No uncaught browser exceptions.');
  assert.deepEqual(observations.serverErrors,[],'No API server errors.');
  record('Zero business writes, external requests, browser exceptions or API 5xx responses');
}catch(error){
  observations.failure=error.stack||String(error);
  if(page){observations.failureRoute=page.url();await screenshot('failure').catch(()=>{});}
  throw error;
}finally{
  if(observations.sessionOpened){allowAuth=true;try{observations.logoutStatus=(await context.request.post(new URL('/api/auth/logout',base).href,{headers:{Origin:base.origin}})).status();}finally{allowAuth=false;}}
  await writeFile(path.join(output,'observations.json'),JSON.stringify(observations,null,2)+'\n');
  await browser.close();
}
