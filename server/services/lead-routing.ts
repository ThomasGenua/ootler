import {ApiError} from '../http/errors.js';
import type {PoolClient} from 'pg';
import type {z} from 'zod';
import type {AuthUser} from '../../shared/contracts.js';
import type {leadRoutingSchema,routingPreviewSchema,routingApplySchema} from '../../shared/workflow-contracts.js';
import {PropertyOperations,fail} from './property-operations-base.js';
import {requireAdmin,propertyAccess,eligibleOwner,scopeArgs,missing,stale,operationEvent} from './operations-access.js';
import {actualLeadScope} from './operations.js';
import {workflowActor} from './workflow-actor.js';
import {fingerprint,signWorkflow,readWorkflow} from './workflow-signatures.js';
type Member=z.infer<typeof leadRoutingSchema>['members'][number];
export function routingAvailable(member:Member,zone:string,now=new Date()){
 if(!member.enabled||member.awayUntil&&new Date(member.awayUntil)>now)return false;
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:zone,weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now).map(p=>[p.type,p.value]));
 const day=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(parts.weekday),time=parts.hour+':'+parts.minute;
 return member.windows.some(w=>w.weekday===day&&time>=w.start&&time<w.end);
}
export class LeadRouting extends PropertyOperations {
 async lock(c:PoolClient,org:string){await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['lead-routing:'+org]);}
 async policy(u:AuthUser,d:string,propertyId:string){return this.staff(u,d,async(c,a)=>{requireAdmin(a);await propertyAccess(c,a,propertyId);return{policy:(await c.query('SELECT property_id,enabled,time_zone,members,version FROM lead_routing_policies WHERE property_id=$1',[propertyId])).rows[0]??null};});}
 async configure(u:AuthUser,d:string,i:z.infer<typeof leadRoutingSchema>){return this.staff(u,d,async(c,a)=>{requireAdmin(a);await this.lock(c,a.organization.id);await propertyAccess(c,a,i.propertyId);for(const m of i.members)await eligibleOwner(c,a.organization.id,m.membershipId,[i.propertyId]);const old=(await c.query('SELECT version FROM lead_routing_policies WHERE property_id=$1',[i.propertyId])).rows[0];if((old?.version??0)!==i.version)throw stale();await c.query('INSERT INTO lead_routing_policies(property_id,organization_id,enabled,time_zone,members,version,updated_by,membership_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(property_id) DO UPDATE SET enabled=$3,time_zone=$4,members=$5,version=$6,updated_by=$7,membership_id=$8,updated_at=now()',[i.propertyId,a.organization.id,i.enabled,i.timeZone,JSON.stringify(i.members),i.version+1,a.id,a.membershipId]);return{saved:true,version:i.version+1};});}
 async choose(c:PoolClient,org:string,lead:Record<string,any>,reserved=new Map<string,number>()){
  const policy=(await c.query('SELECT * FROM lead_routing_policies WHERE organization_id=$1 AND property_id=$2',[org,lead.property_id])).rows[0];
  if(!policy?.enabled)return{owner:null,name:'Unassigned',reason:'No enabled routing policy.',policyVersion:policy?.version??0};
  const issuer=await workflowActor(c,this.config,org,policy.membership_id,policy.updated_by);if(!issuer||issuer.organization.role!=='organization_admin')return{owner:null,name:'Unassigned',reason:'Routing administrator is unavailable.',policyVersion:policy.version};
  const interests=(await c.query('SELECT property_id FROM lead_property_interests WHERE organization_id=$1 AND lead_id=$2',[org,lead.id])).rows.map(r=>r.property_id),candidates=[];
  for(const m of policy.members as Member[]){if(!routingAvailable(m,policy.time_zone))continue;try{await eligibleOwner(c,org,m.membershipId,[lead.property_id,...interests]);}catch(error){if(error instanceof ApiError)continue;throw error;}
   const r=(await c.query("SELECT u.display_name,(SELECT count(*)::int FROM leads l WHERE l.organization_id=$1 AND l.owner_membership_id=om.id AND l.pipeline_stage NOT IN ('leased','won','lost_closed') AND l.id<>$3) AS load FROM organization_memberships om JOIN users u ON u.id=om.user_id WHERE om.id=$2 AND om.organization_id=$1",[org,m.membershipId,lead.id])).rows[0];
   const load=Number(r.load)+(reserved.get(m.membershipId)??0);if(load<m.capacity)candidates.push({owner:m.membershipId,name:r.display_name,load,capacity:m.capacity});
  }
  candidates.sort((a,b)=>a.load/a.capacity-b.load/b.capacity||a.load-b.load||a.owner.localeCompare(b.owner));const chosen=candidates[0];
  return chosen?{...chosen,reason:'Available, eligible staff with the lowest capacity use.',policyVersion:policy.version}:{owner:null,name:'Unassigned',reason:'No eligible staff currently available below capacity.',policyVersion:policy.version};
 }
 async plan(c:PoolClient,a:AuthUser,ids:string[]){const rows=(await c.query(`SELECT l.* FROM leads l WHERE ${actualLeadScope('l')} AND l.id=ANY($4::uuid[]) ORDER BY l.id FOR UPDATE OF l`,[...scopeArgs(a),ids])).rows;if(rows.length!==ids.length)throw missing();const reserved=new Map<string,number>(),items=[];for(const l of rows){await this.lead(c,a,l.id);if(['leased','won','lost_closed'].includes(l.pipeline_stage))fail('Choose active leads.');const choice=await this.choose(c,a.organization.id,l,reserved);if(choice.owner)reserved.set(choice.owner,(reserved.get(choice.owner)??0)+1);items.push({leadId:l.id,leadName:l.display_name,version:l.version,previousOwner:l.owner_membership_id,owner:choice.owner,name:choice.name,reason:choice.reason,policyVersion:choice.policyVersion});}return items;}
 async preview(u:AuthUser,d:string,i:z.infer<typeof routingPreviewSchema>){return this.staff(u,d,async(c,a)=>{await this.lock(c,a.organization.id);const items=await this.plan(c,a,i.leadIds);return{items,token:signWorkflow(this.config.sessionSecret,'lead-routing',{actor:a.id,org:a.organization.id,expires:Date.now()+10*60_000,ids:i.leadIds,hash:fingerprint(items)})};});}
 async apply(u:AuthUser,d:string,i:z.infer<typeof routingApplySchema>){return this.staff(u,d,async(c,a)=>{const p=readWorkflow<{actor:string;org:string;expires:number;ids:string[];hash:string}>(this.config.sessionSecret,'lead-routing',i.token);if(p.actor!==a.id||p.org!==a.organization.id||p.expires<Date.now())fail('Open a fresh routing preview.');await this.lock(c,a.organization.id);const items=await this.plan(c,a,p.ids);return this.receipt(c,a,'routing:apply',i,async()=>{if(fingerprint(items)!==p.hash)throw stale();for(const item of items){if(!item.owner)continue;await this.assign(c,a.organization.id,item.leadId,item.previousOwner,item.owner,a.id,item.reason);}return{items};});});}
 async assign(c:PoolClient,org:string,leadId:string,previous:string|null,owner:string|null,actor:string|null,reason:string){
  if(owner)await c.query('UPDATE leads SET owner_membership_id=$2,version=version+1,updated_at=now() WHERE id=$1',[leadId,owner]);
  await c.query('INSERT INTO lead_routing_events(organization_id,lead_id,previous_owner,owner_membership_id,actor_id,reason) VALUES($1,$2,$3,$4,$5,$6)',[org,leadId,previous,owner,actor,reason]);
  await operationEvent(c,org,(await c.query('SELECT property_id FROM leads WHERE id=$1',[leadId])).rows[0].property_id,leadId,actor,'lead.routed',reason);
 }
 async intake(c:PoolClient,org:string,id:string){await this.lock(c,org);const l=(await c.query('SELECT * FROM leads WHERE id=$1 AND organization_id=$2 FOR UPDATE',[id,org])).rows[0];const choice=await this.choose(c,org,l);await this.assign(c,org,id,null,choice.owner,null,choice.reason);return choice.owner;}
 async assignmentHistory(u:AuthUser,d:string,id:string){return this.staff(u,d,async(c,a)=>{await this.lead(c,a,id);return{items:(await c.query('SELECT e.*,actor.display_name AS actor_name,old_user.display_name AS previous_name,new_user.display_name AS owner_name FROM lead_routing_events e LEFT JOIN users actor ON actor.id=e.actor_id LEFT JOIN organization_memberships old_m ON old_m.id=e.previous_owner LEFT JOIN users old_user ON old_user.id=old_m.user_id LEFT JOIN organization_memberships new_m ON new_m.id=e.owner_membership_id LEFT JOIN users new_user ON new_user.id=new_m.user_id WHERE e.lead_id=$1 ORDER BY e.created_at DESC,e.id LIMIT 100',[id])).rows};});}
}
