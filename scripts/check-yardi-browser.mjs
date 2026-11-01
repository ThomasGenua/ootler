import 'dotenv/config';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';
const retained=new URL(process.env.APP_URL||'http://127.0.0.1:7673'),base=new URL(process.env.OOTLA_CHECK_URL||retained.href);
assert(base.protocol==='http:'&&base.hostname==='127.0.0.1'&&base.port,'Use the configured project-owned loopback preview.');
const scratch=process.env.OOTLA_CHECK_DATABASE||'',owned=Boolean(scratch);
if(owned){assert(/^ootla_demo_stage12_browser_[a-f0-9]{32}$/.test(scratch));assert(!['5173','7673','3100'].includes(base.port));assert.notEqual(base.origin,retained.origin);}
const browser=await chromium.launch({headless:true,channel:process.env.OOTLA_BROWSER_CHANNEL||'chrome'});
const context=await browser.newContext({viewport:{width:1586,height:1050},reducedMotion:'reduce'}),page=await context.newPage();
page.setDefaultTimeout(15000);page.setDefaultNavigationTimeout(20000);
const errors=[],outside=[],writes=[];let groups=0,staff;
const pass=text=>{groups++;console.log('PASS '+text);};
const url=path=>new URL(path,base).href;
const workspace=()=>page.locator('[data-connector-workspace]');
page.on('pageerror',error=>errors.push(error.message));
page.on('request',request=>{const target=new URL(request.url());if(/^https?:$/.test(target.protocol)&&target.origin!==base.origin)outside.push(target.origin+target.pathname);if(!['GET','HEAD','OPTIONS'].includes(request.method()))writes.push(request.method()+' '+target.pathname);});
async function read(path){const response=await page.request.get(url(path));assert.equal(response.status(),200,path);return response.json();}
async function go(){await page.goto(url('/admin/integrations?view=yardi'));await expect(workspace().locator('[data-yardi-readiness]')).toBeVisible();}
async function labels(){const missing=await workspace().evaluate(root=>[...root.querySelectorAll('input,select,textarea')].filter(control=>control.type!=='hidden'&&!control.labels?.length&&!control.getAttribute('aria-label')).map(control=>control.name));assert.deepEqual(missing,[]);}
async function checkDraft(){assert(owned);const response=page.waitForResponse(item=>item.request().method()==='POST'&&new URL(item.url()).pathname==='/api/connectors/yardi/validate-config');await workspace().getByRole('button',{name:'Check draft readiness',exact:true}).click();const checked=await response;assert.equal(checked.status(),200);await expect(workspace().locator('[data-yardi-validation-result]')).toBeVisible();return checked.json();}
try{
 const anonymous=await page.request.get(url('/api/connectors/yardi/readiness'));assert.equal(anonymous.status(),401);
 await page.goto(url('/admin/integrations?view=yardi'));await expect(page).toHaveURL(/\/admin\/login\?returnTo=/);
 await page.getByRole('button',{name:'Fill demo credentials',exact:true}).click();assert.equal(writes.length,0);
 await page.getByRole('button',{name:/Sign in/}).click();await expect(workspace().locator('[data-yardi-readiness]')).toBeVisible();
 const initial=await read('/api/connectors'),readiness=await read('/api/connectors/yardi/readiness');
 assert.deepEqual(readiness.dimensions,{scaffoldingImplemented:true,mappingTested:false,credentialsConfigured:false,liveBehaviorVerified:false});
 for(const [key,value]of Object.entries(readiness.dimensions))await expect(workspace().locator('[data-readiness-dimension="'+key+'"]').first()).toHaveAttribute('data-ready',String(value));
 await expect(workspace().locator('[data-yardi-readiness]')).toHaveAttribute('data-live-status','not_configured');
 await expect(workspace().locator('[data-readiness-dimension=mappingTested]')).toContainText('Simulator mappings are tested separately');
 assert.equal(readiness.transport.networkEnabled,false);assert.equal(readiness.transport.liveAdapterRegistered,false);
 pass('normal protected sign-in and four separate truthful readiness dimensions; simulator tests never imply a live mapping');

 assert.equal(readiness.domains.length,7);assert.equal(readiness.requiredInputs.length,8);
 await expect(workspace().locator('[data-yardi-domain]')).toHaveCount(7);await expect(workspace().locator('[data-yardi-requirement]')).toHaveCount(8);
 for(const entity of ['resident','payment_status'])await expect(workspace().locator('[data-yardi-domain="'+entity+'"]').first()).toHaveAttribute('data-domain-status','unsupported');
 await expect(workspace().locator('input[type=password],input[name=secret],input[name=endpoint],input[name=auth]')).toHaveCount(0);
 await expect(workspace().getByRole('link',{name:'Contact Ootla',exact:true})).toHaveAttribute('href','/contact');await labels();
 assert(Object.values(readiness.evidence).every(value=>value===false));
 pass('seven explicit record boundaries, eight missing client inputs, unsupported domains and no secret or invented transport fields');

 if(owned){
  const result=workspace().locator('[data-yardi-validation-result]'),form=workspace().locator('[data-yardi-draft]');
  const empty=await checkDraft();assert.equal(empty.readyForLive,false);assert.equal(empty.persisted,false);assert.equal(empty.networkUsed,false);assert(empty.issues.length);
  await expect(result).toHaveAttribute('data-ready-for-live','false');
  const marker='Stage12-unverified-<reference>';
  await form.getByLabel('Documentation reference (optional)',{exact:true}).fill(marker);
  await form.getByLabel('Licensed interface reference (optional)',{exact:true}).fill('Unverified example reference');
  await form.getByLabel('Test environment reference (optional)',{exact:true}).fill('Unverified pilot');
  await form.getByLabel('Property identifiers (optional)',{exact:true}).fill('EXAMPLE-PROP-001\nEXAMPLE-PROP-002');
  await form.locator('input[value=property]').check();
  const checked=await checkDraft();assert.equal(checked.summary.propertyCount,2);assert.equal(checked.summary.documentationReferenceProvided,true);assert.equal(checked.readyForLive,false);assert(!JSON.stringify(checked).includes(marker));
  await expect(result).not.toContainText(marker);assert.equal(await result.locator('reference').count(),0);
  await form.locator('input[value=resident]').check();const unsupported=await checkDraft();assert.equal(unsupported.status,'unsupported');await expect(result).toHaveAttribute('data-validation-status','unsupported');
  const posts=writes.length;await form.getByLabel('Property identifiers (optional)',{exact:true}).fill('REPEATED-PROP\nREPEATED-PROP');await form.getByRole('button',{name:'Check draft readiness',exact:true}).click();
  await expect(form.locator('[data-yardi-error]')).toContainText('Remove repeated lines');assert.equal(writes.length,posts);
  assert.deepEqual(await read('/api/connectors/yardi/readiness'),readiness);assert.deepEqual(await read('/api/connectors'),initial);
  await page.reload();await expect(workspace().locator('[data-yardi-readiness]')).toBeVisible();await expect(workspace().getByLabel('Documentation reference (optional)',{exact:true})).toHaveValue('');await expect(result).toBeHidden();
  pass('empty and populated draft checks stay unverified and unsaved, reject repeated scope IDs and report unsupported capabilities without external calls');

  staff=await browser.newContext();const staffPage=await staff.newPage();await staffPage.goto(url('/admin/login?returnTo=%2Fadmin%2Fintegrations%3Fview%3Dyardi'));
  await staffPage.getByLabel('Email address',{exact:true}).fill('yardi-agent@example.test');await staffPage.getByLabel('Password',{exact:true}).fill('YardiAgent!2026');await expect(staffPage.getByRole('button',{name:/Sign in/})).toBeEnabled();await staffPage.getByRole('button',{name:/Sign in/}).click();
  await expect(staffPage.getByRole('heading',{name:'Organization administrator access required',exact:true})).toBeVisible();assert.equal(await staffPage.locator('[data-yardi-draft]').count(),0);
  assert.equal((await staffPage.request.get(url('/api/connectors/yardi/readiness'))).status(),403);assert.equal((await staffPage.request.post(url('/api/connectors/yardi/validate-config'),{headers:{Origin:base.origin},data:{}})).status(),403);
  await staffPage.request.post(url('/api/auth/logout'),{headers:{Origin:base.origin}});await staff.close();staff=undefined;
  pass('non-admin staff cannot read live setup diagnostics or submit draft validation');
 }

 await mkdir('.local/screenshots',{recursive:true});
 for(const widthof of [320,390,768,1586]){await page.setViewportSize({width:widthof,height:1000});await go();await labels();assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Yardi setup fits '+widthof+'px');if(widthof===390||widthof===1586)await page.screenshot({path:'.local/screenshots/yardi-readiness-'+widthof+(owned?'-isolated':'-retained')+'.png',fullPage:true});}
 pass('320/390/768/1586 setup layout and native labeled keyboard controls');

 const before=writes.length;await workspace().getByRole('link',{name:'Open the Yardi simulator',exact:true}).focus();await page.keyboard.press('Enter');await expect(page).toHaveURL(/view=connection/);await expect(workspace().getByRole('heading',{name:'Yardi-ready integration',exact:true})).toBeVisible();
 for(const titleof of ['Connection','Sync jobs','Record mappings','Event history','Conflicts'])await expect(workspace().getByRole('link',{name:titleof,exact:true})).toBeVisible();
 if(initial.connection===null&&initial.access.demoAvailable)await expect(workspace().getByRole('button',{name:'Connect Yardi simulator',exact:true})).toBeVisible();
 await workspace().getByRole('link',{name:'Review live Yardi setup',exact:true}).click();await expect(workspace().locator('[data-yardi-readiness]')).toBeVisible();await workspace().getByRole('button',{name:'Refresh status',exact:true}).click();await expect(workspace().locator('[data-yardi-readiness]')).toBeVisible();
 assert.equal(writes.length,before);assert.deepEqual(await read('/api/connectors'),initial);assert.deepEqual(await read('/api/connectors/yardi/readiness'),readiness);
 if(!owned)assert.equal(writes.filter(item=>item.includes('/api/connectors')).length,0);
 assert.deepEqual(errors,[]);assert.deepEqual(outside,[]);
 await page.getByRole('button',{name:'Account menu',exact:true}).click();await page.locator('#b-account').getByRole('button',{name:'Sign out',exact:true}).click();await expect(page).toHaveURL(/\/admin\/login/);
 pass('existing simulator controls and five tabs remain available; navigation/refresh are read-only with no browser errors or external actions');
 console.log('Yardi readiness browser checks passed: '+groups+' groups ('+(owned?'owned isolated draft checks':'retained read-only')+').');
}finally{await page.request.post(url('/api/auth/logout'),{headers:{Origin:base.origin}}).catch(()=>{});await staff?.close();await context.close();await browser.close();}