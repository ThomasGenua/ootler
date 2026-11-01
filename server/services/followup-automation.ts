import type { PoolClient } from 'pg';
import { randomUUID } from 'node:crypto';
import type { AuthUser } from '../../shared/contracts.js';
import { taskCreateSchema } from '../../shared/task-contracts.js';
import type { Row } from '../../shared/operations-contracts.js';
import { Operations } from './operations.js';
import { Tasks } from './tasks.js';
import { requireAdmin,operationEvent } from './operations-access.js';
import { isIsolatedDemo } from './demo-environment.js';

export class FollowupAutomation extends Operations {
 async run(user:AuthUser,digest:string){return this.staff(user,digest,async(c,a)=>{requireAdmin(a);return this.process(c,a.organization.id);});}
 async tick(){return this.database.transaction(c=>this.process(c));}
 private async process(c:PoolClient,organizationId?:string){
  const isolated=await isIsolatedDemo(this.config,c);if(this.config.demoMode&&!isolated)return{created:0,stopped:0};
  const rules=(await c.query("SELECT r.*,u.display_name,u.email,m.role,m.active AS membership_active,u.active AS user_active,o.name AS organization_name,o.environment FROM followup_rules r JOIN organization_memberships m ON m.id=r.membership_id AND m.user_id=r.created_by JOIN users u ON u.id=r.created_by AND u.account_kind='staff' JOIN organizations o ON o.id=r.organization_id WHERE ($1::uuid IS NULL OR r.organization_id=$1) ORDER BY r.last_checked_at NULLS FIRST,r.id LIMIT 100 FOR UPDATE OF r SKIP LOCKED",[organizationId??null])).rows;
  let created=0,stopped=0;
  for(const rule of rules){
   const eligible=rule.enabled&&rule.membership_active&&rule.user_active&&rule.role==='organization_admin'&&(rule.environment==='demo'?isolated:!this.config.demoMode);
   await c.query('UPDATE followup_rules SET last_checked_at=clock_timestamp() WHERE id=$1',[rule.id]);
   const runs=(await c.query('SELECT run.*,l.pipeline_stage FROM followup_runs run JOIN leads l ON l.id=run.lead_id WHERE run.rule_id=$1 AND run.status=\'created\' ORDER BY run.last_checked_at NULLS FIRST,run.id LIMIT 500 FOR UPDATE OF run',[rule.id])).rows;
   for(const run of runs){
    const reason=!eligible?'Rule disabled or its administrator is unavailable.':['leased','won','lost_closed'].includes(run.pipeline_stage)?'Lead closed.':await this.stopReason(c,rule,run);
    await c.query('UPDATE followup_runs SET last_checked_at=clock_timestamp() WHERE id=$1',[run.id]);
    if(!reason)continue;
    await c.query("UPDATE followup_runs SET status='stopped',reason=$2 WHERE id=$1",[run.id,reason]);
    if(run.task_id)await c.query("UPDATE tasks SET status='cancelled',version=version+1,updated_at=now() WHERE id=$1 AND status='open'",[run.task_id]);
    if(run.message_id)await c.query("UPDATE conversation_messages SET status='cancelled',version=version+1,updated_at=now() WHERE id=$1 AND status='draft' AND version=1",[run.message_id]);stopped++;
   }
   if(!eligible)continue;
   const a:AuthUser={id:rule.created_by,name:rule.display_name,email:rule.email,membershipId:rule.membership_id,sessionExpiresAt:'',permissions:['leasing.manage'],organization:{id:rule.organization_id,name:rule.organization_name,role:'organization_admin'}};
   const sql=rule.trigger==='unanswered_inquiry'?`SELECT l.*,co.id AS conversation_id,(SELECT m.id FROM conversation_messages m WHERE m.conversation_id=co.id AND m.direction='inbound' ORDER BY m.created_at DESC,m.id DESC LIMIT 1)::text AS trigger_key FROM conversations co JOIN leads l ON l.id=co.lead_id WHERE co.organization_id=$1 AND co.property_id=$2 AND co.status='open' AND EXISTS(SELECT 1 FROM conversation_messages m WHERE m.id=(SELECT latest.id FROM conversation_messages latest WHERE latest.conversation_id=co.id AND latest.direction='inbound' ORDER BY latest.created_at DESC,latest.id DESC LIMIT 1) AND m.created_at<=now()-($3::int*interval '1 minute') AND NOT EXISTS(SELECT 1 FROM conversation_messages reply WHERE reply.conversation_id=co.id AND reply.direction='outbound' AND reply.status IN ('accepted','delivered','simulated') AND reply.sent_at>=m.created_at))`
    :rule.trigger==='upcoming_tour'?`SELECT l.*,v.id::text AS trigger_key,v.id AS tour_id FROM viewings v JOIN leads l ON l.id=v.lead_id WHERE v.organization_id=$1 AND v.property_id=$2 AND v.status='scheduled' AND v.starts_at>now() AND v.starts_at<=now()+($3::int*interval '1 minute')`
    :`SELECT l.*,ap.id::text AS trigger_key,ap.id AS application_id FROM applications ap JOIN leads l ON l.id=ap.lead_id WHERE ap.organization_id=$1 AND ap.property_id=$2 AND ap.portal_enabled AND ap.status='draft' AND ap.created_at<=now()-($3::int*interval '1 minute')`;
   const leads=(await c.query('SELECT candidate.* FROM ('+sql+" AND l.pipeline_stage NOT IN ('leased','won','lost_closed')) candidate WHERE NOT EXISTS(SELECT 1 FROM followup_runs prior WHERE prior.rule_id=$4 AND prior.trigger_key=candidate.trigger_key) ORDER BY candidate.id LIMIT 100",[rule.organization_id,rule.property_id,rule.delay_minutes,rule.id])).rows;
   for(const lead of leads){if(!lead.trigger_key||(await c.query('SELECT 1 FROM followup_runs WHERE rule_id=$1 AND trigger_key=$2',[rule.id,lead.trigger_key])).rowCount)continue;
    await c.query('SELECT id FROM leads WHERE id=$1 FOR SHARE',[lead.id]);
    const run=(await c.query("INSERT INTO followup_runs(organization_id,rule_id,lead_id,trigger_key,status) VALUES($1,$2,$3,$4,'created') ON CONFLICT DO NOTHING RETURNING id",[rule.organization_id,rule.id,lead.id,lead.trigger_key])).rows[0];if(!run)continue;
    const task=await new Tasks(this.database).createLinked(c,a,taskCreateSchema.parse({propertyId:lead.property_id,leadId:lead.id,contactId:lead.contact_id,applicationId:lead.application_id??null,tourId:lead.tour_id??null,title:rule.task_title,details:'Follow-up rule: '+rule.name,dueAt:new Date().toISOString(),assignment:'routing'}),{namespace:'ai_follow_up',requestKey:'rule:'+run.id,origin:'system',purpose:'crm'});
    let messageId:string|null=null;
    if(rule.draft_body){const co=(await c.query('INSERT INTO conversations(organization_id,property_id,lead_id) VALUES($1,$2,$3) ON CONFLICT(organization_id,lead_id) DO UPDATE SET lead_id=EXCLUDED.lead_id RETURNING id',[rule.organization_id,lead.property_id,lead.id])).rows[0];messageId=(await c.query("INSERT INTO conversation_messages(organization_id,conversation_id,request_key,direction,channel,body,status,created_by) VALUES($1,$2,$3,'outbound',$4,$5,'draft',$6) RETURNING id",[rule.organization_id,co.id,randomUUID(),rule.channel,rule.draft_body,a.id])).rows[0].id;}
    await c.query('UPDATE followup_runs SET task_id=$2,message_id=$3 WHERE id=$1',[run.id,task.id,messageId]);await operationEvent(c,a.organization.id,lead.property_id,lead.id,a.id,'automation.created','Follow-up rule created a task'+(messageId?' and a reply draft.':'.'));created++;
   }
  }return{created,stopped};
 }
 private async stopReason(c:PoolClient,rule:Row,run:Row):Promise<string|null>{
  if(rule.trigger==='unanswered_inquiry'){
   const inbound=(await c.query('SELECT conversation_id,created_at FROM conversation_messages WHERE id::text=$1',[run.trigger_key])).rows[0];if(!inbound)return'Inquiry unavailable.';
   const closed=(await c.query("SELECT 1 FROM conversations WHERE id=$1 AND status='closed'",[inbound.conversation_id])).rowCount;
   const reply=(await c.query("SELECT 1 FROM conversation_messages WHERE conversation_id=$1 AND direction='outbound' AND status IN ('accepted','delivered','simulated') AND sent_at>=$2 LIMIT 1",[inbound.conversation_id,inbound.created_at])).rowCount;return closed?'Conversation closed.':reply?'Inquiry answered.':null;
  }
  if(rule.trigger==='upcoming_tour'){const tour=(await c.query('SELECT status,starts_at FROM viewings WHERE id::text=$1',[run.trigger_key])).rows[0];return!tour||tour.status!=='scheduled'||tour.starts_at<=new Date()?'Tour cancelled, completed or elapsed.':null;}
  const application=(await c.query('SELECT status,portal_enabled FROM applications WHERE id::text=$1',[run.trigger_key])).rows[0];return!application||!application.portal_enabled||application.status!=='draft'?'Application submitted or portal disabled.':null;
 }
}
export function startFollowupAutomation(service:Pick<FollowupAutomation,'tick'>){let stopped=false,running:Promise<unknown>|undefined;const tick=()=>{if(stopped||running)return;running=service.tick().catch(()=>console.error('Follow-up processing failed; no provider request was made.')).finally(()=>{running=undefined;});};const timer=setInterval(tick,60000);timer.unref();return async()=>{stopped=true;clearInterval(timer);await running;};}
