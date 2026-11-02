import 'dotenv/config';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {chromium,expect} from '@playwright/test';

// Deliberately refuses retained preview operation: every write requires its wrapper-owned scratch identity.
const base=new URL(process.env.OOTLA_CHECK_URL||'http://invalid.local');
const retained=new URL(process.env.APP_URL||'http://127.0.0.1:7673'),scratch=process.env.OOTLA_CHECK_DATABASE||'';
assert(base.protocol==='http:'&&base.hostname==='127.0.0.1'&&base.port);
assert(/^ootla_demo_applicant_browser_[a-f0-9]{32}$/.test(scratch));
assert(!['5173','7673','3100'].includes(base.port)&&base.origin!==retained.origin);
const fixture=JSON.parse(process.env.OOTLA_APPLICANT_CONTEXT||'{}');
assert(fixture.applicationId&&fixture.extraLeadId&&fixture.expiredToken&&fixture.staffPassword);
const browser=await chromium.launch({headless:true,channel:process.env.OOTLA_BROWSER_CHANNEL||'chrome'});
const errors=[],outside=[],requests=[],writes=[];
let groups=0,firstDocument,newApplicationId,issuedToken;
const invitedPassword='InvitedBrowser!2026',url=path=>new URL(path,base).href;
const pass=title=>{groups++;console.log('PASS '+title);};
async function context(){
 const context=await browser.newContext({viewport:{width:1586,height:1050},reducedMotion:'reduce'});
 await context.route('**/*',route=>{const target=new URL(route.request().url());if(/^https?:$/.test(target.protocol)&&target.origin!==base.origin){outside.push(target.origin+target.pathname);return route.abort();}return route.continue();});
 context.on('page',page=>{page.setDefaultTimeout(30000);page.on('pageerror',error=>errors.push(error.message));page.on('request',request=>{const target=new URL(request.url());requests.push(target.pathname+target.search);if(!['GET','HEAD','OPTIONS'].includes(request.method()))writes.push(request.method()+' '+target.pathname);});});
 return context;
}
const applicantContext=await context(),staffContext=await context(),invitedContext=await context();
const applicant=await applicantContext.newPage(),staff=await staffContext.newPage(),invited=await invitedContext.newPage();
async function read(target,path){const response=await target.request.get(url(path));assert.equal(response.status(),200,path);return response.json();}
async function go(target,path,selector){await target.goto(url(path));if(selector)await expect(target.locator(selector)).toBeVisible();}
async function labels(target,selector){const missing=await target.locator(selector).evaluate(root=>[...root.querySelectorAll('input,select,textarea')].filter(control=>control.type!=='hidden'&&!control.labels?.length&&!control.getAttribute('aria-label')).map(control=>control.name||control.id));assert.deepEqual(missing,[]);}
async function staffSignIn(){
 await staff.goto(url('/admin/login?returnTo=%2Fadmin%2Fapplications'));
 await staff.getByLabel('Email address',{exact:true}).fill(fixture.staffEmail);
 await staff.getByLabel('Password',{exact:true}).fill(fixture.staffPassword);
 await expect(staff.getByRole('button',{name:/Sign in/})).toBeEnabled();
 await staff.getByRole('button',{name:/Sign in/}).click();
 await expect(staff.locator('[data-applications-workspace]')).toBeVisible();
}
try{
 await go(applicant,'/applicant/invite#token='+fixture.expiredToken,'[data-applicant-form=accept]');
 await expect(applicant.locator('[data-applicant-error]')).toContainText(/expired|no longer|invalid/i);
 assert.equal(new URL(applicant.url()).hash,'');
 await expect(applicant.getByRole('button',{name:'Accept invitation',exact:true})).toBeDisabled();
 await applicant.goto(url('/applicant'));
 await expect(applicant).toHaveURL(url('/applicant/login'));
 await expect(applicant.locator('#fill-demo-applicant')).toBeVisible();
 const beforeFill=writes.filter(item=>item.includes('/api/applicant/auth/login')).length;
 await applicant.locator('#fill-demo-applicant').click();
 assert.equal(writes.filter(item=>item.includes('/api/applicant/auth/login')).length,beforeFill);
 await expect(applicant.getByLabel('Email address',{exact:true})).toHaveValue(fixture.applicantEmail);
 assert.equal(await applicant.getByLabel('Password',{exact:true}).getAttribute('type'),'password');
 await expect(applicant.getByRole('button',{name:'Sign in',exact:true})).toBeFocused();
 await applicant.keyboard.press('Enter');
 await expect(applicant).toHaveURL(url('/applicant'));
 await expect(applicant.getByRole('heading',{name:'My applications',exact:true})).toBeVisible();
 const me=await read(applicant,'/api/applicant/auth/me');assert.equal(me.user.email,fixture.applicantEmail);
 assert.equal((await applicant.request.get(url('/api/auth/me'))).status(),401,'Applicant session does not become a staff session.');
 pass('expired invitation is blocked; protected portal, masked demo fill, keyboard Sign in and separate real applicant session');

 await go(applicant,'/applicant?application='+fixture.applicationId,'[data-applicant-workspace]');
 await labels(applicant,'.ap-main');
 const details=applicant.locator('[data-applicant-form=details]');
 await details.getByLabel('Full name',{exact:true}).fill('Demo Applicant Browser');
 await details.getByLabel('Phone number',{exact:true}).fill('+44 7700 900321');
 await details.getByLabel('Current address',{exact:true}).fill('Invented browser address 12');
 await details.getByLabel('Preferred move-in date',{exact:true}).fill('2027-02-15');
 await details.getByRole('button',{name:'Save details',exact:true}).click();
 await expect(applicant).toHaveURL(/saved=details/);
 await expect(applicant.locator('[data-applicant-success]')).toContainText('details have been saved');
 await applicant.reload();await expect(applicant.getByLabel('Current address',{exact:true})).toHaveValue('Invented browser address 12');
 assert.equal((await read(applicant,'/api/applicant/applications/'+fixture.applicationId)).participant.details.displayName,'Demo Applicant Browser');
 pass('personal details persist in the actual application and resume after a full browser refresh');

 const original=await read(applicant,'/api/applicant/applications/'+fixture.applicationId);
 assert.equal(original.checklist.length,2);
 const invalid=applicant.locator('[data-applicant-form=upload]').first();
 await invalid.locator('input[type=file]').setInputFiles({name:'rejected.html',mimeType:'text/html',buffer:Buffer.from('<html>not a permitted application file</html>')});
 await invalid.getByRole('button',{name:'Upload document',exact:true}).click();
 await expect(invalid.locator('[data-applicant-error]')).toContainText('PDF, PNG, JPEG or plain text');
 for(const[index,item]of original.checklist.entries()){
  const upload=applicant.locator('[data-applicant-form=upload][data-checklist-id="'+item.id+'"]');
  await upload.locator('input[type=file]').setInputFiles({name:'invented-browser-'+index+'.txt',mimeType:'text/plain',buffer:Buffer.from('Invented demo document '+index+'. No real personal data.')});
  await upload.getByRole('button',{name:'Upload document',exact:true}).click();
  await expect(applicant.locator('[data-applicant-success]')).toContainText('document has been saved privately');
  await expect(applicant.locator('[data-applicant-form=upload][data-checklist-id="'+item.id+'"] button')).toHaveText('Replace document');
 }
 const uploaded=await read(applicant,'/api/applicant/applications/'+fixture.applicationId);
 assert(uploaded.checklist.every(item=>item.document));firstDocument=uploaded.checklist[0].document;
 const download=await applicant.request.get(url(firstDocument.downloadUrl));assert.equal(download.status(),200);assert.match(download.headers()['content-disposition'],/^attachment;/);assert.match(download.headers()['cache-control'],/no-store/);
 assert.match(await download.text(),/Invented demo document/);
 const anon=await browser.newContext();assert.equal((await anon.request.get(url(firstDocument.downloadUrl))).status(),401);await anon.close();
 assert.equal((await applicant.request.get(url(firstDocument.downloadUrl.replace(firstDocument.id,randomUUID())))).status(),404);
 const browserDownload=applicant.waitForEvent('download');await applicant.locator('.ap-file-list a').first().click();assert.match((await browserDownload).suggestedFilename(),/^invented-browser-/);
 pass('validated private uploads, real authorized attachment download, rejected file type and denial of anonymous or guessed documents');

 await applicant.locator('[data-applicant-form=consent] input[type=checkbox]').check();
 await applicant.locator('[data-applicant-form=consent] button[type=submit]').click();
 await expect(applicant.locator('[data-applicant-success]')).toContainText('consent has been recorded');
 await applicant.locator('[data-applicant-form=ready] button[type=submit]').click();
 await expect(applicant.locator('[data-applicant-success]')).toContainText('section is ready');
 await applicant.locator('[data-applicant-form=submit] input[type=checkbox]').check();
 await applicant.locator('[data-applicant-form=submit] button[type=submit]').click();
 await expect(applicant.locator('[data-applicant-success]')).toContainText('submitted for staff review');
 assert.equal((await read(applicant,'/api/applicant/applications/'+fixture.applicationId)).application.status,'submitted');
 await staffSignIn();
 await go(staff,'/admin/applications?application='+fixture.applicationId,'[data-applications-workspace]');
 const savedStaff=await read(staff,'/api/applications/'+fixture.applicationId);
 assert.equal(savedStaff.application.status,'submitted');assert.equal(savedStaff.participants[0].details.displayName,'Demo Applicant Browser');assert(savedStaff.participants[0].consentAcceptedAt);assert.equal(savedStaff.participants[0].documents.length,2);
 await staff.getByRole('link',{name:'Read-only staff preview',exact:true}).click();
 await expect(staff.locator('.ap-preview-banner')).toContainText('Read-only staff preview');
 assert.equal(await staff.locator('[data-applicant-form] button[type=submit]').count(),0);
 assert.equal(await staff.locator('[data-applicant-workspace] input:not(:disabled)').count(),0);
 await go(staff,'/admin/leads?view=record&lead='+savedStaff.application.leadId,'[data-lead-workspace08]');
 const lead=await read(staff,'/api/lead-workspaces/'+savedStaff.application.leadId);
 assert.equal(lead.leadDetail.lead.applicationSummary.status,'submitted');
 assert(lead.timeline.items.some(event=>event.kind==='application'&&/submitted.*staff review/i.test(event.summary)));
 pass('versioned consent, readiness and real submission synchronize staff progress, a safe read-only preview and the connected lead timeline');

 await go(staff,'/admin/applications?'+new URLSearchParams({view:'new',leadSearch:'Browser Invited',lead:fixture.extraLeadId}),'[data-applications-workspace]');
 await staff.getByLabel('Existing leasing lead',{exact:true}).selectOption(fixture.extraLeadId);
 await staff.getByRole('button',{name:'Create linked application',exact:true}).click();
 await expect(staff).toHaveURL(/application=/);
 newApplicationId=new URL(staff.url()).searchParams.get('application');assert(newApplicationId&&newApplicationId!==fixture.applicationId);
 const initialRequirements=(await read(staff,'/api/applications/'+newApplicationId)).checklist.length;
 const settings=staff.locator('[data-application-form=settings]');
 await settings.getByLabel('Allow co-applicants',{exact:true}).check();
 await settings.getByRole('button',{name:'Add checklist item',exact:true}).click();
 const newRow=settings.locator('[data-application-checklist-row]').last();
 await newRow.getByLabel('Document label',{exact:true}).fill('Optional browser supporting document');
 await newRow.getByLabel('Required for each participant',{exact:true}).uncheck();
 await settings.getByRole('button',{name:'Save requirements',exact:true}).click();
 await expect(staff.locator('[data-application-success]')).toContainText('configuration saved');
 await staff.getByRole('link',{name:'Add co-applicant',exact:true}).click();
 await expect(staff.locator('[data-application-form=participant]')).toBeVisible();
 await staff.getByLabel('Existing contact',{exact:true}).selectOption(savedStaff.primaryContact.id);
 await staff.getByLabel('Invitation email for this person',{exact:true}).fill(fixture.applicantEmail);
 await staff.getByRole('button',{name:'Add co-applicant',exact:true}).click();
 await expect(staff.locator('[data-application-success]')).toContainText('Co-applicant added');
 const fresh=await read(staff,'/api/applications/'+newApplicationId);
 assert.equal(fresh.participants.length,2);assert.equal(fresh.checklist.length,initialRequirements+1);
 const primary=fresh.participants.find(item=>item.role==='primary');assert(primary);
 const issue=staff.locator('[data-application-form=invite]');
 await issue.getByLabel('Applicant',{exact:true}).selectOption(primary.id);
 await issue.getByRole('button',{name:'Create private invitation',exact:true}).click();
 await expect(staff.locator('[data-application-issued]')).toBeVisible();
 const invitationUrl=await staff.locator('[data-application-invite-link]').inputValue();
 const invitation=new URL(invitationUrl);assert.equal(invitation.origin,base.origin);assert.match(invitation.hash,/^#token=[a-f0-9]{64}$/);issuedToken=invitation.hash.slice(7);
 await expect(staff.locator('[data-application-invite-status]')).toContainText('No email or text has been sent');
 pass('staff create from a real lead, configure checklist/co-applicants and deliberately issue a private copy-only invitation');

 await go(invited,invitation.pathname+invitation.hash,'[data-applicant-form=accept]');
 await expect(invited.locator('[data-applicant-setup]')).toContainText(primary.email);
 assert.equal(new URL(invited.url()).hash,'');
 assert.equal(await invited.evaluate(token=>localStorage.getItem(token)||sessionStorage.getItem(token),issuedToken),null);
 await expect(invited.getByRole('button',{name:'Accept invitation',exact:true})).toBeEnabled();
 assert.equal((await read(invited,'/api/applicant/auth/me')).user,null);
 await invited.getByLabel('Your password',{exact:true}).fill(invitedPassword);
 await invited.getByRole('button',{name:'Accept invitation',exact:true}).click();
 await expect(invited).toHaveURL(url('/applicant'));
 await expect(invited.getByRole('heading',{name:'My applications',exact:true})).toBeVisible();
 await go(invited,'/applicant?application='+newApplicationId,'[data-applicant-workspace]');
 const own=await read(invited,'/api/applicant/applications/'+newApplicationId);
 assert.equal(own.participants.length,2);assert(own.checklist.every(item=>item.document===null));
 assert.equal(await invited.locator('.ap-file-list').count(),0);
 assert.equal((await invited.request.get(url('/api/applicant/applications/'+fixture.applicationId))).status(),404);
 assert.equal((await invited.request.get(url(firstDocument.downloadUrl))).status(),404);
 const reuse=await invited.request.post(url('/api/applicant/invitations/inspect'),{headers:{Origin:base.origin},data:{token:issuedToken}});assert.equal(reuse.status(),410);
 assert(!requests.some(target=>target.includes(issuedToken)||target.includes(fixture.expiredToken)));
 pass('invitation acceptance creates separate authorized access, removes URL fragments, rejects reuse and denies another applicant’s records/documents');

 await mkdir('.local/screenshots',{recursive:true});
 for(const width of [320,390,768,1586]){
  for(const[target,path,selector,name]of[
   [applicant,'/applicant?application='+fixture.applicationId,'.ap-main','applicant'],
   [staff,'/admin/applications?application='+newApplicationId,'[data-applications-workspace]','applications'],
   [invited,'/applicant?application='+newApplicationId,'.ap-main','invited-applicant']
  ]){
   await target.setViewportSize({width,height:1000});
   await go(target,path,selector);await labels(target,selector);
   assert(await target.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),name+' fits '+width+'px');
   assert(await target.evaluate(()=>matchMedia('(prefers-reduced-motion: reduce)').matches));
   assert.equal(await target.locator(name==='applications'?'.b-rail-brand':'.wordmark .brand-roof').first().evaluate(element=>getComputedStyle(element).animationName),'none');
   if([390,1586].includes(width)&&name!=='invited-applicant')await target.screenshot({path:'.local/screenshots/'+name+'-'+width+'-isolated.png',fullPage:true});
  }
 }
 await invited.getByRole('link',{name:'My applications',exact:true}).focus();await invited.keyboard.press('Enter');await expect(invited).toHaveURL(url('/applicant'));
 pass('applicant and staff workspaces fit 320/390/768/1586px with native labels, keyboard navigation and reduced-motion support');

 await applicant.getByRole('button',{name:'Sign out',exact:true}).click();await expect(applicant).toHaveURL(url('/applicant/login'));
 assert.equal((await read(applicant,'/api/applicant/auth/me')).user,null);
 assert.deepEqual(errors,[]);assert.deepEqual(outside,[]);
 assert.equal(requests.filter(target=>target.startsWith('/api/demo/data')).length,0);
 assert(writes.every(write=>/^(POST|PATCH|PUT|DELETE) \/api\/(applicant\/|applications(?:\/|$)|auth\/(?:login|logout)$)/.test(write)));
 const config=await read(invited,'/api/applicant/config');assert.equal(config.outboundMode,'simulation');
 pass('logout revokes the real session; no page errors, external requests, unrelated demo reads or outbound provider actions');
 console.log('Completed '+groups+' isolated applicant browser groups.');
}catch(issue){
 let message=String(issue?.stack||issue);for(const secret of [fixture.expiredToken,fixture.applicantPassword,fixture.staffPassword,invitedPassword,issuedToken])if(secret)message=message.replaceAll(secret,'[redacted test secret]');
 console.error(message);process.exitCode=1;
}finally{await browser.close();}
