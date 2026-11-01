import 'dotenv/config';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import path from 'node:path';
import {Client} from 'pg';
import {createServer} from 'vite';
import {publicSeoPlugin} from './public-seo-plugin.js';
import {chromium,type Page,type BrowserContext} from '@playwright/test';
import {createApp} from '../server/app.js';
import {loadConfig,type ServerConfig} from '../server/config/env.js';
import {Database} from '../server/db/pool.js';
import {seedDemo} from '../server/services/demo-seed.js';
export interface UiFixture {page:Page;context:BrowserContext;base:string;database:Database;config:ServerConfig;organizationId:string;errors:string[]}
export async function withUiEnvironment(check:(fixture:UiFixture)=>Promise<void>){
 const root=path.resolve(import.meta.dirname,'..'),source=loadConfig(),url=new URL(source.databaseUrl),name='ootla_demo_bento_'+randomUUID().replaceAll('-','');
 assert(source.demoMode&&!source.production&&/^ootla_demo(?:_[a-z0-9_]+)?$/.test(source.databaseName??''));assert(url.hostname==='127.0.0.1'&&url.port==='55439'&&url.username==='ootla'&&!url.search&&!url.hash);
 const ownerUrl=new URL(url);ownerUrl.username='ootla_cluster_owner';ownerUrl.pathname='/postgres';url.pathname='/'+name;
 const owner=new Client({connectionString:ownerUrl.toString(),connectionTimeoutMillis:5000}),config={...source,nodeEnv:'test' as const,production:false,databaseUrl:url.toString(),databaseName:name,appUrl:'http://127.0.0.1:5177'},database=new Database(config);
 const normalize=(s:string)=>path.resolve(s).replaceAll('\\','/').toLowerCase();let owned=false,connected=false,api:ReturnType<ReturnType<typeof createApp>['listen']>|undefined,web:Awaited<ReturnType<typeof createServer>>|undefined,browser:Awaited<ReturnType<typeof chromium.launch>>|undefined;
 try{
  await owner.connect();connected=true;assert.equal(normalize((await owner.query('SHOW data_directory')).rows[0].data_directory),normalize(path.join(root,'.local/postgres/data')));
  const role=(await owner.query("SELECT rolsuper,rolcreatedb,rolcreaterole FROM pg_roles WHERE rolname='ootla'")).rows[0];assert(role&&!role.rolsuper&&!role.rolcreatedb&&!role.rolcreaterole);
  assert.equal((await owner.query('SELECT 1 FROM pg_database WHERE datname=$1',[name])).rowCount,0);const quoted=(await owner.query('SELECT quote_ident($1) AS name',[name])).rows[0].name;await owner.query('CREATE DATABASE '+quoted+' OWNER ootla');owned=true;
  await promisify(execFile)(process.execPath,[path.join(root,'node_modules/tsx/dist/cli.mjs'),path.join(root,'scripts/migrate.ts')],{cwd:root,windowsHide:true,timeout:60000,env:{...process.env,NODE_ENV:'test',DEMO_MODE:'true',DATABASE_URL:config.databaseUrl,APP_URL:config.appUrl}});
  const seeded=await seedDemo(database,config),app=createApp(config,database);
  api=await new Promise((resolve,reject)=>{const server=app.listen(0,'127.0.0.1',()=>resolve(server));server.once('error',reject);});const address=api!.address();assert(address&&typeof address!=='string');
  web=await createServer({configFile:false,plugins:[publicSeoPlugin({},root)],root:path.join(root,'client'),publicDir:path.join(root,'public'),server:{host:'127.0.0.1',port:0,proxy:{'/api':'http://127.0.0.1:'+address.port}},logLevel:'error'});await web.listen();const webAddress=web.httpServer!.address();assert(webAddress&&typeof webAddress!=='string');config.appUrl='http://127.0.0.1:'+webAddress.port;
  browser=await chromium.launch({channel:process.env.OOTLA_BROWSER_CHANNEL||'chrome',headless:true});const context=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce'}),page=await context.newPage(),errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(15000);
  await context.route('**/*',route=>{const u=new URL(route.request().url());if(/^https?:$/.test(u.protocol)&&u.origin!==config.appUrl){errors.push('External request: '+u.pathname);return route.abort();}return route.continue();});
  const login=await context.request.post(config.appUrl+'/api/auth/login',{headers:{Origin:config.appUrl},data:{email:config.demoAdminEmail,password:config.demoAdminPassword}});assert.equal(login.status(),200);
  await check({page,context,base:config.appUrl,database,config,organizationId:seeded.organizationId,errors});assert.deepEqual(errors,[]);
 }finally{
  await browser?.close();await web?.close();if(api){api.closeAllConnections();await new Promise<void>(resolve=>api!.close(()=>resolve()));}await database.close();
  if(owned&&connected){assert.equal(normalize((await owner.query('SHOW data_directory')).rows[0].data_directory),normalize(path.join(root,'.local/postgres/data')));assert(/^ootla_demo_bento_[a-f0-9]{32}$/.test(name));await owner.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1 AND pid<>pg_backend_pid()',[name]);const quoted=(await owner.query('SELECT quote_ident($1) AS name',[name])).rows[0].name;await owner.query('DROP DATABASE '+quoted);console.log('PASS removed only the owned Bento check database');}if(connected)await owner.end();
 }
}
