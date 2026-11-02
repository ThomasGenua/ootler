import {createHmac,randomBytes,timingSafeEqual} from 'node:crypto';
import type {PoolClient} from 'pg';
import type {z} from 'zod';
import type {AuthUser} from '../../shared/contracts.js';
import {groundedAnswer,type conciergeQuestion} from '../../shared/ai-workflow-contracts.js';
import type {inquirySchema} from '../../shared/operations-contracts.js';
import {AiWorkflowRunner} from './ai-workflow-runner.js';
import {Inbox} from './inbox.js';
import {IntakeService} from './intake.js';
import {workflowActor} from './workflow-actor.js';
import {propertyAccess,missing,stale} from './operations-access.js';
import {verifiedUnit} from './vacancies.js';
import {fingerprint} from './workflow-signatures.js';
import {ApiError} from '../http/errors.js';
import {isIsolatedDemo} from './demo-environment.js';
export type AnswerSource={id:string;title:string;body:string;version:number;url:string;expiresAt:string|null};
export async function answerSources(c:PoolClient,org:string,propertyId:string,question:string){
 const knowledge=(await c.query("SELECT id,title,body,version,expires_at FROM property_knowledge WHERE organization_id=$1 AND property_id=$2 AND published AND public_answer AND (expires_at IS NULL OR expires_at>clock_timestamp()) ORDER BY ts_rank_cd(to_tsvector('simple',title||' '||body),plainto_tsquery('simple',$3)) DESC,updated_at DESC,id LIMIT 6",[org,propertyId,question])).rows;
 const units=(await c.query(`SELECT un.id,un.label,un.bedrooms,un.monthly_rent,un.availability_verified_at FROM units un WHERE un.organization_id=$1 AND un.property_id=$2 AND ${verifiedUnit('un')} AND NOT EXISTS(SELECT 1 FROM unit_turnovers t WHERE t.unit_id=un.id AND t.status<>'ready') ORDER BY un.label,un.id LIMIT 8`,[org,propertyId])).rows;
 const sources:AnswerSource[]=knowledge.map(r=>({id:'knowledge:'+r.id,title:r.title,body:r.body,version:r.version,url:'',expiresAt:r.expires_at?.toISOString()??null}));
 for(const un of units)sources.push({id:'unit:'+un.id,title:'Unit '+un.label,body:JSON.stringify({unit:un.label,bedrooms:un.bedrooms,monthlyRent:un.monthly_rent,availability:'Reported available; subject to confirmation. A viewing request is not a reservation.',verifiedAt:un.availability_verified_at}),version:1,url:'',expiresAt:new Date(new Date(un.availability_verified_at).getTime()+7*86400000).toISOString()});
 return{sources,units};
}
export const conciergeInstructions='Answer only using supplied approved sources. Cite supporting sourceIds. If the facts do not answer the question, say that the leasing team needs to confirm and set needsHuman true. Never invent prices, fees, availability, bookings or policies. Do not use conversation history as authority for property facts. Do not disclose internal records or make application/eligibility decisions. Questions about a person’s account, payments or application require a human. Unit availability is a current report, never a reservation. Do not invent URLs.';
export function checkedAnswer(result:z.infer<typeof groundedAnswer>,sources:AnswerSource[]){
 if(result.sourceIds.some(id=>!sources.some(s=>s.id===id)))throw new ApiError(502,'AI_SOURCE_MISMATCH','The answer could not be verified against its sources. Please contact the leasing team.');
 if(!result.sourceIds.length)return{answer:'The published information does not establish an answer. Please ask the leasing team to confirm.',sourceIds:[],needsHuman:true};
 return result;
}
function demoAnswer(sources:AnswerSource[],question:string){const words=question.toLowerCase().match(/[a-z0-9]{4,}/g)??[];const found=sources.find(s=>words.some(w=>(s.title+' '+s.body).toLowerCase().includes(w)));return found?{answer:found.body.slice(0,1500),sourceIds:[found.id],needsHuman:false}:{answer:'Please ask the leasing team to confirm.',sourceIds:[],needsHuman:true};}
export class LeasingConcierge extends Inbox {
 private digest(token:string){return createHmac('sha256',this.config.sessionSecret).update('concierge:'+token).digest('hex');}
 async publicContext(c:PoolClient,formId:string,question=''){
  const row=(await c.query('SELECT f.id,f.organization_id,f.property_id,p.name,s.version,s.membership_id,s.updated_by FROM intake_forms f JOIN properties p ON p.id=f.property_id JOIN property_ai_settings s ON s.property_id=f.property_id WHERE f.id=$1 AND f.enabled AND s.concierge_enabled FOR SHARE OF f,s',[formId])).rows[0];if(!row)throw missing();
  const issuer=await workflowActor(c,this.config,row.organization_id,row.membership_id,row.updated_by);if(!issuer||issuer.organization.role!=='organization_admin')throw missing();await propertyAccess(c,issuer,row.property_id);
  const enabled=(await c.query('SELECT ai_enabled FROM organization_pilot_settings WHERE organization_id=$1',[row.organization_id])).rows[0]?.ai_enabled;
  if(!(await isIsolatedDemo(this.config,c))&&(!enabled||!this.config.ai.enabled))throw new ApiError(503,'AI_NOT_ENABLED','AI assistance is unavailable. Please use the inquiry form to contact the team.');
  return{form:row,...await answerSources(c,row.organization_id,row.property_id,question)};
 }
 async info(formId:string){return this.database.transaction(async c=>{const {form,units}=await this.publicContext(c,formId);return{propertyName:form.name,units,notice:'AI answers use approved property references. Avoid sensitive identity, financial or application information. Questions are processed by our AI provider when enabled. Ask the team to confirm anything unclear.'};});}
 async start(formId:string,challenge:string,ip:string){
  const [time,sig,...rest]=challenge.split('.'),expected=createHmac('sha256',this.config.sessionSecret).update('intake:'+formId+':'+time).digest('hex');
  if(rest.length||!/^\d{13}$/.test(time??'')||!sig||!/^[a-f0-9]{64}$/.test(sig)||!timingSafeEqual(Buffer.from(sig),Buffer.from(expected))||Date.now()-Number(time)<1500||Date.now()-Number(time)>3600000)throw new ApiError(400,'FORM_EXPIRED','Reload the inquiry page and try again.');
  return this.database.transaction(async c=>{const {form}=await this.publicContext(c,formId);const bucket=this.digest('ip:'+ip);const rate=(await c.query("INSERT INTO intake_rate_limits(bucket_key,window_at,count) VALUES($1,to_timestamp(floor(extract(epoch FROM now())/900)*900),1) ON CONFLICT(bucket_key,window_at) DO UPDATE SET count=intake_rate_limits.count+1 RETURNING count",[bucket])).rows[0];if(rate.count>10)throw new ApiError(429,'CHAT_LIMIT','Too many conversations. Please try later.');const token=randomBytes(32).toString('hex');await c.query('INSERT INTO concierge_sessions(organization_id,form_id,token_digest) VALUES($1,$2,$3)',[form.organization_id,formId,this.digest(token)]);return{token};});
 }
 private async session(c:PoolClient,formId:string,token:string){const row=(await c.query('SELECT * FROM concierge_sessions WHERE form_id=$1 AND token_digest=$2 AND expires_at>clock_timestamp() FOR UPDATE',[formId,this.digest(token)])).rows[0];if(!row)throw new ApiError(410,'CHAT_EXPIRED','Start a new conversation.');return row;}
 private currentReplay(previous:any,context:{sources:AnswerSource[];units:any[]}){const valid=previous.sources.every((s:AnswerSource)=>context.sources.some(n=>n.id===s.id&&n.body===s.body&&n.version===s.version));return valid?{...previous,units:context.units}:{requestKey:previous.requestKey,question:previous.question,answer:'Information has changed. Please ask your question again.',sources:[],sourceIds:[],needsHuman:true,mode:previous.mode,units:context.units};}
 async ask(formId:string,i:z.infer<typeof conciergeQuestion>,fetcher:typeof fetch=fetch){
  const prepared=await this.database.transaction(async c=>{const s=await this.session(c,formId,i.token),context=await this.publicContext(c,formId,i.question);const previous=s.history.find((m:any)=>m.requestKey===i.requestKey);if(previous){if(previous.question!==i.question)throw stale();return{s,context,previous};}if(s.history.length>=12)throw new ApiError(429,'CHAT_LIMIT','Please send your question to the team or start a new conversation.');return{s,context,previous:null};});
  if(prepared.previous)return this.currentReplay(prepared.previous,prepared.context);
  const {s,context}=prepared;
  const run=await new AiWorkflowRunner(this.database,this.config,fetcher).run({organizationId:s.organization_id,actorId:null,propertyId:context.form.property_id},'concierge',i.requestKey,{sessionId:s.id,question:i.question,history:s.history.map((m:any)=>({question:m.question,answer:m.answer})),sources:context.sources},groundedAnswer,conciergeInstructions,()=>demoAnswer(context.sources,i.question));
  const answer=checkedAnswer(run.result,context.sources);
  return this.database.transaction(async c=>{const current=await this.session(c,formId,i.token),fresh=await this.publicContext(c,formId,i.question);const replay=current.history.find((m:any)=>m.requestKey===i.requestKey);if(replay)return this.currentReplay(replay,fresh);if(current.version!==s.version||fingerprint(fresh)!==fingerprint(context))throw stale();const entry={requestKey:i.requestKey,question:i.question,...answer,sources:context.sources.filter(x=>answer.sourceIds.includes(x.id)),mode:run.mode};await c.query('UPDATE concierge_sessions SET history=history||$2::jsonb,version=version+1 WHERE id=$1',[s.id,JSON.stringify([entry])]);if(answer.needsHuman)await c.query('INSERT INTO ai_knowledge_gaps(organization_id,property_id,question) VALUES($1,$2,$3)',[s.organization_id,context.form.property_id,i.question]);return{...entry,units:fresh.units};});
 }
 async handoff(formId:string,token:string,input:z.infer<typeof inquirySchema>,ip:string){const transcript=await this.database.transaction(async c=>{const s=await this.session(c,formId,token);await this.publicContext(c,formId);return s.history.slice(-6).map((m:any)=>'Visitor: '+m.question+'\nAssistant ('+m.mode+'): '+m.answer).join('\n\n').slice(0,3500);});return new IntakeService(this.database,this.config).submit(formId,{...input,message:(input.message.slice(0,1000)+'\n\nVisitor requested staff handoff. AI conversation for review:\n'+transcript).slice(0,5000)},ip);}
 async reply(u:AuthUser,d:string,conversationId:string,key:string,fetcher:typeof fetch=fetch){
  const prepare=()=>this.staff(u,d,async(c,a)=>{const co=await this.access(c,a,conversationId);const messages=(await c.query("SELECT id,body,version FROM conversation_messages WHERE conversation_id=$1 AND direction='inbound' ORDER BY created_at DESC,id DESC LIMIT 5",[co.id])).rows;const question=messages[0]?.body??'';return{propertyId:co.property_id,messages,...await answerSources(c,a.organization.id,co.property_id,question)};});
  const data=await prepare();if(!data.messages.length)throw new ApiError(409,'NO_QUESTION','This conversation has no incoming question.');
  const run=await new AiWorkflowRunner(this.database,this.config,fetcher).run({organizationId:u.organization.id,actorId:u.id,propertyId:data.propertyId},'reply',key,{messages:data.messages,sources:data.sources},groundedAnswer,conciergeInstructions+' Prepare an unsent customer-facing reply to the latest incoming question. Do not add names or contact details.',()=>demoAnswer(data.sources,data.messages[0].body));
  if(fingerprint(await prepare())!==fingerprint(data))throw stale();const result=checkedAnswer(run.result,data.sources);return{...run,result,sources:data.sources.filter(s=>result.sourceIds.includes(s.id))};
 }
}
