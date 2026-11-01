import 'dotenv/config';
import assert from 'node:assert/strict';
import path from 'node:path';
import {createServer} from 'vite';
import {chromium,expect} from '@playwright/test';

// No CRM records are changed. Authentication creates/revokes only the check's sessions.
const base=new URL(process.env.APP_URL);
assert(base.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(base.hostname));
const root=path.resolve(import.meta.dirname,'..');
const response=await fetch(base.origin+'/api/config');assert.equal(response.status,200);
const config=await response.json();assert.equal(config.appUrl,base.origin);assert(config.databaseReady);
let web,browser,context,page,signedIn=false;
const faults=[];let loginPosts=0;
try {
 web=await createServer({configFile:false,root:path.join(root,'client'),publicDir:path.join(root,'public'),envDir:root,server:{host:'127.0.0.1',port:0,strictPort:true,hmr:false,proxy:{'/api':{target:'http://127.0.0.1:'+(process.env.PORT||'3100'),changeOrigin:false}}},logLevel:'error'});
 await web.listen();const address=web.httpServer.address();assert(address&&typeof address!=='string');
 const alternate='http://127.0.0.1:'+address.port;assert.notEqual(alternate,base.origin);
 browser=await chromium.launch({headless:true,channel:process.env.OOTLA_BROWSER_CHANNEL||'chrome'});
 context=await browser.newContext();page=await context.newPage();page.setDefaultTimeout(15000);
 page.on('pageerror',e=>faults.push(e.message));
 page.on('request',r=>{if(r.method()==='POST'&&new URL(r.url()).pathname==='/api/auth/login')loginPosts++;});
 const returnTo='/admin/imports?view=new';
 const canonical=new URL('/admin/login',base.origin);canonical.searchParams.set('returnTo',returnTo);
 await page.goto(alternate+'/admin/login?returnTo='+encodeURIComponent(returnTo));
 const link=page.locator('#canonical-login-link');await expect(link).toBeVisible();
 await expect(link).toHaveAttribute('href',canonical.href);
 await expect(page.getByLabel('Email address',{exact:true})).toBeDisabled();
 await expect(page.getByLabel('Password',{exact:true})).toBeDisabled();
 await expect(page.getByRole('button',{name:/Sign in/})).toBeDisabled();
 await expect(page.locator('#demo-credentials-slot button')).toHaveCount(0);
 await page.locator('#login-form').evaluate(form=>form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
 assert.equal(loginPosts,0);
 console.log('PASS alternate port blocks credentials/submission and preserves the safe canonical return route.');
 if(base.hostname==='127.0.0.1'){
  const alias=new URL('/admin/login',base);alias.hostname='localhost';
  await page.goto(alias.href);await expect(link).toBeVisible();await expect(link).toHaveAttribute('href',base.origin+'/admin/login?returnTo=%2Fadmin');
  console.log('PASS localhost alias directs to the configured 127.0.0.1 login.');
 }
 await page.goto(alternate+'/admin/login?returnTo='+encodeURIComponent('https://foreign.example/account'));
 await expect(link).toHaveAttribute('href',base.origin+'/admin/login?returnTo=%2Fadmin');
 await link.click();await expect(page).toHaveURL(base.origin+'/admin/login?returnTo=%2Fadmin');
 console.log('PASS canonical link uses a full navigation and rejects an external return destination.');
 for(const [origin,site,expected]of [[base.origin,'same-origin',400],[alternate,'same-origin',403],['https://foreign.example','cross-site',403],[undefined,undefined,403],[base.origin,'cross-site',403]]){
  const r=await fetch(base.origin+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json',...(origin?{Origin:origin}:{}),...(site?{'Sec-Fetch-Site':site}:{})},body:'{}'});
  assert.equal(r.status,expected);if(expected===403)assert.equal((await r.json()).code,'ORIGIN_DENIED');
 }
 console.log('PASS server still rejects wrong/missing/cross-site origins.');
 for(const [credentials,button,route]of [[config.demoCredentials,'Fill demo credentials','/admin'],[config.standaloneDemoCredentials,'Fill standalone demo credentials','/admin/imports']]){
  assert(credentials,'Prepare both isolated demo accounts before this check.');
  await page.goto(base.origin+'/admin/login?returnTo='+encodeURIComponent(route));
  const before=loginPosts;
  await page.getByRole('button',{name:button,exact:true}).click();
  await expect(page.getByLabel('Password',{exact:true})).toHaveAttribute('type','password');assert.equal(loginPosts,before);
  await page.getByRole('button',{name:/Sign in/}).click();signedIn=true;
  await expect(page).toHaveURL(base.origin+route);await expect(page.locator('[data-staff-shell]')).toBeVisible();
  const me=await page.request.get(base.origin+'/api/auth/me');assert.equal(me.status(),200);assert.equal((await me.json()).user.email,credentials.email);
  const logout=await page.request.post(base.origin+'/api/auth/logout',{headers:{Origin:base.origin}});assert.equal(logout.status(),204);signedIn=false;
 }
 assert.deepEqual(faults,[]);
 console.log('PASS both demo accounts sign in normally at the canonical URL, load their protected pages and log out.');
} finally {
 if(signedIn&&page)await page.request.post(base.origin+'/api/auth/logout',{headers:{Origin:base.origin}}).catch(()=>{});
 await context?.close();await browser?.close();await web?.close();
}
