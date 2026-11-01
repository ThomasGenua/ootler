import assert from 'node:assert/strict';
import {readFile,writeFile,mkdtemp,mkdir,rm,rmdir} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {pathToFileURL} from 'node:url';
import {randomBytes} from 'node:crypto';
import {chromium,expect} from '@playwright/test';
import express from 'express';
import http from 'node:http';

// Public SEO/raw HTML and routing checks; no seeds, resets, provider calls or CRM mutations.
// Build first. The temporary production-style app has no database connection or workers.
const root=process.cwd(),base=process.env.OOTLA_CHECK_URL||'http://127.0.0.1:7673';
const load=file=>import(pathToFileURL(path.join(root,'dist/server',file)).href);
const site=await load('shared/public-site.js'),{createApp}=await load('server/app.js'),{loadConfig}=await load('server/config/env.js'),{Database}=await load('server/db/pool.js'),{runtimePublicSiteSettings,installPublicSiteHttp}=await load('server/http/public-site.js');
const directory=path.join(root,'dist/client'),fixture=await mkdtemp(path.join(os.tmpdir(),'ootla-public-seo-'));
const config=loadConfig({NODE_ENV:'production',APP_URL:'https://compiled-preview.invalid',SESSION_SECRET:randomBytes(32).toString('hex'),DATABASE_URL:'',DEMO_MODE:'false',INTEGRATIONS_MODE:'simulation',OUTBOUND_MODE:'simulation'});
const database=new Database(config),server=createApp(config,database).listen(0,'127.0.0.1');
await new Promise((resolve,reject)=>{server.once('listening',resolve);server.once('error',reject);});
const origin='http://127.0.0.1:'+server.address().port;
let browser,fixtureServer;
const get=(url,options={})=>fetch(url,{redirect:'manual',...options});
const getWithHost=(url,host)=>new Promise((resolve,reject)=>{const request=http.get(url,{headers:{Host:host}},response=>{const chunks=[];response.on('data',chunk=>chunks.push(chunk));response.on('end',()=>{const headers=new Headers();for(const[key,value]of Object.entries(response.headers))if(value!==undefined)headers.set(key,Array.isArray(value)?value.join(', '):value);resolve(new Response(Buffer.concat(chunks),{status:response.statusCode,headers}));});});request.on('error',reject);});
function count(value,pattern){return [...value.matchAll(pattern)].length;}
const declared={origin:'https://marketing.example.test',indexing:true};
try {
 assert.deepEqual(site.readPublicSiteSettings({}),{origin:null,indexing:false});
 for(const env of [{PUBLIC_SITE_INDEXING:'true'},{PUBLIC_SITE_URL:'http://example.test'},{PUBLIC_SITE_URL:'https://example.test/private'},{PUBLIC_SITE_URL:'https://a:b@example.test'},{PUBLIC_SITE_INDEXING:'yes'}])assert.throws(()=>site.readPublicSiteSettings(env));
 assert.deepEqual(site.readPublicSiteSettings({PUBLIC_SITE_URL:declared.origin,PUBLIC_SITE_INDEXING:'true'}),declared);
 assert.equal(new Set(Object.values(site.publicPages).map(p=>p.title)).size,8);
 assert.equal(new Set(Object.values(site.publicPages).map(p=>p.description)).size,8);
 const template=await readFile(path.join(directory,'index.html'),'utf8');
 for(const route of site.publicPagePaths){
  const html=site.renderPublicDocument(template,route,declared,'<main><h1>Test public page</h1></main>');
  assert.equal(count(html,/<link[^>]+rel="canonical"/g),1);
  assert(html.includes('href="'+declared.origin+route+'"'));
  assert(html.includes('content="index, follow, max-image-preview:large"'));
  const json=html.match(/<script data-ootla-seo type="application\/ld\+json">([\s\S]*?)<\/script>/)?.[1];assert(json);const data=JSON.parse(json);assert.equal(data['@graph'][0].name,'Ootla');
  assert(!json.includes('aggregateRating')&&!json.includes('"offers"')&&!json.includes('Elise')&&!json.includes('DashQ'));
 }
 const privateHtml=site.renderPublicDocument(template,'/applicant',declared,'');assert(!privateHtml.includes('application/ld+json'));assert(!privateHtml.includes('rel="canonical"'));assert(!privateHtml.includes('<h1'));assert(privateHtml.includes('noindex, nofollow'));
 const sitemap=site.sitemapXml(declared);assert.equal(count(sitemap,/<loc>/g),8);assert(!/\/(?:admin|applicant|book|api)/.test(sitemap));assert(!site.sitemapXml({origin:null,indexing:false}).includes('<loc>'));
 assert(site.robotsText(declared).includes('Sitemap: '+declared.origin+'/sitemap.xml'));
 await writeFile(path.join(fixture,'public-site-manifest.json'),JSON.stringify({version:1,...declared}));
 const publicConfig={...config,appUrl:declared.origin};assert.equal(runtimePublicSiteSettings(publicConfig,fixture).indexing,true);
 for(const c of [{...publicConfig,production:false},{...publicConfig,demoMode:true},{...publicConfig,appUrl:'https://preview.example.test'}])assert.equal(runtimePublicSiteSettings(c,fixture).indexing,false);
 const fixtureApp=express();installPublicSiteHttp(fixtureApp,publicConfig,fixture);fixtureServer=fixtureApp.listen(0,'127.0.0.1');await new Promise(r=>fixtureServer.once('listening',r));
 const fixtureOrigin='http://127.0.0.1:'+fixtureServer.address().port;
 let response=await getWithHost(fixtureOrigin+'/sitemap.xml','marketing.example.test');assert.equal(count(await response.text(),/<loc>/g),8);
 response=await getWithHost(fixtureOrigin+'/sitemap.xml','preview.example.test');assert.equal(count(await response.text(),/<loc>/g),0);assert.match(response.headers.get('x-robots-tag'),/noindex/);
 console.log('PASS 1: explicit HTTPS/indexing validation, unique metadata, configured canonicals/factual schema, public sitemap and runtime/host/preview gates.');

 for(const route of site.publicPagePaths){
  const response=await get(origin+route),html=await response.text();assert.equal(response.status,200,route);assert.equal(count(html,/<h1\b/g),1,route);assert.equal(count(html,/<title\b/g),1,route);
  assert(html.includes('class="public-body"'));assert.match(response.headers.get('x-robots-tag'),/noindex/);assert.equal(count(html,/<script data-ootla-seo type="application\/ld\+json">/g),1);
  assert(html.includes('<footer'));assert(!html.includes('Skip to content'));assert(html.includes('name="description"'));assert(!html.includes('OotlaDemo!2026'));assert(!html.includes('name="keywords"'));
 }
 for(const route of ['/admin/login','/applicant/login','/applicant/invite','/book']){
  const response=await get(origin+route),html=await response.text();assert.equal(response.status,200);assert.match(response.headers.get('x-robots-tag'),/noindex/);assert(!html.includes('<h1'));assert(!html.includes('application/ld+json'));assert(!html.includes('rel="canonical"'));
 }
 for(const route of ['/admin','/admin/profile','/admin/applications','/applicant']){const r=await get(origin+route);assert.equal(r.status,302);assert.match(r.headers.get('x-robots-tag'),/noindex/);}
 for(const [route,to]of[['/index.html','/'],['/platform/','/platform'],['/platform/index.html','/platform'],['/workflows/leasing/index.html','/workflows/leasing']]){const r=await get(origin+route);assert.equal(r.status,308);assert.equal(r.headers.get('location'),to);}
 for(const route of ['/not-a-page','/not-a-page.html','/app-shell.html'])assert.equal((await get(origin+route)).status,404);
 assert.equal((await get(origin+'/api/auth/me')).status,401);response=await get(origin+'/api/not-a-route');assert.equal(response.status,404);assert.match(response.headers.get('content-type'),/json/);assert.match(response.headers.get('x-robots-tag'),/noindex/);
 assert(!await (await get(origin+'/sitemap.xml')).text().then(t=>t.includes('<loc>')));
 console.log('PASS 2: built raw HTML for all eight routes, blank private shell, preserved auth redirects/401, real404s, aliases and private API/noindex.');
 browser=await chromium.launch({channel:process.env.OOTLA_BROWSER_CHANNEL||'chrome',headless:true});
 const noJs=await browser.newContext({javaScriptEnabled:false,viewport:{width:1280,height:900},reducedMotion:'reduce'}),staticPage=await noJs.newPage();
 for(const route of site.publicPagePaths){await staticPage.goto(origin+route);await expect(staticPage.locator('main h1')).toHaveCount(1);await expect(staticPage.locator('main h1')).toBeVisible();assert(await staticPage.locator('body').evaluate(e=>e.classList.contains('public-body')));}
 const compiledContext=await browser.newContext({reducedMotion:'reduce'}),compiledPage=await compiledContext.newPage(),compiledErrors=[];
 compiledPage.on('pageerror',error=>compiledErrors.push(error.message));compiledPage.on('console',message=>{if(message.type()==='error')compiledErrors.push(message.text());});
 await compiledPage.goto(origin+'/platform');await expect(compiledPage).toHaveTitle(site.publicPages['/platform'].title);await expect(compiledPage.locator('head script[type="application/ld+json"]')).toHaveCount(1);await compiledPage.locator('#public-navigation a[href="/ai-workflows"]').click();await expect(compiledPage).toHaveTitle(site.publicPages['/ai-workflows'].title);await compiledPage.locator('[data-demo-next]').click();assert.deepEqual(compiledErrors,[]);await compiledContext.close();
 const context=await browser.newContext({viewport:{width:1586,height:1000},reducedMotion:'reduce'}),page=await context.newPage(),errors=[],external=[],publicApi=[];let publicPhase=true;
 page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{const u=new URL(r.url());if(u.origin!==new URL(base).origin&&/^https?:$/.test(u.protocol))external.push(u.href);if(publicPhase&&u.pathname.startsWith('/api/'))publicApi.push(u.pathname);});
 await mkdir('.local/screenshots',{recursive:true});
 for(const width of[320,390,768,1280,1586]){
  await page.setViewportSize({width,height:1000});await page.goto(base+'/');await expect(page.locator('h1')).toHaveCount(1);await expect(page.getByText('Skip to content',{exact:true})).toHaveCount(0);await page.evaluate(()=>document.fonts.ready);
  for(const media of await page.locator('.home-story-media').all()){
   const image=media.locator('.public-photo'),product=media.locator('.product-example');await image.scrollIntoViewIfNeeded();
   const photo=await image.boundingBox(),card=await product.boundingBox();assert(photo.width<card.width*.65);assert(photo.width*photo.height<card.width*card.height);assert(photo.x>card.x+photo.width*.4);assert(photo.x+photo.width>card.x+card.width+card.width*.05);assert(photo.y<card.y&&photo.y+photo.height>card.y);
   const caption=image.locator('figcaption'),credit=caption.locator('a');await page.mouse.move(0,0);await expect(caption).toBeHidden();await image.hover();await expect(caption).toBeVisible();await page.keyboard.press('Escape');await expect(caption).toBeHidden();await page.mouse.move(0,0);await image.focus();await expect(caption).toBeVisible();await credit.scrollIntoViewIfNeeded();assert(await credit.evaluate(e=>[...e.getClientRects()].every(r=>e.contains(document.elementFromPoint(r.left+r.width/2,r.top+r.height/2)))));await page.keyboard.press('Tab');await expect(credit).toBeFocused();await page.keyboard.press('Escape');await expect(image).toBeFocused();await expect(caption).toBeHidden();await image.evaluate(e=>e.blur());await page.mouse.move(0,0);
  }
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  if(width===390||width===1586)for(const key of['resident','viewings'])await page.locator('[data-home-process-section="'+key+'"]').screenshot({path:'.local/screenshots/seo-'+key+'-'+width+'.png'});
 }
 await page.setViewportSize({width:1586,height:1000});await page.goto(base+'/');await expect(page).toHaveTitle(site.publicPages['/'].title);await expect(page.locator('head meta[name="description"]')).toHaveAttribute('content',site.publicPages['/'].description);
 await page.locator('#public-navigation a[href="/platform"]').click();await expect(page).toHaveURL(base+'/platform');await expect(page).toHaveTitle(site.publicPages['/platform'].title);await expect(page.locator('head script[type="application/ld+json"]')).toHaveCount(1);await expect(page.locator('head meta[name="robots"]')).toHaveAttribute('content',/noindex/);
 await page.goBack();await expect(page).toHaveTitle(site.publicPages['/'].title);
 assert.deepEqual(publicApi,[]);
 publicPhase=false;await page.locator('#public-navigation a.public-sign-in').click();await expect(page).toHaveURL(base+'/admin/login');await expect(page.locator('head script[type="application/ld+json"]')).toHaveCount(0);await expect(page.locator('head link[rel="canonical"]')).toHaveCount(0);await expect(page.locator('head meta[name="robots"]')).toHaveAttribute('content','noindex, nofollow');await expect(page).toHaveTitle(/Staff sign in/);
 await page.getByRole('button',{name:'Fill demo credentials',exact:true}).click();await expect(page.locator('#login-password')).toHaveAttribute('type','password');await page.locator('#login-submit').click();await expect(page).toHaveURL(base+'/admin');await expect(page.locator('[data-staff-shell]')).toBeVisible();
 await expect(page.locator('[data-shell=command]')).toBeVisible();await expect(page.locator('#b-ask')).toBeVisible();
 await page.locator('[data-shell="account"]').click();await expect(page.locator('#b-account>strong')).toHaveText('Demo Administrator');await page.locator('#b-account [data-action="logout"]').click();await expect(page).toHaveURL(base+'/admin/login');
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
 for(const route of ['/not-a-real-page','/not-a-real-page.html'])assert.equal((await get(base+route)).status,404);
 console.log('PASS 3: no-JavaScript/production-CSP public rendering, diagonal smaller-photo hierarchy at five widths, hover/focus/Escape credits and removed global skip anchor, SPA metadata/back navigation, no public API calls and preserved normal demo login/header/logout.');
 await browser.close();browser=undefined;
 console.log('Public SEO checks passed. No customer records, database schema or external services changed.');
}finally{
 await browser?.close();await new Promise(r=>server.close(r));if(fixtureServer)await new Promise(r=>fixtureServer.close(r));await database.close();
 await rm(path.join(fixture,'public-site-manifest.json'),{force:true});await rmdir(fixture);
}
