import 'dotenv/config';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { Client } from 'pg';
import { createApp } from '../server/app.js';
import { loadConfig, type ServerConfig } from '../server/config/env.js';
import { Database } from '../server/db/pool.js';
import { hashPassword } from '../server/services/passwords.js';
import type { ApplicantUser, IssuedApplicationInvitation, PortalApplication, StaffApplicationWorkspace } from '../shared/applicant-contracts.js';


// Every mutation is confined to a newly created, uniquely owned scratch database.
// Retained demo/customer records are never migrated, seeded, reset or changed.
const root=path.resolve(import.meta.dirname,'..');
const source=loadConfig(), sourceUrl=new URL(source.databaseUrl);
assert(source.demoMode&&!source.production&&/^ootla_demo(?:_[a-z0-9_]+)?$/.test(source.databaseName??''),'Use the documented isolated non-production Ootla demo configuration.');
assert(sourceUrl.hostname==='127.0.0.1'&&sourceUrl.port==='55439'&&sourceUrl.username==='ootla'&&!sourceUrl.search&&!sourceUrl.hash,'Use only the project-owned local cluster and restricted application role.');
const scratchName='ootla_demo_journey_'+randomUUID().replaceAll('-','');
const scratchUrl=new URL(sourceUrl);scratchUrl.pathname='/'+scratchName;
const config:ServerConfig={...source,nodeEnv:'test',production:false,demoMode:true,appUrl:'http://ootla.test',databaseUrl:scratchUrl.toString(),databaseName:scratchName};
const ownerUrl=new URL(sourceUrl);ownerUrl.username='ootla_cluster_owner';ownerUrl.pathname='/postgres';
const owner=new Client({connectionString:ownerUrl.toString(),connectionTimeoutMillis:5000});
const database=new Database(config);
const orgs=[randomUUID(),randomUUID()],properties=[randomUUID(),randomUUID(),randomUUID()];
const roles=['organization_admin','leasing_agent','read_only_analyst','organization_admin','property_manager'] as const;
const users=roles.map(()=>randomUUID()),memberships=roles.map(()=>randomUUID()),emails=users.map(id=>'staff-'+id+'@example.test');
const leadIds=[randomUUID(),randomUUID(),randomUUID()],contacts:string[]=[];
const applicantEmails=leadIds.map(id=>'applicant-'+id+'@example.test');
const password='Journey-'+randomUUID()+'!',applicantPassword='Applicant-'+randomUUID()+'!';
const coContact=randomUUID(),coEmail='co-'+randomUUID()+'@example.test';
let ownerConnected=false,ownsScratch=false,groups=0,phase='safe scratch setup';
const servers:Array<()=>Promise<void>>=[];
const pass=(label:string)=>{groups++;console.log('PASS '+label);};
const normalize=(value:string)=>path.resolve(value).replaceAll('\\','/').toLowerCase();
async function verifiedCluster(){const row=(await owner.query<{data_directory:string}>('SHOW data_directory')).rows[0];assert.equal(normalize(row?.data_directory??''),normalize(path.join(root,'.local/postgres/data')),'Refusing any operation outside the Ootla-owned PostgreSQL data directory.');}
async function createScratch(){
 await owner.connect();ownerConnected=true;await verifiedCluster();assert(/^ootla_demo_journey_[a-f0-9]{32}$/.test(scratchName));
 assert.equal((await owner.query('SELECT 1 FROM pg_database WHERE datname=$1',[scratchName])).rowCount,0);
 const role=(await owner.query<{rolsuper:boolean;rolcreatedb:boolean;rolcreaterole:boolean}>('SELECT rolsuper,rolcreatedb,rolcreaterole FROM pg_roles WHERE rolname=$1',['ootla'])).rows[0];
 assert(role&&!role.rolsuper&&!role.rolcreatedb&&!role.rolcreaterole);
 const quoted=(await owner.query<{name:string}>('SELECT quote_ident($1) AS name',[scratchName])).rows[0]!.name;
 await owner.query('CREATE DATABASE '+quoted+' OWNER ootla');ownsScratch=true;
 assert.equal((await database.query<{name:string}>('SELECT current_database() AS name')).rows[0]?.name,scratchName);
}
type Snapshot=Record<string,{columns:string[];count:number;hash:string}>;
async function snapshot(previous?:Snapshot):Promise<Snapshot>{
 const tables=previous?Object.keys(previous):(await database.query<{tablename:string}>("SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename<>'schema_migrations' ORDER BY tablename")).rows.map(r=>r.tablename),result:Snapshot={};
 for(const table of tables){
  const columns=previous?.[table]?.columns??(await database.query<{column_name:string}>("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position",[table])).rows.map(r=>r.column_name);
  assert(/^[a-z_][a-z0-9_]*$/.test(table)&&columns.length&&columns.every(c=>/^[a-z_][a-z0-9_]*$/.test(c)));
  const rows=(await database.query('SELECT '+columns.map(c=>'"'+c+'"').join(',')+' FROM "'+table+'"')).rows.map(r=>JSON.stringify(r)).sort();
  result[table]={columns,count:rows.length,hash:createHash('sha256').update(JSON.stringify(rows)).digest('hex')};
 }return result;
}
async function baseline(){
 await database.query('CREATE TABLE schema_migrations(name text PRIMARY KEY,checksum char(64) NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())');
 const files=(await readdir(path.join(root,'migrations'))).filter(name=>/^(00[1-9]|01[0-3])_[a-z0-9_]+\.sql$/.test(name)).sort();assert.equal(files.length,13);
 for(const name of files){const sql=await readFile(path.join(root,'migrations',name),'utf8');await database.transaction(async c=>{await c.query(sql.replace(/^\uFEFF/,''));await c.query('INSERT INTO schema_migrations(name,checksum) VALUES($1,$2)',[name,createHash('sha256').update(sql).digest('hex')]);});}
 const hash=await hashPassword(password);
 await database.transaction(async c=>{
  for(const [i,id] of orgs.entries()){await c.query("INSERT INTO organizations(id,name,slug,environment) VALUES($1,$2,$3,'demo')",[id,'Journey isolated '+i,'applicant-'+randomUUID()]);await c.query("INSERT INTO organization_data_settings(organization_id,mode) VALUES($1,'standalone')",[id]);}
  for(const [i,id] of users.entries()){await c.query('INSERT INTO users(id,email,display_name,password_hash) VALUES($1,$2,$3,$4)',[id,emails[i],'Journey '+roles[i],hash]);await c.query('INSERT INTO organization_memberships(id,organization_id,user_id,role) VALUES($1,$2,$3,$4)',[memberships[i],orgs[i===3?1:0],id,roles[i]]);}
  for(const [i,id] of properties.entries())await c.query("INSERT INTO properties(id,organization_id,name,address,city) VALUES($1,$2,$3,'1 Private Way','Lagos')",[id,orgs[i===2?1:0],'Journey property '+i]);
  for(const i of [1,2,4])await c.query('INSERT INTO property_access_assignments(organization_id,membership_id,property_id) VALUES($1,$2,$3)',[orgs[0],memberships[i],properties[0]]);
  for(const [i,id] of leadIds.entries()){
   const row=(await c.query("INSERT INTO leads(id,organization_id,property_id,display_name,email,status,intent,pipeline_stage,notes) VALUES($1,$2,$3,$4,$5,'contacted','leasing','application_started','Existing staff-only private note') RETURNING contact_id",[id,orgs[i===2?1:0],properties[i===2?2:0],'Journey person '+i,applicantEmails[i]])).rows[0];contacts.push(row.contact_id);
  }
  await c.query('INSERT INTO contact_property_links(organization_id,contact_id,property_id) VALUES($1,$2,$3)',[orgs[0],contacts[1],properties[1]]);
  await c.query('INSERT INTO lead_property_interests(organization_id,lead_id,contact_id,property_id) VALUES($1,$2,$3,$4)',[orgs[0],leadIds[1],contacts[1],properties[1]]);
  await c.query("INSERT INTO contacts(id,organization_id,display_name,email,source_system) VALUES($1,$2,'Independent co-applicant',$3,'local')",[coContact,orgs[0],coEmail]);
  await c.query('INSERT INTO contact_property_links(organization_id,contact_id,property_id) VALUES($1,$2,$3)',[orgs[0],coContact,properties[0]]);
  await c.query("INSERT INTO applications(organization_id,contact_id,property_id,lead_id,status) VALUES($1,$2,$3,$4,'draft')",[orgs[0],contacts[0],properties[0],leadIds[0]]);
 });
}
async function migrate(){
 try{await promisify(execFile)(process.execPath,[path.join(root,'node_modules/tsx/dist/cli.mjs'),path.join(root,'scripts/migrate.ts')],{cwd:root,windowsHide:true,timeout:30000,env:{...process.env,NODE_ENV:'test',DEMO_MODE:'false',DATABASE_URL:config.databaseUrl,APP_URL:config.appUrl}});}
 catch{assert.fail('Scoped scratch migration failed; raw credentials/process configuration are omitted.');}
}
async function start(localConfig:ServerConfig=config){
 const db=new Database(localConfig),app=createApp(localConfig,db);
 const server=await new Promise<ReturnType<typeof app.listen>>((resolve,reject)=>{const listener=app.listen(0,'127.0.0.1',()=>resolve(listener));listener.once('error',reject);});
 let closed=false;const close=async()=>{if(closed)return;closed=true;server.closeIdleConnections();await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));await db.close();};servers.push(close);
 const base='http://127.0.0.1:'+(server.address() as AddressInfo).port;
 const request=(route:string,cookie='',method='GET',body?:unknown,headers:Record<string,string>={})=>fetch(base+route,{method,redirect:'manual',headers:{...(cookie?{Cookie:cookie}:{}),...(method==='GET'?{}:{Origin:localConfig.appUrl}),...(body===undefined?{}:{'Content-Type':'application/json'}),...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});
 return {base,request,close,login:async(index:number)=>{const response=await request('/api/auth/login','','POST',{email:emails[index],password});assert.equal(response.status,200);return cookieOf(response,'ootla.sid');}};
}
type Api=Awaited<ReturnType<typeof start>>;
function cookieOf(response:Response,name:string){const set=response.headers.get('set-cookie')??'';assert(set.startsWith(name+'='),'Expected the correct isolated HttpOnly session cookie.');assert(/HttpOnly/i.test(set)&&/SameSite=Lax/i.test(set)&&/Path=\//i.test(set));return set.split(';')[0]!;}
async function json<T=Record<string,unknown>>(api:Api,route:string,cookie='',method='GET',body?:unknown,expected=200):Promise<T>{const response=await api.request(route,cookie,method,body);assert.equal(response.status,expected,method+' '+route.split('?')[0]+' must return '+expected+'; received '+response.status);return response.json() as Promise<T>;}
async function deny(api:Api,route:string,cookie='',method='GET',body?:unknown,expected:number|number[]=[400,401,403,404,409,410,415,422]){const response=await api.request(route,cookie,method,body);assert((Array.isArray(expected)?expected:[expected]).includes(response.status),method+' '+route.split('?')[0]+' must deny; received '+response.status);return response;}
async function noApplicantSession(api:Api,cookie:string){const response=await api.request('/api/applicant/auth/me',cookie);assert.equal(response.status,200);assert.equal((await response.json() as {user:null}).user,null);}
async function rawUpload(api:Api,route:string,cookie:string,content:Buffer,type='application/pdf'){return fetch(api.base+route,{method:'POST',redirect:'manual',headers:{Cookie:cookie,Origin:config.appUrl,'Content-Type':type},body:new Uint8Array(content)});}
const pdf=Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n');
const portal='/api/applicant',staff='/api/applications';

// One fixture drives each stage through the same CRM identities. STAGE_CHECK bounds
// the assertions after each sequential implementation; no retained data is touched.
const stage=Number(process.env.STAGE_CHECK??'16');
assert([16,17,18,19,20].includes(stage),'Use STAGE_CHECK=16,17,18,19 or 20.');
async function main(){
 await createScratch();await baseline();const before=await snapshot();phase='additive migrations preserve established data';await migrate();assert.deepEqual(await snapshot(before),before);await migrate();assert.deepEqual(await snapshot(before),before);
 const files=(await readdir(path.join(root,'migrations'))).filter(name=>/^\d{3}_[a-z0-9_]+\.sql$/.test(name)).sort();
 const checksums=(await database.query<{name:string;checksum:string}>('SELECT name,checksum FROM schema_migrations ORDER BY name')).rows;assert.equal(checksums.length,files.length);
 for(const row of checksums)assert.equal(row.checksum,createHash('sha256').update(await readFile(path.join(root,'migrations',row.name),'utf8')).digest('hex'));
 assert.equal(await database.state(),'ready');pass('all additive migrations and a repeat run preserve pre-existing data columns and immutable migration checksums');
 const api=await start();const cookies:string[]=[];for(let i=0;i<roles.length;i++)cookies.push(await api.login(i));
 const admin=cookies[0]!,agent=cookies[1]!,analyst=cookies[2]!,foreignAdmin=cookies[3]!;
 const prepare=async(index:number,cookie=admin)=>{const response=await api.request(staff,cookie,'POST',{leadId:leadIds[index]});assert([200,201].includes(response.status),'Canonical staff application creation succeeds.');return response.json() as Promise<StaffApplicationWorkspace>;};
 const application=await prepare(0),restricted=await prepare(1),foreign=await prepare(2,foreignAdmin);
 const appId=application.application.id,appRoute=staff+'/'+appId,portalRoute=portal+'/applications/'+appId,participant=application.participants.find(p=>p.role==='primary')!;
 const invitation=await json<IssuedApplicationInvitation>(api,appRoute+'/invitations',admin,'POST',{participantId:participant.id,expiresInHours:1},201),token=new URL(invitation.url).hash.match(/[a-f0-9]{64}/)?.[0];assert(token);
 const accepted=await api.request(portal+'/invitations/accept','','POST',{token,password:applicantPassword});assert.equal(accepted.status,200);const applicant=cookieOf(accepted,'ootla.applicant.sid');
 const applicantId=(await accepted.json() as {user:ApplicantUser}).user.id;
 const context={api,admin,agent,analyst,foreignAdmin,manager:cookies[4]!,application,restricted,foreign,appId,appRoute,portalRoute,participant,applicant,applicantId};
 if(process.env.OOTLA_JOURNEY_BROWSER==='lease'){
  await submittedPortal(context);
  const {checkLeaseBrowser}=await import('./lease-browser-check.js');
  await checkLeaseBrowser({base:api.base,cookie:admin,applicationId:appId,config});return;
 }
 if(process.env.OOTLA_JOURNEY_BROWSER==='pilot'){
  phase='assistant, team, onboarding and analytics browser journeys';
  await submittedPortal(context);
  const {checkPilotBrowser}=await import('./pilot-browser-check.js');
  await checkPilotBrowser({base:api.base,cookie:admin,leadId:leadIds[0]!,password,config});return;
 }
 if(stage===16||process.env.JOURNEY_ALL==='true')await checkScreening(context);else await submittedPortal(context);
 if(stage===17||stage>=17&&process.env.JOURNEY_ALL==='true')await checkPayments(context);
 if(stage===18||stage>=18&&process.env.JOURNEY_ALL==='true')await checkLeases(context);
 if(stage===20){
  await checkLeases(context);
  const {checkOperations}=await import('./operations-check.js');
  const records=await checkOperations({...context,config,database,orgs,properties,memberships,leadIds});
  if(process.env.OOTLA_JOURNEY_BROWSER==='operations'){
   const {checkOperationsBrowser}=await import('./operations-browser-check.js');
   await checkOperationsBrowser({...records,base:api.base,cookie:admin,analyst,applicant,config,propertyId:properties[0]!});
  }
 } else if(stage>=19)await checkAi(context);
 if(process.env.OOTLA_CHECK_BACKUP==='true'){
  phase='isolated backup and restore';
  const {checkBackupRoundtrip}=await import('./backup-roundtrip.js');
  await checkBackupRoundtrip(scratchUrl,owner,verifiedCluster);
 }
 console.log('Application journey checks through Stage '+stage+': '+groups+' focused groups passed. All mutations were confined to the owned scratch database; no outbound provider calls were made.');
}
type Context={api:Api;admin:string;agent:string;analyst:string;foreignAdmin:string;manager:string;application:StaffApplicationWorkspace;restricted:StaffApplicationWorkspace;foreign:StaffApplicationWorkspace;appId:string;appRoute:string;portalRoute:string;participant:StaffApplicationWorkspace['participants'][number];applicant:string;applicantId:string};

async function submittedPortal(c:Context,id=c.appId,cookie=c.applicant){
 const route=portal+'/applications/'+id;let p=await json<PortalApplication>(c.api,route,cookie);
 if(p.application.status!=='draft')return p;
 p=await json<PortalApplication>(c.api,route,cookie,'PATCH',{version:p.participant.version,details:{displayName:'Synthetic Journey Applicant',phone:'+234 800 123 2000',currentAddress:'12 Test Only Avenue',moveInDate:'2027-04-01'}});
 for(const item of p.checklist.filter(v=>v.required)){const response=await rawUpload(c.api,route+'/documents?'+new URLSearchParams({checklistId:item.id,name:'Synthetic-evidence.pdf'}),cookie,pdf);assert.equal(response.status,201);}
 await json(c.api,route+'/consents',cookie,'POST',{version:'application-v1',accepted:true});p=await json<PortalApplication>(c.api,route,cookie);
 p=await json<PortalApplication>(c.api,route+'/ready',cookie,'POST',{version:p.participant.version});
 p=await json<PortalApplication>(c.api,route+'/submit',cookie,'POST',{version:p.application.version});assert.equal(p.application.status,'submitted');return p;
}
type ScreeningWorkspace=import('../shared/screening-contracts.js').ScreeningWorkspace;
async function checkScreening(c:Context){
 const {api,admin,agent,manager,analyst,foreignAdmin,appId,applicant,participant,appRoute,restricted,foreign}=c;
 const journey='/api/application-journey/'+appId,screen=journey+'/screening',consent='/api/applicant/application-journey/'+appId+'/screening-consent';
 phase='screening is distinct from generic application consent and applicant scope';
 await submittedPortal(c);
 await deny(api,screen);await deny(api,screen,applicant);await deny(api,screen,foreignAdmin);await deny(api,screen,analyst,'GET',undefined,403);
 await deny(api,'/api/application-journey/'+restricted.application.id+'/screening',agent,'GET',undefined,[403,404]);
 let w=await json<ScreeningWorkspace>(api,screen,admin);assert.equal(w.mode,'demo');assert.equal(w.status,'consent_required');assert(!w.policy.noticesConfigured&&!w.policy.retentionConfigured);
 assert.equal(w.access.canReadReports,true);assert((await json<ScreeningWorkspace>(api,screen,agent)).access.canReadReports===false);
 const submit={participantId:participant.id,requestKey:randomUUID()};
 await deny(api,screen+'/requests',admin,'POST',submit,[400,409]);
 await deny(api,consent,admin,'POST',{version:'demo-screening-v1',accepted:true},401);
 await deny(api,'/api/applicant/application-journey/'+restricted.application.id+'/screening-consent',applicant,'POST',{version:'demo-screening-v1',accepted:true},[403,404]);
 await deny(api,consent,applicant,'POST',{version:'application-v1',accepted:true},400);
 await deny(api,consent,applicant,'POST',{version:'demo-screening-v1',accepted:false},400);
 const accepted=await json<Record<string,unknown>>(api,consent,applicant,'POST',{version:'demo-screening-v1',accepted:true});assert(accepted);
 await json(api,consent,applicant,'POST',{version:'demo-screening-v1',accepted:true});
 const consentRows=(await database.query('SELECT * FROM screening_consents WHERE application_id=$1',[appId])).rows;assert.equal(consentRows.length,1);assert.equal(consentRows[0]!.actor_user_id,c.applicantId);assert.equal(consentRows[0]!.participant_id,participant.id);assert.equal(consentRows[0]!.purpose,'screening');assert.equal(consentRows[0]!.version,'demo-screening-v1');assert(consentRows[0]!.accepted_at);

 await database.query("UPDATE screening_consents SET version='obsolete-version' WHERE application_id=$1",[appId]);
 await deny(api,screen+'/requests',admin,'POST',{participantId:participant.id,requestKey:randomUUID()},409);
 await database.query("UPDATE screening_consents SET version='demo-screening-v1',actor_user_id=$2 WHERE application_id=$1",[appId,users[0]]);
 await deny(api,screen+'/requests',admin,'POST',{participantId:participant.id,requestKey:randomUUID()},409);
 await database.query('UPDATE screening_consents SET actor_user_id=$2,revoked_at=now() WHERE application_id=$1',[appId,c.applicantId]);
 await deny(api,screen+'/requests',admin,'POST',{participantId:participant.id,requestKey:randomUUID()},409);
 await deny(api,consent,applicant,'POST',{version:'demo-screening-v1',accepted:true},409);
 await database.query('UPDATE screening_consents SET revoked_at=NULL WHERE application_id=$1',[appId]);
 w=await json<ScreeningWorkspace>(api,screen,admin);assert.equal(w.status,'ready_to_submit');
 await deny(api,screen+'/requests',admin,'POST',{participantId:restricted.participants[0]!.id,requestKey:randomUUID()},[400,403,404,409]);
 pass('specific versioned applicant/application/purpose consent is required; generic consent is insufficient and staff/foreign application grants cannot impersonate consent');
 phase='screening concurrent idempotency and durable failure state';
 const responses=await Promise.all([api.request(screen+'/requests',admin,'POST',submit),api.request(screen+'/requests',admin,'POST',submit)]);for(const response of responses)assert([200,201].includes(response.status),'Concurrent same-key screening requests should reconcile.');
 await json(api,screen+'/requests',admin,'POST',{participantId:participant.id,requestKey:randomUUID()});
 w=await json<ScreeningWorkspace>(api,screen,admin);assert.equal(w.screenings.length,1);assert.equal(w.screenings[0]!.status,'submitted');assert.equal(w.decisions.length,0);
 const id=w.screenings[0]!.id;
 assert.equal((await database.query('SELECT 1 FROM screening_requests WHERE application_id=$1',[appId])).rowCount,1);assert.equal((await database.query('SELECT 1 FROM screening_jobs WHERE screening_id=$1',[id])).rowCount,1);
 const failure={requestKey:randomUUID(),simulateFailure:true};await json(api,screen+'/process',admin,'POST',failure);await json(api,screen+'/process',admin,'POST',failure);
 w=await json<ScreeningWorkspace>(api,screen,admin);assert.equal(w.screenings[0]!.status,'failed');assert.equal(w.screenings[0]!.attempts,1);assert(w.screenings[0]!.error&&w.screenings[0]!.nextAttemptAt);assert.equal(w.decisions.length,0);
 await deny(api,screen+'/retry',admin,'POST',{requestKey:randomUUID()},409);
 await database.query("UPDATE screening_jobs SET next_attempt_at=now()-interval '1 second' WHERE screening_id=$1",[id]);
 await json(api,screen+'/retry',admin,'POST',{requestKey:randomUUID()});
 await json(api,screen+'/process',admin,'POST',{requestKey:randomUUID()});
 w=await json<ScreeningWorkspace>(api,screen,admin);assert.equal(w.screenings[0]!.status,'provider_reviewing');
 pass('concurrent and retried requests create one persistent screening/job; an injected temporary failure remains failed, preserves bounded attempt state and enforces retry backoff');
 phase='signed callback authenticity association and duplicate processing';
 const callback={eventId:randomUUID(),organizationId:orgs[0]!,screeningId:id,providerRequestId:w.screenings[0]!.providerRequestId,status:'report_received'};
 const timestamp=Math.floor(Date.now()/1000).toString(),raw=Buffer.from(JSON.stringify(callback));
 const callbackRoute='/api/screening/demo-callback';
 let response=await fetch(api.base+callbackRoute,{method:'POST',headers:{'Content-Type':'application/json','x-ootla-demo-timestamp':timestamp,'x-ootla-demo-signature':'0'.repeat(64)},body:raw});assert([400,401,403].includes(response.status));
 // The exported signer is specific to the synthetic adapter, not a guessed live provider mechanism.
 const {signScreeningDemoCallback}=await import('../server/services/screening.js');
 const sendCallback=async(value:Record<string,unknown>,when=timestamp)=>{const body=Buffer.from(JSON.stringify(value));return fetch(api.base+callbackRoute,{method:'POST',headers:{'Content-Type':'application/json','x-ootla-demo-timestamp':when,'x-ootla-demo-signature':signScreeningDemoCallback(config,body,when)},body});};
 response=await sendCallback(callback);assert([200,202].includes(response.status));response=await sendCallback(callback);assert([200,202].includes(response.status));assert.equal((await database.query('SELECT 1 FROM screening_event_receipts WHERE event_id=$1',[callback.eventId])).rowCount,1);
 response=await sendCallback({...callback,status:'provider_reviewing'});assert([400,401,403,409].includes(response.status),'A reused event id with changed contents must be rejected.');
 response=await sendCallback({...callback,eventId:randomUUID(),organizationId:orgs[1]});assert([400,401,403,404,409].includes(response.status),'A valid signature does not authorize another organization association.');
 response=await sendCallback({...callback,eventId:randomUUID()},String(Math.floor(Date.now()/1000)-3600));assert([400,401,403].includes(response.status),'Expired signed callbacks are refused.');
 w=await json<ScreeningWorkspace>(api,screen,admin);assert.equal(w.screenings[0]!.status,'report_received');
 await json(api,screen+'/process',admin,'POST',{requestKey:randomUUID()});w=await json<ScreeningWorkspace>(api,screen,admin);assert.equal(w.screenings[0]!.status,'staff_review_pending');assert.equal(w.decisions.length,0);
 assert.equal((await database.query('SELECT 1 FROM screening_demo_provider_records WHERE screening_id=$1',[id])).rowCount,1);assert.equal((await database.query('SELECT 1 FROM screening_reports WHERE screening_id=$1',[id])).rowCount,1);
 pass('only fresh adapter-signed callbacks for the correct synthetic association are accepted; event replays reconcile once and changed-event replays are rejected');
 phase='private screening reports human review and decision authorization';
 const report=w.screenings[0]!.reportUrl;assert(report);
 const reportResponse=await api.request(report,admin);assert.equal(reportResponse.status,200);assert(/no-store/i.test(reportResponse.headers.get('cache-control')??''));const reportContent=await reportResponse.text();assert(reportContent.length>0);
 for(const deniedCookie of ['',applicant,agent,analyst,foreignAdmin])await deny(api,report,deniedCookie,'GET',undefined,[401,403,404]);
 assert.equal((await api.request(report,manager)).status,200);
 assert(!JSON.stringify(await json(api,appRoute,admin)).includes('OOTLA SCREENING DEMONSTRATION'),'Ordinary staff application JSON excludes sensitive report content.');
 assert(!JSON.stringify(await json(api,c.portalRoute,applicant)).includes('OOTLA SCREENING DEMONSTRATION'),'Applicant JSON excludes sensitive report content.');
 const decision={requestKey:randomUUID(),decision:'approved',reason:'Authorized staff reviewed the synthetic application.'};
 for(const deniedCookie of ['',applicant,agent,analyst,foreignAdmin])await deny(api,journey+'/decisions',deniedCookie,'POST',decision,[401,403,404]);
 await json(api,screen+'/review',manager,'POST',{requestKey:randomUUID()});
 const requestInfo={requestKey:randomUUID(),decision:'request_information',reason:'Please provide the additional information requested by staff.'};
 await json(api,journey+'/decisions',manager,'POST',requestInfo);await json(api,journey+'/decisions',manager,'POST',requestInfo);
 assert.equal((await database.query('SELECT 1 FROM application_decisions WHERE application_id=$1',[appId])).rowCount,1);
 w=await json<ScreeningWorkspace>(api,screen,admin);assert.equal(w.decisions[0]!.decision,'request_information');assert.equal(w.screenings[0]!.status,'staff_review_pending');
 const crm=(await database.query('SELECT status FROM applications WHERE id=$1',[appId])).rows[0]!;assert.notEqual(crm.status,'approved');assert.notEqual(crm.status,'declined');
 assert((await database.query("SELECT 1 FROM audit_events WHERE organization_id=$1 AND action LIKE '%screen%'",[orgs[0]])).rowCount!>0);

 pass('reports remain private to scoped review staff, access is audited, and repeated explicit human decisions are separate from screening and application workflow status');
 phase='bounded screening retries never report false success';
 const otherId=restricted.application.id,otherParticipant=restricted.participants.find(p=>p.role==='primary')!;
 const invitation=await json<IssuedApplicationInvitation>(api,staff+'/'+otherId+'/invitations',admin,'POST',{participantId:otherParticipant.id,expiresInHours:1},201),token=new URL(invitation.url).hash.match(/[a-f0-9]{64}/)?.[0];assert(token);
 const acceptedOther=await api.request(portal+'/invitations/accept','','POST',{token,password:applicantPassword});assert.equal(acceptedOther.status,200);const otherApplicant=cookieOf(acceptedOther,'ootla.applicant.sid');
 await submittedPortal(c,otherId,otherApplicant);
 await json(api,'/api/applicant/application-journey/'+otherId+'/screening-consent',otherApplicant,'POST',{version:'demo-screening-v1',accepted:true});
 const otherScreen='/api/application-journey/'+otherId+'/screening';
 await json(api,otherScreen+'/requests',admin,'POST',{participantId:otherParticipant.id,requestKey:randomUUID()});
 let failedId='';
 for(let attempt=1;attempt<=3;attempt++){
  await json(api,otherScreen+'/process',admin,'POST',{requestKey:randomUUID(),simulateFailure:true});
  const failed=await json<ScreeningWorkspace>(api,otherScreen,admin);assert.equal(failed.screenings[0]!.status,'failed');assert.equal(failed.screenings[0]!.attempts,attempt);assert(failed.screenings[0]!.error);assert.equal(failed.decisions.length,0);failedId=failed.screenings[0]!.id;
  await database.query("UPDATE screening_jobs SET next_attempt_at=now()-interval '1 second' WHERE screening_id=$1",[failedId]);
  if(attempt<3)await json(api,otherScreen+'/retry',admin,'POST',{requestKey:randomUUID()});
 }
 await deny(api,otherScreen+'/retry',admin,'POST',{requestKey:randomUUID()},409);
 await deny(api,otherScreen+'/process',admin,'POST',{requestKey:randomUUID()},409);
 assert.equal((await database.query('SELECT 1 FROM screening_reports WHERE screening_id=$1',[failedId])).rowCount,0);
 pass('three provider failures exhaust the durable job; further retries/process attempts are rejected and no report, successful result or application decision is fabricated');
 phase='unconfigured live screening does not silently use a demo provider';
 await database.query("UPDATE organizations SET environment='live' WHERE id=ANY($1::uuid[])",[orgs]);
 try{
  const live=await start({...config,demoMode:false}),liveAdmin=await live.login(3),liveScreen='/api/application-journey/'+foreign.application.id+'/screening';
  const notConfigured=await json<ScreeningWorkspace>(live,liveScreen,liveAdmin);assert.equal(notConfigured.mode,'not_configured');assert.equal(notConfigured.access.canRequest,false);
  await deny(live,liveScreen+'/requests',liveAdmin,'POST',{participantId:foreign.participants[0]!.id,requestKey:randomUUID()},[400,403,409,503]);
  const body=Buffer.from(JSON.stringify({...callback,eventId:randomUUID()})),when=Math.floor(Date.now()/1000).toString();
  const callbackResponse=await fetch(live.base+callbackRoute,{method:'POST',headers:{'Content-Type':'application/json','x-ootla-demo-timestamp':when,'x-ootla-demo-signature':signScreeningDemoCallback({...config,demoMode:false},body,when)},body});assert([400,401,403,409,503].includes(callbackResponse.status));
 }finally{await database.query("UPDATE organizations SET environment='demo' WHERE id=ANY($1::uuid[])",[orgs]);}
 pass('a non-demo organization reports missing provider configuration honestly and cannot submit synthetic screening or consume synthetic provider callbacks');
}



type PaymentWorkspace=import('../shared/payment-contracts.js').PaymentWorkspace;
type PaymentHandoff=import('../shared/payment-contracts.js').PaymentHandoff;
type DemoPaymentHandoff=import('../shared/payment-contracts.js').DemoPaymentHandoff;
type PaymentDestinations=import('../shared/payment-contracts.js').PaymentDestinations;
async function checkPayments(c:Context){
 const {api,admin,agent,analyst,foreignAdmin,applicant,appId,restricted,foreign}=c;
 const route='/api/application-payments/'+appId,portalPayment='/api/applicant/application-payments/'+appId,destinations='/api/application-payments/destinations';
 phase='payment status and destination organization/property permissions';
 let state=await json<PaymentWorkspace>(api,route,admin);assert.equal(state.mode,'demo');assert.equal(state.status,'unknown');assert.equal(state.lastKnownStatus,'unknown');assert.equal(state.verifiedAt,null);assert(/demo|simulat/i.test(state.notice));
 await json(api,portalPayment,applicant);await deny(api,route);await deny(api,route,applicant);await deny(api,route,foreignAdmin);await deny(api,'/api/application-payments/'+restricted.application.id,agent,'GET',undefined,[403,404]);
 await deny(api,'/api/applicant/application-payments/'+restricted.application.id,applicant,'GET',undefined,[403,404]);await deny(api,'/api/applicant/application-payments/'+foreign.application.id,applicant,'GET',undefined,[403,404]);
 await deny(api,portalPayment,admin,'GET',undefined,401);
 const forbiddenDestinations=['http://payments.example/pay','//payments.example/pay','javascript:alert(1)','https://user:password@payments.example/pay','https://payments.example/pay?email=person@example.test','https://payments.example/pay#complete','https://localhost/pay','https://localhost./pay','https://127.0.0.1/pay','https://2130706433/pay','https://10.2.3.4/pay','https://172.16.2.3/pay','https://192.168.1.3/pay','https://169.254.169.254/latest','https://[::1]/pay'];
 for(const url of forbiddenDestinations)await deny(api,destinations,admin,'POST',{requestKey:randomUUID(),name:'Unsafe destination',url,enabled:true},400);
 const destination={requestKey:randomUUID(),name:'Approved test provider',url:'https://payments.provider.example/tenant-portal',enabled:true};
 for(const cookie of ['',applicant,agent,analyst,c.manager,foreignAdmin]){
  if(cookie===foreignAdmin)continue;
  await deny(api,destinations,cookie,'POST',destination,[401,403]);
 }
 await json<PaymentDestinations>(api,destinations,admin,'POST',destination);await json<PaymentDestinations>(api,destinations,admin,'POST',destination);
 let configured=await json<PaymentDestinations>(api,destinations,admin);assert.equal(configured.items.length,1);assert.equal(configured.items[0]!.url,destination.url);assert.equal(configured.liveVerificationConfigured,false);
 assert.equal((await json<PaymentDestinations>(api,destinations,foreignAdmin)).items.length,0,'Another organization cannot see the configured provider destination.');
 await deny(api,destinations,admin,'POST',{...destination,url:'https://other-provider.example/pay'},409);
 await deny(api,destinations,admin,'POST',{...destination,requestKey:randomUUID(),organizationId:orgs[1]},400);
 await deny(api,portalPayment+'/handoff',applicant,'POST',{requestKey:randomUUID(),url:'https://attacker.example/',returnTo:'https://attacker.example/'},400);
 pass('payment records are applicant/organization/property scoped; only organization admins configure validated HTTPS destinations, credentials/query/fragment/private destinations and arbitrary browser redirects are rejected');
 phase='opaque session-bound expiring demo payment handoff';
 const requestKey=randomUUID(),handoff=await json<PaymentHandoff>(api,portalPayment+'/handoff',applicant,'POST',{requestKey});
 assert.equal(handoff.mode,'demo');assert(handoff.expiresAt);const url=new URL(handoff.url,config.appUrl);assert.equal(url.pathname,'/payment-demo');assert.equal(url.search,'');assert.equal(url.origin,config.appUrl);const token=url.hash.match(/[a-f0-9]{64}/)?.[0];assert(token);assert(!handoff.url.includes(applicantEmails[0]!));
 assert.deepEqual(await json<PaymentHandoff>(api,portalPayment+'/handoff',applicant,'POST',{requestKey}),handoff);
 const rows=(await database.query('SELECT * FROM payment_handoffs WHERE application_id=$1',[appId])).rows;assert.equal(rows.length,1);assert.equal(rows[0]!.token_digest.length,64);assert.notEqual(rows[0]!.token_digest,token);assert.equal(rows[0]!.user_id,c.applicantId);
 assert(!JSON.stringify((await database.query('SELECT * FROM payment_action_receipts WHERE application_id=$1',[appId])).rows).includes(token),'Payment action receipts must not store a plaintext handoff credential.');
 const opened=await json<DemoPaymentHandoff>(api,'/api/payment-demo/open',applicant,'POST',{token});assert.equal(opened.mode,'demo');assert.equal(opened.applicationId,appId);assert.equal(opened.status,'pending');assert(/simulat|demo/i.test(opened.notice));assert(opened.returnUrl.startsWith('/applicant'));
 for(const cookie of ['',admin,foreignAdmin])await deny(api,'/api/payment-demo/open',cookie,'POST',{token},[401,403,404]);
 const newLogin=await api.request('/api/applicant/auth/login','','POST',{email:applicantEmails[0],password:applicantPassword});assert.equal(newLogin.status,200);const anotherSession=cookieOf(newLogin,'ootla.applicant.sid');assert.notEqual(anotherSession,applicant);
 await deny(api,'/api/payment-demo/open',anotherSession,'POST',{token},[403,404,410]);
 await deny(api,'/api/payment-demo/open',applicant,'POST',{token:'0'.repeat(64)},[400,403,404,410]);
 const expiring=await json<PaymentHandoff>(api,portalPayment+'/handoff',applicant,'POST',{requestKey:randomUUID()}),expiryToken=new URL(expiring.url,config.appUrl).hash.match(/[a-f0-9]{64}/)?.[0];assert(expiryToken);
 await database.query("UPDATE payment_handoffs SET created_at=now()-interval '31 minutes',expires_at=now()-interval '1 minute' WHERE token_digest<>$1 AND application_id=$2",[rows[0]!.token_digest,appId]);
 await deny(api,'/api/payment-demo/open',applicant,'POST',{token:expiryToken},[400,403,404,410]);
 await deny(api,'/api/payment-demo/confirm',applicant,'POST',{token:expiryToken,requestKey:randomUUID()},[400,403,404,410]);
 pass('demo handoffs use hashed opaque fragment credentials, stable idempotency and short expiry; the current applicant session and application grant are required, and stored external destinations never activate in the demo');
 phase='browser returns cannot verify payment and provider confirmation is separate from canonical status';
 const reference=(await database.query('SELECT * FROM application_payment_references WHERE application_id=$1',[appId])).rows[0]!;assert(reference);assert.equal(reference.status,'unknown');assert.equal(reference.verified_at,null);
 await deny(api,route+'?paid=true&status=confirmed&returnTo=https://attacker.example',admin,'GET',undefined,400);
 await deny(api,portalPayment+'/verify',applicant,'POST',{requestKey:randomUUID(),paid:true,status:'confirmed'},400);
 await api.request('/payment-demo?paid=true&status=confirmed&application='+appId,applicant);
 state=await json<PaymentWorkspace>(api,route,admin);assert.equal(state.status,'verification_needed');assert.equal(state.lastKnownStatus,'unknown');assert.equal(state.verifiedAt,null);
 const verification={requestKey:randomUUID()};state=await json<PaymentWorkspace>(api,portalPayment+'/verify',applicant,'POST',verification);assert.equal(state.status,'pending');assert.equal(state.lastKnownStatus,'pending');assert(state.verifiedAt&&!state.stale);assert(/simulat|demo/i.test(state.source));
 const pendingVerifiedAt=state.verifiedAt,confirm={token,requestKey:randomUUID()};
 // The application host and database need not have perfectly synchronized clocks.
 const originalNow=Date.now;
 try{Date.now=()=>originalNow()-60000;const fresh=await json<PaymentWorkspace>(api,route,admin);assert.equal(fresh.status,'pending','A host clock behind the database must not make fresh verification stale.');assert.equal(fresh.stale,false);const portal=await json<PortalApplication>(api,'/api/applicant/applications/'+appId,applicant);assert(portal.nextSteps.some(step=>step.includes('Simulated provider status: pending')));}finally{Date.now=originalNow;}
 const confirmations=await Promise.all([api.request('/api/payment-demo/confirm',applicant,'POST',confirm),api.request('/api/payment-demo/confirm',applicant,'POST',confirm)]);for(const r of confirmations)assert.equal(r.status,200);
 const providerRecord=(await database.query('SELECT * FROM payment_demo_provider_records WHERE payment_reference_id=$1',[reference.id])).rows[0]!;assert.equal(providerRecord.status,'confirmed');assert.equal((await database.query('SELECT 1 FROM payment_demo_provider_events WHERE payment_reference_id=$1',[reference.id])).rowCount,1);
 const unchanged=(await database.query('SELECT status,verified_at FROM application_payment_references WHERE id=$1',[reference.id])).rows[0]!;assert.equal(unchanged.status,'pending');assert.equal(unchanged.verified_at.toISOString(),pendingVerifiedAt);
 state=await json<PaymentWorkspace>(api,route,admin);assert.equal(state.lastKnownStatus,'pending');assert.notEqual(state.status,'confirmed','A browser confirmation does not directly update the CRM payment status.');
 const confirmedRead={requestKey:randomUUID()};state=await json<PaymentWorkspace>(api,portalPayment+'/verify',applicant,'POST',confirmedRead);assert.equal(state.status,'confirmed');assert.equal(state.lastKnownStatus,'confirmed');assert(state.verifiedAt);assert(/simulat|demo/i.test(state.source));
 const verifiedAt=state.verifiedAt;await json(api,portalPayment+'/verify',applicant,'POST',confirmedRead);assert.equal((await database.query('SELECT verified_at FROM application_payment_references WHERE id=$1',[reference.id])).rows[0]!.verified_at.toISOString(),verifiedAt);
 await json(api,'/api/payment-demo/confirm',applicant,'POST',{token,requestKey:randomUUID()});await json(api,route+'/verify',admin,'POST',{requestKey:randomUUID()});
 assert.equal((await database.query('SELECT 1 FROM payment_demo_provider_events WHERE payment_reference_id=$1',[reference.id])).rowCount,1);assert.equal((await database.query('SELECT 1 FROM payment_event_receipts WHERE payment_reference_id=$1 AND provider_version=$2',[reference.id,providerRecord.version])).rowCount,1);
 assert.equal((await database.query('SELECT 1 FROM application_decisions WHERE application_id=$1',[appId])).rowCount,process.env.JOURNEY_ALL==='true'?1:0,'Payment verification must never create an application approval.');
 pass('forged browser parameters and manual status fields cannot confirm payment; controlled synthetic provider confirmation changes only provider records until an authorized adapter read verifies it, with duplicate-safe receipts');
 phase='stale and missing provider verification are explicit';
 await database.query("UPDATE application_payment_references SET verified_at=clock_timestamp()+interval '1 minute' WHERE id=$1",[reference.id]);
 state=await json<PaymentWorkspace>(api,route,admin);assert.equal(state.stale,true);assert.equal(state.status,'verification_needed','A timestamp in the database clock’s future is still invalid.');
 await database.query("UPDATE application_payment_references SET verified_at=now()-interval '2 hours' WHERE id=$1",[reference.id]);
 state=await json<PaymentWorkspace>(api,route,admin);assert(state.stale);assert.equal(state.status,'verification_needed');assert.equal(state.lastKnownStatus,'confirmed');assert(state.verifiedAt&&Date.now()-new Date(state.verifiedAt).getTime()>3600000);
 await database.query("UPDATE organizations SET environment='live' WHERE id=ANY($1::uuid[])",[orgs]);
 try{
  const live=await start({...config,demoMode:false}),liveAdmin=await live.login(3),liveRoute='/api/application-payments/'+foreign.application.id;
  let unknown=await json<PaymentWorkspace>(live,liveRoute,liveAdmin);assert.equal(unknown.mode,'not_configured');assert.equal(unknown.verifiedAt,null);assert.equal(unknown.status,'unknown');
  await json(live,destinations,liveAdmin,'POST',{requestKey:randomUUID(),name:'Existing approved portal',url:'https://client-provider.example/portal',enabled:true});
  unknown=await json<PaymentWorkspace>(live,liveRoute,liveAdmin);assert.equal(unknown.mode,'external');assert.equal(unknown.verifiedAt,null);assert.equal(unknown.status,'unknown');
  await deny(live,liveRoute+'/verify',liveAdmin,'POST',{requestKey:randomUUID()},503);
  const forbiddenDemo=await live.request('/api/payment-demo/open',applicant,'POST',{token});assert([401,403,404].includes(forbiddenDemo.status));
 }finally{await database.query("UPDATE organizations SET environment='demo' WHERE id=ANY($1::uuid[])",[orgs]);}
 pass('stale verified records are marked verification needed; an approved live portal alone provides no fabricated payment verification and the demo cannot operate outside its isolated environment');
}


type LeaseWorkflowWorkspace=import('../shared/lease-workflow-contracts.js').LeaseWorkflowWorkspace;
type LeaseWorkflowSettings=import('../shared/lease-workflow-contracts.js').LeaseWorkflowSettings;
type LeaseWorkflowStage=import('../shared/lease-workflow-contracts.js').LeaseWorkflowStage;
type TaskRecord=import('../shared/task-contracts.js').TaskRecord;
async function checkLeases(c:Context){
 const {api,admin,agent,manager,analyst,foreignAdmin,applicant,appId,restricted,foreign,appRoute,portalRoute}=c;
 const route='/api/application-leases/'+appId,settings='/api/application-leases/settings',decisions='/api/application-journey/'+appId+'/decisions';
 const prepareBody={requestKey:randomUUID(),startsOn:'2027-04-01',endsOn:'2028-03-31'};
 phase='application decisions require scoped staff review and document uploads are not lease proof';
 let w=await json<LeaseWorkflowWorkspace>(api,route,admin);assert.equal(w.mode,'demo');assert.equal(w.workflow,null);assert.equal(w.latestDecision,null);
 await deny(api,route);await deny(api,route,applicant);await deny(api,route,foreignAdmin);await deny(api,route,analyst,'GET',undefined,403);
 await deny(api,'/api/application-leases/'+restricted.application.id,manager,'GET',undefined,[403,404]);
 for(const cookie of ['',applicant,agent,analyst,foreignAdmin])await deny(api,route+'/create',cookie,'POST',prepareBody,[401,403,404]);
 await deny(api,route+'/create',admin,'POST',prepareBody,409);
 assert((await database.query('SELECT 1 FROM application_documents WHERE application_id=$1',[appId])).rowCount!>0,'The normal applicant fixture contains a private uploaded PDF.');
 assert.equal((await database.query('SELECT 1 FROM leases WHERE application_id=$1',[appId])).rowCount,0,'A submitted PDF must never generate a signed lease.');
 const requestInfo={requestKey:randomUUID(),decision:'request_information',reason:'Please confirm the move-in information requested by staff.'};
 for(const cookie of ['',applicant,agent,analyst,foreignAdmin])await deny(api,decisions,cookie,'POST',requestInfo,[401,403,404]);
 await json(api,decisions,manager,'POST',requestInfo);await json(api,decisions,manager,'POST',requestInfo);
 const beforeReopen=await json<PortalApplication>(api,portalRoute,applicant);assert(beforeReopen.readOnly);assert(/information|detail|staff/i.test(beforeReopen.nextSteps.join(' ')));
 const docsBefore=(await database.query('SELECT id,sha256 FROM application_documents WHERE application_id=$1 ORDER BY id',[appId])).rows;
 const reopen={requestKey:randomUUID()};
 for(const cookie of ['',applicant,agent,analyst,foreignAdmin])await deny(api,route+'/reopen',cookie,'POST',reopen,[401,403,404]);
 await json(api,route+'/reopen',manager,'POST',reopen);await json(api,route+'/reopen',manager,'POST',reopen);
 const reopened=await json<PortalApplication>(api,portalRoute,applicant);assert.equal(reopened.application.status,'draft');assert(!reopened.readOnly);assert.equal(reopened.participant.id,c.participant.id);assert.equal(reopened.participant.readyAt,null);assert.deepEqual((await database.query('SELECT id,sha256 FROM application_documents WHERE application_id=$1 ORDER BY id',[appId])).rows,docsBefore);
 assert((await database.query('SELECT 1 FROM application_consents WHERE application_id=$1',[appId])).rowCount!>0,'Prior versioned application consent remains an audit record after reopening.');
 await submittedPortal(c);
 await json(api,decisions,manager,'POST',{requestKey:randomUUID(),decision:'approved',reason:'Authorized staff reviewed the resubmitted synthetic application.'});
 assert.equal((await database.query('SELECT status FROM applications WHERE id=$1',[appId])).rows[0]!.status,'submitted','Staff decisions remain separate from the canonical application workflow status.');
 pass('only scoped review staff request information, reopen and decide; applicants resume their same application with private documents and consent history preserved, while an uploaded PDF never creates or verifies a lease');
 phase='organization settings, stable lease creation and strict transition graph';
 const templates=[{key:'keys',title:'Coordinate key handover',dayOffset:-2,priority:'high'},{key:'welcome',title:'Confirm move-in welcome',dayOffset:0,priority:'normal'}];
 const configBody={requestKey:randomUUID(),leasedMilestone:'fully_signed',moveInTasks:templates};
 for(const cookie of ['',applicant,agent,manager,analyst])await deny(api,settings,cookie,'POST',configBody,[401,403]);
 await json<LeaseWorkflowSettings>(api,settings,admin,'POST',configBody);await json(api,settings,admin,'POST',configBody);
 await deny(api,settings,admin,'POST',{...configBody,leasedMilestone:'completed'},409);
 await deny(api,settings,admin,'POST',{...configBody,requestKey:randomUUID(),organizationId:orgs[1]},400);
 assert.equal((await json<LeaseWorkflowSettings>(api,settings,foreignAdmin)).configured,false);
 await deny(api,route+'/create',admin,'POST',{...prepareBody,endsOn:'2026-01-01'},400);
 const creations=await Promise.all([api.request(route+'/create',admin,'POST',prepareBody),api.request(route+'/create',admin,'POST',prepareBody)]);for(const response of creations)assert.equal(response.status,200);
 w=await json<LeaseWorkflowWorkspace>(api,route,admin);assert(w.workflow);assert.equal(w.workflow.stage,'lease_preparation');assert.equal(w.workflow.leasedMilestone,'fully_signed');assert.equal(w.workflow.signatureEvidenceKind,null);assert.equal(w.workflow.signatureVerifiedAt,null);assert.equal(w.workflow.residentCount,0);
 const leaseId=w.workflow.leaseId,workflowId=w.workflow.id;
 assert.equal((await database.query('SELECT 1 FROM leases WHERE application_id=$1',[appId])).rowCount,1);assert.equal((await database.query('SELECT 1 FROM lease_workflows WHERE application_id=$1',[appId])).rowCount,1);
 await json(api,route+'/create',admin,'POST',{...prepareBody,requestKey:randomUUID()});assert.equal((await database.query('SELECT 1 FROM leases WHERE application_id=$1',[appId])).rowCount,1);
 const evidence={kind:'demo_event',reference:'Controlled synthetic signing-provider milestone.'};
 const transition=(stage:LeaseWorkflowStage,extra:Record<string,unknown>={},key=randomUUID())=>({requestKey:key,stage,evidence,...extra});
 await deny(api,route+'/transition',admin,'POST',transition('fully_signed'),409);
 await deny(api,route+'/transition',admin,'POST',transition('completed'),409);
 await deny(api,route+'/transition',admin,'POST',{...transition('signature_requested'),evidence:{kind:'uploaded_pdf',reference:'Uploaded signed-document.pdf'}},400);
 await deny(api,route+'/transition',admin,'POST',{...transition('signature_requested'),evidence:{kind:'provider_verified',reference:'Unconfigured signing API'}},400);
 for(const cookie of ['',applicant,agent,analyst,foreignAdmin])await deny(api,route+'/transition',cookie,'POST',transition('signature_requested'),[401,403,404]);
 const requested=transition('signature_requested');await json(api,route+'/transition',manager,'POST',requested);await json(api,route+'/transition',manager,'POST',requested);
 await deny(api,route+'/transition',manager,'POST',{...requested,stage:'partially_signed'},409);
 w=await json<LeaseWorkflowWorkspace>(api,route,admin);assert.equal(w.workflow!.stage,'signature_requested');assert.equal(w.workflow!.signatureEvidenceKind,null);
 assert.equal((await database.query('SELECT pipeline_stage FROM leads WHERE id=$1',[leadIds[0]])).rows[0]!.pipeline_stage,'lease_pending');
 await json(api,route+'/transition',manager,'POST',transition('partially_signed'));
 assert.notEqual((await database.query('SELECT pipeline_stage FROM leads WHERE id=$1',[leadIds[0]])).rows[0]!.pipeline_stage,'leased');
 assert.equal((await database.query('SELECT 1 FROM resident_relationships WHERE lease_id=$1',[leaseId])).rowCount,0);
 pass('explicit organization settings snapshot the valid leased milestone; concurrent create actions reuse one canonical lease, invalid skips and invented/PDF evidence are rejected, and partial signatures cannot mark a lead Leased');
 phase='signature milestone continuity and reminder relevance';
 const routedTeam=await json<{team:{id:string}}>(api,'/api/tasks/teams',admin,'POST',{name:'Move-in synthetic team',membershipIds:[memberships[1]]},201);
 await json(api,'/api/tasks/routing-rules',admin,'POST',{propertyId:properties[0],teamId:routedTeam.team.id,enabled:true});
 const ordinary=await json<{task:TaskRecord}>(api,'/api/tasks',admin,'POST',{propertyId:properties[0],leadId:leadIds[0],contactId:contacts[0],title:'Ordinary pre-lease follow-up',dueAt:'2027-03-20T09:00:00Z',priority:'normal',assignment:'manual',ownerMembershipId:memberships[1]},201);
 assert((await database.query("SELECT 1 FROM task_reminders WHERE task_id=$1 AND status<>'cancelled'",[ordinary.task.id])).rowCount!>0);
 const fully=transition('fully_signed'),signed=await json<LeaseWorkflowWorkspace>(api,route+'/transition',manager,'POST',fully);await json(api,route+'/transition',manager,'POST',fully);
 assert.equal(signed.workflow!.stage,'fully_signed');assert.equal(signed.workflow!.signatureEvidenceKind,'demo_event');assert(signed.workflow!.signatureVerifiedAt&&signed.workflow!.simulated);assert.equal(signed.workflow!.residentCount,1);
 const resident=(await database.query('SELECT * FROM resident_relationships WHERE lease_id=$1',[leaseId])).rows;assert.equal(resident.length,1);assert.equal(resident[0]!.contact_id,contacts[0]);assert.equal(resident[0]!.lead_id,leadIds[0]);assert.equal(resident[0]!.application_id,appId);assert.equal(resident[0]!.source,'demo_event');assert.equal(resident[0]!.status,'pending_move_in');
 await json(api,route+'/transition',manager,'POST',{...fully,requestKey:randomUUID()});
 const continuity=(await database.query('SELECT contact_id,application_id,lead_id FROM leases WHERE id=$1',[leaseId])).rows[0]!;assert.equal(continuity.contact_id,contacts[0]);assert.equal(continuity.application_id,appId);assert.equal(continuity.lead_id,leadIds[0]);
 assert.equal((await database.query('SELECT pipeline_stage FROM leads WHERE id=$1',[leadIds[0]])).rows[0]!.pipeline_stage,'leased');
 assert.equal((await database.query("SELECT 1 FROM task_reminders WHERE task_id=$1 AND status<>'cancelled'",[ordinary.task.id])).rowCount,0);
 const milestone=(await database.query('SELECT evidence_kind FROM lease_verified_milestones WHERE lease_id=$1',[leaseId])).rows;assert.equal(milestone.length,1);assert.equal(milestone[0]!.evidence_kind,'demo_event');
 await deny(api,route+'/transition',manager,'POST',transition('move_in_scheduled'),[400,409]);
 const moveInAt='2027-04-01T10:00:00+01:00',scheduled=transition('move_in_scheduled',{moveInAt});
 w=await json<LeaseWorkflowWorkspace>(api,route+'/transition',manager,'POST',scheduled);await json(api,route+'/transition',manager,'POST',scheduled);
 assert.equal(w.workflow!.moveInAt,new Date(moveInAt).toISOString());assert.equal(w.tasks.length,2);
 const moveTasks=(await database.query("SELECT * FROM tasks WHERE application_id=$1 AND purpose='move_in' ORDER BY title",[appId])).rows;assert.equal(moveTasks.length,2);
 for(const task of moveTasks){assert.equal(task.owner_membership_id,memberships[1]);assert.equal(task.origin,'system');assert.equal(task.status,'open');assert.equal(task.contact_id,contacts[0]);assert.equal(task.lead_id,leadIds[0]);assert.equal(task.assignment,'routing');const detail=await json<{task:TaskRecord}>(api,'/api/tasks/'+task.id,agent);assert(detail.task.actionable,'Move-in tasks must remain actionable after their lead becomes Leased.');assert((await database.query("SELECT 1 FROM task_reminders WHERE task_id=$1 AND status<>'cancelled'",[task.id])).rowCount!>0);}
 assert.equal(moveTasks.find(v=>v.title==='Coordinate key handover')!.due_at.toISOString(),'2027-03-30T09:00:00.000Z');assert.equal(moveTasks.find(v=>v.title==='Confirm move-in welcome')!.due_at.toISOString(),'2027-04-01T09:00:00.000Z');
 assert.equal((await database.query("SELECT 1 FROM task_creation_receipts WHERE organization_id=$1 AND namespace='lease_move_in'",[orgs[0]])).rowCount,2);
 const complete=transition('completed');await json(api,route+'/transition',manager,'POST',complete);await json(api,route+'/transition',manager,'POST',complete);
 w=await json<LeaseWorkflowWorkspace>(api,route,admin);assert.equal(w.workflow!.stage,'completed');assert.equal(w.events.length,6);assert.equal(w.workflow!.residentCount,1);assert.equal(w.tasks.length,2);assert.equal((await database.query('SELECT status FROM resident_relationships WHERE lease_id=$1',[leaseId])).rows[0]!.status,'active');
 assert.equal((await database.query('SELECT 1 FROM lease_workflow_events WHERE workflow_id=$1',[workflowId])).rowCount,6);assert.equal((await database.query('SELECT 1 FROM resident_relationships WHERE lease_id=$1',[leaseId])).rowCount,1);
 const next=await json<PortalApplication>(api,portalRoute,applicant);assert(/complete|move.in|resident|lease/i.test(next.nextSteps.join(' ')));assert(!/save your personal details/i.test(next.nextSteps.join(' ')));

 pass('a demo signature milestone creates one resident relationship using the original contact/lead/application, marks Leased only with recorded evidence and cancels ordinary lead reminders; two routed move-in tasks have correct due dates and remain actionable, with replays creating no duplicates');
 phase='configured Completed milestone and honest unassigned move-in tasks';
 await json(api,settings,admin,'POST',{requestKey:randomUUID(),leasedMilestone:'completed',moveInTasks:templates});
 assert.equal((await json<LeaseWorkflowWorkspace>(api,route,admin)).workflow!.leasedMilestone,'fully_signed','Changing organization policy cannot rewrite an existing workflow milestone.');
 const otherId=restricted.application.id,otherRoute='/api/application-leases/'+otherId,otherParticipant=restricted.participants.find(p=>p.role==='primary')!;
 const invitation=await json<IssuedApplicationInvitation>(api,staff+'/'+otherId+'/invitations',admin,'POST',{participantId:otherParticipant.id,expiresInHours:1},201),token=new URL(invitation.url).hash.match(/[a-f0-9]{64}/)?.[0];assert(token);
 const accepted=await api.request(portal+'/invitations/accept','','POST',{token,password:applicantPassword});assert.equal(accepted.status,200);const otherApplicant=cookieOf(accepted,'ootla.applicant.sid');
 await submittedPortal(c,otherId,otherApplicant);
 await json(api,'/api/application-journey/'+otherId+'/decisions',admin,'POST',{requestKey:randomUUID(),decision:'approved',reason:'Authorized review of the second synthetic application is complete.'});
 let other=await json<LeaseWorkflowWorkspace>(api,otherRoute+'/create',admin,'POST',{...prepareBody,requestKey:randomUUID()});assert.equal(other.workflow!.leasedMilestone,'completed');const otherLeaseId=other.workflow!.leaseId;
 for(const stage of ['signature_requested','partially_signed','fully_signed'] as const)other=await json<LeaseWorkflowWorkspace>(api,otherRoute+'/transition',admin,'POST',transition(stage));
 assert.equal(other.workflow!.signatureEvidenceKind,'demo_event');assert.equal(other.workflow!.residentCount,1);
 assert.notEqual((await database.query('SELECT pipeline_stage FROM leads WHERE id=$1',[leadIds[1]])).rows[0]!.pipeline_stage,'leased');
 assert.equal((await database.query('SELECT 1 FROM lease_verified_milestones WHERE lease_id=$1',[otherLeaseId])).rowCount,0);
 let leadVersion=(await database.query('SELECT version FROM leads WHERE id=$1',[leadIds[1]])).rows[0]!.version;
 await deny(api,'/api/leads/'+leadIds[1]+'/stage',admin,'PATCH',{version:leadVersion,stage:'leased',reason:'Attempted drag before configured milestone.'},409);
 await deny(api,'/api/leads/'+leadIds[1]+'/lease-verification',admin,'POST',{version:leadVersion,leaseId:otherLeaseId,evidenceReference:'Attempted old manual bypass before Completed.',confirmVerified:true},409);
 const emptyTeam=await json<{team:{id:string}}>(api,'/api/tasks/teams',admin,'POST',{name:'No eligible move-in staff',membershipIds:[]},201);
 await json(api,'/api/tasks/routing-rules',admin,'POST',{propertyId:properties[0],teamId:emptyTeam.team.id,enabled:true});
 other=await json<LeaseWorkflowWorkspace>(api,otherRoute+'/transition',admin,'POST',transition('move_in_scheduled',{moveInAt}));assert.equal(other.tasks.length,2);
 for(const task of (await database.query("SELECT * FROM tasks WHERE application_id=$1 AND purpose='move_in'",[otherId])).rows){assert.equal(task.owner_membership_id,null);assert(task.assignment_notice);assert.equal((await database.query('SELECT 1 FROM task_reminders WHERE task_id=$1',[task.id])).rowCount,0,'Unassigned tasks must not generate a reminder for an invented assignee.');}
 const completing=transition('completed');other=await json<LeaseWorkflowWorkspace>(api,otherRoute+'/transition',admin,'POST',completing);await json(api,otherRoute+'/transition',admin,'POST',completing);
 assert.equal((await database.query('SELECT pipeline_stage FROM leads WHERE id=$1',[leadIds[1]])).rows[0]!.pipeline_stage,'leased');
 assert.equal((await database.query('SELECT 1 FROM lease_verified_milestones WHERE lease_id=$1',[otherLeaseId])).rowCount,1);assert.equal((await database.query('SELECT 1 FROM resident_relationships WHERE lease_id=$1',[otherLeaseId])).rowCount,1);assert.equal((await database.query("SELECT 1 FROM tasks WHERE application_id=$1 AND purpose='move_in'",[otherId])).rowCount,2);
 await deny(api,otherRoute+'/reopen',admin,'POST',{requestKey:randomUUID()},409);
 pass('a workflow configured for Completed cannot be marked Leased through signature status, drag/drop or the legacy verification route; empty routing teams leave work explicitly unassigned, and completion creates each milestone, resident and move-in task once');
 phase='manual attestation differs from synthetic evidence and provider-owned authority';
 await database.query("UPDATE organizations SET environment='live' WHERE id=ANY($1::uuid[])",[orgs]);
 try{
  const live=await start({...config,demoMode:false}),liveAdmin=await live.login(3),foreignId=foreign.application.id,manualRoute='/api/application-leases/'+foreignId;
  await database.query("UPDATE applications SET status='submitted',portal_submitted_at=now() WHERE id=$1",[foreignId]);
  await json(live,settings,liveAdmin,'POST',{requestKey:randomUUID(),leasedMilestone:'fully_signed',moveInTasks:templates});
  await json(live,'/api/application-journey/'+foreignId+'/decisions',liveAdmin,'POST',{requestKey:randomUUID(),decision:'approved',reason:'Authorized staff reviewed the isolated manual-process fixture.'});
  await database.query("UPDATE applications SET source_system='yardi',source_owned_fields=ARRAY['status']::text[] WHERE id=$1",[foreignId]);
  const unsupported=await json<LeaseWorkflowWorkspace>(live,manualRoute,liveAdmin);assert.equal(unsupported.mode,'unsupported_provider');assert(!unsupported.access.canCreate);
  const ownedDenial=await deny(live,manualRoute+'/create',liveAdmin,'POST',{...prepareBody,requestKey:randomUUID()},[403,409]);const denialBody=await ownedDenial.json() as {code:string};assert(/PROVIDER|SOURCE|YARDI/i.test(denialBody.code));
  await database.query("UPDATE applications SET source_system='local',source_owned_fields='{}' WHERE id=$1",[foreignId]);
  let manual=await json<LeaseWorkflowWorkspace>(live,manualRoute+'/create',liveAdmin,'POST',{...prepareBody,requestKey:randomUUID()});assert.equal(manual.mode,'manual');assert(!manual.workflow!.simulated);assert(manual.evidenceKinds.includes('manual_attestation'));assert(!manual.evidenceKinds.includes('demo_event'));
  await deny(live,manualRoute+'/transition',liveAdmin,'POST',transition('signature_requested'),[403,409]);
  const attest={kind:'manual_attestation',reference:'Authorized staff attests to the verified paper-signature milestone.'};
  for(const stage of ['signature_requested','partially_signed','fully_signed'] as const)manual=await json<LeaseWorkflowWorkspace>(live,manualRoute+'/transition',liveAdmin,'POST',{...transition(stage),evidence:attest});
  assert.equal(manual.workflow!.signatureEvidenceKind,'manual_attestation');assert(!manual.workflow!.simulated);assert(!manual.events.some(e=>e.simulated));
  assert.equal((await database.query('SELECT source FROM resident_relationships WHERE lease_id=$1',[manual.workflow!.leaseId])).rows[0]!.source,'manual_attestation');
  await json(live,manualRoute+'/transition',liveAdmin,'POST',{...transition('move_in_scheduled',{moveInAt:'2099-04-01T09:00:00Z'}),evidence:attest});
  await deny(live,manualRoute+'/transition',liveAdmin,'POST',{...transition('completed'),evidence:attest},409);
  assert.equal((await json<LeaseWorkflowWorkspace>(live,manualRoute,liveAdmin)).workflow!.stage,'move_in_scheduled','An authorized manual process cannot attest a future move-in as completed.');
 }finally{await database.query("UPDATE organizations SET environment='demo' WHERE id=ANY($1::uuid[])",[orgs]);}
 pass('standalone non-demo organizations have an explicit authorized manual attestation process, synthetic evidence is refused outside the demo, provider-owned applications remain unsupported without their interface, and future move-ins cannot be manually completed');
}


async function checkAi(c:Context){
 const {api,admin,agent,analyst,foreignAdmin,applicant}=c;
 phase='release readiness and request correlation';
 assert.equal((await api.request('/api/live')).status,200);
 const ready=await api.request('/api/ready');assert.equal(ready.status,200);assert.match(ready.headers.get('x-request-id')??'',/^[a-f0-9-]{36}$/);
 for(const name of ['017_pilot_features.sql','023_staff_assistant_chat.sql']){
  await database.query('DELETE FROM schema_migrations WHERE name=$1',[name]);
  assert.equal((await api.request('/api/ready')).status,503);
  const migration=await readFile(path.join(root,'migrations',name),'utf8');
  await database.query('INSERT INTO schema_migrations(name,checksum) VALUES($1,$2)',[name,createHash('sha256').update(migration).digest('hex')]);
  assert.equal((await api.request('/api/ready')).status,200);
 }
 phase='assistant permissions, quota, replay and review';
 const route='/api/pilot/assistant',body={leadId:leadIds[0],requestKey:randomUUID(),action:'follow_up'};
 for(const cookie of ['',applicant,analyst])await deny(api,route,cookie,'POST',body,[401,403]);
 await deny(api,route,foreignAdmin,'POST',body,[403,404]);
 await deny(api,route,agent,'POST',{...body,leadId:leadIds[1]},[403,404]);
 const before=await snapshot();
 const result=await json<import('../shared/pilot-contracts.js').AssistantResult>(api,route,admin,'POST',body);
 assert.equal(result.mode,'demo');assert.equal(result.status,'completed');assert(result.result!.body);assert(result.result!.cautions.some(v=>v.includes('no model')));
 const replay=await json<typeof result>(api,route,admin,'POST',body);assert.equal(replay.id,result.id);
 await deny(api,route,admin,'POST',{...body,action:'summary'},409);
 await deny(api,route+'/'+result.id+'/review',agent,'POST',{confirmed:true},404);
 await json(api,route+'/'+result.id+'/review',admin,'POST',{confirmed:true});
 await json(api,route+'/'+result.id+'/review',admin,'POST',{confirmed:true});
 assert.equal(Number((await database.query("SELECT count(*) AS n FROM audit_events WHERE action='assistant.reviewed' AND metadata->>'requestId'=$1",[result.id])).rows[0].n),1);
 const history=await json<{items:typeof result[]}>(api,route+'/history/'+leadIds[0],admin);assert(history.items[0]!.reviewedAt);
 const after=await snapshot(before);for(const table of ['leads','applications','leases','tasks','contacts','screening_reports'])if(before[table])assert.deepEqual(after[table],before[table],'Assistant must not modify '+table);
 await deny(api,route+'/settings',agent,'POST',{enabled:true,confirmed:true},403);
 await deny(api,route+'/settings',admin,'POST',{enabled:true,confirmed:true},409);
 for(let i=1;i<20;i++)await json(api,route,admin,'POST',{...body,requestKey:randomUUID(),action:'summary'});
 await deny(api,route,admin,'POST',{...body,requestKey:randomUUID()},429);
 pass('assistant uses scoped records, persists reviewable demo drafts, deduplicates retries, enforces actor ownership and hourly quotas, and never mutates business records');
 phase='model adapter validated contract and failure behavior';
 const {generateAssistantOutput}=await import('../server/services/assistant.js');
 const expected={title:'Review',body:'An unsent draft.',nextActions:['Review current records.'],cautions:['Check availability.']};
 const fake=(async(url:unknown,options?:RequestInit)=>{assert.equal(url,'https://api.openai.com/v1/responses');const payload=JSON.parse(String(options!.body));assert.equal(payload.store,false);assert.equal(payload.text.format.strict,true);assert.equal(payload.tools,undefined);assert(!String(options!.body).includes(password));return new Response(JSON.stringify({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(expected)}]}]}),{status:200});}) as typeof fetch;
 assert.deepEqual(await generateAssistantOutput(config,'summary',{stage:'contacted'},fake),expected);
 await assert.rejects(()=>generateAssistantOutput(config,'summary',{},(async()=>new Response('{}',{status:429})) as typeof fetch));
 await assert.rejects(()=>generateAssistantOutput(config,'summary',{},(async()=>new Response(JSON.stringify({status:'incomplete'}),{status:200})) as typeof fetch));
 await assert.rejects(()=>generateAssistantOutput(config,'summary',{},(async()=>new Response('x'.repeat(65537),{status:200})) as typeof fetch));
 pass('Responses adapter uses structured output, disabled response storage and bounded generation; provider and incomplete responses fail safely without external calls');
 phase='team invitation, recovery and revocation';
 const team='/api/pilot/team',email='invited-'+randomUUID()+'@example.test',newPassword='Personal-'+randomUUID()+'!';
 const invite={email,name:'Invited Staff',role:'leasing_agent',propertyIds:[properties[0]],currentPassword:password};
 for(const cookie of ['',agent,analyst,applicant])await deny(api,team+'/invitations',cookie,'POST',invite,[401,403]);
 await deny(api,team+'/invitations',admin,'POST',{...invite,currentPassword:'Incorrect password'},403);
 await deny(api,team+'/invitations',admin,'POST',{...invite,propertyIds:[properties[2]]},400);
 const issued=await json<{id:string;url:string}>(api,team+'/invitations',admin,'POST',invite,201);
 const token=new URL(issued.url).hash.slice(7);assert(/^[a-f0-9]{64}$/.test(token));assert(!new URL(issued.url).search);
 const stored=(await database.query('SELECT * FROM staff_access_links WHERE id=$1',[issued.id])).rows[0];assert.notEqual(stored.token_digest,token);assert(!JSON.stringify(stored).includes(token));
 const accepts=await Promise.all([api.request('/api/pilot/staff-access/accept','','POST',{token,password:newPassword}),api.request('/api/pilot/staff-access/accept','','POST',{token,password:newPassword})]);
 assert.deepEqual(accepts.map(r=>r.status).sort(),[200,410],'Concurrent acceptance consumes a link once.');
 const signed=await api.request('/api/auth/login','','POST',{email,password:newPassword});assert.equal(signed.status,200);const newCookie=cookieOf(signed,'ootla.sid');const newUser=(await signed.json() as {user:{id:string}}).user;
 await json(api,'/api/lead-workspaces/'+leadIds[0],newCookie);await deny(api,'/api/lead-workspaces/'+leadIds[1],newCookie,'GET',undefined,[403,404]);await deny(api,'/api/leads/'+leadIds[2],newCookie,'GET',undefined,[403,404]);
 const recovery=await json<{id:string;url:string}>(api,team+'/recovery',admin,'POST',{userId:newUser.id,currentPassword:password},201);
 const recoveryToken=new URL(recovery.url).hash.slice(7),replacement='Recovered-'+randomUUID()+'!';
 await json(api,'/api/pilot/staff-access/accept','','POST',{token:recoveryToken,password:replacement});
 await deny(api,'/api/leads/'+leadIds[0],newCookie,'GET',undefined,401);
 assert.equal((await api.request('/api/auth/login','','POST',{email,password:replacement})).status,200);
 const revocable=await json<{id:string;url:string}>(api,team+'/invitations',admin,'POST',{...invite,email:'revoked-'+randomUUID()+'@example.test'},201);
 await json(api,team+'/links/'+revocable.id+'/revoke',admin,'POST',{});
 await deny(api,'/api/pilot/staff-access/accept','','POST',{token:new URL(revocable.url).hash.slice(7),password:newPassword},410);
 const expired=await json<{id:string;url:string}>(api,team+'/invitations',admin,'POST',{...invite,email:'expired-'+randomUUID()+'@example.test'},201);
 await database.query("UPDATE staff_access_links SET created_at=now()-interval '2 hours',expires_at=now()-interval '1 hour' WHERE id=$1",[expired.id]);
 await deny(api,'/api/pilot/staff-access/accept','','POST',{token:new URL(expired.url).hash.slice(7),password:newPassword},410);
 const workspace=await json<import('../shared/pilot-contracts.js').TeamWorkspace>(api,team,admin);assert(workspace.members.some(m=>m.userId===newUser.id));assert(!JSON.stringify(workspace).includes(token));
 pass('admin-reauthenticated invitations grant only selected properties; single-use/expired/revoked tokens fail, recovery invalidates sessions, and secrets are absent from listings');
 phase='analytics cohort and property isolation';
 const analytics=await json<import('../shared/pilot-contracts.js').AnalyticsSnapshot>(api,'/api/pilot/analytics?days=90',admin);
 assert.equal(analytics.cohortLeads,2);assert.equal(analytics.applicationsStarted,2);assert(analytics.applicationsSubmitted>=1);assert(!JSON.stringify(analytics).includes(email));
 const restricted=await json<typeof analytics>(api,'/api/pilot/analytics?days=90',analyst);assert.equal(restricted.cohortLeads,1);
 const other=await json<typeof analytics>(api,'/api/pilot/analytics?days=90',foreignAdmin);assert.equal(other.cohortLeads,1);
 await deny(api,'/api/pilot/analytics?days=90',agent,'GET',undefined,403);await deny(api,'/api/pilot/analytics?days=9999',admin,'GET',undefined,400);
 await json(api,'/api/pilot/onboarding',admin);await deny(api,'/api/pilot/onboarding',agent,'GET',undefined,403);
 pass('analytics uses one bounded creation cohort, excludes hidden interests, respects organization/role scope and exposes aggregate counts; onboarding reads actual setup progress');
 phase='operator organization provisioning';
 const {provisionOrganization}=await import('../server/services/provision-organization.js');
 const setup={name:'Isolated new organization',slug:'setup-'+randomUUID(),adminName:'Individual Admin',adminEmail:'setup-'+randomUUID()+'@example.test',password:'Setup-'+randomUUID()+'!'};
 await assert.rejects(()=>provisionOrganization(database,config,setup));
 const liveConfig={...config,demoMode:false};
 const created=await provisionOrganization(database,liveConfig,setup);
 await assert.rejects(()=>provisionOrganization(database,liveConfig,setup));
 await assert.rejects(()=>provisionOrganization(database,liveConfig,{...setup,slug:'different-'+randomUUID()}));
 const live=await start(liveConfig),signIn=await live.request('/api/auth/login','','POST',{email:setup.adminEmail,password:setup.password});assert.equal(signIn.status,200);
 const principal=(await signIn.json() as {user:{id:string;organization:{id:string;role:string}}}).user;
 assert.equal(principal.id,created.userId);assert.equal(principal.organization.id,created.organizationId);assert.equal(principal.organization.role,'organization_admin');
 const onboarding=await json<{counts:{staff:number;properties:number}}>(live,'/api/pilot/onboarding',cookieOf(signIn,'ootla.sid'));assert.equal(onboarding.counts.staff,1);assert.equal(onboarding.counts.properties,0);
 pass('operator provisioning creates an individual admin and empty standalone organization, supports normal sign-in, and refuses duplicate identity takeover or demo seeding');
}
try{await main();}
catch(error){const detail=error instanceof assert.AssertionError?error.message.split(/\r?\n/,1)[0]:JSON.stringify({name:error instanceof Error?error.name:'unknown',code:(error as{code?:string})?.code});console.error('Journey checks failed during '+phase+': '+detail);console.error('Check location: '+(error instanceof Error?error.stack?.split(/\r?\n/).find(l=>/scripts[\\/][a-z-]+\.ts:\d+/.test(l))?.trim():'unknown'));process.exitCode=1;}
finally{
 try{
  for(const close of servers.reverse())await close();await database.close();
  if(ownsScratch){await verifiedCluster();assert(/^ootla_demo_journey_[a-f0-9]{32}$/.test(scratchName));const target=await owner.query<{owner:string}>('SELECT pg_get_userbyid(datdba) AS owner FROM pg_database WHERE datname=$1',[scratchName]);assert(target.rowCount===1&&target.rows[0]?.owner==='ootla','Scratch ownership changed; no deletion attempted.');const quoted=(await owner.query<{name:string}>('SELECT quote_ident($1) AS name',[scratchName])).rows[0]!.name;await owner.query('DROP DATABASE '+quoted);assert.equal((await owner.query('SELECT 1 FROM pg_database WHERE datname=$1',[scratchName])).rowCount,0);console.log('PASS removed only the uniquely owned journey scratch database; retained data was never modified');}
 }catch{console.error('Journey owned scratch cleanup failed. No unrelated database deletion was attempted.');process.exitCode=1;}finally{if(ownerConnected)await owner.end();}
}
