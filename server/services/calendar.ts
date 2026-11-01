import {tourReplyDraft} from './tour-reply-drafts.js';
import { createHash,createHmac,randomBytes,timingSafeEqual } from 'node:crypto';
import type { PoolClient,QueryResultRow } from 'pg';
import type { z } from 'zod';
import type { AuthUser,OrganizationRole,Permission } from '../../shared/contracts.js';
import type { Paginated } from '../../shared/property-contracts.js';
import type { CalendarAvailability,CalendarDirectory,CalendarEvent,CalendarInvitation,CalendarIssuedInvitation,CalendarOptions,CalendarPropertySettings,CalendarSlots,CalendarViewing,PublicCalendarConfirmation,PublicCalendarInvitation,ViewingStatus,calendarAvailabilitySchema,calendarBookSchema,calendarInvitationQuerySchema,calendarInvitationSchema,calendarOptionsSchema,calendarQuerySchema,calendarRescheduleSchema,calendarSettingsSchema,calendarSlotsSchema,calendarStatusSchema,publicCalendarBookSchema,publicCalendarReadSchema,publicCalendarManageSchema } from '../../shared/calendar-contracts.js';
import type { ServerConfig } from '../config/env.js';
import type { Database } from '../db/pool.js';
import { enqueueGoogleViewingSync } from './google-calendar.js';
import { ApiError } from '../http/errors.js';
import { addLocalDays,localDate,localDayBounds,localInstants,localMinute,validatesOffsetDateTime,weekday,zonedIso } from './calendar-time.js';
type Row=QueryResultRow;
type Page={page:number;pageSize:number};
type Actor=AuthUser;
const iso=(value:unknown):string|null=>value?(value instanceof Date?value:new Date(String(value))).toISOString():null;
const paged=<T>(items:T[],total:number,p:Page):Paginated<T>=>({items,total,page:p.page,pageSize:p.pageSize,totalPages:Math.ceil(total/p.pageSize)});
const missing=():never=>{throw new ApiError(404,'VIEWING_NOT_FOUND','This viewing or related record is unavailable in your assigned access.');};
const denied=():never=>{throw new ApiError(403,'CALENDAR_ACCESS_DENIED','Calendar details require lead-management permission and access to every related property.');};
const conflict=(message:string,code='VIEWING_CONFLICT'):never=>{throw new ApiError(409,code,message);};
const propertyScope="($2='organization_admin' OR EXISTS(SELECT 1 FROM property_access_assignments pa WHERE pa.organization_id=p.organization_id AND pa.property_id=p.id AND pa.membership_id=$3))";
const leadScope="($2='organization_admin' OR NOT EXISTS(SELECT 1 FROM lead_property_interests li WHERE li.organization_id=l.organization_id AND li.lead_id=l.id AND NOT EXISTS(SELECT 1 FROM property_access_assignments pa WHERE pa.organization_id=li.organization_id AND pa.property_id=li.property_id AND pa.membership_id=$3)))";
const viewingJoins=" JOIN properties p ON p.id=v.property_id AND p.organization_id=v.organization_id JOIN leads l ON l.id=v.lead_id AND l.organization_id=v.organization_id JOIN contacts c ON c.id=l.contact_id AND c.organization_id=l.organization_id LEFT JOIN units un ON un.id=v.unit_id AND un.organization_id=v.organization_id LEFT JOIN organization_memberships om ON om.id=v.owner_membership_id AND om.organization_id=v.organization_id LEFT JOIN users ou ON ou.id=om.user_id ";
const viewingColumns="v.*,p.name AS property_name,c.display_name AS lead_name,un.label AS unit_label,om.role AS owner_role,ou.display_name AS owner_name";
function viewingDto(r:Row):CalendarViewing{return{id:r.id,property:{id:r.property_id,name:r.property_name},lead:{id:r.lead_id,name:r.lead_name},unit:r.unit_id?{id:r.unit_id,label:r.unit_label}:null,owner:r.owner_membership_id?{membershipId:r.owner_membership_id,name:r.owner_name,role:r.owner_role}:null,startsAt:iso(r.starts_at)!,endsAt:iso(r.ends_at),timeZone:r.time_zone,durationMinutes:r.duration_minutes,bufferBeforeMinutes:r.buffer_before_minutes,bufferAfterMinutes:r.buffer_after_minutes,location:r.location,status:r.status,version:r.version,managed:r.managed_by_ootla,source:r.managed_by_ootla?r.booking_origin:'legacy',canManage:r.managed_by_ootla,legacyNotice:r.managed_by_ootla?null:'Legacy viewing: timezone, duration and assigned staff were not recorded. Its known start is displayed in UTC; this record is read-only.'};}
function settingsDto(r:Row|undefined):CalendarPropertySettings{return r?{configured:true,enabled:r.enabled,timeZone:r.time_zone,durationMinutes:r.duration_minutes,bufferBeforeMinutes:r.buffer_before_minutes,bufferAfterMinutes:r.buffer_after_minutes,location:r.location,publicBookingEnabled:r.public_booking_enabled,version:r.version}:{configured:false,enabled:false,timeZone:'Africa/Lagos',durationMinutes:30,bufferBeforeMinutes:10,bufferAfterMinutes:10,location:'',publicBookingEnabled:false,version:1};}
function availabilityDto(r:Row|undefined):CalendarAvailability{return r?{enabled:r.enabled,windows:r.windows,version:r.version}:{enabled:false,windows:[],version:1};}
function invitationDto(r:Row):CalendarInvitation{return{id:r.id,propertyId:r.property_id,leadId:r.lead_id,expiresAt:iso(r.expires_at)!,revokedAt:iso(r.revoked_at),booked:Boolean(r.booked_viewing_id),createdAt:iso(r.created_at)!};}
async function resources(c:PoolClient,keys:string[]):Promise<void>{for(const key of [...new Set(keys)].sort())await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['ootla:calendar:'+key]);}
async function authorize(c:PoolClient,u:Actor,digest?:string):Promise<Actor>{
 const result=(await c.query("SELECT m.role,ARRAY(SELECT permission FROM role_permissions WHERE role_key=m.role) AS permissions FROM organization_memberships m JOIN users u ON u.id=m.user_id WHERE m.id=$1 AND m.organization_id=$2 AND m.user_id=$3 AND m.active AND m.account_kind='staff' AND u.active AND u.account_kind='staff' AND EXISTS(SELECT 1 FROM role_permissions rp WHERE rp.role_key=m.role AND rp.permission='leasing.manage') FOR SHARE OF m,u",[u.membershipId,u.organization.id,u.id])).rows[0];
 if(!result)denied();
 if(digest!==undefined&&!(await c.query('SELECT id FROM sessions WHERE token_digest=$1 AND user_id=$2 AND organization_id=$3 AND expires_at>clock_timestamp() FOR SHARE',[digest,u.id,u.organization.id])).rowCount)throw new ApiError(401,'AUTH_REQUIRED','Your session ended. Sign in again.');
 return{...u,permissions:result.permissions as Permission[],organization:{...u.organization,role:result.role as OrganizationRole}};
}
async function property(c:PoolClient,u:Actor,id:string):Promise<Row>{
 const r=(await c.query("SELECT p.id,p.name FROM properties p WHERE p.organization_id=$1 AND "+propertyScope+" AND p.id=$4 FOR KEY SHARE OF p",[u.organization.id,u.organization.role,u.membershipId,id])).rows[0];
 if(!r)missing();
 if(u.organization.role!=='organization_admin'&&!(await c.query('SELECT property_id FROM property_access_assignments WHERE organization_id=$1 AND membership_id=$2 AND property_id=$3 FOR SHARE',[u.organization.id,u.membershipId,id])).rowCount)denied();
 return r;
}
async function context(c:PoolClient,u:Actor,leadId:string,propertyId:string,lock=false):Promise<Row>{
 const l=(await c.query("SELECT l.* FROM leads l WHERE l.organization_id=$1 AND "+leadScope+" AND l.id=$4"+(lock?' FOR UPDATE OF l':''),[u.organization.id,u.organization.role,u.membershipId,leadId])).rows[0];
 if(!l)missing();
 const interests=(await c.query('SELECT property_id FROM lead_property_interests WHERE organization_id=$1 AND lead_id=$2 ORDER BY property_id FOR SHARE',[u.organization.id,leadId])).rows;
 if(!interests.some(r=>r.property_id===propertyId))throw new ApiError(400,'PROPERTY_INTEREST_REQUIRED','Choose a property explicitly linked to this lead.');
 for(const id of [...new Set<string>([l.property_id,...interests.map(r=>String(r.property_id))])].sort())await property(c,u,id);
 return l;
}
async function owner(c:PoolClient,u:Actor,membershipId:string,propertyId:string,leadId?:string):Promise<Row>{
 const r=(await c.query("SELECT m.id,m.user_id,m.role,u.display_name FROM organization_memberships m JOIN users u ON u.id=m.user_id AND u.active AND u.account_kind='staff' WHERE m.id=$1 AND m.organization_id=$2 AND m.active AND m.account_kind='staff' AND EXISTS(SELECT 1 FROM role_permissions rp WHERE rp.role_key=m.role AND rp.permission='leasing.manage') AND (m.role='organization_admin' OR (EXISTS(SELECT 1 FROM property_access_assignments pa WHERE pa.organization_id=m.organization_id AND pa.membership_id=m.id AND pa.property_id=$3) AND ($4::uuid IS NULL OR NOT EXISTS(SELECT 1 FROM lead_property_interests li WHERE li.organization_id=m.organization_id AND li.lead_id=$4 AND NOT EXISTS(SELECT 1 FROM property_access_assignments pa WHERE pa.organization_id=li.organization_id AND pa.membership_id=m.id AND pa.property_id=li.property_id))))) FOR SHARE OF m,u",[membershipId,u.organization.id,propertyId,leadId??null])).rows[0];
 if(!r)throw new ApiError(400,'INVALID_VIEWING_OWNER','Choose an active eligible agent with access to every related property.');
 return r;
}
async function settings(c:PoolClient,org:string,id:string,enabled=true):Promise<Row>{
 const r=(await c.query('SELECT * FROM property_viewing_settings WHERE organization_id=$1 AND property_id=$2 FOR SHARE',[org,id])).rows[0];
 if(!r||(enabled&&!r.enabled))throw new ApiError(409,'VIEWING_SETUP_REQUIRED','Configure and enable this property schedule before booking.');
 return r;
}
async function availability(c:PoolClient,org:string,propertyId:string,membershipId:string):Promise<Row>{
 const r=(await c.query('SELECT * FROM viewing_staff_availability WHERE organization_id=$1 AND property_id=$2 AND membership_id=$3 FOR SHARE',[org,propertyId,membershipId])).rows[0];
 if(!r?.enabled||!r.windows.length)throw new ApiError(409,'STAFF_UNAVAILABLE','No eligible agent availability is configured for this property.');
 return r;
}
async function actualViewing(c:PoolClient,u:Actor,id:string):Promise<Row>{
 const r=(await c.query('SELECT '+viewingColumns+' FROM viewings v'+viewingJoins+' WHERE v.organization_id=$1 AND v.id=$2',[u.organization.id,id])).rows[0];if(!r)missing();await context(c,u,r.lead_id,r.property_id);return r;
}
async function receipt<T extends Record<string,unknown>>(c:PoolClient,u:Actor,scope:string,key:string,operation:string,input:unknown,run:()=>Promise<T>):Promise<{replayed:boolean;result:T}>{
 const hash=createHash('sha256').update(JSON.stringify(input)).digest('hex');
 const prior=(await c.query('SELECT operation,payload_hash,result FROM viewing_action_receipts WHERE organization_id=$1 AND actor_scope=$2 AND request_key=$3',[u.organization.id,scope,key])).rows[0];
 if(prior){if(prior.operation!==operation||prior.payload_hash!==hash)conflict('Use a new request identifier for a different action.','REQUEST_KEY_REUSED');return{replayed:true,result:prior.result as T};}
 const result=await run();await c.query('INSERT INTO viewing_action_receipts(organization_id,actor_scope,request_key,operation,payload_hash,result) VALUES($1,$2,$3,$4,$5,$6::jsonb)',[u.organization.id,scope,key,operation,hash,JSON.stringify(result)]);
 return{replayed:false,result};
}
async function audit(c:PoolClient,u:Actor,action:string,metadata:Record<string,unknown>):Promise<void>{await c.query('INSERT INTO audit_events(organization_id,actor_user_id,action,metadata) VALUES($1,$2,$3,$4::jsonb)',[u.organization.id,u.id,action,JSON.stringify(metadata)]);}
async function event(c:PoolClient,u:Actor,v:Row,kind:string,origin:'staff'|'public',invitationId:string|null,metadata:Record<string,unknown>):Promise<void>{
 const inserted=(await c.query('INSERT INTO viewing_events(organization_id,viewing_id,kind,origin,actor_user_id,actor_membership_id,invitation_id,metadata) VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb) RETURNING id',[u.organization.id,v.id,kind,origin,origin==='staff'?u.id:null,origin==='staff'?u.membershipId:null,invitationId,JSON.stringify(metadata)])).rows[0];
 await c.query("INSERT INTO viewing_notification_receipts(event_id,organization_id,mode) VALUES($1,$2,'simulation') ON CONFLICT DO NOTHING",[inserted.id,u.organization.id]);
 await enqueueGoogleViewingSync(c,u.organization.id,v.id);
 await tourReplyDraft(c,u.organization.id,v.id,inserted.id,kind);
 if(origin==='staff')await audit(c,u,'viewing.'+kind,{viewingId:v.id,eventId:inserted.id,notification:'simulation'});
}
async function leadStage(c:PoolClient,u:Actor,l:Row,v:Row,kind:string,origin:'staff'|'public'):Promise<Record<string,unknown>>{
 let before:string|null=null,after:string|null=null;
 if(kind==='booked'&&['new_inquiry','contacted'].includes(l.pipeline_stage)){
  before=l.pipeline_stage;after=l.intent==='sales'?'viewing_scheduled':'tour_scheduled';
  const updated=(await c.query('UPDATE leads SET pipeline_stage=$2,version=version+1,updated_at=now() WHERE id=$1 RETURNING version',[l.id,after])).rows[0];
  await c.query('INSERT INTO viewing_lead_summaries(organization_id,lead_id,previous_stage,scheduled_stage,expected_lead_version) VALUES($1,$2,$3,$4,$5) ON CONFLICT(lead_id) DO UPDATE SET previous_stage=EXCLUDED.previous_stage,scheduled_stage=EXCLUDED.scheduled_stage,expected_lead_version=EXCLUDED.expected_lead_version,created_at=now()',[u.organization.id,l.id,before,after,updated.version]);
 }else if(kind==='completed')await c.query('DELETE FROM viewing_lead_summaries WHERE organization_id=$1 AND lead_id=$2',[u.organization.id,l.id]);
 else if(kind==='cancelled'||kind==='no_show'){
  const s=(await c.query('SELECT * FROM viewing_lead_summaries WHERE organization_id=$1 AND lead_id=$2 FOR UPDATE',[u.organization.id,l.id])).rows[0];
  if(s&&l.version===s.expected_lead_version&&l.pipeline_stage===s.scheduled_stage&&!(await c.query("SELECT id FROM viewings WHERE organization_id=$1 AND lead_id=$2 AND status='scheduled' LIMIT 1",[u.organization.id,l.id])).rowCount){
   before=l.pipeline_stage;after=s.previous_stage;await c.query('UPDATE leads SET pipeline_stage=$2,version=version+1,updated_at=now() WHERE id=$1',[l.id,after]);await c.query('DELETE FROM viewing_lead_summaries WHERE lead_id=$1',[l.id]);
  }
 }
 if(before&&after&&origin==='staff')await c.query("INSERT INTO lead_events(organization_id,lead_id,kind,previous_stage,stage,actor_user_id,actor_membership_id,metadata) VALUES($1,$2,'stage_changed',$3,$4,$5,$6,$7::jsonb)",[u.organization.id,l.id,before,after,u.id,u.membershipId,JSON.stringify({origin:'viewing_schedule',viewingId:v.id,milestone:'confirmed_viewing'})]);
 return before&&after?{previousStage:before,stage:after}: {};
}
function clockMinutes(value:string):number{const [h,m]=value.split(':').map(Number);return h!*60+m!;}
function withinAvailability(a:Row,start:Date,end:Date,zone:string):boolean{
 for(let time=start.getTime();time<end.getTime();time+=60000){
  const d=new Date(time),minute=localMinute(d,zone),day=weekday(localDate(d,zone));
  if(!a.windows.some((w:{weekday:number;start:string;end:string})=>w.weekday===day&&clockMinutes(w.start)<=minute&&minute<clockMinutes(w.end)))return false;
 }
 return true;
}
async function isFree(c:PoolClient,org:string,propertyId:string,leadId:string,unitId:string|null,ownerUserId:string,start:Date,end:Date,before:number,after:number,zone:string,exclude?:string):Promise<boolean>{
 const low=new Date(start.getTime()-before*60000),high=new Date(end.getTime()+after*60000);
 const day=localDayBounds(localDate(start,zone),zone);
 const legacy=await c.query("SELECT id FROM viewings WHERE organization_id=$1 AND property_id=$2 AND NOT managed_by_ootla AND status='scheduled' AND starts_at >= $3 AND starts_at < $4 LIMIT 1",[org,propertyId,day.from,day.until]);
 if(legacy.rowCount)return false;
 const busy=await c.query("SELECT v.id FROM viewings v LEFT JOIN organization_memberships m ON m.id=v.owner_membership_id WHERE v.status='scheduled' AND v.managed_by_ootla AND v.id IS DISTINCT FROM $1::uuid AND (m.user_id=$2 OR (v.organization_id=$3 AND v.lead_id=$4) OR (v.organization_id=$3 AND v.property_id=$5 AND (v.unit_id IS NULL OR $6::uuid IS NULL OR v.unit_id=$6))) AND v.starts_at-v.buffer_before_minutes*interval '1 minute' < $8 AND v.ends_at+v.buffer_after_minutes*interval '1 minute' > $7 LIMIT 1",[exclude??null,ownerUserId,org,leadId,propertyId,unitId,low,high]);
 return !busy.rowCount;
}

