import assert from 'node:assert/strict';
import path from 'node:path';
import {expect} from '@playwright/test';
import type {UiFixture} from './ui-environment.js';
async function checkStaffAuth(f:UiFixture,leadId:string){
 const context=await f.context.browser()!.newContext(),page=await context.newPage();let logins=0;
 page.on('request',request=>{if(request.method()==='POST'&&request.url().endsWith('/api/auth/login'))logins++;});
 try{
  for(const requested of ['/admin/leads?lead='+leadId,'/admin/inbox','https://example.invalid/admin']){
   const safe=requested.startsWith('/'),target=safe?requested:'/admin';
   await page.goto(f.base+(safe?requested:'/admin/login?returnTo='+encodeURIComponent(requested)));
   await expect(page).toHaveURL(/\/admin\/login\?returnTo=/);
   const before=logins;await page.getByRole('button',{name:'Fill demo credentials',exact:true}).click();
   await expect(page.getByLabel('Password',{exact:true})).toHaveAttribute('type','password');assert.equal(logins,before);
   await page.getByRole('button',{name:'Sign in',exact:true}).click();await expect(page).toHaveURL(f.base+target);
   await expect(page.locator('[data-staff-shell]')).toBeVisible();
   if(target.includes('?lead=')){await expect(page.locator('.b-lead-drawer')).toBeVisible();await page.keyboard.press('Escape');}
   await page.getByRole('button',{name:'Account menu',exact:true}).click();await page.getByRole('button',{name:'Sign out',exact:true}).click();await expect(page).toHaveURL(f.base+'/admin/login');
  }
  await page.route('**/api/config',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({appUrl:f.base,databaseReady:false,demoEnabled:false,setupMessage:'Database is not configured.'})}));
  await page.goto(f.base+'/admin/login');await expect(page.locator('#login-setup')).toBeVisible();await expect(page.locator('#login-setup')).not.toContainText(/not configured/i);
  await expect(page.getByRole('button',{name:'Sign in',exact:true})).toBeDisabled();await expect(page.getByRole('button',{name:'Fill demo credentials',exact:true})).toHaveCount(0);
  console.log('PASS masked demo autofill, safe staff deep links, external redirect rejection, logout and setup state');
 }finally{await context.close();}
}
export async function checkStaffPages(f:UiFixture,screens:string){
 const {page,base,context}=f;await page.goto(base+'/admin');await expect(page.locator('[data-staff-shell]')).toBeVisible();const routes=[...new Set((await page.locator('.b-rail a,#b-workspaces a').evaluateAll(links=>links.map(link=>link.getAttribute('href')??''))).filter(route=>route.startsWith('/admin')).concat('/admin/profile'))];
 const failures:string[]=[];
 for(const [width,height]of [[1024,600],[768,900]]){
  await page.setViewportSize({width,height});
  for(const route of routes){
   console.log('OPEN '+route+' '+width);await page.goto(base+route);await expect(page.locator('[data-staff-shell]')).toBeVisible({timeout:15000});await expect(page.locator('#workspace-title')).toBeVisible();
   if(route==='/admin')await expect(page.locator('[data-pipeline]')).toBeVisible();
   const overflow=await page.evaluate("[document.documentElement,document.querySelector('.b-page'),document.querySelector('.b-main')].filter(Boolean).some(el=>el.scrollWidth>el.clientWidth+1)");if(overflow)failures.push(route+' overflows at '+width);
   await page.screenshot({path:path.join(screens,route.slice(1).replaceAll('/','-')+'-'+width+'x'+height+'.png'),fullPage:true});
   const copy=await page.locator('.b-main').innerText();const banned=copy.match(/.{0,35}(?:not configured|unavailable|simulated|requires configuration).{0,55}/gi);if(banned)failures.push(route+' contains outdated setup labels: '+JSON.stringify(banned));
   console.log('CHECK '+route+' '+width);
  }
 }
 assert.deepEqual(failures,[]);
 await page.setViewportSize({width:1440,height:900});await page.goto(base+'/admin/leads?view=list');await expect(page.locator('[data-bulk-form]')).toBeVisible();
 const box=page.locator('[data-bulk-lead]').first(),id=await box.getAttribute('value');assert(id);await box.check();await expect(page.locator('[data-bulk-count]')).toHaveText('1 selected');await page.locator('[data-bulk-form] select').selectOption('');await page.locator('[data-bulk-submit]').click();await expect(page.locator('[data-bulk-count]')).toHaveText('0 selected');assert.equal((await (await context.request.get(base+'/api/leads/'+id)).json()).lead.owner,null);
 await page.screenshot({path:path.join(screens,'leads-list-1440x900.png'),fullPage:true});
 await page.goto(base+'/admin/leads?view=board');await expect(page.locator('.lw-board')).toHaveCount(2);await expect(page.locator('[data-bulk-lead]').first()).toBeVisible();await page.screenshot({path:path.join(screens,'leads-board-1440x900.png'),fullPage:true});
 for(const route of ['/admin/leads?view=record&lead='+id,'/admin/integrations?view=yardi','/admin/properties?view=new','/admin/tasks?view=new','/admin/calendar?view=book','/admin/profile?edit=1']){await page.setViewportSize({width:768,height:900});console.log('OPEN '+route+' form');await page.goto(base+route);await expect(page.locator('[data-staff-shell]')).toBeVisible({timeout:15000});assert(await page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'));assert.doesNotMatch(await page.locator('.b-main').innerText(),/not configured|unavailable|simulated|requires configuration/i);await page.screenshot({path:path.join(screens,route.slice(7).replaceAll(/[?=&]/g,'-')+'-form-768.png'),fullPage:true});}
 const signedOut=await context.browser()!.newContext({viewport:{width:1024,height:600},reducedMotion:'reduce'});try{const auth=await signedOut.newPage();for(const route of ['/admin/login','/staff/access']){await auth.goto(base+route);await expect(auth.locator('h1')).toBeVisible();assert(await auth.evaluate('document.documentElement.scrollWidth<=innerWidth+1'));await auth.screenshot({path:path.join(screens,route.replaceAll('/','-')+'-1024x600.png'),fullPage:true});}}finally{await signedOut.close();}
 await checkStaffAuth(f,id);
 console.log('PASS all '+routes.length+' staff routes at 1024 and 768, bulk assignment, board/list, creation forms and staff auth');
}
