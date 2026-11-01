import {draftSchema} from '../../shared/operations-contracts.js';
import {createHash} from 'node:crypto';
import type {z} from 'zod';
import type {PoolClient} from 'pg';
import type {AuthUser} from '../../shared/contracts.js';
import type {ChatEntry,ChatCard,ChatProposal,chatRequestSchema,chatDecisionSchema} from '../../shared/assistant-chat-contracts.js';
import {taskCreateSchema} from '../../shared/task-contracts.js';
import type {Database} from '../db/pool.js';
import type {ServerConfig} from '../config/env.js';
import {ApiError} from '../http/errors.js';
import {staffOrganizationAccess} from './application-access.js';
import {leadScope,scopeArgs,operationEvent,stale,missing} from './operations-access.js';
import {LeadWorkspaces} from './lead-workspace.js';
import {AssistantService} from './assistant.js';
import {Tasks} from './tasks.js';
import {Inbox} from './inbox.js';
import {Calendar} from './calendar.js';
import {calendarQuerySchema} from '../../shared/calendar-contracts.js';
type Row=Record<string,any>;
const dto=(r:Row):ChatEntry=>({id:r.id,leadId:r.lead_id,question:r.question,answer:r.answer,cards:r.cards,proposal:r.proposal,decision:r.decision,version:r.version,createdAt:new Date(r.created_at).toISOString(),resultUrl:r.result_url,mode:r.mode});
export class AssistantChat {
 constructor(private database:Database,private config:ServerConfig){}
 private async visible(c:PoolClient,a:AuthUser,card:ChatCard){
  if(card.leadId)return Boolean((await c.query(`SELECT 1 FROM leads l WHERE ${leadScope('l').replaceAll('l.lead_id','l.id')} AND l.id=$4`,[...scopeArgs(a),card.leadId])).rowCount);
  return a.organization.role==='organization_admin'||Boolean((await c.query('SELECT 1 FROM property_access_assignments WHERE organization_id=$1 AND membership_id=$2 AND property_id=$3',[a.organization.id,a.membershipId,card.propertyId])).rowCount);
 }
 async history(user:AuthUser,digest:string){return this.database.transaction(async c=>{
  const a=await staffOrganizationAccess(c,this.config,user,digest,{permission:'leasing.manage'});
  const rows=(await c.query(`SELECT h.* FROM staff_assistant_chats h WHERE h.organization_id=$1 AND h.actor_user_id=$4 AND (h.lead_id IS NULL OR EXISTS(SELECT 1 FROM leads l WHERE l.id=h.lead_id AND ${leadScope('l').replaceAll('l.lead_id','l.id')})) ORDER BY h.created_at DESC,h.id DESC LIMIT 30`,[...scopeArgs(a),a.id])).rows;
  const items:ChatEntry[]=[];for(const row of rows){const entry=dto(row),visible:ChatCard[]=[];for(const card of entry.cards)if(await this.visible(c,a,card))visible.push(card);entry.cards=visible;items.push(entry);}return{items:items.reverse()};
 });}
 async generate(user:AuthUser,digest:string,input:z.infer<typeof chatRequestSchema>):Promise<ChatEntry>{
  const hash=createHash('sha256').update(JSON.stringify(input)).digest('hex');
  const prepared=await this.database.transaction(async c=>{
   const a=await staffOrganizationAccess(c,this.config,user,digest,{permission:'leasing.manage'});
   const lead=input.leadId?await new LeadWorkspaces(this.database).assertLeadAccess(a,input.leadId,c,true):null;
   const old=(await c.query('SELECT * FROM staff_assistant_chats WHERE organization_id=$1 AND actor_user_id=$2 AND request_key=$3',[a.organization.id,a.id,input.requestKey])).rows[0];
   if(old){if(old.payload_hash!==hash)throw stale();return{a,lead,old};}
   const recent=(await c.query("SELECT count(*)::int AS n FROM staff_assistant_chats WHERE organization_id=$1 AND actor_user_id=$2 AND created_at>now()-interval '1 hour'",[a.organization.id,a.id])).rows[0].n;if(recent>=60)throw new ApiError(429,'CHAT_LIMIT','Try again in a few minutes.');
   return{a,lead,old:null};
  });
  if(prepared.old){const history=await this.history(user,digest);const old=history.items.find(r=>r.id===prepared.old.id);if(!old)throw missing();return old;}
  let answer='',cards:ChatCard[]=[],proposal:ChatProposal|null=null,mode:ChatEntry['mode']='records';
  const question=input.question.toLowerCase(),lead=prepared.lead;
  if(lead){
   cards=[{kind:'lead',id:lead.id,leadId:lead.id,propertyId:lead.property_id,title:lead.display_name,subtitle:String(lead.pipeline_stage).replaceAll('_',' '),href:'/admin/leads?lead='+lead.id}];
   const draft=Boolean(input.draftBody)||/draft|reply|email|sms|message/.test(question),task=/create.*task|add.*task|remind me/.test(question);
   if(input.draftBody)answer='Review this reply before saving it as an unsent draft.';
   else {const result=await new AssistantService(this.database,this.config).generate(user,digest,{leadId:lead.id,requestKey:input.requestKey,action:draft?'follow_up':task||/next|prepare|viewing/.test(question)?'next_actions':/summari|summary/.test(question)?'summary':'answer',question:input.question});if(!result.result)throw new ApiError(409,'CHAT_PENDING','This answer is still being prepared. Try again shortly.');mode=result.mode;answer='**'+result.result.title+'**\n\n'+(result.editedBody??result.result.body)+'\n\n'+result.result.cautions.join('\n');if(draft)input={...input,draftBody:result.editedBody??result.result.body};}
   if(draft||task)proposal={kind:draft?'draft':'task',body:input.draftBody??'Review the lead and agree the next step.',title:'Follow up with '+lead.display_name,dueAt:new Date(Date.now()+86400000).toISOString(),channel:/sms/.test(question)?'sms':'email',subject:'Your property inquiry'};
  }else if(/tour|viewing/.test(question)){
   const result=await new Calendar(this.database,this.config).list(user,digest,calendarQuerySchema.parse({view:'agenda',upcoming:'true',status:'scheduled',pageSize:4}));
   answer=result.total?'Here are the next '+result.items.length+' of '+result.total+' scheduled tours.':'There are no upcoming tours.';cards=result.items.map(v=>({kind:'tour',id:v.id,leadId:v.lead.id,propertyId:v.property.id,title:v.lead.name,subtitle:v.property.name+' · '+new Date(v.startsAt).toLocaleString('en',{timeZone:v.timeZone??'Africa/Lagos',dateStyle:'medium',timeStyle:'short'}),href:'/admin/calendar?viewing='+v.id}));
  }else if(/task|follow.?up|attention|today/.test(question)){
   cards=await this.database.transaction(async c=>{const a=await staffOrganizationAccess(c,this.config,user,digest,{permission:'leasing.manage'});const rows=(await c.query(`SELECT t.id,t.title,t.property_id,t.lead_id,t.due_at,p.name FROM tasks t JOIN properties p ON p.id=t.property_id AND p.organization_id=t.organization_id WHERE ${leadScope('t')} AND t.status='open' AND t.due_at<((date_trunc('day',now() AT TIME ZONE 'Africa/Lagos')+interval '1 day') AT TIME ZONE 'Africa/Lagos') ORDER BY t.due_at,t.id LIMIT 6`,scopeArgs(a))).rows;return rows.map(t=>({kind:'task' as const,id:t.id,leadId:t.lead_id,propertyId:t.property_id,title:t.title,subtitle:t.name+' · Due '+new Date(t.due_at).toLocaleDateString('en',{timeZone:'Africa/Lagos'}),href:'/admin/tasks?task='+t.id}));});answer=cards.length?'These open tasks are due today or overdue. Open Tasks to see the full queue.':'No open tasks are due today or overdue.';
  }else answer='I can find upcoming tours and tasks due today. Select a lead for a summary, property question, reply draft, or new follow-up task.';
  return this.database.transaction(async c=>{
   const a=await staffOrganizationAccess(c,this.config,user,digest,{permission:'leasing.manage'});if(input.leadId)await new LeadWorkspaces(this.database).assertLeadAccess(a,input.leadId,c,true);
   for(const card of cards)if(!await this.visible(c,a,card))throw missing();
   const row=(await c.query('INSERT INTO staff_assistant_chats(organization_id,actor_user_id,lead_id,request_key,payload_hash,question,answer,cards,proposal,decision,mode) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT(organization_id,actor_user_id,request_key) DO NOTHING RETURNING *',[a.organization.id,a.id,input.leadId,input.requestKey,hash,input.question,answer,JSON.stringify(cards),proposal?JSON.stringify(proposal):null,proposal?'pending':null,mode])).rows[0];
   if(!row)throw new ApiError(409,'CHAT_REPLAY','This request has already completed. Reload the conversation.');
   await operationEvent(c,a.organization.id,lead?.property_id??null,lead?.id??null,a.id,proposal?'assistant.proposed':'assistant.answered',proposal?'Assistant action prepared for review.':'Assistant answer prepared.');return dto(row);
  });
 }
 async decide(user:AuthUser,digest:string,id:string,input:z.infer<typeof chatDecisionSchema>){return this.database.transaction(async c=>{
  const a=await staffOrganizationAccess(c,this.config,user,digest,{permission:'leasing.manage'});
  const initial=(await c.query('SELECT * FROM staff_assistant_chats WHERE id=$1 AND organization_id=$2 AND actor_user_id=$3',[id,a.organization.id,a.id])).rows[0];if(!initial?.lead_id)throw missing();
  const lead=await new LeadWorkspaces(this.database).assertLeadAccess(a,initial.lead_id,c,true);
  const row=(await c.query('SELECT * FROM staff_assistant_chats WHERE id=$1 FOR UPDATE',[id])).rows[0];if(!row.proposal)throw missing();
  if(row.decision!=='pending'){if(input.operation==='approve'&&row.decision==='approved'||input.operation==='skip'&&row.decision==='skipped')return dto(row);throw stale();}if(row.version!==input.version)throw stale();
  const proposal=row.proposal as ChatProposal;let resultUrl:string|null=null;
  if(input.operation==='edit'){for(const key of ['body','title','dueAt','channel','subject'] as const)if(input[key]!==undefined)(proposal as unknown as Record<string,unknown>)[key]=input[key];}
  else if(input.operation==='approve'){
   if(proposal.kind==='task'){const task=await new Tasks(this.database).createLinked(c,a,taskCreateSchema.parse({propertyId:lead.property_id,leadId:lead.id,title:proposal.title,details:proposal.body,dueAt:proposal.dueAt}),{namespace:'ai_follow_up',requestKey:'chat:'+id,origin:row.mode==='demo'?'ai_simulation':'system',purpose:'crm'});resultUrl='/admin/tasks?task='+task.id;}
   else{const inbox=new Inbox(this.database,this.config),conversation=await inbox.openLinked(c,a,lead.id);const draft=draftSchema.safeParse({requestKey:id,channel:proposal.channel,subject:proposal.subject,body:proposal.body});if(!draft.success)throw new ApiError(400,'INVALID_DRAFT','Shorten this reply before saving (SMS: 1,600 characters).');await inbox.draftLinked(c,a,conversation.id,draft.data);resultUrl='/admin/inbox?conversation='+conversation.id;}
  }
  const saved=(await c.query('UPDATE staff_assistant_chats SET proposal=$2,decision=$3,result_url=$4,version=version+1 WHERE id=$1 RETURNING *',[id,JSON.stringify(proposal),input.operation==='approve'?'approved':input.operation==='skip'?'skipped':'pending',resultUrl])).rows[0];
  await operationEvent(c,a.organization.id,lead.property_id,lead.id,a.id,'assistant.'+input.operation,'Assistant action '+(input.operation==='approve'?'approved and saved':input.operation==='edit'?'edited':'skipped')+'.');return dto(saved);
 });}
}