async function reserve(c:PoolClient,u:Actor,input:{leadId:string;propertyId:string;unitId:string|null;ownerMembershipId:string;startsAt:string;durationMinutes?:number;location?:string},origin:'staff'|'public',invitationId:string|null):Promise<Row>{
 const l=await context(c,u,input.leadId,input.propertyId,true),s=await settings(c,u.organization.id,input.propertyId),o=await owner(c,u,input.ownerMembershipId,input.propertyId,input.leadId),a=await availability(c,u.organization.id,input.propertyId,input.ownerMembershipId);
 if(['lost_closed','won','leased'].includes(l.pipeline_stage))conflict('This lead is closed. Open a new opportunity before scheduling another viewing.','LEAD_NOT_ACTIVE');
 if(input.unitId&&!(await c.query('SELECT id FROM units WHERE id=$1 AND organization_id=$2 AND property_id=$3 FOR KEY SHARE',[input.unitId,u.organization.id,input.propertyId])).rowCount)throw new ApiError(400,'INVALID_UNIT','Choose a unit from the viewing property.');
 const start=validatesOffsetDateTime(input.startsAt,s.time_zone),duration=input.durationMinutes??s.duration_minutes,end=new Date(start.getTime()+duration*60000);
 if(start.getTime()<Date.now()+5*60000||start.getTime()>Date.now()+90*86400000)throw new ApiError(400,'VIEWING_TIME_OUTSIDE_POLICY','Choose an offered time at least five minutes ahead and within 90 days.');
 if(!withinAvailability(a,new Date(start.getTime()-s.buffer_before_minutes*60000),new Date(end.getTime()+s.buffer_after_minutes*60000),s.time_zone))conflict('This time and its buffers are outside the assigned agent availability.','STAFF_UNAVAILABLE');
 if(!await isFree(c,u.organization.id,input.propertyId,l.id,input.unitId,o.user_id,start,end,s.buffer_before_minutes,s.buffer_after_minutes,s.time_zone))conflict('This slot is unavailable. Choose another offered time.','SLOT_UNAVAILABLE');
 const v=(await c.query("INSERT INTO viewings(organization_id,property_id,lead_id,unit_id,starts_at,status,ends_at,time_zone,owner_membership_id,duration_minutes,buffer_before_minutes,buffer_after_minutes,location,managed_by_ootla,booking_origin,created_by_user_id,created_by_membership_id) VALUES($1,$2,$3,$4,$5,'scheduled',$6,$7,$8,$9,$10,$11,$12,true,$13,$14,$15) RETURNING *",[u.organization.id,input.propertyId,l.id,input.unitId,start,end,s.time_zone,o.id,duration,s.buffer_before_minutes,s.buffer_after_minutes,input.location??s.location,origin,u.id,u.membershipId])).rows[0];
 const stage=await leadStage(c,u,l,v,'booked',origin);await event(c,u,v,'booked',origin,invitationId,{...stage,startsAt:iso(start),endsAt:iso(end),notification:'simulation'});
 return v;
}
async function slotRows(c:PoolClient,u:Actor,i:z.infer<typeof calendarSlotsSchema>):Promise<CalendarSlots>{
 await context(c,u,i.leadId,i.propertyId);
 const s=await settings(c,u.organization.id,i.propertyId),o=await owner(c,u,i.ownerMembershipId,i.propertyId,i.leadId);
 let a:Row;try{a=await availability(c,u.organization.id,i.propertyId,i.ownerMembershipId);}catch(error){if(error instanceof ApiError&&error.code==='STAFF_UNAVAILABLE')return{...paged([],0,i),timeZone:s.time_zone,durationMinutes:i.durationMinutes??s.duration_minutes,notice:'No eligible staff availability is configured. The work remains unassigned until availability is set.'};throw error;}
 if(i.unitId&&!(await c.query('SELECT id FROM units WHERE id=$1 AND organization_id=$2 AND property_id=$3',[i.unitId,u.organization.id,i.propertyId])).rowCount)throw new ApiError(400,'INVALID_UNIT','Choose a unit from this property.');
 if(i.excludeViewingId){const existing=await actualViewing(c,u,i.excludeViewingId);if(existing.lead_id!==i.leadId||existing.property_id!==i.propertyId)throw new ApiError(400,'INVALID_VIEWING_CONTEXT','Use the same viewing context when finding reschedule options.');}
 const duration=i.durationMinutes??s.duration_minutes,slots:CalendarSlots['items']=[];
 let legacy=false;
 for(let day=0;day<i.days;day++){
  const date=addLocalDays(i.date,day),bounds=localDayBounds(date,s.time_zone);
  if(bounds.until.getTime()<Date.now()||bounds.from.getTime()>Date.now()+90*86400000)continue;
  if((await c.query("SELECT id FROM viewings WHERE organization_id=$1 AND property_id=$2 AND NOT managed_by_ootla AND status='scheduled' AND starts_at >=$3 AND starts_at<$4 LIMIT 1",[u.organization.id,i.propertyId,bounds.from,bounds.until])).rowCount){legacy=true;continue;}
  for(let minute=0;minute<1440;minute+=15){
   if(!a.windows.some((w:{weekday:number;start:string;end:string})=>w.weekday===weekday(date)&&clockMinutes(w.start)<=minute&&minute<clockMinutes(w.end)))continue;
   for(const start of localInstants(date,minute,s.time_zone)){
    if(start.getTime()<Date.now()+5*60000||start.getTime()>Date.now()+90*86400000)continue;
    const end=new Date(start.getTime()+duration*60000);
    if(!withinAvailability(a,new Date(start.getTime()-s.buffer_before_minutes*60000),new Date(end.getTime()+s.buffer_after_minutes*60000),s.time_zone))continue;
    if(await isFree(c,u.organization.id,i.propertyId,i.leadId,i.unitId??null,o.user_id,start,end,s.buffer_before_minutes,s.buffer_after_minutes,s.time_zone,i.excludeViewingId))slots.push({startsAt:zonedIso(start,s.time_zone),endsAt:zonedIso(end,s.time_zone),utcOffset:zonedIso(start,s.time_zone).slice(-6)});
   }
  }
 }
 slots.sort((a,b)=>Date.parse(a.startsAt)-Date.parse(b.startsAt));
 return{...paged(slots.slice((i.page-1)*i.pageSize,i.page*i.pageSize),slots.length,i),timeZone:s.time_zone,durationMinutes:duration,notice:legacy?'A legacy viewing has unknown duration/assignment. Its property-local day is blocked; choose another date.':slots.length?null:'No slots meet the current staff availability and resource constraints.'};
}
export class Calendar{
 constructor(private readonly database:Database,private readonly config:ServerConfig,private readonly client?:PoolClient){}
 private transaction<T>(run:(c:PoolClient)=>Promise<T>):Promise<T>{return this.client?run(this.client):this.database.transaction(run);}
 async lockPrepared(user:Actor,requestKey:string,input:{kind:'book';propertyId:string;leadId:string;unitId:string|null;ownerMembershipId:string}|{kind:'reschedule';viewingId:string;ownerMembershipId:string}){return this.transaction(async c=>{
  const raw=input.kind==='book'?{property_id:input.propertyId,lead_id:input.leadId,unit_id:input.unitId,owner_membership_id:null}:(await c.query('SELECT * FROM viewings WHERE id=$1 AND organization_id=$2',[input.viewingId,user.organization.id])).rows[0];if(!raw)missing();
  const users=(await c.query('SELECT user_id FROM organization_memberships WHERE organization_id=$1 AND id=ANY($2::uuid[])',[user.organization.id,[raw.owner_membership_id,input.ownerMembershipId].filter(Boolean)])).rows;
  await resources(c,['property:'+raw.property_id,'lead:'+raw.lead_id,...(raw.unit_id?['unit:'+raw.unit_id]:[]),...users.map(r=>'staff:'+r.user_id),'request:'+user.organization.id+':'+user.membershipId+':'+requestKey]);
 });}

