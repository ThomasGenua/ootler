import 'dotenv/config';
import assert from 'node:assert/strict';
import {mkdir}from 'node:fs/promises';
import {chromium,expect}from '@playwright/test';
const base=new URL(process.env.APP_URL||'http://127.0.0.1:7673');
assert.equal(base.protocol,'http:');assert.equal(base.hostname,'127.0.0.1');assert(base.port);
const browser=await chromium.launch({channel:'chrome',headless:true});
const context=await browser.newContext({viewport:{width:1586,height:1050},reducedMotion:'reduce'});
const page=await context.newPage(),errors=[],outside=[],writes=[];let groups=0;
page.setDefaultTimeout(20000);
page.on('pageerror',error=>errors.push(error.message));
page.on('request',request=>{const target=new URL(request.url());if(/^https?:$/.test(target.protocol)&&target.origin!==base.origin)outside.push(target.origin+target.pathname);if(!['GET','HEAD','OPTIONS'].includes(request.method()))writes.push(request.method()+' '+target.pathname);});
const go=path=>page.goto(new URL(path,base).href),pass=title=>{groups++;console.log('PASS '+title);};
const read=async path=>{const response=await page.request.get(new URL(path,base).href);assert.equal(response.status(),200,path);return response.json();};
try{
 await go('/admin/calendar?view=google');await expect(page).toHaveURL(/\/admin\/login\?returnTo=/);
 await page.getByRole('button',{name:'Fill demo credentials',exact:true}).click();assert.equal(writes.length,0);
 await page.getByRole('button',{name:/Sign in/}).click();
 await expect(page.locator('[data-google-calendar]')).toBeVisible();
 const before=await read('/api/google-calendar');assert.equal(before.state,'demo');assert.equal(before.invitations,'disabled');assert.equal(before.ownership,'ootla_only');assert.equal(before.localSchedulingAvailable,true);
 await expect(page.locator('[data-google-state]')).toContainText('Demo calendar');
 await expect(page.locator('[data-google-calendar]')).toContainText('saved locally first');
 await expect(page.locator('[data-google-action]')).toHaveCount(0);
 pass('normal backend login; native Calendar truthfully labels demo, local persistence and separate Google synchronization without live controls');
 const options=await read('/api/calendar/options');
 for(const view of ['day','week','agenda','book','settings']){
  await go('/admin/calendar?view='+view);await expect(page.locator('[data-calendar-workspace]')).toBeVisible();
  await expect(page.locator('[data-calendar-workspace] .vc-tabs a[aria-current=page]')).toHaveText(view==='book'?'Book a viewing':view==='settings'?'Availability & settings':view[0].toUpperCase()+view.slice(1));
 }
 if(options.properties.items[0]){
  await go('/admin/calendar?view=settings&propertyId='+options.properties.items[0].id);
  await expect(page.getByRole('button',{name:'Save property settings',exact:true})).toBeVisible();
  await expect(page.getByLabel('Property IANA timezone',{exact:true})).toBeVisible();
 }
 pass('day, week, agenda, booking and settings use native Calendar controls with real scoped options and no mutation on read');
 const calendar=await read('/api/calendar?view=agenda');
 if(calendar.items[0]){
  await go('/admin/calendar?viewing='+calendar.items[0].id);await expect(page.locator('[data-google-viewing-status]')).toContainText('Local booking: saved.');
  await expect(page.locator('[data-calendar-workspace]')).toContainText('Saved in Ootla');
 }
 await mkdir('.local/screenshots',{recursive:true});
 for(const width of [320,390,768,1586]){
  await page.setViewportSize({width,height:1000});
  for(const view of ['google','week','settings']){
   await go('/admin/calendar?view='+view);await expect(page.locator('[data-calendar-workspace]')).toBeVisible();
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Calendar fits '+width+'px '+view);
   const missing=await page.locator('[data-calendar-workspace]').evaluate(root=>[...root.querySelectorAll('input,select,textarea')].filter(control=>control.type!=='hidden'&&!control.labels?.length&&!control.getAttribute('aria-label')).map(control=>control.name));
   assert.deepEqual(missing,[]);
   if(view==='google'&&[390,1586].includes(width))await page.screenshot({path:'.local/screenshots/google-calendar-'+width+'-retained.png',fullPage:true});
  }
 }
 pass('local and remote tour status stay separate; Calendar fits 320/390/768/1586px with labeled native keyboard controls');
 await go('/book');await expect(page.getByRole('heading',{name:'Booking link needed',exact:true})).toBeVisible();
 await go('/book#token=invalid');await expect(page.getByRole('heading',{name:'Booking link needed',exact:true})).toBeVisible();assert.equal(new URL(page.url()).hash,'');
 assert.deepEqual(await read('/api/google-calendar'),before);
 assert.equal(writes.filter(write=>!write.includes('/api/auth/')).length,0);assert.deepEqual(outside,[]);assert.deepEqual(errors,[]);
 pass('public missing-link state, immediate fragment removal and read-only navigation; no real provider calls or invitations');

 const mockedContext=await browser.newContext({storageState:await context.storageState(),viewport:{width:1200,height:1000},reducedMotion:'reduce'});
 const mocked=await mockedContext.newPage();const mockedCalls=[];let mockedState='connected',selectionSaved=false,failGoogle=false;
 const choice=(id,name,writable)=>({id,name,timeZone:'Europe/London',accessRole:writable?'writer':'reader',selected:selectionSaved,writable});
 await mocked.route('**/api/google-calendar**',async route=>{
  const request=route.request(),target=new URL(request.url()),path=target.pathname;
  const fulfill=body=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
  if(request.method()!=='GET')mockedCalls.push(path);
  if(path==='/api/google-calendar'&&failGoogle)return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:{message:'Synthetic unavailable status'}})});
  if(path==='/api/google-calendar')return fulfill({...before,state:mockedState,demo:false,configured:true,canManage:true,canConnect:true,notice:mockedState==='revoked'?'Access revoked. Reconnect Google Calendar.':'Synthetic UI test; local booking independent.',selectedCalendars:selectionSaved?[{id:'calendar-one',name:'First calendar',timeZone:'Europe/London',writable:true,writeTarget:true,lastSuccessfulSync:null,state:'ready'}]:[],jobs:{pending:1,failed:1}});
  if(path==='/api/google-calendar/calendars')return fulfill(target.searchParams.has('pageToken')?{items:[choice('calendar-two','Second calendar',false)],nextPageToken:null}:{items:[choice('calendar-one','First calendar',true)],nextPageToken:'second-page'});
  if(path==='/api/google-calendar/selection'){assert.deepEqual(request.postDataJSON(),{calendarIds:['calendar-one','calendar-two'],writeCalendarId:'calendar-one'});selectionSaved=true;return fulfill({saved:true});}
  if(path==='/api/google-calendar/busy')return fulfill({items:[{id:'synthetic-busy',startsAt:'2026-10-26T09:00:00Z',endsAt:'2026-10-26T10:00:00Z',title:'Busy',allDay:false}],lastSuccessfulSync:null,coverage:null,notice:'Synthetic Busy-only display'});
  if(path==='/api/google-calendar/disconnect'){mockedState='disconnected';return fulfill({disconnected:true,revocation:'requested',remoteEventsRetained:true});}
  if(path==='/api/google-calendar/sync'||path==='/api/google-calendar/retry')return fulfill({queued:true});
  throw new Error('Unexpected mocked Calendar request: '+path);
 });
 await mocked.goto(new URL('/admin/calendar?view=google',base).href);await expect(mocked.locator('[data-google-calendar]')).toBeVisible();
 await mocked.getByRole('button',{name:'Choose calendars',exact:true}).click();
 await mocked.locator('input[name=calendarIds][value=calendar-one]').check();await mocked.getByLabel('Ootla event calendar',{exact:true}).selectOption('calendar-one');
 await mocked.getByRole('button',{name:'Load more calendars',exact:true}).click();
 await expect(mocked.locator('input[name=calendarIds][value=calendar-one]')).toBeChecked();await expect(mocked.getByLabel('Ootla event calendar',{exact:true})).toHaveValue('calendar-one');
 await mocked.locator('input[name=calendarIds][value=calendar-two]').check();await mocked.getByRole('button',{name:'Save calendar selection',exact:true}).click();
 await expect(mocked.locator('[data-google-calendar]')).toContainText('First calendar');await expect(mocked.locator('[data-google-calendar]')).toContainText('Synthetic Busy-only display');
 await mocked.getByRole('button',{name:'Sync selected calendars',exact:true}).click();await expect(mocked.locator('[data-google-message]')).toContainText('queued');
 await mocked.getByRole('button',{name:'Retry failed synchronization',exact:true}).click();await expect(mocked.locator('[data-google-message]')).toContainText('queued');
 mocked.once('dialog',dialog=>dialog.accept());await mocked.getByRole('button',{name:'Disconnect Google',exact:true}).click();await expect(mocked.locator('[data-google-state]')).toContainText('disconnected');
 mockedState='revoked';await mocked.reload();await expect(mocked.locator('[data-google-state]')).toContainText('revoked');await expect(mocked.getByRole('button',{name:'Authorize Google Calendar',exact:true})).toBeVisible();await expect(mocked.getByRole('button',{name:'Sync selected calendars',exact:true})).toHaveCount(0);
 failGoogle=true;await mocked.reload();await expect(mocked.getByRole('heading',{name:'Google needs attention',exact:true})).toBeVisible();await mocked.getByRole('link',{name:'Open local Calendar',exact:true}).click();await expect(mocked.locator('[data-calendar-workspace] .vc-tabs a[aria-current=page]')).toHaveText('Week');
 assert.deepEqual(mockedCalls,['/api/google-calendar/selection','/api/google-calendar/sync','/api/google-calendar/retry','/api/google-calendar/disconnect']);await mockedContext.close();
 pass('intercepted synthetic Google UI: calendar pagination preserves choices/write target, selection, Busy-only display, queued sync/retry, disconnect, revoked reauthorization and graceful optional-Google failure');

 console.log('Google Calendar browser checks passed: '+groups+' groups (four retained read-only, one intercepted synthetic UI).');
}finally{await page.request.post(new URL('/api/auth/logout',base).href,{headers:{Origin:base.origin}}).catch(()=>{});await context.close();await browser.close();}
