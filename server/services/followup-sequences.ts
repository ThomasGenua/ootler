import {randomUUID} from 'node:crypto';
import type {z} from 'zod';
import type {AuthUser} from '../../shared/contracts.js';
import type {PoolClient} from 'pg';
import type {Row} from '../../shared/operations-contracts.js';
import {sequenceStepSchema,type sequenceSchema,type sequenceEnrollmentSchema,type versionActionSchema,type productivityQuery} from '../../shared/productivity-contracts.js';
import {taskCreateSchema} from '../../shared/task-contracts.js';
import {PropertyOperations,fail} from './property-operations-base.js';
import {requireAdmin,scopeArgs,propertyScope,propertyAccess,missing,stale} from './operations-access.js';
import {actualLeadScope} from './operations.js';
import {Tasks} from './tasks.js';
import {Inbox} from './inbox.js';
import {workflowActor} from './workflow-actor.js';
export class FollowupSequences extends PropertyOperations {
 async directory(u:AuthUser,d:string,q:z.infer<typeof productivityQuery>){return this.staff(u,d,async(c,a)=>({canConfigure:a.organization.role==='organization_admin',items:(await c.query(`SELECT s.id,s.name,s.property_id,s.steps,p.name AS property_name FROM followup_sequences s JOIN properties p ON p.id=s.property_id WHERE ${propertyScope('s')} ORDER BY s.created_at DESC,s.id LIMIT 25 OFFSET $4`,[...scopeArgs(a),(q.page-1)*25])).rows,page:q.page}));}
 async create(u:AuthUser,d:string,i:z.infer<typeof sequenceSchema>){return this.staff(u,d,async(c,a)=>{
  requireAdmin(a);await propertyAccess(c,a,i.propertyId);return this.receipt(c,a,'sequence:create',i,async()=>{const r=(await c.query('INSERT INTO followup_sequences(organization_id,property_id,name,steps,created_by,membership_id) VALUES($1,$2,$3,$4,$5,$6) RETURNING id',[a.organization.id,i.propertyId,i.name,JSON.stringify(i.steps),a.id,a.membershipId])).rows[0];await this.history(c,a,{id:r.id,property_id:i.propertyId},'sequence.created',{steps:i.steps.length});return r;});
 });}
 async detail(u:AuthUser,d:string,id:string,q:z.infer<typeof productivityQuery>){return this.staff(u,d,async(c,a)=>{
  const sequence=(await c.query(`SELECT s.* FROM followup_sequences s WHERE ${propertyScope('s')} AND s.id=$4`,[...scopeArgs(a),id])).rows[0];if(!sequence)throw missing();
  const enrollments=(await c.query(`SELECT e.*,l.display_name FROM sequence_enrollments e JOIN leads l ON l.id=e.lead_id WHERE ${actualLeadScope('l')} AND e.sequence_id=$4 ORDER BY e.started_at DESC,e.id LIMIT 50 OFFSET $5`,[...scopeArgs(a),id,(q.page-1)*50])).rows;
  const candidates=(await c.query(`SELECT l.id,l.display_name,l.pipeline_stage FROM leads l WHERE ${actualLeadScope('l')} AND l.property_id=$4 AND l.pipeline_stage NOT IN ('leased','won','lost_closed') AND NOT EXISTS(SELECT 1 FROM sequence_enrollments e WHERE e.lead_id=l.id AND e.sequence_id=$5) AND strpos(lower(l.display_name),lower($6))>0 ORDER BY l.created_at,l.id LIMIT 50`,[...scopeArgs(a),sequence.property_id,id,q.q])).rows;
  return{sequence,enrollments,candidates,canConfigure:a.organization.role==='organization_admin',page:q.page};
 });}
 async enroll(u:AuthUser,d:string,id:string,i:z.infer<typeof sequenceEnrollmentSchema>){return this.staff(u,d,async(c,a)=>{
  requireAdmin(a);const s=(await c.query('SELECT * FROM followup_sequences WHERE id=$1 AND organization_id=$2',[id,a.organization.id])).rows[0];if(!s)throw missing();await propertyAccess(c,a,s.property_id);
  return this.receipt(c,a,'sequence:enroll:'+id,i,async()=>{
   for(const leadId of [...i.leadIds].sort()){const l=await this.lead(c,a,leadId);if(l.property_id!==s.property_id||['leased','won','lost_closed'].includes(l.pipeline_stage))fail('Choose active leads at the sequence property.');if((await c.query('SELECT 1 FROM sequence_enrollments WHERE sequence_id=$1 AND lead_id=$2',[id,l.id])).rowCount)fail('A selected lead is already enrolled. Refresh the preview.');await c.query("INSERT INTO sequence_enrollments(sequence_id,lead_id,start_stage,next_at,status) VALUES($1,$2,$3,now()+$4*interval '1 hour','active')",[id,l.id,l.pipeline_stage,s.steps[0].delayHours]);}
   await this.history(c,a,{id,property_id:s.property_id},'sequence.activated',{leadIds:i.leadIds});return{enrolled:i.leadIds.length};
  });
 });}
 async control(u:AuthUser,d:string,id:string,i:z.infer<typeof versionActionSchema>){return this.staff(u,d,async(c,a)=>{
  requireAdmin(a);const raw=(await c.query('SELECT e.* FROM sequence_enrollments e JOIN followup_sequences s ON s.id=e.sequence_id WHERE e.id=$1 AND s.organization_id=$2',[id,a.organization.id])).rows[0];if(!raw)throw missing();const l=await this.lead(c,a,raw.lead_id);
  return this.receipt(c,a,'sequence:control:'+id,i,async()=>{const r=(await c.query('SELECT * FROM sequence_enrollments WHERE id=$1 FOR UPDATE',[id])).rows[0];if(r.version!==i.version)throw stale();if(['stopped','completed'].includes(r.status))fail('This enrollment has ended.');if(i.action==='resume'&&r.status!=='paused'||i.action==='pause'&&r.status!=='active')fail('Refresh the current enrollment status.');
   if(i.action==='stop')await this.stop(c,r,'Stopped by staff.');else await c.query('UPDATE sequence_enrollments SET status=$2,version=version+1 WHERE id=$1',[id,i.action==='pause'?'paused':'active']);await this.history(c,a,{id,property_id:l.property_id,lead_id:l.id},'sequence.'+i.action,{});return{saved:true};});
 });}
 private async stop(c:PoolClient,e:Row,reason:string){
  await c.query("UPDATE sequence_enrollments SET status='stopped',stop_reason=$2,version=version+1 WHERE id=$1",[e.id,reason]);
  await c.query("UPDATE tasks SET status='cancelled',version=version+1,updated_at=now() WHERE status='open' AND version=1 AND id IN(SELECT task_id FROM sequence_step_runs WHERE enrollment_id=$1)",[e.id]);
  await c.query("UPDATE conversation_messages SET status='cancelled',version=version+1,updated_at=now() WHERE status='draft' AND version=1 AND id IN(SELECT draft_id FROM sequence_step_runs WHERE enrollment_id=$1)",[e.id]);
 }
 async run(u:AuthUser,d:string){const org=await this.staff(u,d,async(_c,a)=>{requireAdmin(a);return a.organization.id;});return this.tick(org);}
 async tick(org?:string){
  const candidates=(await this.database.query("SELECT e.id FROM sequence_enrollments e JOIN followup_sequences s ON s.id=e.sequence_id WHERE e.status IN ('active','paused','completed') AND ($1::uuid IS NULL OR s.organization_id=$1) ORDER BY (e.status='active' AND e.next_at<=now()) DESC,e.last_checked_at NULLS FIRST,e.next_at,e.id LIMIT 100",[org??null])).rows;
  let created=0,stopped=0;
  for(const candidate of candidates){const outcome=await this.database.transaction(async c=>{
   const raw=(await c.query('SELECT e.lead_id FROM sequence_enrollments e WHERE e.id=$1',[candidate.id])).rows[0];if(!raw)return 'skipped';
   if(!(await c.query('SELECT id FROM leads WHERE id=$1 FOR UPDATE SKIP LOCKED',[raw.lead_id])).rowCount)return 'skipped';
   const e=(await c.query("SELECT e.*,s.organization_id,s.property_id,s.steps,s.created_by,s.membership_id,s.name FROM sequence_enrollments e JOIN followup_sequences s ON s.id=e.sequence_id WHERE e.id=$1 AND e.status IN ('active','paused','completed') FOR UPDATE OF e SKIP LOCKED",[candidate.id])).rows[0];if(!e)return 'skipped';
   await c.query('UPDATE sequence_enrollments SET last_checked_at=clock_timestamp() WHERE id=$1',[e.id]);
   const a=await workflowActor(c,this.config,e.organization_id,e.membership_id,e.created_by);let reason=!a||a.organization.role!=='organization_admin'?'Sequence administrator is unavailable.':'';
   const l=(await c.query('SELECT * FROM leads WHERE id=$1',[e.lead_id])).rows[0];
   if(l.property_id!==e.property_id||l.pipeline_stage!==e.start_stage||['leased','won','lost_closed'].includes(l.pipeline_stage)||(await c.query("SELECT 1 FROM lead_events WHERE lead_id=$1 AND kind='stage_changed' AND occurred_at>$2 LIMIT 1",[l.id,e.started_at])).rowCount)reason='Lead progressed or closed.';
   if((await c.query("SELECT 1 FROM conversations co JOIN conversation_messages m ON m.conversation_id=co.id WHERE co.lead_id=$1 AND m.direction='inbound' AND m.created_at>$2 LIMIT 1",[l.id,e.started_at])).rowCount)reason='Prospect replied.';
   const step=sequenceStepSchema.parse(e.steps[Math.min(e.step,e.steps.length-1)]);
   if((await c.query('SELECT 1 FROM contact_communication_preferences WHERE organization_id=$1 AND contact_id=$2 AND channel=$3 AND NOT allowed',[e.organization_id,l.contact_id,step.channel])).rowCount)reason='Prospect opted out of this channel.';
   if(reason){await this.stop(c,e,reason);return 'stopped';}if(e.status==='paused'||e.status==='completed'||new Date(e.next_at)>new Date())return 'skipped';
   const task=await new Tasks(this.database).createLinked(c,a!,taskCreateSchema.parse({propertyId:l.property_id,leadId:l.id,title:step.title,details:'Sequence: '+e.name+' · Step '+(e.step+1),dueAt:new Date().toISOString(),assignment:'routing'}),{namespace:'leasing_workflow',requestKey:'sequence:'+e.id+':'+e.step,origin:'system',purpose:'crm'});
   let draftId:string|null=null;if(step.body){const inbox=new Inbox(this.database,this.config),co=await inbox.openLinked(c,a!,l.id);const draft=await inbox.draftLinked(c,a!,co.id,{requestKey:randomUUID(),channel:step.channel,subject:step.title,body:step.body});draftId=draft.id;}
   await c.query('INSERT INTO sequence_step_runs(enrollment_id,step,task_id,draft_id) VALUES($1,$2,$3,$4)',[e.id,e.step,task.id,draftId]);
   const next=e.step+1,done=next===e.steps.length;await c.query("UPDATE sequence_enrollments SET step=$2,status=$3,next_at=now()+$4*interval '1 hour',version=version+1 WHERE id=$1",[e.id,next,done?'completed':'active',done?0:e.steps[next].delayHours]);await this.history(c,a!,{id:e.id,property_id:l.property_id,lead_id:l.id},'sequence.step_created',{step:e.step,taskId:task.id,draftId});return 'created';
  });if(outcome==='created')created++;if(outcome==='stopped')stopped++;}
  return{created,stopped,checked:candidates.length};
 }
}