 async list(user:Actor,digest:string,i:z.infer<typeof calendarQuerySchema>):Promise<CalendarDirectory>{
  return this.transaction(async c=>{
   const u=await authorize(c,user,digest);if(i.propertyId)await property(c,u,i.propertyId);
   let date=i.date??localDate(new Date(),i.timeZone);
   if(i.view==='week')date=addLocalDays(date,-((weekday(date)+6)%7));
   const end=addLocalDays(date,i.view==='day'?1:i.view==='week'?7:30),from=i.upcoming?new Date():localDayBounds(date,i.timeZone).from,until=i.upcoming?new Date('9999-12-31T00:00:00Z'):localDayBounds(end,i.timeZone).from;
   const values=[u.organization.id,u.organization.role,u.membershipId,from,until,i.propertyId??null,i.ownerMembershipId??null,i.status,i.leadId??null];
   const where="v.organization_id=$1 AND "+propertyScope+" AND "+leadScope+" AND v.starts_at<$5 AND ($9::uuid IS NULL OR v.lead_id=$9) AND ($12::boolean=false OR v.starts_at>=$4) AND ((v.managed_by_ootla AND v.ends_at>$4) OR (NOT v.managed_by_ootla AND v.starts_at>=$4)) AND ($6::uuid IS NULL OR v.property_id=$6) AND ($7::uuid IS NULL OR v.owner_membership_id=$7) AND ($8='all' OR v.status=$8)";
   const total=Number((await c.query('SELECT count(*) AS total FROM viewings v'+viewingJoins+' WHERE '+where.replace('$12::boolean', '$10::boolean'),[...values,Boolean(i.upcoming)])).rows[0].total);
   const rows=(await c.query('SELECT '+viewingColumns+' FROM viewings v'+viewingJoins+' WHERE '+where+' ORDER BY v.starts_at,v.id LIMIT $10 OFFSET $11',[...values,i.pageSize,(i.page-1)*i.pageSize,Boolean(i.upcoming)])).rows;
   return{...paged(rows.map(viewingDto),total,i),range:{from:from.toISOString(),until:until.toISOString(),timeZone:i.timeZone,view:i.view},access:{canManage:true}};
  });
 }
 async options(user:Actor,digest:string,i:z.infer<typeof calendarOptionsSchema>):Promise<CalendarOptions>{
  return this.transaction(async c=>{
   const u=await authorize(c,user,digest);
   let selected:Row|undefined;
   if(i.propertyId)selected=await property(c,u,i.propertyId);
   if(i.leadId){const raw=(await c.query('SELECT property_id FROM leads WHERE organization_id=$1 AND id=$2',[u.organization.id,i.leadId])).rows[0];if(!raw)missing();if(!selected)selected=await property(c,u,raw.property_id);await context(c,u,i.leadId,selected.id);}
   const pwhere="p.organization_id=$1 AND "+propertyScope+" AND ($4='' OR strpos(lower(p.name),lower($4))>0)";
   const properties=(await c.query('SELECT p.id,p.name,count(*) OVER()::int AS total FROM properties p WHERE '+pwhere+' ORDER BY lower(p.name),p.id LIMIT 25',[u.organization.id,u.organization.role,u.membershipId,i.propertySearch])).rows;
   const lwhere="l.organization_id=$1 AND "+leadScope+" AND ($4::uuid IS NULL OR EXISTS(SELECT 1 FROM lead_property_interests li WHERE li.organization_id=l.organization_id AND li.lead_id=l.id AND li.property_id=$4)) AND ($5='' OR strpos(lower(c.display_name||' '||c.email),lower($5))>0 OR l.id=$6::uuid)";
   const leads=(await c.query("SELECT l.id,c.display_name AS name,l.property_id,count(*) OVER()::int AS total FROM leads l JOIN contacts c ON c.id=l.contact_id AND c.organization_id=l.organization_id WHERE "+lwhere+" ORDER BY (l.id=$6::uuid) DESC NULLS LAST,lower(c.display_name),l.id LIMIT 25",[u.organization.id,u.organization.role,u.membershipId,selected?.id??null,i.leadSearch,i.leadId??null])).rows;
   let owners:Row[]=[],units:Row[]=[],s:Row|undefined;
   if(selected){
    s=(await c.query('SELECT * FROM property_viewing_settings WHERE organization_id=$1 AND property_id=$2',[u.organization.id,selected.id])).rows[0];
    owners=(await c.query("SELECT m.id AS membership_id,m.role,u.display_name AS name,a.enabled,a.windows,a.version,count(*) OVER()::int AS total FROM organization_memberships m JOIN users u ON u.id=m.user_id AND u.active AND u.account_kind='staff' LEFT JOIN viewing_staff_availability a ON a.organization_id=m.organization_id AND a.property_id=$2 AND a.membership_id=m.id WHERE m.organization_id=$1 AND m.active AND EXISTS(SELECT 1 FROM role_permissions rp WHERE rp.role_key=m.role AND rp.permission='leasing.manage') AND ($3='' OR strpos(lower(u.display_name),lower($3))>0) AND (m.role='organization_admin' OR (EXISTS(SELECT 1 FROM property_access_assignments pa WHERE pa.organization_id=m.organization_id AND pa.membership_id=m.id AND pa.property_id=$2) AND ($4::uuid IS NULL OR NOT EXISTS(SELECT 1 FROM lead_property_interests li WHERE li.organization_id=m.organization_id AND li.lead_id=$4 AND NOT EXISTS(SELECT 1 FROM property_access_assignments pa WHERE pa.organization_id=li.organization_id AND pa.membership_id=m.id AND pa.property_id=li.property_id))))) ORDER BY lower(u.display_name),m.id LIMIT 50",[u.organization.id,selected.id,i.ownerSearch,i.leadId??null])).rows;
    units=(await c.query('SELECT id,label,count(*) OVER()::int AS total FROM units WHERE organization_id=$1 AND property_id=$2 ORDER BY lower(label),id LIMIT 100',[u.organization.id,selected.id])).rows;
   }
   return{properties:paged(properties.map(r=>({id:r.id,name:r.name})),properties[0]?.total??0,{page:1,pageSize:25}),selectedProperty:selected?{id:selected.id,name:selected.name}:null,settings:selected?settingsDto(s):null,
    owners:owners.map(r=>({membershipId:r.membership_id,name:r.name,role:r.role,availability:availabilityDto(r.version?r:undefined)})),ownerTotal:owners[0]?.total??0,
    leads:paged(leads.map(r=>({id:r.id,name:r.name,propertyId:r.property_id})),leads[0]?.total??0,{page:1,pageSize:25}),
    units:units.map(r=>({id:r.id,label:r.label})),unitTotal:units[0]?.total??0,access:{canManage:true,canConfigure:u.organization.role==='organization_admin'||u.permissions.includes('properties.manage'),canManageOwnAvailability:true}};
  });
 }
 async slots(user:Actor,digest:string,i:z.infer<typeof calendarSlotsSchema>):Promise<CalendarSlots>{return this.transaction(async c=>slotRows(c,await authorize(c,user,digest),i));}
 async detail(user:Actor,digest:string,id:string,p:Page):Promise<{viewing:CalendarViewing;events:Paginated<CalendarEvent>}>{
  return this.transaction(async c=>{
   const u=await authorize(c,user,digest),v=await actualViewing(c,u,id);
   const total=Number((await c.query('SELECT count(*) AS total FROM viewing_events WHERE organization_id=$1 AND viewing_id=$2',[u.organization.id,id])).rows[0].total);
   const rows=(await c.query('SELECT e.*,u.display_name AS actor_name FROM viewing_events e LEFT JOIN users u ON u.id=e.actor_user_id WHERE e.organization_id=$1 AND e.viewing_id=$2 ORDER BY e.occurred_at DESC,e.id LIMIT $3 OFFSET $4',[u.organization.id,id,p.pageSize,(p.page-1)*p.pageSize])).rows;
   return{viewing:viewingDto(v),events:paged(rows.map(r=>({id:r.id,kind:r.kind,summary:'Viewing '+r.kind.replaceAll('_',' ')+(r.origin==='public'?' through a secure booking link.':'.'),actorLabel:r.origin==='public'?'Public booking':r.actor_name,origin:r.origin,occurredAt:iso(r.occurred_at)!,notification:'simulation' as const})),total,p)};
  });
 }
 async book(user:Actor,digest:string,i:z.infer<typeof calendarBookSchema>):Promise<{viewing:CalendarViewing}>{
  return this.transaction(async c=>{
   const raw=(await c.query('SELECT user_id FROM organization_memberships WHERE id=$1 AND organization_id=$2',[i.ownerMembershipId,user.organization.id])).rows[0];if(!raw)throw new ApiError(400,'INVALID_VIEWING_OWNER','Choose an eligible assigned agent.');
   await resources(c,['staff:'+raw.user_id,'property:'+i.propertyId,'lead:'+i.leadId,...(i.unitId?['unit:'+i.unitId]:[]),'request:'+user.organization.id+':'+user.membershipId+':'+i.requestKey]);
   const u=await authorize(c,user,digest);
   const result=await receipt(c,u,'staff:'+u.membershipId,i.requestKey,'book',i,async()=>({viewingId:(await reserve(c,u,i,'staff',null)).id}));
   return{viewing:viewingDto(await actualViewing(c,u,String(result.result.viewingId)))};
  });
 }
 async reschedule(user:Actor,digest:string,id:string,i:z.infer<typeof calendarRescheduleSchema>):Promise<{viewing:CalendarViewing}>{
  return this.transaction(async c=>{
   const raw=(await c.query('SELECT * FROM viewings WHERE id=$1 AND organization_id=$2',[id,user.organization.id])).rows[0];if(!raw)missing();
   const users=(await c.query('SELECT user_id FROM organization_memberships WHERE organization_id=$1 AND id=ANY($2::uuid[])',[user.organization.id,[raw.owner_membership_id,i.ownerMembershipId].filter(Boolean)])).rows;
   await resources(c,['property:'+raw.property_id,'lead:'+raw.lead_id,...(raw.unit_id?['unit:'+raw.unit_id]:[]),...users.map(r=>'staff:'+r.user_id),'request:'+user.organization.id+':'+user.membershipId+':'+i.requestKey]);
   const u=await authorize(c,user,digest),l=await context(c,u,raw.lead_id,raw.property_id,true);
   const result=await receipt(c,u,'staff:'+u.membershipId,i.requestKey,'reschedule',{id,...i},async()=>{
    const v=(await c.query('SELECT * FROM viewings WHERE id=$1 AND organization_id=$2 FOR UPDATE',[id,u.organization.id])).rows[0];
    if(!v.managed_by_ootla)conflict('Legacy viewings are read-only until their missing scheduling metadata is reconciled.','LEGACY_VIEWING_READ_ONLY');
    if(v.version!==i.version)conflict('This viewing changed. Reload it before saving.','VERSION_CONFLICT');
    if(v.status!=='scheduled')conflict('Only a scheduled viewing can be rescheduled.','INVALID_VIEWING_STATUS');
    const s=await settings(c,u.organization.id,v.property_id),o=await owner(c,u,i.ownerMembershipId,v.property_id,l.id),a=await availability(c,u.organization.id,v.property_id,o.id);
    const start=validatesOffsetDateTime(i.startsAt,s.time_zone),duration=i.durationMinutes??s.duration_minutes,end=new Date(start.getTime()+duration*60000);
    if(start.getTime()<Date.now()+300000||start.getTime()>Date.now()+90*86400000)throw new ApiError(400,'VIEWING_TIME_OUTSIDE_POLICY','Choose a future offered time within 90 days.');
    if(!withinAvailability(a,new Date(start.getTime()-s.buffer_before_minutes*60000),new Date(end.getTime()+s.buffer_after_minutes*60000),s.time_zone))conflict('The time and its buffers are outside staff availability.','STAFF_UNAVAILABLE');
    if(!await isFree(c,u.organization.id,v.property_id,l.id,v.unit_id,o.user_id,start,end,s.buffer_before_minutes,s.buffer_after_minutes,s.time_zone,id))conflict('This slot is unavailable. Choose another offered time.','SLOT_UNAVAILABLE');
    await c.query('UPDATE viewings SET starts_at=$2,ends_at=$3,time_zone=$4,owner_membership_id=$5,duration_minutes=$6,buffer_before_minutes=$7,buffer_after_minutes=$8,location=$9,version=version+1,updated_at=now() WHERE id=$1',[id,start,end,s.time_zone,o.id,duration,s.buffer_before_minutes,s.buffer_after_minutes,i.location??s.location]);
    await event(c,u,v,'rescheduled','staff',null,{previousStartsAt:iso(v.starts_at),startsAt:iso(start),endsAt:iso(end),notification:'simulation'});return{viewingId:id};
   });
   return{viewing:viewingDto(await actualViewing(c,u,String(result.result.viewingId)))};
  });
 }
 async status(user:Actor,digest:string,id:string,i:z.infer<typeof calendarStatusSchema>):Promise<{viewing:CalendarViewing}>{
  return this.transaction(async c=>{
   const raw=(await c.query('SELECT v.*,m.user_id FROM viewings v LEFT JOIN organization_memberships m ON m.id=v.owner_membership_id WHERE v.id=$1 AND v.organization_id=$2',[id,user.organization.id])).rows[0];if(!raw)missing();
   await resources(c,['property:'+raw.property_id,'lead:'+raw.lead_id,...(raw.unit_id?['unit:'+raw.unit_id]:[]),...(raw.user_id?['staff:'+raw.user_id]:[]),'request:'+user.organization.id+':'+user.membershipId+':'+i.requestKey]);
   const u=await authorize(c,user,digest),l=await context(c,u,raw.lead_id,raw.property_id,true);
   const result=await receipt(c,u,'staff:'+u.membershipId,i.requestKey,'status',{id,...i},async()=>{
    const v=(await c.query('SELECT * FROM viewings WHERE id=$1 AND organization_id=$2 FOR UPDATE',[id,u.organization.id])).rows[0];
    if(!v.managed_by_ootla)conflict('Legacy viewings have incomplete metadata and are read-only.','LEGACY_VIEWING_READ_ONLY');
    if(v.version!==i.version)conflict('This viewing changed. Reload it before saving.','VERSION_CONFLICT');
    if(v.status!=='scheduled')conflict('This viewing is no longer scheduled.','INVALID_VIEWING_STATUS');
    if(i.status==='completed'&&new Date(v.ends_at).getTime()>Date.now())conflict('Complete a viewing after its scheduled end.','VIEWING_NOT_FINISHED');
    if(i.status==='no_show'&&new Date(v.starts_at).getTime()>Date.now())conflict('A no-show can be recorded after the scheduled start.','VIEWING_NOT_STARTED');
    await c.query('UPDATE viewings SET status=$2,version=version+1,updated_at=now() WHERE id=$1',[id,i.status]);
    const stage=await leadStage(c,u,l,v,i.status,'staff');await event(c,u,v,i.status,'staff',null,{...stage,reason:i.reason,notification:'simulation'});return{viewingId:id};
   });
   return{viewing:viewingDto(await actualViewing(c,u,String(result.result.viewingId)))};
  });
 }
 async configure(user:Actor,digest:string,propertyId:string,i:z.infer<typeof calendarSettingsSchema>):Promise<{settings:CalendarPropertySettings}>{
  return this.transaction(async c=>{
   await resources(c,['property:'+propertyId]);const u=await authorize(c,user,digest);await property(c,u,propertyId);
   if(u.organization.role!=='organization_admin'&&!u.permissions.includes('properties.manage'))denied();
   const old=(await c.query('SELECT * FROM property_viewing_settings WHERE organization_id=$1 AND property_id=$2 FOR UPDATE',[u.organization.id,propertyId])).rows[0];
   if((old?.version??1)!==i.version)conflict('These settings changed. Reload before saving.','VERSION_CONFLICT');
   if((await c.query("SELECT id FROM viewings WHERE organization_id=$1 AND property_id=$2 AND managed_by_ootla AND status='scheduled' AND ends_at>now() LIMIT 1",[u.organization.id,propertyId])).rowCount)conflict('Reschedule or cancel future managed viewings before changing this schedule.','ACTIVE_VIEWINGS');
   const row=(await c.query('INSERT INTO property_viewing_settings(organization_id,property_id,enabled,time_zone,duration_minutes,buffer_before_minutes,buffer_after_minutes,location,public_booking_enabled,version) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(property_id) DO UPDATE SET enabled=EXCLUDED.enabled,time_zone=EXCLUDED.time_zone,duration_minutes=EXCLUDED.duration_minutes,buffer_before_minutes=EXCLUDED.buffer_before_minutes,buffer_after_minutes=EXCLUDED.buffer_after_minutes,location=EXCLUDED.location,public_booking_enabled=EXCLUDED.public_booking_enabled,version=EXCLUDED.version,updated_at=now() RETURNING *',[u.organization.id,propertyId,i.enabled,i.timeZone,i.durationMinutes,i.bufferBeforeMinutes,i.bufferAfterMinutes,i.location,i.publicBookingEnabled,i.version+1])).rows[0];
   await audit(c,u,'viewing.settings_updated',{propertyId});return{settings:settingsDto(row)};
  });
 }
 async setAvailability(user:Actor,digest:string,propertyId:string,membershipId:string,i:z.infer<typeof calendarAvailabilitySchema>):Promise<{availability:CalendarAvailability}>{
  return this.transaction(async c=>{
   const raw=(await c.query('SELECT user_id FROM organization_memberships WHERE id=$1 AND organization_id=$2',[membershipId,user.organization.id])).rows[0];if(!raw)throw new ApiError(400,'INVALID_VIEWING_OWNER','Choose an eligible staff member.');
   await resources(c,['property:'+propertyId,'staff:'+raw.user_id]);const u=await authorize(c,user,digest);await property(c,u,propertyId);await owner(c,u,membershipId,propertyId);
   if(membershipId!==u.membershipId&&u.organization.role!=='organization_admin'&&!u.permissions.includes('properties.manage'))denied();
   const ordered=[...i.windows].sort((a,b)=>a.weekday-b.weekday||a.start.localeCompare(b.start));
   if(ordered.some((w,index)=>index>0&&ordered[index-1]!.weekday===w.weekday&&ordered[index-1]!.end>w.start))throw new ApiError(400,'OVERLAPPING_AVAILABILITY','Availability windows on the same day must not overlap.');
   const old=(await c.query('SELECT * FROM viewing_staff_availability WHERE organization_id=$1 AND property_id=$2 AND membership_id=$3 FOR UPDATE',[u.organization.id,propertyId,membershipId])).rows[0];
   if((old?.version??1)!==i.version)conflict('Availability changed. Reload before saving.','VERSION_CONFLICT');
   if((await c.query("SELECT id FROM viewings WHERE organization_id=$1 AND property_id=$2 AND owner_membership_id=$3 AND managed_by_ootla AND status='scheduled' AND ends_at>now() LIMIT 1",[u.organization.id,propertyId,membershipId])).rowCount)conflict('Reschedule or cancel this agent future viewings before changing availability.','ACTIVE_VIEWINGS');
   const row=(await c.query('INSERT INTO viewing_staff_availability(organization_id,property_id,membership_id,enabled,windows,version) VALUES($1,$2,$3,$4,$5::jsonb,$6) ON CONFLICT(property_id,membership_id) DO UPDATE SET enabled=EXCLUDED.enabled,windows=EXCLUDED.windows,version=EXCLUDED.version,updated_at=now() RETURNING *',[u.organization.id,propertyId,membershipId,i.enabled,JSON.stringify(ordered),i.version+1])).rows[0];
   await audit(c,u,'viewing.availability_updated',{propertyId,membershipId});return{availability:availabilityDto(row)};
  });
 }

