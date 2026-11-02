import 'dotenv/config';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { randomUUID, randomBytes, createHmac, createHash } from 'node:crypto';
import path from 'node:path';
import {readFile} from 'node:fs/promises';
import { promisify } from 'node:util';
import { Client } from 'pg';
import { createServer } from 'vite';
import { createApp } from '../server/app.js';
import { loadConfig } from '../server/config/env.js';
import { Database } from '../server/db/pool.js';
import { seedDemo } from '../server/services/demo-seed.js';
import { seedApplicantDemo, applicantDemoEmail, applicantDemoPassword, applicantDemoStaffEmail } from '../server/services/applicant-demo.js';

// Browser mutations are restricted to a unique owned database on Ootla's verified loopback cluster.
const root=path.resolve(import.meta.dirname,'..'),source=loadConfig(),sourceUrl=new URL(source.databaseUrl);
assert(source.demoMode&&!source.production&&/^ootla_demo(?:_[a-z0-9_]+)?$/.test(source.databaseName??''));
assert(sourceUrl.hostname==='127.0.0.1'&&sourceUrl.port==='55439'&&sourceUrl.username==='ootla'&&!sourceUrl.search&&!sourceUrl.hash);
const name='ootla_demo_applicant_browser_'+randomUUID().replaceAll('-','');
assert(name.length<=63);
const scratchUrl=new URL(sourceUrl);scratchUrl.pathname='/'+name;
const ownerUrl=new URL(sourceUrl);ownerUrl.username='ootla_cluster_owner';ownerUrl.pathname='/postgres';
const owner=new Client({connectionString:ownerUrl.toString(),connectionTimeoutMillis:5000});
const config={...source,nodeEnv:'test' as const,production:false,databaseUrl:scratchUrl.toString(),databaseName:name,appUrl:'http://127.0.0.1:5198'};
const database=new Database(config),normalize=(value:string)=>path.resolve(value).replaceAll('\\','/').toLowerCase();
let owned=false,connected=false,api:ReturnType<ReturnType<typeof createApp>['listen']>|undefined,web:Awaited<ReturnType<typeof createServer>>|undefined;
try{
 assert.equal(createHash('sha256').update((await readFile(path.join(root,'migrations/013_applicant_portal.sql'),'utf8')).replaceAll('\r\n','\n')).digest('hex'),'7233fdcc29a4a80edc19e437235dad0feb5f5d48cc1a4f5aad5c6ad06cba10a6');
 await owner.connect();connected=true;
 assert.equal(normalize((await owner.query('SHOW data_directory')).rows[0].data_directory),normalize(path.join(root,'.local/postgres/data')));
 const role=(await owner.query('SELECT rolsuper,rolcreatedb,rolcreaterole FROM pg_roles WHERE rolname=$1',['ootla'])).rows[0];
 assert(role&&!role.rolsuper&&!role.rolcreatedb&&!role.rolcreaterole);
 assert.equal((await owner.query('SELECT 1 FROM pg_database WHERE datname=$1',[name])).rowCount,0);
 await owner.query('CREATE DATABASE '+(await owner.query('SELECT quote_ident($1) AS name',[name])).rows[0].name+' OWNER ootla');owned=true;
 assert.equal((await database.query('SELECT current_database() AS name')).rows[0].name,name);
 await promisify(execFile)(process.execPath,[path.join(root,'node_modules/tsx/dist/cli.mjs'),path.join(root,'scripts/migrate.ts')],{cwd:root,windowsHide:true,timeout:90000,env:{...process.env,NODE_ENV:'test',DEMO_MODE:'true',DATABASE_URL:config.databaseUrl,APP_URL:config.appUrl}});
 await seedDemo(database,config);
 const demo=await seedApplicantDemo(database,config);
 const property=(await database.query<{property_id:string;unit_id:string}>('SELECT property_id,unit_id FROM applications WHERE id=$1 AND organization_id=$2',[demo.applicationId,demo.organizationId])).rows[0]!;
 const primary=(await database.query<{id:string}>("SELECT id FROM application_participants WHERE application_id=$1 AND organization_id=$2 AND role='primary'",[demo.applicationId,demo.organizationId])).rows[0]!;
 const extraLead=(await database.query<{id:string}>("INSERT INTO leads(organization_id,property_id,unit_id,display_name,email,status,intent,pipeline_stage,source,next_action) VALUES($1,$2,$3,'Browser Invited Applicant','browser.invited@demo.ootla.test','qualified','leasing','application_started','manual','Complete the synthetic browser application') RETURNING id",[demo.organizationId,property.property_id,property.unit_id])).rows[0]!;
 const expiredToken=randomBytes(32).toString('hex'),digest=createHmac('sha256',config.sessionSecret).update('ootla-applicant:invitation:'+expiredToken).digest('hex');
 await database.query("INSERT INTO application_invitations(organization_id,application_id,participant_id,token_digest,invited_email,created_by_user_id,created_at,expires_at) VALUES($1,$2,$3,$4,$5,$6,now()-interval '2 hours',now()-interval '1 hour')",[demo.organizationId,demo.applicationId,primary.id,digest,applicantDemoEmail,demo.staffUserId]);
 const app=createApp(config,database);
 api=await new Promise((resolve,reject)=>{const listener=app.listen(0,'127.0.0.1',()=>resolve(listener));listener.once('error',reject);});
 assert(api);const apiAddress=api.address();assert(apiAddress&&typeof apiAddress!=='string');
 web=await createServer({configFile:false,root:path.join(root,'client'),publicDir:path.join(root,'public'),envDir:root,server:{host:'127.0.0.1',port:0,strictPort:true,proxy:{'/api':{target:'http://127.0.0.1:'+apiAddress.port,changeOrigin:false}}},logLevel:'error'});
 await web.listen();const address=web.httpServer?.address();assert(address&&typeof address!=='string');
 config.appUrl='http://127.0.0.1:'+address.port;
 assert(![3100,5173,7673].includes(address.port));
 const health=await fetch(config.appUrl+'/api/health');assert.equal(health.status,200);assert.equal((await health.json()as{database:string}).database,'ready');
 console.log('Created owned isolated applicant browser environment; retained demo is untouched.');
 const result=await promisify(execFile)(process.execPath,[path.join(root,'scripts/check-applicant-browser.mjs')],{cwd:root,windowsHide:true,timeout:420000,maxBuffer:1024*1024,env:{...process.env,OOTLA_CHECK_URL:config.appUrl,OOTLA_CHECK_DATABASE:name,OOTLA_APPLICANT_CONTEXT:JSON.stringify({applicationId:demo.applicationId,extraLeadId:extraLead.id,expiredToken,applicantEmail:applicantDemoEmail,applicantPassword:applicantDemoPassword,staffEmail:applicantDemoStaffEmail,staffPassword:config.demoAdminPassword})}});
 process.stdout.write(result.stdout);if(result.stderr)process.stderr.write(result.stderr);
 assert.equal(Number((await database.query('SELECT count(*) AS total FROM application_documents WHERE organization_id=$1',[demo.organizationId])).rows[0].total),2);
 assert.equal((await database.query("SELECT status FROM applications WHERE id=$1 AND organization_id=$2",[demo.applicationId,demo.organizationId])).rows[0].status,'submitted');
 console.log('Verified private uploaded records and submitted application in the owned scratch database.');
}catch(issue){const child=issue as{stdout?:string;stderr?:string;message?:string};if(child.stdout)process.stdout.write(child.stdout);if(child.stderr)process.stderr.write(child.stderr);console.error('Isolated applicant browser check failed; configured credentials, tokens and raw database details are omitted.');process.exitCode=1;}
finally{
 if(web)await web.close();
 if(api){api.closeAllConnections();await new Promise<void>(resolve=>api!.close(()=>resolve()));}
 await database.close();
 if(owned&&connected){
  assert.equal(normalize((await owner.query('SHOW data_directory')).rows[0].data_directory),normalize(path.join(root,'.local/postgres/data')));
  assert(/^ootla_demo_applicant_browser_[a-f0-9]{32}$/.test(name));
  await owner.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1 AND pid<>pg_backend_pid()',[name]);
  await owner.query('DROP DATABASE '+(await owner.query('SELECT quote_ident($1) AS name',[name])).rows[0].name);
  console.log('Removed only the owned applicant browser database and stopped its temporary servers.');
 }
 if(connected)await owner.end();
}
