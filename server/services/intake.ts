import {LeadRouting} from './lead-routing.js';
import { createHmac, timingSafeEqual, randomUUID } from 'node:crypto';
import type { z } from 'zod';
import type { inquirySchema } from '../../shared/operations-contracts.js';
import type { Database } from '../db/pool.js';
import type { ServerConfig } from '../config/env.js';
import { ApiError } from '../http/errors.js';
import { eligibleOwner, missing, operationEvent } from './operations-access.js';
import { isIsolatedDemo } from './demo-environment.js';

export class IntakeService {
 constructor(private database:Database,private config:ServerConfig) {}
 private hmac(value:string) { return createHmac('sha256',this.config.sessionSecret).update(value).digest('hex'); }
 async form(id:string):Promise<{id:string;title:string;embed_origins:string[];property_name:string;challenge:string}> {
  const row=(await this.database.query('SELECT f.id,f.title,f.embed_origins,p.name AS property_name FROM intake_forms f JOIN properties p ON p.id=f.property_id AND p.organization_id=f.organization_id WHERE f.id=$1 AND f.enabled',[id])).rows[0];if(!row)throw missing();
  const time=String(Date.now());return{id:row.id,title:row.title,embed_origins:row.embed_origins,property_name:row.property_name,challenge:time+'.'+this.hmac('intake:'+id+':'+time)};
 }
 async submit(id:string,input:z.infer<typeof inquirySchema>,ip:string) {
  const [time,signature]=input.challenge.split('.');const expected=this.hmac('intake:'+id+':'+time);
  if(!signature || signature.length!==expected.length || !timingSafeEqual(Buffer.from(signature),Buffer.from(expected)) || !/^\d{13}$/.test(time??'') || Date.now()-Number(time)<1500 || Date.now()-Number(time)>3600000 || input.website)throw new ApiError(400,'FORM_EXPIRED','Reload the form and try again.');
  return this.database.transaction(async c=>{
   const form=(await c.query('SELECT f.*,o.environment FROM intake_forms f JOIN organizations o ON o.id=f.organization_id WHERE f.id=$1 AND f.enabled FOR SHARE OF f,o',[id])).rows[0];if(!form)throw missing();
   const isolated=await isIsolatedDemo(this.config,c);if(this.config.demoMode&&!isolated || form.environment==='demo'&&!isolated || form.environment==='live'&&this.config.demoMode)throw missing();
   const org=form.organization_id;
   const payload={name:input.name,email:input.email.toLowerCase(),phone:input.phone,message:input.message,campaign:input.campaign,emailConsent:input.emailConsent,smsConsent:input.smsConsent};
   await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['intake-key:'+id+':'+input.requestKey]);
   const hash=this.hmac('submission:'+id+':'+JSON.stringify(payload));
   await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['intake:'+id+':'+hash]);
   const old=(await c.query("SELECT id,payload_hash FROM intake_submissions WHERE form_id=$1 AND (request_key=$2 OR payload_hash=$3 AND created_at>now()-interval '15 minutes') ORDER BY created_at DESC LIMIT 1",[id,input.requestKey,hash])).rows[0];
   if(old){if(old.payload_hash!==hash)throw new ApiError(409,'REQUEST_CONFLICT','This submission key was already used. Reload the form.');return{received:true,receipt:old.id};}
   for(const [key,limit] of [[this.hmac('intake-ip:'+ip),20],[this.hmac('intake-form:'+id),200]] as const){
    const rate=(await c.query("INSERT INTO intake_rate_limits(bucket_key,window_at,count) VALUES($1,to_timestamp(floor(extract(epoch FROM now())/900)*900),1) ON CONFLICT(bucket_key,window_at) DO UPDATE SET count=intake_rate_limits.count+1 RETURNING count",[key])).rows[0];if(rate.count>limit)throw new ApiError(429,'INTAKE_LIMIT','Too many inquiries. Please try again later.');
   }
   await c.query("DELETE FROM intake_rate_limits WHERE window_at<now()-interval '1 day'");
   // Contact details are unverified public input. Flag possible matches for staff;
   // never attach an inquiry to somebody else's identity based on an email alone.
   const duplicate=Boolean((await c.query('SELECT 1 FROM contacts WHERE organization_id=$1 AND lower(email)=$2 LIMIT 1',[org,payload.email])).rowCount);
   const contact=(await c.query('INSERT INTO contacts(organization_id,display_name,email,phone) VALUES($1,$2,$3,$4) RETURNING id',[org,payload.name,payload.email,payload.phone])).rows[0];
   await c.query('INSERT INTO contact_property_links(organization_id,contact_id,property_id) VALUES($1,$2,$3)',[org,contact.id,form.property_id]);
   let owner=form.owner_membership_id;try{await eligibleOwner(c,org,owner,[form.property_id]);}catch(error){if(error instanceof ApiError)owner=null;else throw error;}
   const lead=(await c.query("INSERT INTO leads(organization_id,property_id,contact_id,display_name,email,status,intent,source,owner_membership_id,next_action) VALUES($1,$2,$3,$4,$5,'new','leasing','website',$6,'Review website inquiry') RETURNING id",[org,form.property_id,contact.id,payload.name,payload.email,owner])).rows[0];
   if(!owner)owner=await new LeadRouting(this.database,this.config).intake(c,org,lead.id);
   const conversation=(await c.query('INSERT INTO conversations(organization_id,property_id,lead_id,owner_membership_id) VALUES($1,$2,$3,$4) RETURNING id',[org,form.property_id,lead.id,owner])).rows[0];
   await c.query("INSERT INTO conversation_messages(organization_id,conversation_id,request_key,direction,channel,body,status) VALUES($1,$2,$3,'inbound','web',$4,'received')",[org,conversation.id,randomUUID(),payload.message]);
   for(const channel of ['email','sms'])await c.query("INSERT INTO contact_communication_preferences(organization_id,contact_id,channel,allowed,evidence) VALUES($1,$2,$3,$4,'Public inquiry checkbox; identity not independently verified')",[org,contact.id,channel,channel==='email'||payload.smsConsent]);
   const receipt=(await c.query('INSERT INTO intake_submissions(organization_id,form_id,request_key,payload_hash,lead_id,campaign,possible_duplicate) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id',[org,id,input.requestKey,hash,lead.id,payload.campaign,duplicate])).rows[0];
   await operationEvent(c,org,form.property_id,lead.id,null,'intake.received',duplicate?'Website inquiry received; possible duplicate requires staff review.':'Website inquiry received.');
   return{received:true,receipt:receipt.id};
  });
 }
}