 async invitations(user:Actor,digest:string,i:z.infer<typeof calendarInvitationQuerySchema>):Promise<Paginated<CalendarInvitation>>{
  return this.transaction(async c=>{
   const u=await authorize(c,user,digest);if(i.propertyId)await property(c,u,i.propertyId);
   if(i.leadId){const l=(await c.query('SELECT property_id FROM leads WHERE organization_id=$1 AND id=$2',[u.organization.id,i.leadId])).rows[0];if(!l)missing();await context(c,u,i.leadId,i.propertyId??l.property_id);}
   const where="v.organization_id=$1 AND "+propertyScope+" AND "+leadScope+" AND ($4::uuid IS NULL OR v.lead_id=$4) AND ($5::uuid IS NULL OR v.property_id=$5)";
   const joins=" JOIN properties p ON p.id=v.property_id AND p.organization_id=v.organization_id JOIN leads l ON l.id=v.lead_id AND l.organization_id=v.organization_id ";
   const values=[u.organization.id,u.organization.role,u.membershipId,i.leadId??null,i.propertyId??null];
   const total=Number((await c.query('SELECT count(*) AS total FROM viewing_invitations v'+joins+' WHERE '+where,values)).rows[0].total);
   const rows=(await c.query('SELECT v.* FROM viewing_invitations v'+joins+' WHERE '+where+' ORDER BY v.created_at DESC,v.id LIMIT $6 OFFSET $7',[...values,i.pageSize,(i.page-1)*i.pageSize])).rows;
   return paged(rows.map(invitationDto),total,i);
  });
 }
 async invite(user:Actor,digest:string,i:z.infer<typeof calendarInvitationSchema>):Promise<CalendarIssuedInvitation>{
  return this.transaction(async c=>{
   const raw=(await c.query('SELECT user_id FROM organization_memberships WHERE organization_id=$1 AND id=$2',[user.organization.id,i.ownerMembershipId])).rows[0];if(!raw)throw new ApiError(400,'INVALID_VIEWING_OWNER','Choose an eligible agent.');
   await resources(c,['property:'+i.propertyId,'lead:'+i.leadId,'staff:'+raw.user_id,'request:'+user.organization.id+':'+user.membershipId+':'+i.requestKey]);
   const u=await authorize(c,user,digest),l=await context(c,u,i.leadId,i.propertyId,true),s=await settings(c,u.organization.id,i.propertyId);await owner(c,u,i.ownerMembershipId,i.propertyId,i.leadId);await availability(c,u.organization.id,i.propertyId,i.ownerMembershipId);
   if(!s.public_booking_enabled)conflict('Enable public booking in the approved property schedule first.','PUBLIC_BOOKING_DISABLED');
   if(['lost_closed','won','leased'].includes(l.pipeline_stage))conflict('This lead is no longer active.','LEAD_NOT_ACTIVE');
   if(i.unitId&&!(await c.query('SELECT id FROM units WHERE id=$1 AND organization_id=$2 AND property_id=$3',[i.unitId,u.organization.id,i.propertyId])).rowCount)throw new ApiError(400,'INVALID_UNIT','Choose a unit from this property.');
   let token:string|undefined;
   const result=await receipt(c,u,'staff:'+u.membershipId,i.requestKey,'invite',i,async()=>{
    token=randomBytes(32).toString('hex');const hash=this.tokenDigest(token);
    const row=(await c.query('INSERT INTO viewing_invitations(organization_id,property_id,lead_id,unit_id,owner_membership_id,token_digest,settings_version,duration_minutes,expires_at,created_by_user_id,created_by_membership_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *',[u.organization.id,i.propertyId,i.leadId,i.unitId,i.ownerMembershipId,hash,s.version,i.durationMinutes??s.duration_minutes,new Date(Date.now()+i.expiresInHours*3600000),u.id,u.membershipId])).rows[0];
    await audit(c,u,'viewing.invitation_issued',{invitationId:row.id,propertyId:i.propertyId});return{invitationId:row.id};
   });
   if(result.replayed||!token)conflict('This invitation was already issued. Its secret is returned only once; revoke it and create a new invitation if needed.','INVITATION_ALREADY_ISSUED');
   const row=(await c.query('SELECT * FROM viewing_invitations WHERE id=$1 AND organization_id=$2',[result.result.invitationId,u.organization.id])).rows[0];
   return{invitation:invitationDto(row),token:token!,bookingPath:'/book#token='+token};
  });
 }
 async revoke(user:Actor,digest:string,id:string,requestKey:string):Promise<{invitation:CalendarInvitation}>{
  return this.transaction(async c=>{
   const raw=(await c.query('SELECT * FROM viewing_invitations WHERE id=$1 AND organization_id=$2',[id,user.organization.id])).rows[0];if(!raw)missing();
   await resources(c,['invitation:'+id,'lead:'+raw.lead_id,'property:'+raw.property_id,'request:'+user.organization.id+':'+user.membershipId+':'+requestKey]);
   const u=await authorize(c,user,digest);await context(c,u,raw.lead_id,raw.property_id,true);
   await receipt(c,u,'staff:'+u.membershipId,requestKey,'revoke',{id},async()=>{await c.query('UPDATE viewing_invitations SET revoked_at=coalesce(revoked_at,now()) WHERE id=$1',[id]);await audit(c,u,'viewing.invitation_revoked',{invitationId:id});return{invitationId:id};});
   return{invitation:invitationDto((await c.query('SELECT * FROM viewing_invitations WHERE id=$1',[id])).rows[0])};
  });
 }
 private tokenDigest(token:string):string{return createHmac('sha256',this.config.sessionSecret).update('ootla:viewing-invitation:'+token).digest('hex');}
 private slotKey(invitation:Row,start:Date):string{return createHmac('sha256',this.config.sessionSecret).update(['ootla:viewing-slot',invitation.id,invitation.token_digest,invitation.lead_id,invitation.property_id,invitation.unit_id??'',invitation.owner_membership_id,String(invitation.settings_version),String(invitation.duration_minutes),start.toISOString()].join(':')).digest('hex');}
 private async invitation(c:PoolClient,token:string,lock=false):Promise<Row>{
  const row=(await c.query("SELECT i.*,p.name AS property_label FROM viewing_invitations i JOIN properties p ON p.id=i.property_id AND p.organization_id=i.organization_id WHERE i.token_digest=$1 AND i.revoked_at IS NULL AND i.expires_at>clock_timestamp()"+(lock?' FOR UPDATE OF i':''),[this.tokenDigest(token)])).rows[0];
  if(!row)throw new ApiError(410,'INVITATION_UNAVAILABLE','This booking link is unavailable. Ask the property team for a new link.');
  return row;
 }
 private async invitationActor(c:PoolClient,i:Row):Promise<Actor>{
  const raw=(await c.query('SELECT u.id,u.email,u.display_name,m.id AS membership_id,m.role,o.name AS organization_name FROM users u JOIN organization_memberships m ON m.user_id=u.id JOIN organizations o ON o.id=m.organization_id WHERE m.id=$1 AND m.organization_id=$2 AND u.id=$3',[i.created_by_membership_id,i.organization_id,i.created_by_user_id])).rows[0];
  if(!raw)throw new ApiError(410,'INVITATION_UNAVAILABLE','This booking link is unavailable.');
  const actor:Actor={id:raw.id,email:raw.email,name:raw.display_name,membershipId:raw.membership_id,sessionExpiresAt:i.expires_at.toISOString(),permissions:[],organization:{id:i.organization_id,name:raw.organization_name,role:raw.role}};
  try{return await authorize(c,actor);}catch{throw new ApiError(410,'INVITATION_UNAVAILABLE','This booking link is unavailable. Ask the property team for a new link.');}
 }
 private async invitationPolicy(c:PoolClient,i:Row):Promise<{actor:Actor;settings:Row}>{
  const u=await this.invitationActor(c,i);
  try{
   await context(c,u,i.lead_id,i.property_id);await owner(c,u,i.owner_membership_id,i.property_id,i.lead_id);
   const s=await settings(c,i.organization_id,i.property_id);
   if(!s.public_booking_enabled||s.version!==i.settings_version)throw new Error('Policy changed.');
   return{actor:u,settings:s};
  }catch{throw new ApiError(410,'INVITATION_UNAVAILABLE','This booking link is unavailable. Ask the property team for a new link.');}
 }
 async publicRead(i:z.infer<typeof publicCalendarReadSchema>):Promise<PublicCalendarInvitation>{
  return this.transaction(async c=>{
   const invitation=await this.invitation(c,i.token),policy=await this.invitationPolicy(c,invitation),s=policy.settings;
   if(invitation.booked_viewing_id){
    const v=(await c.query('SELECT * FROM viewings WHERE id=$1 AND organization_id=$2',[invitation.booked_viewing_id,invitation.organization_id])).rows[0];
    const canManage=this.canManageBooking(invitation,v);let slots:PublicCalendarInvitation['slots']=paged([],0,i);
    if(i.manage&&canManage){
     const today=localDate(new Date(),s.time_zone),date=i.date??today;
     if(date<today||date>addLocalDays(today,14))throw new ApiError(400,'PUBLIC_BOOKING_RANGE','Choose a date within the next fourteen days.');
     const result=await slotRows(c,policy.actor,{propertyId:invitation.property_id,leadId:invitation.lead_id,ownerMembershipId:invitation.owner_membership_id,unitId:invitation.unit_id,date,days:Math.min(i.days,15-Math.round((Date.parse(date+'T00:00:00Z')-Date.parse(today+'T00:00:00Z'))/86400000)),durationMinutes:invitation.duration_minutes,page:i.page,pageSize:i.pageSize,excludeViewingId:v.id});
     slots={...result,items:result.items.map(slot=>({...slot,slotKey:this.changeSlotKey(invitation,v,new Date(slot.startsAt))}))};
    }
    return{state:'booked',propertyLabel:invitation.property_label,location:v?.location??s.location,timeZone:v?.time_zone??s.time_zone,durationMinutes:v?.duration_minutes??invitation.duration_minutes,slots,notice:canManage?'You may change or cancel this viewing until five minutes before it starts, while this link remains valid.':'Contact the property team for further changes.',booking:v?{startsAt:iso(v.starts_at)!,endsAt:iso(v.ends_at)!,status:v.status,version:v.version,canManage}:null};
   }
   const date=i.date??localDate(new Date(),s.time_zone),today=localDate(new Date(),s.time_zone);
   if(date<today||date>addLocalDays(today,14))throw new ApiError(400,'PUBLIC_BOOKING_RANGE','Choose a date within the next fourteen days.');
   const result=await slotRows(c,policy.actor,{propertyId:invitation.property_id,leadId:invitation.lead_id,ownerMembershipId:invitation.owner_membership_id,unitId:invitation.unit_id,date,days:Math.min(i.days,15-Math.round((Date.parse(date+'T00:00:00Z')-Date.parse(today+'T00:00:00Z'))/86400000)),durationMinutes:invitation.duration_minutes,page:i.page,pageSize:i.pageSize});
   return{state:'available',propertyLabel:invitation.property_label,location:s.location,timeZone:s.time_zone,durationMinutes:invitation.duration_minutes,slots:{...result,items:result.items.map(slot=>({...slot,slotKey:this.slotKey(invitation,new Date(slot.startsAt))}))},notice:result.notice,booking:null};
  });
 }
 private canManageBooking(invitation:Row,v:Row):boolean{return Boolean(v?.managed_by_ootla&&v.status==='scheduled'&&new Date(v.starts_at).getTime()>Date.now()+300000&&v.owner_membership_id===invitation.owner_membership_id&&v.unit_id===invitation.unit_id&&v.duration_minutes===invitation.duration_minutes);}
 private changeSlotKey(invitation:Row,v:Row,start:Date):string{return this.slotKey({...invitation,settings_version:String(invitation.settings_version)+':viewing:'+v.version},start);}
 async publicManage(i:z.infer<typeof publicCalendarManageSchema>){return this.transaction(async c=>{
  const initial=await this.invitation(c,i.token),staff=(await c.query('SELECT user_id FROM organization_memberships WHERE id=$1 AND organization_id=$2',[initial.owner_membership_id,initial.organization_id])).rows[0];
  if(!staff||!initial.booked_viewing_id)throw new ApiError(410,'INVITATION_UNAVAILABLE','This link has no available booking.');
  await resources(c,['invitation:'+initial.id,'lead:'+initial.lead_id,'property:'+initial.property_id,'staff:'+staff.user_id,...(initial.unit_id?['unit:'+initial.unit_id]:[]),'request:'+initial.organization_id+':public:'+initial.id+':'+i.requestKey]);
  const invitation=await this.invitation(c,i.token,true),policy=await this.invitationPolicy(c,invitation),u=policy.actor,s=policy.settings;
  const lead=await context(c,u,invitation.lead_id,invitation.property_id,true);
  await receipt(c,u,'public:'+invitation.id,i.requestKey,'public_manage',i,async()=>{
   const v=(await c.query('SELECT * FROM viewings WHERE id=$1 AND organization_id=$2 FOR UPDATE',[invitation.booked_viewing_id,invitation.organization_id])).rows[0];
   if(!v||!this.canManageBooking(invitation,v))conflict('This booking can no longer be changed through this link. Contact the property team.','BOOKING_CHANGED');
   if(v.version!==i.version)conflict('The booking changed. Refresh its current details before continuing.','VERSION_CONFLICT');
   if(i.action==='cancel'){
    await c.query("UPDATE viewings SET status='cancelled',version=version+1,updated_at=now() WHERE id=$1",[v.id]);
    const stage=await leadStage(c,u,lead,v,'cancelled','public');await event(c,u,v,'cancelled','public',invitation.id,{...stage,reason:'Cancelled by the booking-link holder.',notification:'simulation'});
   }else{
    const start=validatesOffsetDateTime(i.startsAt!,s.time_zone),end=new Date(start.getTime()+invitation.duration_minutes*60000);
    const expected=this.changeSlotKey(invitation,v,start);if(!timingSafeEqual(Buffer.from(expected,'hex'),Buffer.from(i.slotKey!,'hex')))throw new ApiError(400,'INVALID_BOOKING_SLOT','Choose an offered replacement time.');
    if(start.getTime()<Date.now()+300000||start.getTime()>Date.now()+14*86400000)throw new ApiError(400,'PUBLIC_BOOKING_RANGE','Choose a future offered time within fourteen days.');
    const a=await availability(c,u.organization.id,v.property_id,v.owner_membership_id);
    if(!withinAvailability(a,new Date(start.getTime()-s.buffer_before_minutes*60000),new Date(end.getTime()+s.buffer_after_minutes*60000),s.time_zone)||!await isFree(c,u.organization.id,v.property_id,v.lead_id,v.unit_id,staff.user_id,start,end,s.buffer_before_minutes,s.buffer_after_minutes,s.time_zone,v.id))conflict('This replacement time is no longer available. Choose another time.','SLOT_UNAVAILABLE');
    await c.query('UPDATE viewings SET starts_at=$2,ends_at=$3,version=version+1,updated_at=now() WHERE id=$1',[v.id,start,end]);
    await event(c,u,v,'rescheduled','public',invitation.id,{previousStartsAt:iso(v.starts_at),startsAt:iso(start),endsAt:iso(end),notification:'simulation'});
   }
   return{viewingId:v.id};
  });
  return{updated:true};
 });}
 async publicBook(i:z.infer<typeof publicCalendarBookSchema>):Promise<PublicCalendarConfirmation>{
  return this.transaction(async c=>{
   const initial=await this.invitation(c,i.token),raw=(await c.query('SELECT user_id FROM organization_memberships WHERE id=$1 AND organization_id=$2',[initial.owner_membership_id,initial.organization_id])).rows[0];
   if(!raw)throw new ApiError(410,'INVITATION_UNAVAILABLE','This booking link is unavailable.');
   await resources(c,['invitation:'+initial.id,'lead:'+initial.lead_id,'property:'+initial.property_id,'staff:'+raw.user_id,...(initial.unit_id?['unit:'+initial.unit_id]:[]),'request:'+initial.organization_id+':public:'+initial.id+':'+i.requestKey]);
   const invitation=await this.invitation(c,i.token,true),policy=await this.invitationPolicy(c,invitation),u=policy.actor,s=policy.settings;
   const start=validatesOffsetDateTime(i.startsAt,s.time_zone),expected=this.slotKey(invitation,start);
   if(!timingSafeEqual(Buffer.from(expected,'hex'),Buffer.from(i.slotKey,'hex')))throw new ApiError(400,'INVALID_BOOKING_SLOT','Choose an offered slot from this booking link.');
   const result=await receipt(c,u,'public:'+invitation.id,i.requestKey,'public_book',{startsAt:start.toISOString(),slotKey:i.slotKey},async()=>{
    if(invitation.booked_viewing_id)conflict('This link has already been used for a booking.','INVITATION_ALREADY_BOOKED');
    if(start.getTime()>Date.now()+14*86400000)throw new ApiError(400,'PUBLIC_BOOKING_RANGE','Choose an offered time within the next fourteen days.');
    const v=await reserve(c,u,{leadId:invitation.lead_id,propertyId:invitation.property_id,unitId:invitation.unit_id,ownerMembershipId:invitation.owner_membership_id,startsAt:i.startsAt,durationMinutes:invitation.duration_minutes},'public',invitation.id);
    await c.query('UPDATE viewing_invitations SET booked_viewing_id=$2,booked_at=now() WHERE id=$1',[invitation.id,v.id]);return{viewingId:v.id};
   });
   const v=(await c.query('SELECT starts_at,ends_at,status,time_zone,duration_minutes,location FROM viewings WHERE id=$1 AND organization_id=$2',[result.result.viewingId,invitation.organization_id])).rows[0];
   if(v.status!=='scheduled')conflict('The property team has updated this viewing. Refresh the booking link for its current status.','BOOKING_CHANGED');
   return{status:'booked',propertyLabel:invitation.property_label,location:v.location,timeZone:v.time_zone,startsAt:iso(v.starts_at)!,endsAt:iso(v.ends_at)!,durationMinutes:v.duration_minutes,notification:'simulation'};
  });
 }
}
