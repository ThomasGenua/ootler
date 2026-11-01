import 'dotenv/config';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';
const retained=new URL(process.env.APP_URL||'http://127.0.0.1:7673');
const base=new URL(process.env.OOTLA_CHECK_URL||retained.href);
assert(base.protocol==='http:'&&base.hostname==='127.0.0.1'&&base.port,'Use a project-owned loopback preview.');
const scratch=process.env.OOTLA_CHECK_DATABASE||'',mutate=Boolean(scratch);
const layoutOnly=process.env.OOTLA_CONNECTOR_BROWSER_LAYOUT_ONLY==='true';
if(mutate){assert(/^ootla_demo_stage11_browser_[a-f0-9]{32}$/.test(scratch));assert(!['5173','7673','3100'].includes(base.port));assert.notEqual(base.origin,retained.origin);}
const browser=await chromium.launch({headless:true,channel:process.env.OOTLA_BROWSER_CHANNEL||'chrome'});
const context=await browser.newContext({viewport:{width:1586,height:1050},reducedMotion:'reduce'});
const page=await context.newPage();page.setDefaultTimeout(15000);page.setDefaultNavigationTimeout(20000);
const errors=[],external=[],writes=[],unbounded=[],pending=[],legacy=[];
let groups=0,connectionId='',staff;
const checkStarted=performance.now();
const pass=text=>{groups++;console.log('PASS '+((performance.now()-checkStarted)/1000).toFixed(1)+'s '+text);};
const url=path=>new URL(path,base).href;
const workspace=()=>page.locator('[data-connector-workspace]');
page.on('pageerror',error=>errors.push(error.message));
page.on('request',request=>{const target=new URL(request.url());if(/^https?:$/.test(target.protocol)&&target.origin!==base.origin)external.push(target.origin+target.pathname);if(!['GET','HEAD','OPTIONS'].includes(request.method()))writes.push(request.method()+' '+target.pathname);if(target.pathname==='/api/demo/data')legacy.push(target.pathname);});
page.on('response',response=>{if(response.status()===200&&response.request().method()==='GET'&&new URL(response.url()).pathname.startsWith('/api/connectors'))pending.push(response.json().then(body=>{if(body?.items?.length>100)unbounded.push(response.url());}).catch(()=>{}));});
async function read(path){const response=await page.request.get(url(path));assert.equal(response.status(),200,path);return response.json();}
async function go(view='connection',extra={}){await page.goto(url('/admin/integrations?'+new URLSearchParams({view,...extra})));await expect(workspace()).toBeVisible();}
async function overview(){return read('/api/connectors');}
async function records(kind){return read('/api/connectors/'+connectionId+'/'+kind+'?pageSize=100');}
async function waitFor(title,load,predicate,timeout=45000){const stop=Date.now()+timeout;while(Date.now()<stop){const value=await load();if(predicate(value))return value;await new Promise(resolve=>setTimeout(resolve,500));}assert.fail('Timed out: '+title);}
async function waitJob(id,timeout=45000){return waitFor('completed connector job',()=>records('jobs'),data=>data.items.some(job=>job.id===id&&job.status==='completed'),timeout);}
async function action(kind){assert(mutate);const form=workspace().locator('[data-connector-form='+kind+']');const expectedSaved=kind==='scenario'?await form.locator('select[name=action]').inputValue():kind;const responsePromise=page.waitForResponse(response=>response.request().method()==='POST'&&new URL(response.url()).pathname.startsWith('/api/connectors'));await form.getByRole('button').click();const response=await responsePromise;assert(response.ok(),'The deliberate '+kind+' action succeeded.');const result=await response.json();await expect(page).toHaveURL(new RegExp('[?&]saved='+expectedSaved+'(?:&|$)'));await expect(workspace()).toBeVisible();return result;}
async function scenario(kind,status){await go();await workspace().getByLabel('Simulation',{exact:true}).selectOption(kind);if(status)await workspace().getByLabel('Simulated unit availability',{exact:true}).selectOption(status);return action('scenario');}
async function sync(mode='sync'){await go();const result=await action(mode);await waitJob(result.job.id);await go('jobs');return result.job.id;}
async function labels(){const missing=await workspace().evaluate(root=>[...root.querySelectorAll('input,select,textarea')].filter(control=>control.type!=='hidden'&&!control.labels?.length&&!control.getAttribute('aria-label')).map(control=>control.name));assert.deepEqual(missing,[]);}
async function signIn(target,email,password){await target.goto(url('/admin/login?returnTo=%2Fadmin%2Fintegrations'));await target.getByLabel('Email address',{exact:true}).fill(email);await target.getByLabel('Password',{exact:true}).fill(password);await expect(target.getByRole('button',{name:/Sign in/})).toBeEnabled();await target.getByRole('button',{name:/Sign in/}).click();await expect(target.locator('[data-connector-workspace]')).toBeVisible();}
try{
 await page.goto(url('/admin/integrations'));
 await expect(page).toHaveURL(/\/admin\/login\?returnTo=/);
 await page.getByRole('button',{name:'Fill demo credentials',exact:true}).click();assert.equal(writes.length,0);
 await page.getByRole('button',{name:/Sign in/}).click();await expect(workspace()).toBeVisible();
 const initial=await overview();connectionId=initial.connection?.id??'';
 if(mutate){assert.equal(initial.connection,null);await expect(workspace()).toHaveAttribute('data-connector-state','not_configured');}
 assert.equal(initial.access.liveAvailable,false);
 await expect(workspace().getByRole('heading',{name:'Live Yardi connection: not connected',exact:true})).toBeVisible();
 for(const state of ['Not configured','Demo','Connecting','Live','Degraded','Disconnected'])await expect(workspace().locator('.cn-states .cn-tag').filter({hasText:new RegExp('^'+state+'$')})).toBeVisible();
 await expect(workspace().getByRole('link',{name:'Open customer-data import',exact:true})).toHaveAttribute('href','/admin/imports');
 await expect(workspace().locator('input[type=password],textarea[name=secret],input[name=secret]')).toHaveCount(0);
 await labels();assert.deepEqual(legacy,[]);
 pass('protected normal sign-in, six truthful states, live setup requirements and preserved standalone CSV path');

 if(mutate){
  const response=await action('connect');connectionId=response.connection.id;assert.equal(response.connection.state,'connecting');
  await waitJob(response.job.id);await go();await expect(workspace()).toHaveAttribute('data-connector-state','demo');
  const started=await overview();assert(started.connection.lastSuccessAt);assert(BigInt(started.connection.cursor)>0n);
  const mappings=await records('mappings');assert.equal(mappings.total,4);assert.deepEqual(new Set(mappings.items.map(item=>item.entityType)),new Set(['property','unit','contact','lead']));
  const property=mappings.items.find(item=>item.entityType==='property'),unit=mappings.items.find(item=>item.entityType==='unit'),contact=mappings.items.find(item=>item.entityType==='contact'),lead=mappings.items.find(item=>item.entityType==='lead');
  const signature=data=>data.items.map(item=>item.entityType+':'+item.externalId+':'+item.recordId).sort();
  const original=signature(mappings);
  const propertyDetail=await read('/api/property-foundation/properties/'+property.recordId);
  assert(propertyDetail.units.items.some(item=>item.id===unit.recordId));assert.notEqual(property.recordId,unit.recordId);
  assert.equal((await read('/api/property-foundation/contacts/'+contact.recordId)).contact.id,contact.recordId);
  assert.equal((await read('/api/leads/'+lead.recordId)).lead.contactId,contact.recordId);
  await page.reload();await expect(workspace()).toHaveAttribute('data-connector-state','demo');
  pass('deliberate initial sync produces real separate property/unit/contact/lead records, mappings, cursor and refresh persistence');

  await go('mappings',{pageSize:'1'});await expect(workspace().locator('[data-connector-mapping]')).toHaveCount(1);
  const first=await workspace().locator('[data-connector-mapping]').getAttribute('data-connector-mapping');
  await workspace().getByRole('link',{name:'Next',exact:true}).click();await expect(page).toHaveURL(/page=2/);
  const second=await workspace().locator('[data-connector-mapping]').getAttribute('data-connector-mapping');assert.notEqual(first,second);
  for(const mapping of mappings.items){await page.goto(url(mapping.relatedUrl));await expect(page.locator('[data-staff-shell]')).toBeVisible();await expect(page.locator('.b-main')).not.toContainText('Your workspace needs a moment');}
  await go('mappings');await workspace().getByRole('link',{name:'Event history',exact:true}).focus();await page.keyboard.press('Enter');await expect(page).toHaveURL(/view=events/);await labels();
  pass('server-paginated mappings, separate result pages, real CRM destinations and native keyboard navigation');
  if(!layoutOnly){
  const beforeContact=(await read('/api/property-foundation/contacts/'+contact.recordId)).contact;
  await scenario('availability_update','occupied');await sync();
  const updatedProperty=await read('/api/property-foundation/properties/'+property.recordId),updatedUnit=updatedProperty.units.items.find(item=>item.id===unit.recordId);
  assert(updatedUnit);assert.equal(updatedUnit.status,'occupied');assert.equal(updatedUnit.lastVerifiedAt,null);assert(/demo|simulat/i.test(updatedUnit.availabilitySource));assert(updatedUnit.readOnlyFields.includes('status'));
  await scenario('contact_update');await sync();
  const updatedContact=(await read('/api/property-foundation/contacts/'+contact.recordId)).contact;
  assert.notEqual(updatedContact.phone,beforeContact.phone);assert.equal(updatedContact.id,contact.recordId);assert.deepEqual(signature(await records('mappings')),original);
  pass('incremental availability/contact changes use the same canonical identities, preserve source ownership and never claim live verification');

  await scenario('fail_next');await go();const failure=await action('sync');
  await waitFor('degraded state after one simulated provider failure',overview,value=>value.connection.state==='degraded');
  await go();await expect(workspace()).toHaveAttribute('data-connector-state','degraded');await expect(workspace().locator('.cn-warning')).toBeVisible();
  await waitJob(failure.job.id,65000);
  const retried=(await records('jobs')).items.find(job=>job.id===failure.job.id);assert(retried.attempts>=2&&retried.attempts<=3);
  await go();await expect(workspace()).toHaveAttribute('data-connector-state','demo');assert.deepEqual(signature(await records('mappings')),original);
  pass('provider failure becomes Degraded, real bounded-backoff retry recovers and completed records are preserved');

  await sync('replay');assert.deepEqual(signature(await records('mappings')),original);
  await scenario('duplicate_event');await sync();assert.deepEqual(signature(await records('mappings')),original);
  const receipts=await records('events');assert(receipts.items.some(event=>event.status==='duplicate'));
  await go('events');await expect(workspace().locator('[data-event-status=duplicate]').first()).toBeVisible();
  const diagnostics=await workspace().innerText();assert(!diagnostics.includes(updatedContact.email));assert(!diagnostics.includes(updatedContact.phone));
  pass('safe replay and duplicate-event receipts leave CRM records unchanged and diagnostics omit raw customer data');

  await scenario('stale_event');await sync();
  const conflicts=await records('conflicts'),conflict=conflicts.items.find(item=>item.status==='open'&&item.reason==='stale_event');assert(conflict);assert.equal(conflict.canUseProvider,false);
  await go('conflicts');const card=workspace().locator('[data-connector-conflict="'+conflict.id+'"]');
  assert.equal(await card.locator('option[value=use_provider]').count(),0);
  await card.locator('select[name=resolution]').selectOption('keep_ootla');
  const conflictResponse=page.waitForResponse(response=>response.request().method()==='POST'&&new URL(response.url()).pathname.endsWith('/resolve'));
  await card.getByRole('button',{name:'Save conflict decision',exact:true}).click();assert((await conflictResponse).ok());
  await expect(page).toHaveURL(/saved=resolve/);await expect(workspace().locator('[data-connector-conflict="'+conflict.id+'"][data-conflict-status=resolved]')).toBeVisible();
  const afterConflict=(await read('/api/property-foundation/properties/'+property.recordId)).units.items.find(item=>item.id===unit.recordId);assert.equal(afterConflict.status,'occupied');assert(afterConflict.readOnlyFields.includes('status'));
  pass('out-of-order conflict requires an explicit valid decision and retains newer provider values and source ownership');

  await scenario('contact_update');const beforeDisconnect=await overview();const beforeResume=(await read('/api/property-foundation/contacts/'+contact.recordId)).contact;
  const disconnected=await action('disconnect');assert.equal(disconnected.connection.state,'disconnected');assert.equal(disconnected.connection.cursor,beforeDisconnect.connection.cursor);
  await expect(workspace()).toHaveAttribute('data-connector-state','disconnected');await expect(workspace().locator('[data-connector-form=scenario]')).toHaveCount(0);
  assert.equal((await read('/api/property-foundation/contacts/'+contact.recordId)).contact.phone,beforeResume.phone);
  const resumed=await action('reconnect');assert.equal(resumed.connection.cursor,beforeDisconnect.connection.cursor);await waitJob(resumed.job.id);
  const afterResume=await overview();assert(BigInt(afterResume.connection.cursor)>BigInt(beforeDisconnect.connection.cursor));assert.notEqual((await read('/api/property-foundation/contacts/'+contact.recordId)).contact.phone,beforeResume.phone);assert.deepEqual(signature(await records('mappings')),original);
  await go();await expect(workspace()).toHaveAttribute('data-connector-state','demo');
  pass('disconnect retains CRM data and cursor, while reconnect resumes pending events without duplicate records');

  staff=await browser.newContext({viewport:{width:390,height:900}});const staffPage=await staff.newPage();
  await signIn(staffPage,'connector-agent@example.test','ConnectorAgent!2026');
  await expect(staffPage.locator('[data-connector-workspace]').getByRole('heading',{name:'Organization administrator access required',exact:true})).toBeVisible();
  assert.equal(await staffPage.locator('[data-connector-form]').count(),0);
  const forbidden=await staffPage.request.get(url('/api/connectors'));assert.equal(forbidden.status(),403);
  const denied=await staffPage.request.post(url('/api/connectors/'+connectionId+'/sync'),{headers:{Origin:base.origin},data:{requestKey:crypto.randomUUID(),mode:'incremental'}});assert.equal(denied.status(),403);
  await staffPage.request.post(url('/api/auth/logout'),{headers:{Origin:base.origin}});
  await staff.close();staff=undefined;
  pass('non-admin staff receive a useful restricted page and server denial of diagnostics and connector controls');
  }else{await scenario('stale_event');await sync();}
 }else{
  for(const view of ['jobs','mappings','events','conflicts']){await go(view);await labels();}
  await go();const unchanged=await overview();assert.deepEqual(unchanged.summary,initial.summary);assert.deepEqual(unchanged.connection,initial.connection);
  pass('retained connection and all diagnostics remain read-only, bounded and unchanged on navigation');
 }
 await mkdir('.local/screenshots',{recursive:true});
 for(const width of [320,390,768,1586]){
  console.log('CHECK responsive width '+width);
  await page.setViewportSize({width,height:1000});await go();await labels();
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Connection page fits '+width+'px');
  if(width===390||width===1586)await page.screenshot({path:'.local/screenshots/connectors-'+width+(mutate?'-isolated':'-retained')+'.png',fullPage:true});
  for(const view of (width===320||width===1586?['jobs','mappings','events','conflicts']:[])){console.log('CHECK responsive '+width+' '+view);await go(view,{pageSize:'1'});await labels();assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),view+' page fits '+width+'px');}
 }
 pass('320/390/768/1586 responsive pages, internally scrollable diagnostic tables and native labeled controls');
 await go();const before=await overview();const count=writes.length;
 await workspace().getByRole('button',{name:'Refresh status',exact:true}).focus();await page.keyboard.press('Enter');await expect(workspace()).toBeVisible();
 await page.reload();await expect(workspace()).toBeVisible();
 const after=await overview();assert.deepEqual(after.summary,before.summary);assert.deepEqual(after.connection,before.connection);assert.equal(writes.length,count,'Refresh does not post, queue, connect or create records.');
 if(!mutate)assert.equal(writes.filter(item=>item.includes('/api/connectors')).length,0,'Retained checks perform no connector mutations.');
 await Promise.all(pending);assert.deepEqual(errors,[]);assert.deepEqual(external,[]);assert.deepEqual(unbounded,[]);assert.deepEqual(legacy,[]);
 await page.getByRole('button',{name:'Account menu',exact:true}).click();await page.locator('#b-account').getByRole('button',{name:'Sign out',exact:true}).click();await expect(page).toHaveURL(/\/admin\/login/);
 pass('refresh/reload are read-only, all responses are bounded, normal sign-out works and no external actions or browser errors occur');
 console.log('Connector browser checks passed: '+groups+' groups ('+(mutate?'owned scratch writes':'retained demo read-only')+').');
}finally{await page.request.post(url('/api/auth/logout'),{headers:{Origin:base.origin}}).catch(()=>{});await staff?.close();await context.close();await browser.close();}