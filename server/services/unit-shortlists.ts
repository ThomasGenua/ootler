import {createHash,createHmac} from 'node:crypto';
import type {z} from 'zod';
import type {PoolClient} from 'pg';
import type {AuthUser} from '../../shared/contracts.js';
import type {shortlistCreateSchema,shortlistResponseSchema,productivityQuery} from '../../shared/productivity-contracts.js';
import {taskCreateSchema} from '../../shared/task-contracts.js';
import {PropertyOperations,fail} from './property-operations-base.js';
import {actualLeadScope} from './operations.js';
import {scopeArgs,missing,propertyAccess} from './operations-access.js';
import {verifiedUnit} from './vacancies.js';
import {workflowActor} from './workflow-actor.js';
import {Tasks} from './tasks.js';
const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
export class UnitShortlists extends PropertyOperations {
 async directory(u:AuthUser,d:string,q:z.infer<typeof productivityQuery>){return this.staff(u,d,async(c,a)=>({items:(await c.query(`SELECT s.id,s.title,s.lead_id,s.expires_at,s.revoked_at,s.created_at,l.display_name,(SELECT count(*)::int FROM shortlist_responses r WHERE r.shortlist_id=s.id) AS responses FROM unit_shortlists s JOIN leads l ON l.id=s.lead_id WHERE ${actualLeadScope('l')} AND strpos(lower(s.title||' '||l.display_name),lower($4))>0 ORDER BY s.created_at DESC,s.id LIMIT 25 OFFSET $5`,[...scopeArgs(a),q.q,(q.page-1)*25])).rows,page:q.page}));}
 async units(c:PoolClient,org:string,ids:string[]){return(await c.query(`SELECT un.id,un.property_id,un.label,un.bedrooms,un.monthly_rent,p.name AS property_name,un.availability_verified_at,(${verifiedUnit('un')} AND NOT EXISTS(SELECT 1 FROM unit_turnovers t WHERE t.unit_id=un.id AND t.status<>'ready')) AS available FROM units un JOIN properties p ON p.id=un.property_id AND p.organization_id=un.organization_id WHERE un.organization_id=$1 AND un.id=ANY($2::uuid[]) ORDER BY array_position($2::uuid[],un.id)`,[org,ids])).rows;}
 async create(u:AuthUser,d:string,i:z.infer<typeof shortlistCreateSchema>){return this.staff(u,d,async(c,a)=>{
  const l=await this.lead(c,a,i.leadId);if(l.intent!=='leasing'||['leased','won','lost_closed'].includes(l.pipeline_stage))fail('Choose an active leasing prospect.');
  const token=createHmac('sha256',this.config.sessionSecret).update('shortlist:'+a.organization.id+':'+a.id+':'+i.requestKey).digest('hex');
  const result=await this.receipt(c,a,'shortlist:create',i,async()=>{
   const units=await this.units(c,a.organization.id,i.unitIds);if(units.length!==i.unitIds.length)throw missing();
   for(const unit of units){await propertyAccess(c,a,unit.property_id);if(!(await c.query('SELECT 1 FROM lead_property_interests WHERE lead_id=$1 AND property_id=$2',[l.id,unit.property_id])).rowCount)fail('Add each property to the lead’s interests first.');if(!unit.available)fail('Choose available units verified within seven days, with turnover and repairs ready.');}
   const row=(await c.query('INSERT INTO unit_shortlists(organization_id,lead_id,title,unit_ids,token_digest,expires_at,created_by,membership_id) VALUES($1,$2,$3,$4,$5,now()+$6*interval \'1 day\',$7,$8) RETURNING id',[a.organization.id,l.id,i.title,i.unitIds,hash(token),i.expiresInDays,a.id,a.membershipId])).rows[0];await this.history(c,a,{id:row.id,property_id:l.property_id,lead_id:l.id},'shortlist.created',{unitIds:i.unitIds});return row;
  });return{...result,path:'/shortlist#token='+token};
 });}
 async detail(u:AuthUser,d:string,id:string){return this.staff(u,d,async(c,a)=>{
  const s=(await c.query('SELECT * FROM unit_shortlists WHERE id=$1 AND organization_id=$2',[id,a.organization.id])).rows[0];if(!s)throw missing();await this.lead(c,a,s.lead_id);for(const unit of await this.units(c,a.organization.id,s.unit_ids))await propertyAccess(c,a,unit.property_id);
  const {token_digest:_,...shortlist}=s;return{shortlist,units:await this.units(c,a.organization.id,s.unit_ids),responses:(await c.query('SELECT preferred_unit_ids,viewing_requested,note,task_id,created_at FROM shortlist_responses WHERE shortlist_id=$1 ORDER BY created_at DESC LIMIT 100',[id])).rows};
 });}
 async revoke(u:AuthUser,d:string,id:string){return this.staff(u,d,async(c,a)=>{
  const s=(await c.query('SELECT * FROM unit_shortlists WHERE id=$1 AND organization_id=$2',[id,a.organization.id])).rows[0];if(!s)throw missing();const l=await this.lead(c,a,s.lead_id);await c.query('UPDATE unit_shortlists SET revoked_at=coalesce(revoked_at,now()),version=version+1 WHERE id=$1',[id]);await this.history(c,a,{id,property_id:l.property_id,lead_id:l.id},'shortlist.revoked',{});return{revoked:true};
 });}
 private async access(c:PoolClient,token:string){
  if(!/^[a-f0-9]{64}$/.test(token))throw missing();const s=(await c.query('SELECT * FROM unit_shortlists WHERE token_digest=$1 AND revoked_at IS NULL AND expires_at>clock_timestamp()',[hash(token)])).rows[0];if(!s)throw missing();
  const a=await workflowActor(c,this.config,s.organization_id,s.membership_id,s.created_by);if(!a)throw missing();const l=await this.lead(c,a,s.lead_id);if(!(await c.query('SELECT id FROM unit_shortlists WHERE id=$1 AND revoked_at IS NULL AND expires_at>clock_timestamp() FOR UPDATE',[s.id])).rowCount)throw missing();if(['leased','won','lost_closed'].includes(l.pipeline_stage))throw missing();const units=await this.units(c,s.organization_id,s.unit_ids);if(units.length!==s.unit_ids.length)throw missing();for(const unit of units){await propertyAccess(c,a,unit.property_id);if(!(await c.query('SELECT 1 FROM lead_property_interests WHERE lead_id=$1 AND property_id=$2',[l.id,unit.property_id])).rowCount)throw missing();}return{s,a,l,units};
 }
 async publicRead(token:string){return this.database.transaction(async c=>{const {s,units}=await this.access(c,token);return{title:s.title,expiresAt:s.expires_at,units:units.map(({property_id:_,...unit})=>unit)};});}
 async respond(token:string,i:z.infer<typeof shortlistResponseSchema>){return this.database.transaction(async c=>{
  const {s,a,l,units}=await this.access(c,token),payloadHash=hash(JSON.stringify(i));const old=(await c.query('SELECT * FROM shortlist_responses WHERE shortlist_id=$1 AND request_key=$2',[s.id,i.requestKey])).rows[0];if(old){if(old.payload_hash!==payloadHash)fail('Use a new request for changed choices.');return{saved:true,viewingRequested:old.viewing_requested};}
  if(i.preferredUnitIds.some(id=>!s.unit_ids.includes(id)))fail('Choose units from this shortlist.');if(i.viewingRequested&&i.preferredUnitIds.some(id=>!units.find(u=>u.id===id)?.available))fail('Availability changed. Refresh this page before requesting a viewing.');
  if(Number((await c.query('SELECT count(*) AS n FROM shortlist_responses WHERE shortlist_id=$1',[s.id])).rows[0].n)>=100)fail('This shortlist has reached its response limit. Contact the property team.');
  const response=(await c.query('INSERT INTO shortlist_responses(shortlist_id,request_key,payload_hash,preferred_unit_ids,viewing_requested,note) VALUES($1,$2,$3,$4,$5,$6) RETURNING id',[s.id,i.requestKey,payloadHash,i.preferredUnitIds,i.viewingRequested,i.note])).rows[0];
  if(i.viewingRequested){const task=await new Tasks(this.database).createLinked(c,a,taskCreateSchema.parse({propertyId:l.property_id,leadId:l.id,title:'Arrange shortlist viewing for '+l.display_name,details:'Preferred units: '+units.filter(u=>i.preferredUnitIds.includes(u.id)).map(u=>u.property_name+' · '+u.label).join(', ')+'\n'+i.note,dueAt:new Date().toISOString(),assignment:'routing'}),{namespace:'leasing_workflow',requestKey:'shortlist:'+response.id,origin:'system',purpose:'crm'});await c.query('UPDATE shortlist_responses SET task_id=$2 WHERE id=$1',[response.id,task.id]);}
  await this.history(c,a,{id:s.id,property_id:l.property_id,lead_id:l.id},'shortlist.responded',{responseId:response.id,viewingRequested:i.viewingRequested});return{saved:true,viewingRequested:i.viewingRequested};
 });}
}
