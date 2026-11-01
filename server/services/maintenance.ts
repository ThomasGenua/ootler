import {scanDocument} from './document-scanner.js';
import type {z} from 'zod';
import type {vendorSchema,workOrderCreate,workOrderUpdate,portfolioQuery} from '../../shared/property-operations-contracts.js';
import {PropertyOperations,fail,type Actor,type Client} from './property-operations-base.js';
import {leadScope,scopeArgs,propertyScope,propertyAccess,eligibleOwner,stale,missing,requireAdmin} from './operations-access.js';
import {validateDocument} from './lead-workspace.js';
export class Maintenance extends PropertyOperations {
 async listOrders(u:Actor,d:string,q:z.infer<typeof portfolioQuery>){return this.staff(u,d,async(c,a)=>({items:(await c.query(`SELECT w.*,r.title,p.name AS property_name,v.name AS vendor_name,ou.display_name AS owner_name,count(*) OVER()::int AS total FROM maintenance_work_orders w JOIN resident_requests r ON r.id=w.request_id JOIN properties p ON p.id=w.property_id LEFT JOIN maintenance_vendors v ON v.id=w.vendor_id LEFT JOIN organization_memberships om ON om.id=w.owner_membership_id LEFT JOIN users ou ON ou.id=om.user_id WHERE ${leadScope('w')} AND ($4::uuid IS NULL OR w.property_id=$4) AND strpos(lower(r.title),lower($5))>0 ORDER BY (w.status IN ('completed','cancelled')),w.appointment_start NULLS LAST,w.created_at LIMIT 25 OFFSET $6`,[...scopeArgs(a),q.propertyId??null,q.q,(q.page-1)*25])).rows,page:q.page}));}
 async vendors(u:Actor,d:string,q:z.infer<typeof portfolioQuery>){return this.staff(u,d,async(c,a)=>({items:(await c.query(`SELECT v.*,p.name AS property_name,count(*) OVER()::int AS total FROM maintenance_vendors v JOIN properties p ON p.id=v.property_id WHERE ${propertyScope('v')} AND ($4::uuid IS NULL OR v.property_id=$4) AND strpos(lower(v.name||' '||v.trade),lower($5))>0 ORDER BY lower(v.name),v.id LIMIT 50 OFFSET $6`,[...scopeArgs(a),q.propertyId??null,q.q,(q.page-1)*50])).rows,page:q.page}));}
 async saveVendor(u:Actor,d:string,id:string|null,i:z.infer<typeof vendorSchema>){return this.staff(u,d,async(c,a)=>{
  requireAdmin(a);await propertyAccess(c,a,i.propertyId);
  return this.receipt(c,a,'vendor:'+id,i,async()=>{
   const args=[a.organization.id,i.propertyId,i.name,i.trade,i.email,i.phone,i.active];
   const row=id?(await c.query('UPDATE maintenance_vendors SET name=$3,trade=$4,email=$5,phone=$6,active=$7,version=version+1 WHERE organization_id=$1 AND property_id=$2 AND id=$8 AND version=$9 RETURNING *',[...args,id,i.version])).rows[0]:(await c.query('INSERT INTO maintenance_vendors(organization_id,property_id,name,trade,email,phone,active) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *',args)).rows[0];
   if(!row)throw stale();await this.history(c,a,row,'maintenance.vendor',{name:i.name,active:i.active});return row;
  });
 });}
 async create(u:Actor,d:string,i:z.infer<typeof workOrderCreate>){return this.staff(u,d,async(c,a)=>{
  const r=await this.scoped(c,a,'resident_requests',i.requestId);
  return this.receipt(c,a,'work-order:create',i,async()=>{
   const existing=(await c.query('SELECT * FROM maintenance_work_orders WHERE request_id=$1',[r.id])).rows[0];if(existing)return existing;
   if(['closed','resolved'].includes(r.status))fail('Reopen this resident request before creating work.');
   const w=(await c.query('INSERT INTO maintenance_work_orders(organization_id,property_id,lead_id,request_id,owner_membership_id) VALUES($1,$2,$3,$4,$5) RETURNING *',[a.organization.id,r.property_id,r.lead_id,r.id,r.owner_membership_id])).rows[0];
   await this.history(c,a,w,'maintenance.created',{requestId:r.id});return w;
  });
 });}
 async detail(u:Actor,d:string,id:string){return this.staff(u,d,async(c,a)=>{const order=await this.scoped(c,a,'maintenance_work_orders',id);return{order,request:(await c.query('SELECT title,description,category,priority FROM resident_requests WHERE id=$1',[order.request_id])).rows[0],photos:await this.photos(c,id),history:await this.timeline(c,id)};});}
 async photos(c:Client,id:string){return(await c.query('SELECT id,name,media_type,created_at FROM maintenance_photos WHERE work_order_id=$1 ORDER BY created_at,id',[id])).rows;}
 async update(u:Actor,d:string,id:string,i:z.infer<typeof workOrderUpdate>){return this.staff(u,d,async(c,a)=>{
  const w=await this.scoped(c,a,'maintenance_work_orders',id);
  return this.receipt(c,a,'work-order:update:'+id,i,async()=>{
   if(w.version!==i.version)throw stale();
   const allowed:Record<string,string[]>={open:['open','scheduled','in_progress','cancelled'],scheduled:['open','scheduled','in_progress','completed','cancelled'],in_progress:['scheduled','in_progress','completed','cancelled'],completed:['completed','in_progress'],cancelled:['cancelled','open']};
   if(!allowed[w.status].includes(i.status))fail('Choose the next work stage before completing this order.');
   if(i.status==='scheduled'&&!i.appointmentStart)fail('Scheduled work needs an appointment window.');
   if(i.appointmentStart&&Date.parse(i.appointmentEnd!)-Date.parse(i.appointmentStart)>7*86400000)fail('Keep the appointment window within seven days.');
   if(i.status==='completed'&&!i.completionNote)fail('Describe the completed work before closing it.');
   if(i.vendorId&&!(await c.query('SELECT id FROM maintenance_vendors WHERE id=$1 AND organization_id=$2 AND property_id=$3 AND active FOR SHARE',[i.vendorId,a.organization.id,w.property_id])).rowCount)fail('Choose an active vendor for this property.');
   const interests=(await c.query('SELECT property_id FROM lead_property_interests WHERE lead_id=$1',[w.lead_id])).rows.map(r=>r.property_id);await eligibleOwner(c,a.organization.id,i.ownerMembershipId,[w.property_id,...interests]);
   const row=(await c.query('UPDATE maintenance_work_orders SET vendor_id=$2,owner_membership_id=$3,status=$4,appointment_start=$5,appointment_end=$6,entry_instructions=$7,estimate=$8,actual_cost=$9,currency=$10,completion_note=$11,resident_confirmed_at=NULL,version=version+1,updated_at=now() WHERE id=$1 RETURNING *',[id,i.vendorId,i.ownerMembershipId,i.status,i.appointmentStart,i.appointmentEnd,i.entryInstructions,i.estimate,i.actualCost,i.currency,i.completionNote])).rows[0];
   const status=i.status==='completed'?'resolved':i.status==='cancelled'?'waiting':'in_progress';
   await c.query('UPDATE resident_requests SET status=$2,version=version+1,updated_at=now() WHERE id=$1',[w.request_id,status]);
   await c.query('INSERT INTO resident_request_updates(request_id,actor_user_id,body,status) VALUES($1,$2,$3,$4)',[w.request_id,a.id,i.residentUpdate,status]);
   await this.history(c,a,w,'maintenance.updated',{...i,requestKey:undefined,previousStatus:w.status});return row;
  });
 });}
 async upload(u:Actor,d:string,id:string,name:string,type:string,content:Buffer){validateDocument(name,type,content);if(!['image/png','image/jpeg'].includes(type))fail('Completion evidence must be a PNG or JPEG photo.');return this.staff(u,d,async(c,a)=>{await this.scoped(c,a,'maintenance_work_orders',id);if(Number((await c.query('SELECT count(*) AS n FROM maintenance_photos WHERE work_order_id=$1',[id])).rows[0].n)>=10)fail('Use at most ten completion photos.');await scanDocument(this.config,c,content);return(await c.query('INSERT INTO maintenance_photos(work_order_id,uploaded_by,name,media_type,content) VALUES($1,$2,$3,$4,$5) RETURNING id',[id,a.id,name,type,content])).rows[0];});}
 async photo(u:Actor,d:string,id:string,photoId:string){return this.staff(u,d,async(c,a)=>{await this.scoped(c,a,'maintenance_work_orders',id);const p=(await c.query('SELECT name,media_type,content FROM maintenance_photos WHERE work_order_id=$1 AND id=$2',[id,photoId])).rows[0];if(!p)throw missing();return p;});}
}
