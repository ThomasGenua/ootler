import {createHmac} from 'node:crypto';
import type {z} from 'zod';
import type {AuthUser} from '../../shared/contracts.js';
import type {journeyPrepareSchema} from '../../shared/workflow-contracts.js';
import {shortlistCreateSchema,shortlistResponseSchema} from '../../shared/productivity-contracts.js';
import {calendarInvitationSchema,publicCalendarReadSchema,publicCalendarBookSchema,publicCalendarManageSchema} from '../../shared/calendar-contracts.js';
import {ApplicantPortal,type ApplicantPrincipal} from './applicant-portal.js';
import {applicantApplicationAccess} from './application-access.js';
import {PropertyOperations} from './property-operations-base.js';
import {UnitShortlists} from './unit-shortlists.js';
import {Calendar} from './calendar.js';
import {missing} from './operations-access.js';
import {ApiError} from '../http/errors.js';
export class ProspectJourney extends PropertyOperations {
 private token(kind:'shortlist'|'journey-booking',org:string,actor:string,key:string){return createHmac('sha256',this.config.sessionSecret).update(kind+':'+org+':'+actor+':'+key).digest('hex');}
 async prepare(u:AuthUser,d:string,i:z.infer<typeof journeyPrepareSchema>){
  await this.staff(u,d,(c,a)=>this.lead(c,a,i.leadId));
  const portal=new ApplicantPortal(this.database,this.config),app=await portal.staffCreate(u,i.leadId);
  const shortlisted=i.unitIds.length?await new UnitShortlists(this.database,this.config).create(u,d,shortlistCreateSchema.parse({requestKey:i.requestKey,leadId:i.leadId,title:'Your property options',unitIds:i.unitIds,expiresInDays:30,confirmed:true})):null;
  const booking=i.booking?await new Calendar(this.database,this.config).invite(u,d,calendarInvitationSchema.parse({...i.booking,requestKey:i.requestKey,leadId:i.leadId,expiresInHours:168}),this.token('journey-booking',u.organization.id,u.id,i.requestKey)):null;
  return this.staff(u,d,async(c,a)=>{await this.lead(c,a,i.leadId);return this.receipt(c,a,'journey:prepare',{...i,requestKey:createHmac('sha256',this.config.sessionSecret).update('journey-receipt:'+i.requestKey).digest('hex').slice(0,32).replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/,'$1-$2-$3-$4-$5')},async()=>{await c.query('INSERT INTO prospect_journeys(application_id,organization_id,lead_id,request_key,created_by,membership_id,shortlist_id,booking_invitation_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(application_id) DO UPDATE SET request_key=$4,created_by=$5,membership_id=$6,shortlist_id=$7,booking_invitation_id=$8,created_at=now()',[app.application.id,a.organization.id,i.leadId,i.requestKey,a.id,a.membershipId,shortlisted?.id??null,booking?.invitation.id??null]);return{applicationId:app.application.id,portalPath:'/applicant/journey?application='+app.application.id,staffPath:'/admin/applications?application='+app.application.id};});});
 }
 private async authorized<T>(u:ApplicantPrincipal,id:string,run:(row:Record<string,any>)=>Promise<T>){return this.database.transaction(async c=>{const {application,participant}=await applicantApplicationAccess(c,this.config,u,id);if(participant.role!=='primary'||participant.contact_id!==application.contact_id)throw missing();const row=(await c.query('SELECT * FROM prospect_journeys WHERE application_id=$1 AND organization_id=$2 AND lead_id=$3',[id,u.organization.id,application.lead_id])).rows[0];if(!row)throw missing();return run(row);});}
 async directoryForApplicant(u:ApplicantPrincipal){const {items}=await new ApplicantPortal(this.database,this.config).list(u);const ids=(await this.database.query("SELECT j.application_id FROM prospect_journeys j JOIN application_participants p ON p.application_id=j.application_id WHERE j.organization_id=$1 AND j.application_id=ANY($2::uuid[]) AND p.user_id=$3 AND p.role='primary' AND p.active",[u.organization.id,items.map(i=>i.id),u.id])).rows.map(r=>r.application_id);return{items:items.filter(i=>ids.includes(i.id))};}
 async read(u:ApplicantPrincipal,id:string){
  const application=await new ApplicantPortal(this.database,this.config).detail(u,id);
  return this.authorized(u,id,async r=>{let shortlist=null,booking=null;const notices:string[]=[];
   if(r.shortlist_id)try{shortlist=await new UnitShortlists(this.database,this.config).publicRead(this.token('shortlist',r.organization_id,r.created_by,r.request_key));}catch(error){if(!(error instanceof ApiError))throw error;notices.push('Your property options need an updated link from the leasing team.');}
   if(r.booking_invitation_id)try{booking=await new Calendar(this.database,this.config).publicRead(publicCalendarReadSchema.parse({token:this.token('journey-booking',r.organization_id,r.created_by,r.request_key)}));}catch(error){if(!(error instanceof ApiError))throw error;notices.push('Ask your leasing team to renew your viewing invitation.');}
   return{application,shortlist,booking,notices};
  });
 }
 async preferences(u:ApplicantPrincipal,id:string,i:z.infer<typeof shortlistResponseSchema>){return this.authorized(u,id,r=>{if(!r.shortlist_id)throw missing();return new UnitShortlists(this.database,this.config).respond(this.token('shortlist',r.organization_id,r.created_by,r.request_key),i);});}
 async availability(u:ApplicantPrincipal,id:string,i:Omit<z.infer<typeof publicCalendarReadSchema>,'token'>){return this.authorized(u,id,r=>{if(!r.booking_invitation_id)throw missing();return new Calendar(this.database,this.config).publicRead({...i,token:this.token('journey-booking',r.organization_id,r.created_by,r.request_key)});});}
 async book(u:ApplicantPrincipal,id:string,i:Omit<z.infer<typeof publicCalendarBookSchema>,'token'>){return this.authorized(u,id,r=>{if(!r.booking_invitation_id)throw missing();return new Calendar(this.database,this.config).publicBook({...i,token:this.token('journey-booking',r.organization_id,r.created_by,r.request_key)});});}
 async manage(u:ApplicantPrincipal,id:string,i:Omit<z.infer<typeof publicCalendarManageSchema>,'token'>){return this.authorized(u,id,r=>{if(!r.booking_invitation_id)throw missing();return new Calendar(this.database,this.config).publicManage({...i,token:this.token('journey-booking',r.organization_id,r.created_by,r.request_key)});});}
}
