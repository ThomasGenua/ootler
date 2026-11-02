import type { PoolClient } from 'pg';
import {activityFeed} from './activity-feed.js';
import type { z } from 'zod';
import type { AuthUser, Permission } from '../../shared/contracts.js';
import type { Row, bulkAssignmentSchema, savedViewSchema, formSchema, ruleSchema, knowledgeSchema, templateSchema } from '../../shared/operations-contracts.js';
import type { Database } from '../db/pool.js';
import type { ServerConfig } from '../config/env.js';
import { ApiError } from '../http/errors.js';
import { staffOrganizationAccess } from './application-access.js';
import { LeadWorkspaces } from './lead-workspace.js';
import { eligibleOwner, leadScope, propertyScope, scopeArgs, propertyAccess, requireAdmin, missing, stale, operationEvent } from './operations-access.js';
export const actualLeadScope=(alias:string)=>leadScope(alias).replaceAll(alias+'.lead_id',alias+'.id');

export class Operations {
 constructor(public database:Database,public config:ServerConfig) {}
 async staff<T>(user:AuthUser,digest:string,fn:(c:PoolClient,actor:AuthUser)=>Promise<T>,permission:Permission='leasing.manage'):Promise<T>{
  return this.database.transaction(async c=>fn(c,await staffOrganizationAccess(c,this.config,user,digest,{permission})));
 }
 async options(user:AuthUser,digest:string,q:string,page:number){return this.staff(user,digest,async(c,a)=>{
  const properties=(await c.query(`SELECT p.id,p.name,count(*) OVER()::int AS total FROM properties p WHERE p.organization_id=$1 AND ($2='organization_admin' OR EXISTS(SELECT 1 FROM property_access_assignments pa WHERE pa.organization_id=p.organization_id AND pa.property_id=p.id AND pa.membership_id=$3)) AND strpos(lower(p.name),lower($4))>0 ORDER BY lower(p.name),p.id LIMIT 50 OFFSET $5`,[...scopeArgs(a),q,(page-1)*50])).rows;
  return{properties,propertyPage:page,propertyTotal:properties[0]?.total??0,canConfigure:a.organization.role==='organization_admin'};
 });}
 async list(user:AuthUser,digest:string,kind:'forms'|'rules'|'knowledge'|'templates'|'activity'|'runs'|'saved-views',q:string,page:number){return this.staff(user,digest,async(c,a)=>{
  if(kind==='activity')return activityFeed(c,a,q,page);
  const config={forms:{table:'intake_forms',filter:propertyScope('r'),search:'r.title',order:'r.created_at DESC,r.id'},rules:{table:'followup_rules',filter:propertyScope('r'),search:'r.name',order:'r.created_at DESC,r.id'},knowledge:{table:'property_knowledge',filter:propertyScope('r'),search:'r.title',order:'r.updated_at DESC,r.id'},templates:{table:'communication_templates',filter:'r.organization_id=$1 AND ($2::text IS NOT NULL) AND ($3::uuid IS NOT NULL)',search:'r.name',order:'r.updated_at DESC,r.id'},activity:{table:'operation_events',filter:leadScope('r'),search:"r.summary||' '||r.kind",order:'r.created_at DESC,r.id DESC'},runs:{table:'followup_runs',filter:`r.organization_id=$1 AND EXISTS(SELECT 1 FROM leads l WHERE l.id=r.lead_id AND ${actualLeadScope('l')})`,search:'r.reason',order:'r.created_at DESC,r.id'},'saved-views':{table:'saved_lead_views',filter:'r.organization_id=$1 AND r.user_id=$6 AND $2::text IS NOT NULL AND $3::uuid IS NOT NULL',search:'r.name',order:'r.created_at DESC,r.id'}}[kind];
  if(kind==='forms'||kind==='rules')requireAdmin(a);
  const args=[...scopeArgs(a),q,(page-1)*25,...(kind==='saved-views'?[a.id]:[])];
  const items=(await c.query(`SELECT r.*,count(*) OVER()::int AS total FROM ${config.table} r WHERE ${config.filter} AND strpos(lower(${config.search}),lower($4))>0 ORDER BY ${config.order} LIMIT 25 OFFSET $5`,args)).rows;
  return{items,page,total:items[0]?.total??0,pageSize:25};
 });}
 async saveForm(user:AuthUser,digest:string,id:string|null,input:z.infer<typeof formSchema>){return this.staff(user,digest,async(c,a)=>{
  requireAdmin(a);await propertyAccess(c,a,input.propertyId);await eligibleOwner(c,a.organization.id,input.ownerMembershipId,[input.propertyId]);
  const row=id?(await c.query('UPDATE intake_forms SET title=$3,enabled=$4,owner_membership_id=$5,embed_origins=$6,version=version+1 WHERE organization_id=$1 AND id=$2 AND version=$7 AND property_id=$8 RETURNING *',[a.organization.id,id,input.title,input.enabled,input.ownerMembershipId,input.embedOrigins,input.version,input.propertyId])).rows[0]:(await c.query('INSERT INTO intake_forms(organization_id,property_id,title,enabled,owner_membership_id,embed_origins,created_by) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *',[a.organization.id,input.propertyId,input.title,input.enabled,input.ownerMembershipId,input.embedOrigins,a.id])).rows[0];if(!row)throw stale();
  await operationEvent(c,a.organization.id,input.propertyId,null,a.id,'intake.configured',input.enabled?'Inquiry form enabled.':'Inquiry form disabled.');return row;
 });}
 async saveRule(user:AuthUser,digest:string,id:string|null,input:z.infer<typeof ruleSchema>){return this.staff(user,digest,async(c,a)=>{
  requireAdmin(a);await propertyAccess(c,a,input.propertyId);
  const values=[a.organization.id,input.propertyId,input.name,input.trigger,input.delayMinutes,input.enabled,input.taskTitle,input.draftBody,input.channel,a.id,a.membershipId];
  const row=id?(await c.query('UPDATE followup_rules SET name=$3,trigger=$4,delay_minutes=$5,enabled=$6,task_title=$7,draft_body=$8,channel=$9,created_by=$10,membership_id=$11,version=version+1 WHERE organization_id=$1 AND property_id=$2 AND id=$12 AND version=$13 RETURNING *',[...values,id,input.version])).rows[0]:(await c.query('INSERT INTO followup_rules(organization_id,property_id,name,trigger,delay_minutes,enabled,task_title,draft_body,channel,created_by,membership_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *',values)).rows[0];if(!row)throw stale();
  await operationEvent(c,a.organization.id,input.propertyId,null,a.id,'automation.configured','Follow-up rule '+(input.enabled?'enabled.':'disabled.'));return row;
 });}
 async saveKnowledge(user:AuthUser,digest:string,id:string|null,input:z.infer<typeof knowledgeSchema>){return this.staff(user,digest,async(c,a)=>{
  requireAdmin(a);await propertyAccess(c,a,input.propertyId);
  const values=[a.organization.id,input.propertyId,input.title,input.body,input.sourceUrl,input.published,a.id];
  const row=id?(await c.query('UPDATE property_knowledge SET title=$3,body=$4,source_url=$5,published=$6,public_answer=false,updated_by=$7,updated_at=now(),version=version+1 WHERE organization_id=$1 AND property_id=$2 AND id=$8 AND version=$9 RETURNING *',[...values,id,input.version])).rows[0]:(await c.query('INSERT INTO property_knowledge(organization_id,property_id,title,body,source_url,published,updated_by) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *',values)).rows[0];if(!row)throw stale();
  await operationEvent(c,a.organization.id,input.propertyId,null,a.id,'knowledge.updated','Property knowledge '+(input.published?'published.':'saved as a draft.'));return row;
 });}
 async saveTemplate(user:AuthUser,digest:string,id:string|null,input:z.infer<typeof templateSchema>){return this.staff(user,digest,async(c,a)=>{
  requireAdmin(a);const values=[a.organization.id,input.name,input.channel,input.subject,input.body,a.id];
  const row=id?(await c.query('UPDATE communication_templates SET name=$2,channel=$3,subject=$4,body=$5,created_by=$6,version=version+1,updated_at=now() WHERE organization_id=$1 AND id=$7 AND version=$8 RETURNING *',[...values,id,input.version])).rows[0]:(await c.query('INSERT INTO communication_templates(organization_id,name,channel,subject,body,created_by) VALUES($1,$2,$3,$4,$5,$6) RETURNING *',values)).rows[0];if(!row)throw stale();return row;
 });}
 async saveView(user:AuthUser,digest:string,input:z.infer<typeof savedViewSchema>){return this.staff(user,digest,async(c,a)=>{
  await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['saved-views:'+a.organization.id+':'+a.id]);
  if(!(await c.query('SELECT id FROM saved_lead_views WHERE organization_id=$1 AND user_id=$2 AND name=$3',[a.organization.id,a.id,input.name])).rowCount&&Number((await c.query('SELECT count(*) AS n FROM saved_lead_views WHERE organization_id=$1 AND user_id=$2',[a.organization.id,a.id])).rows[0].n)>=50)throw new ApiError(409,'VIEW_LIMIT','Remove an unused saved view before adding another.');
  return(await c.query('INSERT INTO saved_lead_views(organization_id,user_id,name,filters) VALUES($1,$2,$3,$4) ON CONFLICT(organization_id,user_id,name) DO UPDATE SET filters=$4 RETURNING *',[a.organization.id,a.id,input.name,JSON.stringify(input.filters)])).rows[0];
 });}
 async deleteView(user:AuthUser,digest:string,id:string){return this.staff(user,digest,async(c,a)=>{if(!(await c.query('DELETE FROM saved_lead_views WHERE organization_id=$1 AND user_id=$2 AND id=$3',[a.organization.id,a.id,id])).rowCount)throw missing();return{deleted:true};});}
 async bulkAssign(user:AuthUser,digest:string,input:z.infer<typeof bulkAssignmentSchema>){return this.staff(user,digest,async(c,a)=>{
  const rows:Row[]=[];const properties=new Set<string>();
  for(const selected of [...input.leads].sort((x,y)=>x.id.localeCompare(y.id))){
   const row=(await c.query('SELECT * FROM leads WHERE organization_id=$1 AND id=$2 FOR UPDATE',[a.organization.id,selected.id])).rows[0];if(!row)throw missing();if(row.version!==selected.version)throw stale();
   await new LeadWorkspaces(this.database).assertLeadAccess(a,row.id,c,true);rows.push(row);properties.add(row.property_id);
   for(const interest of (await c.query('SELECT property_id FROM lead_property_interests WHERE organization_id=$1 AND lead_id=$2 FOR SHARE',[a.organization.id,row.id])).rows)properties.add(interest.property_id);
  }
  await eligibleOwner(c,a.organization.id,input.ownerMembershipId,[...properties]);
  for(const row of rows){await c.query('UPDATE leads SET owner_membership_id=$3,version=version+1,updated_at=now() WHERE organization_id=$1 AND id=$2',[a.organization.id,row.id,input.ownerMembershipId]);await operationEvent(c,a.organization.id,row.property_id,row.id,a.id,'lead.assigned','Lead assignment updated in bulk.');}
  return{updated:rows.length};
 });}
 async search(user:AuthUser,digest:string,q:string,page:number){return this.staff(user,digest,async(c,a)=>{
  if(q.length<2)return{items:[],page,total:0,pageSize:25};
  const items=(await c.query(`WITH results AS (
   SELECT l.id,'lead' AS kind,l.display_name AS title,'/admin/leads?lead='||l.id AS url FROM leads l WHERE ${actualLeadScope('l')} AND strpos(lower(l.display_name||' '||l.email),lower($4))>0
   UNION ALL SELECT p.id,'property',p.name,'/admin/properties?property='||p.id FROM properties p WHERE p.organization_id=$1 AND ($2='organization_admin' OR EXISTS(SELECT 1 FROM property_access_assignments pa WHERE pa.organization_id=p.organization_id AND pa.property_id=p.id AND pa.membership_id=$3)) AND strpos(lower(p.name),lower($4))>0
   UNION ALL SELECT a.id,'application',co.display_name,'/admin/applications?application='||a.id FROM applications a JOIN contacts co ON co.id=a.contact_id WHERE ${leadScope('a')} AND strpos(lower(co.display_name),lower($4))>0
   UNION ALL SELECT co.id,'contact',co.display_name,'/admin/contacts?contact='||co.id FROM contacts co WHERE co.organization_id=$1 AND ($2='organization_admin' OR EXISTS(SELECT 1 FROM contact_property_links cp WHERE cp.contact_id=co.id AND ${propertyScope('cp')}) AND NOT EXISTS(SELECT 1 FROM contact_property_links cp WHERE cp.contact_id=co.id AND NOT (${propertyScope('cp')}))) AND strpos(lower(co.display_name||' '||co.email),lower($4))>0
   UNION ALL SELECT v.id,'tour',co.display_name||' · '||p.name,'/admin/calendar?viewing='||v.id FROM viewings v JOIN contacts co ON co.id=(SELECT contact_id FROM leads WHERE id=v.lead_id AND organization_id=v.organization_id) JOIN properties p ON p.id=v.property_id AND p.organization_id=v.organization_id WHERE ${leadScope('v')} AND strpos(lower(co.display_name||' '||p.name),lower($4))>0
   UNION ALL SELECT t.id,'task',t.title,'/admin/tasks?task='||t.id FROM tasks t WHERE ${leadScope('t')} AND strpos(lower(t.title),lower($4))>0
  ) SELECT *,count(*) OVER()::int AS total FROM results ORDER BY kind,lower(title),id LIMIT 25 OFFSET $5`,[...scopeArgs(a),q,(page-1)*25])).rows;
  return{items,page,total:items[0]?.total??0,pageSize:25};
 });}
}
