import {createHash} from 'node:crypto';
import type {z} from 'zod';
import type {AuthUser} from '../../shared/contracts.js';
import type {PoolClient} from 'pg';
import type {playbookCreateSchema,playbookApplySchema} from '../../shared/productivity-contracts.js';
import {PropertyOperations,fail} from './property-operations-base.js';
import {requireAdmin,propertyAccess,missing,stale} from './operations-access.js';
export class PropertyPlaybooks extends PropertyOperations {
 async directory(u:AuthUser,d:string){return this.staff(u,d,async(c,a)=>{requireAdmin(a);return{items:(await c.query('SELECT id,name,created_at FROM property_playbooks WHERE organization_id=$1 ORDER BY created_at DESC,id LIMIT 100',[a.organization.id])).rows,templates:(await c.query('SELECT id,name FROM communication_templates WHERE organization_id=$1 ORDER BY name,id LIMIT 100',[a.organization.id])).rows,inspections:(await c.query('SELECT id,name FROM inspection_templates WHERE organization_id=$1 AND active ORDER BY name,id LIMIT 100',[a.organization.id])).rows};});}
 async create(u:AuthUser,d:string,i:z.infer<typeof playbookCreateSchema>){return this.staff(u,d,async(c,a)=>{
  requireAdmin(a);await propertyAccess(c,a,i.sourcePropertyId);return this.receipt(c,a,'playbook:create',i,async()=>{
   const calendar=(await c.query('SELECT enabled,time_zone,duration_minutes,buffer_before_minutes,buffer_after_minutes,location FROM property_viewing_settings WHERE property_id=$1',[i.sourcePropertyId])).rows[0]??null;
   const response=(await c.query('SELECT enabled,time_zone,windows,response_minutes,escalation_minutes FROM property_response_policies WHERE property_id=$1',[i.sourcePropertyId])).rows[0]??null;
   const templates=(await c.query('SELECT name,channel,subject,body FROM communication_templates WHERE organization_id=$1 AND id=ANY($2::uuid[]) ORDER BY id',[a.organization.id,i.templateIds])).rows;
   const inspections=(await c.query('SELECT name,items FROM inspection_templates WHERE organization_id=$1 AND active AND id=ANY($2::uuid[]) ORDER BY id',[a.organization.id,i.inspectionTemplateIds])).rows;
   if(templates.length!==new Set(i.templateIds).size||inspections.length!==new Set(i.inspectionTemplateIds).size)throw missing();if(!calendar&&!response&&!templates.length&&!inspections.length)fail('Configure the source property or select at least one template.');
   const r=(await c.query('INSERT INTO property_playbooks(organization_id,name,snapshot,created_by) VALUES($1,$2,$3,$4) RETURNING id',[a.organization.id,i.name,JSON.stringify({calendar,response,templates,inspections}),a.id])).rows[0];await this.history(c,a,{id:r.id,property_id:i.sourcePropertyId},'playbook.created',{});return r;
  });
 });}
 private async previewLinked(c:PoolClient,a:AuthUser,id:string,propertyId:string){
  requireAdmin(a);const property=await propertyAccess(c,a,propertyId),playbook=(await c.query('SELECT * FROM property_playbooks WHERE id=$1 AND organization_id=$2',[id,a.organization.id])).rows[0];if(!playbook)throw missing();
  const calendar=(await c.query('SELECT * FROM property_viewing_settings WHERE property_id=$1',[propertyId])).rows[0]??null,response=(await c.query('SELECT * FROM property_response_policies WHERE property_id=$1',[propertyId])).rows[0]??null,assignment=(await c.query('SELECT * FROM property_playbook_assignments WHERE property_id=$1',[propertyId])).rows[0]??null;
  const proposed={...playbook.snapshot,calendar:playbook.snapshot.calendar?{...playbook.snapshot.calendar,time_zone:calendar?.time_zone??playbook.snapshot.calendar.time_zone,location:calendar?.location??playbook.snapshot.calendar.location,public_booking_enabled:calendar?.public_booking_enabled??false}:null,response:playbook.snapshot.response?{...playbook.snapshot.response,time_zone:response?.time_zone??calendar?.time_zone??playbook.snapshot.response.time_zone,manager_membership_id:response?.manager_membership_id??null}:null};
  const hash=createHash('sha256').update(JSON.stringify({id,propertyId,calendar,response,assignment,proposed})).digest('hex');
  const blocked=Boolean(proposed.calendar&&(await c.query("SELECT 1 FROM viewings WHERE property_id=$1 AND status='scheduled' AND managed_by_ootla AND ends_at>now() LIMIT 1",[propertyId])).rowCount);
  return{playbook:{id:playbook.id,name:playbook.name},property:{id:property.id,name:property.name},current:{calendar,response,assignment},proposed,previewHash:hash,blocked};
 }
 async preview(u:AuthUser,d:string,id:string,propertyId:string){return this.staff(u,d,(c,a)=>this.previewLinked(c,a,id,propertyId));}
 async apply(u:AuthUser,d:string,id:string,i:z.infer<typeof playbookApplySchema>){return this.staff(u,d,async(c,a)=>{
  requireAdmin(a);await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['ootla:calendar:property:'+i.propertyId]);await propertyAccess(c,a,i.propertyId);
  return this.receipt(c,a,'playbook:apply:'+id,i,async()=>{
   const preview=await this.previewLinked(c,a,id,i.propertyId);if(preview.previewHash!==i.previewHash)throw stale();if(preview.blocked)fail('Reschedule or finish future managed viewings before applying schedule changes.');
   const {calendar:s,response:r,templates,inspections}=preview.proposed;
   if(s)await c.query('INSERT INTO property_viewing_settings(organization_id,property_id,enabled,time_zone,duration_minutes,buffer_before_minutes,buffer_after_minutes,location,public_booking_enabled,version) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,1) ON CONFLICT(property_id) DO UPDATE SET enabled=$3,time_zone=$4,duration_minutes=$5,buffer_before_minutes=$6,buffer_after_minutes=$7,location=$8,public_booking_enabled=$9,version=property_viewing_settings.version+1,updated_at=now()',[a.organization.id,i.propertyId,s.enabled,s.time_zone,s.duration_minutes,s.buffer_before_minutes,s.buffer_after_minutes,s.location,s.public_booking_enabled]);
   if(r)await c.query('INSERT INTO property_response_policies(organization_id,property_id,enabled,time_zone,windows,response_minutes,escalation_minutes,manager_membership_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(property_id) DO UPDATE SET enabled=$3,time_zone=$4,windows=$5,response_minutes=$6,escalation_minutes=$7,manager_membership_id=$8,version=property_response_policies.version+1,updated_at=now()',[a.organization.id,i.propertyId,r.enabled,r.time_zone,JSON.stringify(r.windows),r.response_minutes,r.escalation_minutes,r.manager_membership_id]);
   const templateIds:string[]=[],inspectionIds:string[]=[];
   for(const t of templates)templateIds.push((await c.query('INSERT INTO communication_templates(organization_id,name,channel,subject,body,created_by) VALUES($1,$2,$3,$4,$5,$6) RETURNING id',[a.organization.id,(preview.property.name+' · '+t.name).slice(0,120),t.channel,t.subject,t.body,a.id])).rows[0].id);
   for(const t of inspections)inspectionIds.push((await c.query('INSERT INTO inspection_templates(organization_id,name,items) VALUES($1,$2,$3) RETURNING id',[a.organization.id,(preview.property.name+' · '+t.name).slice(0,160),JSON.stringify(t.items)])).rows[0].id);
   await c.query('INSERT INTO property_playbook_assignments(property_id,playbook_id,template_ids,inspection_template_ids) VALUES($1,$2,$3,$4) ON CONFLICT(property_id) DO UPDATE SET playbook_id=$2,template_ids=$3,inspection_template_ids=$4,applied_at=now()',[i.propertyId,id,templateIds,inspectionIds]);await this.history(c,a,{id,property_id:i.propertyId},'playbook.applied',{templateIds,inspectionIds});return{applied:true,templateIds,inspectionIds};
  });
 });}
}
