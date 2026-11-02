import assert from 'node:assert/strict';
import path from 'node:path';
import {mkdir,access} from 'node:fs/promises';
import {preview} from 'vite';
import {chromium,expect} from '@playwright/test';
import type {ServerConfig} from '../server/config/env.js';
export async function checkOperationsBrowser(input:{base:string;cookie:string;analyst:string;applicant:string;config:ServerConfig;propertyId:string;formId:string;leadId:string;conversationId:string;requestId:string;propertyRecords:import('./property-operations-browser-check.js').PropertyBrowserRecords}){
 const root=path.resolve(import.meta.dirname,'..');
 // Exercise the built release assets without a development module graph/HMR across hundreds of navigations.
 await access(path.join(root,'dist/client/app-shell.html')).catch(()=>{throw Error('Run npm run build before the operations browser check.');});
 const web=await preview({configFile:false,root:path.join(root,'client'),build:{outDir:path.join(root,'dist/client')},appType:'mpa',preview:{host:'127.0.0.1',port:0,proxy:{'/api':input.base}},plugins:[{name:'isolated-browser-shell',configurePreviewServer(server){server.middlewares.use((req,_res,next)=>{if(req.method==='GET'&&req.headers.accept?.includes('text/html')&&!new URL(req.url??'/', 'http://localhost').pathname.startsWith('/api/'))req.url='/app-shell.html';next();});}}],logLevel:'error'});
 const address=web.httpServer.address();assert(address&&typeof address!=='string');const base='http://127.0.0.1:'+address.port,previous=input.config.appUrl;(input.config as {appUrl:string}).appUrl=base;
 const browser=await chromium.launch({channel:process.env.OOTLA_BROWSER_CHANNEL||'chrome',headless:true});
 try{
  const errors:string[]=[],context=await browser.newContext({reducedMotion:'reduce'});
  await context.addCookies([{name:'ootla.sid',value:input.cookie.split('=')[1]!,url:base,httpOnly:true,sameSite:'Lax'},{name:'ootla.applicant.sid',value:input.applicant.split('=')[1]!,url:base,httpOnly:true,sameSite:'Lax'}]);
  await context.route('**/*',route=>{const u=new URL(route.request().url());if(/^https?:$/.test(u.protocol)&&u.origin!==base){errors.push('External request');return route.abort();}return route.continue();});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/inquire?form='+input.formId+'&campaign=browser');
  const intake=page.locator('[data-ops-action=inquire]');await expect(intake).toBeVisible();
  await intake.getByLabel('Your name',{exact:true}).fill('Browser Inquiry Customer');await intake.getByLabel('Email',{exact:true}).fill('browser-operations@example.test');await intake.getByLabel('How can we help?',{exact:true}).fill('Is visitor parking available?');await intake.locator('[name=emailConsent]').check();
  // The form challenge deliberately requires at least 1.5 seconds of form dwell time.
  await page.waitForTimeout(1600);await intake.getByRole('button',{name:'Send inquiry',exact:true}).click();await expect(page.locator('[data-ops-notice]')).toContainText('has been received');
  await page.goto(base+'/admin/inbox?q=Browser');await page.getByRole('link',{name:'Browser Inquiry Customer',exact:true}).click();await expect(page.locator('[data-ops-action=draft]')).toBeVisible();
  const draft=page.locator('[data-ops-action=draft]');await draft.getByLabel('Reply text',{exact:true}).fill('Thank you. Visitor parking is in the east lot.');await draft.getByRole('button',{name:'Save draft',exact:true}).click();
  const send=page.locator('[data-ops-action=send-draft]').first();await expect(send).toBeVisible();await send.locator('[name=confirmed]').check();await send.getByRole('button',{name:'Simulate send',exact:true}).click();await expect(page.locator('[data-message]').first()).toContainText('simulated');
  console.log('PASS browser operations: public inquiry to unread inbox, draft review and persisted simulated reply');
  const {checkConnectedBrowser}=await import('./connected-browser-check.js');await checkConnectedBrowser(page,base);
  await page.goto(base+'/resident');await expect(page.getByRole('heading',{name:'My resident workspace',exact:true})).toBeVisible();
  const request=page.locator('[data-ops-action=resident-create]');await request.getByLabel('Short description',{exact:true}).fill('Browser window latch');await request.getByLabel('What needs attention?',{exact:true}).fill('The bedroom window latch needs inspection.');await request.getByRole('button',{name:'Submit request',exact:true}).click();await expect(page.getByRole('heading',{name:'Browser window latch',exact:true})).toBeVisible();
  const upload=page.locator('[data-ops-action=resident-upload]');await upload.locator('[type=file]').setInputFiles({name:'latch.txt',mimeType:'text/plain',buffer:Buffer.from('Synthetic attachment describing the latch.')});await upload.getByRole('button',{name:'Upload attachment',exact:true}).click();await expect(page.getByRole('link',{name:'latch.txt',exact:true})).toBeVisible();
  const requestId=new URL(page.url()).searchParams.get('request');assert(requestId);await page.goto(base+'/admin/residents?request='+requestId);
  const update=page.locator('[data-ops-action=resident-update]');await update.getByLabel('Status',{exact:true}).selectOption('waiting');await update.getByLabel('Update for the resident',{exact:true}).fill('We have asked maintenance to arrange access.');await update.getByRole('button',{name:'Save update',exact:true}).click();await expect(page.locator('[data-operations]')).toContainText('We have asked maintenance');
  await page.goto(base+'/resident?request='+requestId);await expect(page.locator('[data-operations]')).toContainText('We have asked maintenance');
  console.log('PASS browser operations: resident request, attachment and staff update visible through the private portal');
  await page.goto(base+'/admin/knowledge');await expect(page.locator('[data-config-record]')).not.toHaveCount(0);
  await page.goto(base+'/admin/ai?lead='+input.leadId);const ai=page.locator('[data-pilot-action=generate]');await ai.getByLabel('Assistance',{exact:true}).selectOption('answer');await ai.locator('[name=question]').fill('Where is visitor parking?');await ai.getByRole('button',{name:'Generate draft',exact:true}).click();await expect(page.locator('[data-assistant-result]').first()).toContainText('Published reference excerpt');
  await page.locator('[data-assistant-result]').first().getByText('Edit draft & give feedback',{exact:true}).click();const edit=page.locator('[data-pilot-action=revise]').first();await edit.getByLabel('Edited draft',{exact:true}).fill('Parking is in the east lot; register at reception. [1]');await edit.getByLabel('Feedback',{exact:true}).selectOption('helpful');await edit.getByRole('button',{name:'Save edited draft',exact:true}).click();await expect(page.locator('[data-assistant-result]').first()).toContainText('Parking is in the east lot; register');
  await page.goto(base+'/admin/workspace?view=saved&source=website');await page.locator('[data-ops-action=save-view] [name=name]').fill('Browser saved inquiries');await page.locator('[data-ops-action=save-view]').getByRole('button',{name:'Save current filters',exact:true}).click();await expect(page.getByRole('link',{name:'Browser saved inquiries',exact:true})).toBeVisible();
  await page.locator('[data-ops-action=bulk] [name=selectedLead]').first().check();await page.locator('[data-ops-action=bulk] [name=confirmed]').check();await page.locator('[data-ops-action=bulk]').getByRole('button',{name:'Assign selected leads',exact:true}).click();await expect(page.locator('[data-ops-error]')).toBeEmpty();
  console.log('PASS browser operations: referenced AI answer, editable feedback, saved filters and reviewed bulk assignment');
  await mkdir(path.join(root,'.local/screenshots'),{recursive:true});
  for(const width of [320,390,768,1586])for(const route of ['/admin/attention','/admin/intake','/admin/inbox?conversation='+input.conversationId,'/admin/automations','/admin/residents','/admin/workspace?view=saved','/admin/knowledge','/admin/reports','/resident']){
   await page.setViewportSize({width,height:1000});await page.goto(base+route);await expect(page.locator('[data-operations]')).toBeVisible();await expect(page.locator('[data-ops-error]')).toBeEmpty();assert(await page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),'No horizontal overflow: '+route+' at '+width);
   if((width===390||width===1586)&&['/admin/attention','/admin/reports','/admin/inbox?conversation='+input.conversationId,'/resident'].includes(route))await page.screenshot({path:path.join(root,'.local/screenshots/operations-'+route.split('?')[0].split('/').at(-1)+'-'+width+'.png'),fullPage:true});
  }
  const {checkPropertyOperationsBrowser}=await import('./property-operations-browser-check.js');await checkPropertyOperationsBrowser(page,base,input.propertyRecords);
  const {checkCollaborationBrowser}=await import('./property-collaboration-browser-check.js');await checkCollaborationBrowser(page,base,input.propertyRecords.collaborationRecords);
  await context.addCookies([{name:'ootla.sid',value:input.analyst.split('=')[1]!,url:base,httpOnly:true,sameSite:'Lax'}]);await page.goto(base+'/admin/property-insights');await expect(page.locator('[data-operations]')).toContainText('Maintenance costs');await expect(page.locator('[data-ops-error]')).toBeEmpty();await expect(page.getByLabel('Property',{exact:true})).toBeVisible();console.log('PASS collaboration browser: read-only analyst dashboard loads without private workflow endpoints');
  assert.deepEqual(errors,[]);console.log('PASS browser operations: nine workspaces at four widths, no page errors or external network requests');
 }catch(error){console.error('Operations browser failure: '+(error instanceof Error?error.message:'Unknown failure'));console.error(error instanceof Error?error.stack?.split('\n').filter(l=>l.includes('operations-browser-check.ts')).join('\n'):'');const page=browser.contexts()[0]?.pages().at(-1);if(page){console.error((await page.locator('body').innerText()).slice(0,2000));await mkdir(path.join(root,'.local/screenshots'),{recursive:true});await page.screenshot({path:path.join(root,'.local/screenshots/operations-failure.png'),fullPage:true});}throw error;}
 finally{await browser.close();await web.close();(input.config as {appUrl:string}).appUrl=previous;}
}
