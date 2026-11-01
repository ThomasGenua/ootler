import {randomUUID} from 'node:crypto';
import type {z} from 'zod';
import type {AuthUser} from '../../shared/contracts.js';
import {dashboardTiles,type productivityQuery,type feedbackSchema,type dashboardPreferenceSchema} from '../../shared/productivity-contracts.js';
import {taskCreateSchema} from '../../shared/task-contracts.js';
import {PropertyOperations,fail} from './property-operations-base.js';
import {leadScope,scopeArgs,propertyAccess,missing,stale} from './operations-access.js';
import {actualLeadScope} from './operations.js';
import {activityFeed} from './activity-feed.js';
import {loadDashboard} from './dashboard.js';
import {Tasks} from './tasks.js';
import {Inbox} from './inbox.js';
type Query=z.infer<typeof productivityQuery>;
export class LeasingProductivity extends PropertyOperations {
 async dashboard(user:AuthUser,digest:string,q:Query){return this.staff(user,digest,async(c,a)=>{if(q.propertyId)await propertyAccess(c,a,q.propertyId);const filter={propertyId:q.propertyId,ownerMembershipId:q.owner==='me'?a.membershipId:undefined};return{dashboard:await loadDashboard({query:(sql:string,values:unknown[])=>c.query(sql,values)},a,'month',filter),activity:await activityFeed(c,a,'',1,filter)};});}
 async feedback(user:AuthUser,digest:string,id:string){return this.staff(user,digest,async(c,a)=>{
  const viewing=(await c.query(`SELECT v.*,l.display_name,p.name AS property_name FROM viewings v JOIN leads l ON l.id=v.lead_id JOIN properties p ON p.id=v.property_id WHERE ${leadScope('v')} AND v.id=$4`,[...scopeArgs(a),id])).rows[0];if(!viewing)throw missing();
  const feedback=(await c.query('SELECT * FROM tour_feedback WHERE viewing_id=$1',[id])).rows[0]??null;
  return{viewing,feedback,suggestion:{title:viewing.status==='no_show'?'Arrange another viewing for '+viewing.display_name:'Follow up after viewing with '+viewing.display_name,body:viewing.status==='no_show'?'We missed you at the viewing. Would you like us to arrange another time?':'Thank you for viewing '+viewing.property_name+'. What did you think, and would you like help with the next step?'}};
 });}
 async saveFeedback(user:AuthUser,digest:string,id:string,input:z.infer<typeof feedbackSchema>){return this.staff(user,digest,async(c,a)=>{
  const v=(await c.query(`SELECT v.* FROM viewings v WHERE ${leadScope('v')} AND v.id=$4`,[...scopeArgs(a),id])).rows[0];if(!v)throw missing();
  const l=await this.lead(c,a,v.lead_id);await c.query('SELECT id FROM viewings WHERE id=$1 FOR UPDATE',[id]);
  return this.receipt(c,a,'tour-feedback:'+id,input,async()=>{
   const current=(await c.query('SELECT * FROM viewings WHERE id=$1',[id])).rows[0];if(!['completed','no_show'].includes(current.status))fail('Record completion or a no-show in Calendar before writing follow-up.');
   if((current.status==='no_show')!==(input.interest==='not_attended'))fail('Use Not attended for a no-show, or record the attended tour outcome.');
   const old=(await c.query('SELECT * FROM tour_feedback WHERE viewing_id=$1 FOR UPDATE',[id])).rows[0];if((old?.version??0)!==input.version)throw stale();
   let taskId=old?.task_id??null,draftId=old?.draft_id??null,conversationId:string|null=null;
   if(input.createTask){if(taskId)fail('This viewing already has a follow-up task. Open that task to update it.');const task=await new Tasks(this.database).createLinked(c,a,taskCreateSchema.parse({propertyId:l.property_id,leadId:l.id,title:input.title,details:input.notes,dueAt:input.dueAt,ownerMembershipId:l.owner_membership_id}),{namespace:'leasing_workflow',requestKey:'feedback:'+id,origin:'system',purpose:'crm'});taskId=task.id;}
   if(input.createDraft){if(draftId)fail('A follow-up draft already exists. Edit it in Messages.');const inbox=new Inbox(this.database,this.config),co=await inbox.openLinked(c,a,l.id),draft=await inbox.draftLinked(c,a,co.id,{requestKey:randomUUID(),channel:'email',subject:input.title,body:input.body});draftId=draft.id;conversationId=co.id;}
   const saved=(await c.query('INSERT INTO tour_feedback(viewing_id,organization_id,interest,next_step,notes,task_id,draft_id,updated_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(viewing_id) DO UPDATE SET interest=$3,next_step=$4,notes=$5,task_id=$6,draft_id=$7,updated_by=$8,updated_at=now(),version=tour_feedback.version+1 RETURNING *',[id,a.organization.id,input.interest,input.nextStep,input.notes,taskId,draftId,a.id])).rows[0];
   await this.history(c,a,{...v,id},'tour.feedback',{interest:input.interest,nextStep:input.nextStep,taskId,draftId});return{feedback:saved,conversationId};
  });
 });}
 async preferences(user:AuthUser,digest:string){return this.staff(user,digest,async(c,a)=>{
  const row=(await c.query('SELECT * FROM dashboard_preferences WHERE organization_id=$1 AND user_id=$2',[a.organization.id,a.id])).rows[0];
  let propertyId=row?.property_id??null;if(propertyId){try{await propertyAccess(c,a,propertyId);}catch{propertyId=null;}}
  return{version:row?.version??0,propertyId,owner:row?.owner_scope??'team',tiles:row?.tiles??[...dashboardTiles]};
 });}
 async savePreferences(user:AuthUser,digest:string,i:z.infer<typeof dashboardPreferenceSchema>){return this.staff(user,digest,async(c,a)=>{
  await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['dashboard:'+a.organization.id+':'+a.id]);if(i.propertyId)await propertyAccess(c,a,i.propertyId);
  const old=(await c.query('SELECT version FROM dashboard_preferences WHERE organization_id=$1 AND user_id=$2',[a.organization.id,a.id])).rows[0];if((old?.version??0)!==i.version)throw stale();
  await c.query('INSERT INTO dashboard_preferences(organization_id,user_id,property_id,owner_scope,tiles,version) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(organization_id,user_id) DO UPDATE SET property_id=$3,owner_scope=$4,tiles=$5,version=$6',[a.organization.id,a.id,i.propertyId,i.owner,JSON.stringify(i.tiles),i.version+1]);return{...i,version:i.version+1};
 });}
 async workload(user:AuthUser,digest:string,q:Query){return this.staff(user,digest,async(c,a)=>{
  if(q.propertyId)await propertyAccess(c,a,q.propertyId);
  const args=[...scopeArgs(a),q.propertyId??null,q.owner==='me'?a.membershipId:null],filter=(alias:string)=>` AND ($4::uuid IS NULL OR ${alias}.property_id=$4) AND ($5::uuid IS NULL OR ${alias}.owner_membership_id=$5)`;
  const items=(await c.query(`WITH counts AS (
   SELECT l.owner_membership_id AS owner,'lead' AS kind,false AS overdue FROM leads l WHERE ${actualLeadScope('l')}${filter('l')} AND l.pipeline_stage NOT IN ('leased','won','lost_closed')
   UNION ALL SELECT t.owner_membership_id,'task',t.due_at<now() FROM tasks t WHERE ${leadScope('t')}${filter('t')} AND t.status='open'
   UNION ALL SELECT v.owner_membership_id,'tour',false FROM viewings v WHERE ${leadScope('v')}${filter('v')} AND v.status='scheduled' AND v.starts_at>=now() AND v.starts_at<now()+interval '7 days'
  ) SELECT owner AS membership_id,coalesce(u.display_name,'Unassigned') AS name,count(*) FILTER(WHERE kind='lead')::int AS leads,count(*) FILTER(WHERE kind='task')::int AS tasks,count(*) FILTER(WHERE overdue)::int AS overdue,count(*) FILTER(WHERE kind='tour')::int AS tours FROM counts LEFT JOIN organization_memberships m ON m.id=owner LEFT JOIN users u ON u.id=m.user_id GROUP BY owner,u.display_name ORDER BY count(*) FILTER(WHERE overdue) DESC,count(*) DESC,owner`,args)).rows;
  const leads=(await c.query(`SELECT l.id,l.display_name,l.version,l.owner_membership_id,l.property_id,p.name AS property_name FROM leads l JOIN properties p ON p.id=l.property_id WHERE ${actualLeadScope('l')}${filter('l')} AND l.pipeline_stage NOT IN ('leased','won','lost_closed') AND strpos(lower(l.display_name),lower($6))>0 ORDER BY l.updated_at,l.id LIMIT 50 OFFSET $7`,[...args,q.q,(q.page-1)*50])).rows;
  return{items,leads,page:q.page};
 });}
 async insights(user:AuthUser,digest:string,q:Query){return this.staff(user,digest,async(c,a)=>{
  if(q.propertyId)await propertyAccess(c,a,q.propertyId);
  const args=[...scopeArgs(a),q.propertyId??null,q.days,q.owner==='me'?a.membershipId:null];
  const cohort=`${actualLeadScope('l')} AND ($4::uuid IS NULL OR l.property_id=$4) AND ($6::uuid IS NULL OR l.owner_membership_id=$6)`;
  const periods=(await c.query(`WITH cohort AS (SELECT l.*,CASE WHEN l.created_at>=now()-$5*interval '1 day' THEN 'current' ELSE 'previous' END AS period FROM leads l WHERE ${cohort} AND l.created_at>=now()-2*$5*interval '1 day' AND l.created_at<=now())
   SELECT period,count(*)::int AS leads,count(*) FILTER(WHERE EXISTS(SELECT 1 FROM viewings v WHERE v.lead_id=l.id AND v.status<>'cancelled'))::int AS toured,count(*) FILTER(WHERE EXISTS(SELECT 1 FROM applications a WHERE a.lead_id=l.id))::int AS applications,count(*) FILTER(WHERE EXISTS(SELECT 1 FROM applications a JOIN lease_workflows w ON w.application_id=a.id AND w.signature_verified_at IS NOT NULL WHERE a.lead_id=l.id))::int AS signed,count(*) FILTER(WHERE pipeline_stage='lost_closed')::int AS lost FROM cohort l GROUP BY period`,args)).rows;
  const stages=(await c.query(`WITH events AS (SELECT e.lead_id,e.stage,e.occurred_at,lead(e.occurred_at) OVER(PARTITION BY e.lead_id ORDER BY e.occurred_at,e.id) AS until FROM lead_events e JOIN leads l ON l.id=e.lead_id WHERE ${cohort} AND e.kind='stage_changed') SELECT stage,count(*)::int AS observed_transitions,round(avg(extract(epoch FROM until-occurred_at)/86400)::numeric,2) AS average_days FROM events WHERE until IS NOT NULL AND occurred_at>=now()-$5*interval '1 day' GROUP BY stage ORDER BY stage`,args)).rows;
  const tours=(await c.query(`SELECT count(*) FILTER(WHERE v.status='completed')::int AS completed,count(*) FILTER(WHERE v.status='no_show')::int AS no_shows FROM viewings v JOIN leads l ON l.id=v.lead_id WHERE ${cohort} AND v.starts_at>=now()-$5*interval '1 day' AND v.starts_at<=now()`,args)).rows[0];
  const records=(await c.query(`SELECT l.id,l.display_name,l.pipeline_stage,EXTRACT(epoch FROM now()-entered.occurred_at)/86400 AS stage_days,ns.id AS no_show_id FROM leads l LEFT JOIN LATERAL(SELECT e.occurred_at FROM lead_events e WHERE e.lead_id=l.id AND e.kind='stage_changed' AND e.stage=l.pipeline_stage ORDER BY e.occurred_at DESC,e.id DESC LIMIT 1) entered ON true LEFT JOIN LATERAL(SELECT v.id FROM viewings v WHERE v.lead_id=l.id AND v.status='no_show' AND v.starts_at>=now()-$5*interval '1 day' ORDER BY v.starts_at DESC LIMIT 1) ns ON true WHERE ${cohort} AND (ns.id IS NOT NULL OR (l.pipeline_stage='lost_closed' AND l.updated_at>=now()-$5*interval '1 day') OR (l.pipeline_stage NOT IN ('leased','won','lost_closed') AND entered.occurred_at<now()-interval '7 days')) ORDER BY l.updated_at,l.id LIMIT 50 OFFSET $7`,[...args,(q.page-1)*50])).rows;
  return{days:q.days,periods,stages,tours,records,page:q.page,notice:'Equal lead-creation cohorts; outcomes are observed as of today. Older cohorts have had more time to convert. Stage durations include only recorded transitions with an observed exit.'};
 });}
}
