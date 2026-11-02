import assert from 'node:assert/strict';
import path from 'node:path';
import {mkdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {createServer} from 'vite';
import {chromium,expect as browserExpect} from '@playwright/test';
// Cold CI module loads and route refreshes can exceed Playwright's five-second assertion default.
const expect=browserExpect.configure({timeout:15000});
import type {ServerConfig} from '../server/config/env.js';
export async function checkPilotBrowser(input:{base:string;cookie:string;leadId:string;password:string;config:ServerConfig}){
 const root=path.resolve(import.meta.dirname,'..');
 const web=await createServer({configFile:false,root:path.join(root,'client'),publicDir:path.join(root,'public'),server:{host:'127.0.0.1',port:0,proxy:{'/api':input.base}},logLevel:'error'});
 await web.listen();const address=web.httpServer!.address();assert(address&&typeof address!=='string');const base='http://127.0.0.1:'+address.port;
 const previous=input.config.appUrl;(input.config as {appUrl:string}).appUrl=base;
 const browser=await chromium.launch({channel:process.env.OOTLA_BROWSER_CHANNEL||'chrome',headless:true});
 try{
  const errors:string[]=[];
  const context=await browser.newContext({reducedMotion:'reduce'});
  await context.addCookies([{name:'ootla.sid',value:input.cookie.split('=')[1]!,url:base,httpOnly:true,sameSite:'Lax'}]);
  await context.route('**/*',route=>{const url=new URL(route.request().url());if(/^https?:$/.test(url.protocol)&&url.origin!==base){errors.push('External request');return route.abort();}return route.continue();});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/admin/ai?lead='+input.leadId);
  await expect(page.locator('[data-pilot-action=generate]')).toBeVisible();
  await page.getByRole('button',{name:'Generate draft',exact:true}).click();
  await expect(page.locator('[data-assistant-result]')).toHaveCount(1);
  await expect(page.locator('[data-assistant-result]')).toContainText('Demonstration');
  await page.locator('[data-pilot-action=review] input').check();
  await page.getByRole('button',{name:'Mark reviewed',exact:true}).click();
  await expect(page.locator('[data-assistant-result]')).toContainText('Reviewed');
  await page.reload();await expect(page.locator('[data-assistant-result]')).toContainText('Reviewed');
  console.log('PASS browser assistant: selected record, generation, review and persisted history');
  await page.goto(base+'/admin/team');
  const invite=page.locator('[data-pilot-action=invite]');await expect(invite).toBeVisible();
  const email='browser-'+randomUUID()+'@example.test';
  await invite.getByLabel('Full name',{exact:true}).fill('Browser Staff');await invite.getByLabel('Email',{exact:true}).fill(email);
  await invite.getByLabel('Your current password',{exact:true}).fill(input.password);
  await invite.locator('[name=propertyIds]').first().check();
  await invite.getByRole('button',{name:'Create invitation link',exact:true}).click();
  const access=page.getByLabel('New staff access link',{exact:true});await expect(access).toBeVisible();const accessUrl=await access.inputValue();assert(new URL(accessUrl).hash);
  const newcomer=await browser.newContext();const person=await newcomer.newPage();const requests:string[]=[];person.on('request',r=>requests.push(r.url()));person.on('pageerror',e=>errors.push(e.message));
  await person.goto(accessUrl);await expect(person).toHaveURL(base+'/staff/access');
  const password='Browser-'+randomUUID()+'!';await person.getByLabel('New password',{exact:true}).fill(password);await person.getByLabel('Confirm password',{exact:true}).fill(password);
  await person.getByRole('button',{name:'Save password',exact:true}).click();await expect(person.locator('[data-pilot-message]')).toContainText('Password saved');
  assert(!requests.some(url=>url.includes(new URL(accessUrl).hash.slice(7))));
  await person.getByRole('link',{name:'Go to staff sign in',exact:true}).click();
  await person.getByLabel('Email address',{exact:true}).fill(email);await person.getByLabel('Password',{exact:true}).fill(password);await person.getByRole('button',{name:'Sign in',exact:true}).click();
  await expect(person).toHaveURL(base+'/admin');
  await person.goto(base+'/admin/team');await expect(person.locator('[data-pilot-workspace]')).toContainText('Access restricted');
  console.log('PASS browser team: admin-issued link, immediate fragment removal, personal password, normal login and restricted staff access');
  await page.goto(base+'/admin/analytics');await expect(page.locator('[data-analytics-export]')).toBeVisible();
  const download=page.waitForEvent('download');await page.getByRole('button',{name:'Download CSV',exact:true}).click();assert.equal((await download).suggestedFilename(),'ootla-leasing-analytics.csv');
  await page.goto(base+'/admin/onboarding');await expect(page.locator('.pilot-checklist')).toBeVisible();
  await mkdir(path.join(root,'.local/screenshots'),{recursive:true});
  for(const width of [320,390,768,1586])for(const route of ['/admin/ai?lead='+input.leadId,'/admin/team','/admin/analytics','/admin/onboarding']){
   await page.setViewportSize({width,height:1000});await page.goto(base+route);await expect(page.locator('[data-pilot-workspace]')).toBeVisible();
   assert(await page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),'No horizontal overflow: '+route+' at '+width);
   if(width===390||width===1586)await page.screenshot({path:path.join(root,'.local/screenshots/pilot-'+route.split('?')[0].split('/').at(-1)+'-'+width+'.png'),fullPage:true});
  }
  assert.deepEqual(errors,[]);
  console.log('PASS browser analytics export, onboarding navigation and four-width layouts across all new workspaces');
 }finally{await browser.close();await web.close();(input.config as {appUrl:string}).appUrl=previous;}
}
