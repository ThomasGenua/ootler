import 'dotenv/config';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {chromium,expect as baseExpect} from '@playwright/test';
const expect=baseExpect.configure({timeout:15000});
const base=new URL(process.env.OOTLA_CHECK_URL||'http://invalid.local'),retained=new URL(process.env.APP_URL||'http://127.0.0.1:7673'),scratch=process.env.OOTLA_CHECK_DATABASE||'';
assert(base.protocol==='http:'&&base.hostname==='127.0.0.1'&&base.port&&!['5173','7673','3100'].includes(base.port)&&base.origin!==retained.origin);
assert(/^ootla_demo_payment_browser_[a-f0-9]{32}$/.test(scratch));
const fixture=JSON.parse(process.env.OOTLA_APPLICANT_CONTEXT||'{}');assert(fixture.applicationId&&fixture.staffEmail&&fixture.staffPassword);
const browser=await chromium.launch({headless:true,channel:process.env.OOTLA_BROWSER_CHANNEL||'chrome'});
const outside=[],errors=[],requests=[];let groups=0,dropConfirmation=false,capturedToken='';
const pass=label=>{groups++;console.log('PASS '+label);},url=path=>new URL(path,base).href;
async function context(){
 const result=await browser.newContext({viewport:{width:1586,height:1000},reducedMotion:'reduce'});
 await result.route('**/*',async route=>{
  const target=new URL(route.request().url());
  if(/^https?:$/.test(target.protocol)&&target.origin!==base.origin){outside.push(target.origin+target.pathname);return route.abort();}
  if(target.pathname.endsWith('/handoff')&&route.request().method()==='POST'){const response=await route.fetch();if(response.ok()){const data=await response.json();capturedToken=new URL(data.url,base).hash.slice(7);}return route.fulfill({response});}
  if(dropConfirmation&&target.pathname==='/api/payment-demo/confirm'){dropConfirmation=false;const response=await route.fetch();assert.equal(response.status(),200);await response.dispose();return route.abort('failed');}
  return route.continue();
 });
 result.on('page',page=>{page.setDefaultTimeout(30000);page.on('pageerror',issue=>errors.push(issue.message));page.on('request',request=>requests.push(request.method()+' '+request.url()));});return result;
}
const applicantContext=await context(),staffContext=await context(),applicant=await applicantContext.newPage(),staff=await staffContext.newPage();
const id=fixture.applicationId,applicantPath='/applicant?application='+id,staffPath='/admin/applications?application='+id,applicantApi='/api/applicant/application-payments/'+id,staffApi='/api/application-payments/'+id;
async function read(page,path){const response=await page.request.get(url(path));assert.equal(response.status(),200);return response.json();}
async function go(page,path,selector){await page.goto(url(path));await expect(page.locator(selector)).toBeVisible();}
async function portalAction(selector,button){
 const old=await applicant.locator('[data-applicant-workspace]').elementHandle();await applicant.locator(selector).getByRole('button',{name:button,exact:true}).click();await old.waitForElementState('hidden');await expect(applicant.locator('[data-applicant-workspace]')).toBeVisible();
}
async function paymentAction(page,action,button){
 const old=await page.locator('[data-payment-workspace]').elementHandle();await page.locator('[data-payment-action='+action+']').getByRole('button',{name:button,exact:true}).click();await old.waitForElementState('hidden');await expect(page.locator('[data-payment-workspace] [data-payment-success]')).toBeVisible();
}
try{
 await go(staff,'/admin/login','#login-form');await staff.getByLabel('Email address',{exact:true}).fill(fixture.staffEmail);await staff.getByLabel('Password',{exact:true}).fill(fixture.staffPassword);await expect(staff.getByRole('button',{name:/Sign in/})).toBeEnabled();await staff.getByRole('button',{name:/Sign in/}).click();await expect(staff).toHaveURL(url('/admin'));
 await go(staff,staffPath,'[data-payment-workspace]');
 const initial=await read(staff,staffApi);assert.equal(initial.mode,'demo');assert.equal(initial.status,'unknown');assert.equal(initial.verifiedAt,null);
 await staff.getByText('Approved payment destinations',{exact:true}).click();
 const configuration=staff.locator('[data-payment-action=destination]');
 await configuration.getByLabel('Destination name',{exact:true}).fill('Synthetic approved destination');
 await configuration.getByLabel('Approved HTTPS portal URL',{exact:true}).fill('http://unapproved.example.test/portal');await configuration.locator('[name=confirmed]').check();await configuration.getByRole('button',{name:'Save approved destination',exact:true}).click();await expect(configuration.locator('[data-payment-error]')).toContainText(/HTTPS|approved/i);
 await configuration.getByLabel('Approved HTTPS portal URL',{exact:true}).fill('https://payments.example.test/portal');
 await paymentAction(staff,'destination','Save approved destination');
 assert.equal((await read(staff,'/api/application-payments/destinations')).items.length,1);
 assert.equal((await read(staff,staffApi)).mode,'demo','A configured link cannot switch an isolated demo into live mode.');
 pass('staff see honestly unknown status; HTTP destination is rejected and approved HTTPS remains isolated from ordinary demo actions');

 await go(applicant,'/applicant/login','[data-applicant-form=login]');await expect(applicant.locator('#fill-demo-applicant')).toBeVisible();await applicant.locator('#fill-demo-applicant').click();await applicant.getByRole('button',{name:'Sign in',exact:true}).click();await expect(applicant).toHaveURL(url('/applicant'));
 await go(applicant,applicantPath,'[data-applicant-workspace]');
 const details=applicant.locator('[data-applicant-form=details]');
 await details.getByLabel('Full name',{exact:true}).fill('Demo Payment Applicant');await details.getByLabel('Phone number',{exact:true}).fill('+44 7700 900321');await details.getByLabel('Current address',{exact:true}).fill('Synthetic payment browser address');await details.getByLabel('Preferred move-in date',{exact:true}).fill('2027-02-15');
 await portalAction('[data-applicant-form=details]','Save details');
 for(const [index,item]of (await read(applicant,'/api/applicant/applications/'+id)).checklist.entries()){
  const selector='[data-applicant-form=upload][data-checklist-id="'+item.id+'"]';await applicant.locator(selector+' input[type=file]').setInputFiles({name:'synthetic-payment-'+index+'.txt',mimeType:'text/plain',buffer:Buffer.from('Invented synthetic application document. No actual identity or payment details.')});await portalAction(selector,'Upload document');
 }
 await applicant.locator('[data-applicant-form=consent] input[type=checkbox]').check();await portalAction('[data-applicant-form=consent]','Record my consent');
 await portalAction('[data-applicant-form=ready]','Mark my section ready');await applicant.locator('[data-applicant-form=submit] input[type=checkbox]').check();await portalAction('[data-applicant-form=submit]','Submit application');
 await go(applicant,applicantPath+'&payment=success&status=confirmed&verified=true','[data-payment-workspace]');
 assert.equal((await read(applicant,applicantApi)).status,'unknown','Browser parameters cannot verify payment.');
 const forged=await applicant.request.get(url(applicantApi+'?confirmed=true'));assert.equal(forged.status(),400);
 pass('actual applicant application is submitted and forged return/query parameters cannot verify payment');

 await applicant.getByRole('button',{name:'Open simulated payment provider',exact:true}).click();await expect(applicant).toHaveURL(url('/payment-demo'));assert(/^[a-f0-9]{64}$/.test(capturedToken));
 await expect(applicant.locator('[data-payment-demo-confirm]')).toBeEnabled();
 assert.equal(new URL(applicant.url()).hash,'');assert.equal(new URL(applicant.url()).search,'');
 assert.equal(await applicant.locator('input,textarea,select').count(),0,'Provider simulation must collect no payment or identity details.');
 const beforeConfirm=await read(applicant,applicantApi);assert.equal(beforeConfirm.status,'verification_needed');assert.equal(beforeConfirm.lastKnownStatus,'unknown');assert.equal(beforeConfirm.verifiedAt,null);
 const anonymous=await browser.newContext();const denied=await anonymous.request.post(url('/api/payment-demo/open'),{headers:{Origin:base.origin},data:{token:capturedToken}});assert.equal(denied.status(),401);await anonymous.close();
 dropConfirmation=true;await applicant.locator('[data-payment-demo-confirm]').click();await expect(applicant.locator('[data-payment-error]')).toContainText(/reach|connection|try again/i);
 await applicant.locator('[data-payment-demo-confirm]').click();await expect(applicant.locator('[data-payment-demo-confirm]')).toHaveText('Simulated confirmation recorded');
 const stillUnverified=await read(applicant,applicantApi);assert.equal(stillUnverified.status,'verification_needed');assert.equal(stillUnverified.verifiedAt,null);
 pass('local handoff strips fragment secrets, collects no details, requires applicant session and safely retries provider confirmation without pretending CRM verification');

 await applicant.getByRole('link',{name:'Back to my application',exact:true}).click();await expect(applicant).toHaveURL(url(applicantPath));await expect(applicant.locator('[data-payment-workspace]')).toBeVisible();
 assert.equal((await read(applicant,applicantApi)).status,'verification_needed','Returning must not verify payment.');
 await paymentAction(applicant,'verify','Verify provider status');
 const verified=await read(applicant,applicantApi);assert.equal(verified.status,'confirmed');assert.match(verified.source,/Simulated/);assert(verified.verifiedAt&&!verified.stale);
 await applicant.reload();await expect(applicant.locator('[data-payment-status]')).toHaveText('Confirmed');
 await go(staff,staffPath,'[data-payment-workspace]');assert.equal((await read(staff,staffApi)).status,'confirmed');await expect(staff.locator('[data-payment-workspace]')).toContainText('Simulated existing payment provider');
 const beforePreview=requests.filter(request=>request.includes('/api/application-payments/')).length;
 await go(staff,staffPath+'&preview=1','.ap-preview-banner');assert.equal(await staff.locator('[data-payment-workspace],[data-payment-action]').count(),0);assert.equal(requests.filter(request=>request.includes('/api/application-payments/')).length,beforePreview);
 pass('only explicit provider verification updates the canonical status with simulated source and time; refresh and staff view agree; preview cannot impersonate payment actions');

 await mkdir('.local/screenshots',{recursive:true});
 for(const width of [320,390,768,1586]){
  await applicant.setViewportSize({width,height:1000});await go(applicant,applicantPath,'[data-payment-workspace]');
  await staff.setViewportSize({width,height:1000});await go(staff,staffPath,'[data-payment-workspace]');
  for(const page of [applicant,staff])assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  if(width===390)await applicant.screenshot({path:'.local/screenshots/payment-applicant-390-isolated.png',fullPage:true});
 }
 await applicant.getByRole('button',{name:'Open simulated payment provider',exact:true}).click();await expect(applicant.locator('[data-payment-demo-confirm]')).toBeDisabled();await expect(applicant).toHaveURL(url('/payment-demo'));
 await applicant.reload();await expect(applicant.locator('[data-payment-error]')).toContainText('handoff is missing');
 await applicant.goto(url('/payment-demo#token='+('f'.repeat(64))));await expect(applicant.locator('[data-payment-error]')).toContainText(/unavailable|expired/i);assert.equal(new URL(applicant.url()).hash,'');
 assert.deepEqual(outside,[]);assert.deepEqual(errors,[]);assert(!requests.some(request=>capturedToken&&request.includes(capturedToken)));
 pass('responsive native pages fit four widths; refresh or invalid handoff fails safely, and tokens never enter network URLs or external requests');
 console.log('Completed '+groups+' focused isolated Stage17 browser groups.');
}catch(issue){let message=String(issue?.stack||issue);for(const secret of [fixture.staffPassword,fixture.applicantPassword,capturedToken])if(secret)message=message.replaceAll(secret,'[redacted test secret]');console.error(message);console.error('Safe diagnostic: '+JSON.stringify({path:new URL(applicant.url()).pathname,errors}));process.exitCode=1;}
finally{await browser.close();}
