import 'dotenv/config';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {chromium,expect as baseExpect} from '@playwright/test';
const expect=baseExpect.configure({timeout:15000});

const base=new URL(process.env.OOTLA_CHECK_URL||'http://invalid.local');
const retained=new URL(process.env.APP_URL||'http://127.0.0.1:7673'),scratch=process.env.OOTLA_CHECK_DATABASE||'';
assert(base.protocol==='http:'&&base.hostname==='127.0.0.1'&&base.port);
assert(/^ootla_demo_screening_browser_[a-f0-9]{32}$/.test(scratch));
assert(!['5173','7673','3100'].includes(base.port)&&base.origin!==retained.origin);
const fixture=JSON.parse(process.env.OOTLA_APPLICANT_CONTEXT||'{}');
assert(fixture.applicationId&&fixture.staffEmail&&fixture.staffPassword&&fixture.applicantEmail);
const browser=await chromium.launch({headless:true,channel:process.env.OOTLA_BROWSER_CHANNEL||'chrome'});
const outside=[],errors=[],requests=[];
let groups=0,dropFirstRequest=false;
const pass=label=>{groups++;console.log('PASS '+label);};
const url=path=>new URL(path,base).href;
async function context(){
 const result=await browser.newContext({viewport:{width:1586,height:1050},reducedMotion:'reduce'});
 await result.route('**/*',async route=>{
  const target=new URL(route.request().url());if(/^https?:$/.test(target.protocol)&&target.origin!==base.origin){outside.push(target.origin+target.pathname);return route.abort();}
  if(dropFirstRequest&&route.request().method()==='POST'&&target.pathname.endsWith('/screening/requests')){
   dropFirstRequest=false;const response=await route.fetch();assert([200,201].includes(response.status()));await response.dispose();return route.abort('failed');
  }
  return route.continue();
 });
 result.on('page',page=>{page.setDefaultTimeout(30000);page.on('pageerror',error=>errors.push(error.message));page.on('request',request=>requests.push(request.method()+' '+new URL(request.url()).pathname));});
 return result;
}
const staffContext=await context(),applicantContext=await context();
const staff=await staffContext.newPage(),applicant=await applicantContext.newPage();
const application=fixture.applicationId,staffPath='/admin/applications?application='+application,applicantPath='/applicant?application='+application;
const staffApi='/api/application-journey/'+application,applicantApi='/api/applicant/application-journey/'+application;
async function json(page,path){const response=await page.request.get(url(path));assert.equal(response.status(),200,path);return response.json();}
async function go(page,path,selector){await page.goto(url(path));await expect(page.locator(selector)).toBeVisible();}
async function formAction(page,selector,button){
 const form=page.locator(selector),workspace=page.locator('[data-screening-workspace]'),previous=await workspace.elementHandle();
 await form.getByRole('button',{name:button,exact:true}).click();
 await previous.waitForElementState('hidden');await expect(workspace).toBeVisible();await expect(workspace.locator('[data-screening-success]')).toBeVisible();
 return json(page,staffApi+'/screening');
}
try{
 await go(staff,'/admin/login','#login-form');
 await staff.getByLabel('Email address',{exact:true}).fill(fixture.staffEmail);
 await staff.getByLabel('Password',{exact:true}).fill(fixture.staffPassword);
 await expect(staff.getByRole('button',{name:/Sign in/})).toBeEnabled();await staff.getByRole('button',{name:/Sign in/}) .click();await expect(staff).toHaveURL(url('/admin'));
 await go(staff,staffPath,'[data-screening-workspace]');
 const initial=await json(staff,staffApi+'/screening');assert.equal(initial.mode,'demo');assert.equal(initial.status,'consent_required');
 assert.equal(await staff.getByRole('button',{name:'Request demo screening',exact:true}).count(),0);
 const missing=await staff.request.post(url(staffApi+'/screening/requests'),{headers:{Origin:base.origin},data:{participantId:initial.participants[0].id,requestKey:randomUUID()}});
 assert([400,409,422].includes(missing.status()));
 pass('real staff application shows demo adapter and refuses screening without separate applicant consent');

 await go(applicant,'/applicant/login','[data-applicant-form=login]');
 await expect(applicant.locator('#fill-demo-applicant')).toBeVisible();await applicant.locator('#fill-demo-applicant').click();
 await applicant.getByRole('button',{name:'Sign in',exact:true}).click();await expect(applicant).toHaveURL(url('/applicant'));
 await go(applicant,applicantPath,'[data-applicant-workspace]');
 const details=applicant.locator('[data-applicant-form=details]');
 await details.getByLabel('Full name',{exact:true}).fill('Demo Screening Applicant');
 await details.getByLabel('Phone number',{exact:true}).fill('+44 7700 900321');
 await details.getByLabel('Current address',{exact:true}).fill('Synthetic Stage16 browser address');
 await details.getByLabel('Preferred move-in date',{exact:true}).fill('2027-02-15');
 await details.getByRole('button',{name:'Save details',exact:true}).click();await expect(applicant.locator('[data-applicant-success]')).toContainText('details have been saved');
 let own=await json(applicant,'/api/applicant/applications/'+application);
 for(const [index,item]of own.checklist.entries()){
  const upload=applicant.locator('[data-applicant-form=upload][data-checklist-id="'+item.id+'"]');
  await upload.locator('input[type=file]').setInputFiles({name:'synthetic-screening-'+index+'.txt',mimeType:'text/plain',buffer:Buffer.from('Invented synthetic application file. No real identity or screening data.')});
  const beforeUpload=await applicant.locator('[data-applicant-workspace]').elementHandle();await upload.getByRole('button',{name:'Upload document',exact:true}).click();await beforeUpload.waitForElementState('hidden');await expect(applicant.locator('[data-applicant-success]')).toContainText('document has been saved privately');
 }
 await applicant.locator('[data-applicant-form=consent] input[type=checkbox]').check();await applicant.locator('[data-applicant-form=consent] button[type=submit]').click();await expect(applicant.locator('[data-applicant-success]')).toContainText('consent has been recorded');
 assert.equal((await json(applicant,applicantApi+'/screening-consent')).acceptedAt,null,'Application-information consent must not become screening consent.');
 await applicant.locator('[data-applicant-form=ready] button[type=submit]').click();await expect(applicant.locator('[data-applicant-success]')).toContainText('section is ready');
 await applicant.locator('[data-applicant-form=submit] input[type=checkbox]').check();await applicant.locator('[data-applicant-form=submit] button[type=submit]').click();await expect(applicant.locator('[data-applicant-success]')).toContainText('submitted for staff review');
 await expect(applicant.locator('[data-screening-consent]')).toBeVisible();
 await applicant.locator('[data-screening-consent] input[type=checkbox]').check();await applicant.getByRole('button',{name:'Record screening consent',exact:true}).click();
 await expect(applicant.locator('[data-screening-consent-workspace] .ap-message:not([hidden])')).toContainText('Recorded');
 await applicant.reload();await expect(applicant.locator('[data-screening-consent-workspace] .ap-message:not([hidden])')).toContainText('Recorded');
 const consent=await json(applicant,applicantApi+'/screening-consent');assert.equal(consent.purpose,'screening');assert.equal(consent.version,'demo-screening-v1');assert(consent.acceptedAt);
 pass('actual applicant submission and separate versioned screening consent persist after submission and refresh');

 await go(staff,staffPath,'[data-screening-workspace]');
 dropFirstRequest=true;
 const requestForm=staff.locator('[data-screening-action=request]');
 await requestForm.getByRole('button',{name:'Request demo screening',exact:true}).click();
 await expect(requestForm.locator('[data-screening-error]')).toContainText(/reach|connection|try again/i);
 const requestKey=await requestForm.getAttribute('data-request-key');assert(requestKey);
 let screening=await formAction(staff,'[data-screening-action=request]','Request demo screening');
 assert.equal(screening.screenings.length,1);assert.equal(screening.status,'submitted');
 assert.equal(screening.screenings[0].status,'submitted');
 pass('a lost request response retries through the same persisted request key and creates one actual screening');

 screening=await formAction(staff,'[data-screening-action=fail]','Simulate temporary provider failure');
 assert.equal(screening.status,'failed');assert(screening.screenings[0].error);assert(screening.screenings[0].nextAttemptAt);
 const failedRequest=screening.screenings[0];
 const retry=staff.locator('[data-screening-action=retry]');
 await retry.getByRole('button',{name:'Retry failed demo screening',exact:true}).click();
 await expect(retry.locator('[data-screening-error]')).not.toBeEmpty();
 const wait=Math.max(0,Date.parse(failedRequest.nextAttemptAt)-Date.now())+100;assert(wait<30000);
 if(wait)await staff.waitForTimeout(wait);
 screening=await formAction(staff,'[data-screening-action=retry]','Retry failed demo screening');assert.equal(screening.status,'submitted');
 for(const expected of ['provider_reviewing','report_received','staff_review_pending']){
  screening=await formAction(staff,'[data-screening-action=process]','Advance demo screening');assert.equal(screening.status,expected);
 }
 assert(screening.screenings[0].reportAvailable);assert.equal(screening.decisions.length,0,'Demo screening must not approve or reject an applicant.');
 const download=staff.getByRole('link',{name:'Download private demo report',exact:true});await expect(download).toBeVisible();
 const reportPath=await download.getAttribute('href');assert(reportPath.startsWith(staffApi+'/screening/'));
 const report=await staff.request.get(url(reportPath));assert.equal(report.status(),200);assert.match(report.headers()['content-disposition'],/^attachment/);
 assert.equal((await applicant.request.get(url(reportPath))).status(),401);
 const anonymous=await browser.newContext();assert.equal((await anonymous.request.get(url(reportPath))).status(),401);await anonymous.close();
 screening=await formAction(staff,'[data-screening-action=review]','Record staff report review');assert(screening.screenings[0].reviewedAt);assert.equal(screening.decisions.length,0);
 pass('temporary failures and retry backoff remain honest; demo progresses through provider states to private report and explicit staff review without an automatic decision');

 const decision=staff.locator('[data-screening-action=decision]');
 await decision.getByLabel('Staff decision',{exact:true}).selectOption('approved');
 await decision.getByLabel('Reason and next steps',{exact:true}).fill('Authorized synthetic demo staff review complete; continue to lease preparation.');
 await decision.locator('input[name=confirmed]').check();
 screening=await formAction(staff,'[data-screening-action=decision]','Record staff decision');
 assert.equal(screening.decisions.length,1);assert.equal(screening.decisions[0].decision,'approved');assert(screening.decisions[0].actorName);
 await staff.reload();await expect(staff.locator('[data-screening-workspace]')).toContainText('Authorized synthetic demo staff review complete');
 const beforePreview=requests.filter(path=>path.includes('/api/application-journey/')).length;
 await go(staff,staffPath+'&preview=1','.ap-preview-banner');assert.equal(await staff.locator('[data-screening-action],[data-screening-consent]').count(),0);
 assert.equal(requests.filter(path=>path.includes('/api/application-journey/')).length,beforePreview,'Preview must not fetch sensitive screening summaries or authorize consent.');
 pass('authorized staff decision persists separately with actor and reason; read-only preview has no screening fetch or mutation controls');

 await mkdir('.local/screenshots',{recursive:true});
 for(const width of [320,390,768,1586]){
  await staff.setViewportSize({width,height:1000});await go(staff,staffPath,'[data-screening-workspace]');
  await applicant.setViewportSize({width,height:1000});await go(applicant,applicantPath,'[data-screening-consent-workspace]');
  for(const page of [staff,applicant]){
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
   const unlabelled=await page.locator('main').evaluate(main=>[...main.querySelectorAll('input,textarea,select')].filter(control=>control.type!=='hidden'&&!control.labels?.length&&!control.getAttribute('aria-label')).map(control=>control.name));assert.deepEqual(unlabelled,[]);
  }
  if([390,1586].includes(width))await staff.screenshot({path:'.local/screenshots/screening-'+width+'-isolated.png',fullPage:true});
 }
 assert.deepEqual(outside,[]);assert.deepEqual(errors,[]);
 pass('screening and consent remain usable at 320/390/768/1586px with native labels and no browser errors or external requests');
 console.log('Completed '+groups+' focused isolated Stage16 browser groups.');
}catch(issue){
 let message=String(issue?.stack||issue);for(const secret of [fixture.applicantPassword,fixture.staffPassword])if(secret)message=message.replaceAll(secret,'[redacted test secret]');
 console.error(message);console.error('Safe diagnostic: '+JSON.stringify({staffUrl:new URL(staff.url()).pathname,mainText:(await staff.locator('main').textContent().catch(()=>''))?.slice(0,1600),errors}));process.exitCode=1;
}finally{await browser.close();}
