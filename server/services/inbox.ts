import { createHmac,randomUUID,createHash } from 'node:crypto';
import type { PoolClient } from 'pg';
import type { z } from 'zod';
import type { AuthUser } from '../../shared/contracts.js';
import type { Row, draftSchema,editDraftSchema,conversationSchema,consentSchema } from '../../shared/operations-contracts.js';
import { ApiError } from '../http/errors.js';
import { assertComposer } from './inbox-composer.js';
import {assertPropertyDraftCurrent} from './property-message-validation.js';
import { Operations } from './operations.js';
import { LeadWorkspaces } from './lead-workspace.js';
import { leadScope,scopeArgs,eligibleOwner,missing,stale,operationEvent,requireAdmin } from './operations-access.js';
import { isIsolatedDemo } from './demo-environment.js';
import { DeliveryError,sendCommunication } from './communication-transport.js';
import {reviewFingerprint} from './workflow-signatures.js';

export class Inbox extends Operations {
 async access(c:PoolClient,a:AuthUser,id:string,lock=false){
  const query=`SELECT co.*,l.contact_id,ct.display_name,ct.email,ct.phone FROM conversations co JOIN leads l ON l.id=co.lead_id AND l.organization_id=co.organization_id JOIN contacts ct ON ct.id=l.contact_id WHERE co.id=$4 AND ${leadScope('co')}`,args=[...scopeArgs(a),id];
  const initial=(await c.query(query,args)).rows[0];if(!initial)throw missing();
  // Calendar actions lock the lead before preparing a conversation draft.
  await new LeadWorkspaces(this.database).assertLeadAccess(a,initial.lead_id,c,true);
  const row=(await c.query(query+(lock?' FOR UPDATE OF co':' FOR SHARE OF co'),args)).rows[0];if(!row)throw missing();return row;
 }

 async listInbox(user:AuthUser,digest:string,q:string,page:number,status:string){return this.staff(user,digest,async(c,a)=>{
  const items=(await c.query(`SELECT co.*,ct.display_name,p.name AS property_name,u.display_name AS owner_name, EXISTS(SELECT 1 FROM conversation_messages m WHERE m.conversation_id=co.id AND m.direction='inbound' AND m.created_at>COALESCE(cr.read_at,'epoch')) AS unread,(SELECT count(*)::int FROM intake_submissions s WHERE s.lead_id=co.lead_id AND s.possible_duplicate) AS possible_duplicates,count(*) OVER()::int AS total FROM conversations co JOIN leads l ON l.id=co.lead_id JOIN contacts ct ON ct.id=l.contact_id JOIN properties p ON p.id=co.property_id LEFT JOIN conversation_reads cr ON cr.conversation_id=co.id AND cr.user_id=$6 LEFT JOIN organization_memberships om ON om.id=co.owner_membership_id LEFT JOIN users u ON u.id=om.user_id WHERE ${leadScope('co')} AND strpos(lower(ct.display_name||' '||ct.email),lower($4))>0 AND ($7='' OR co.status=$7) ORDER BY co.updated_at DESC,co.id LIMIT 25 OFFSET $5`,[...scopeArgs(a),q,(page-1)*25,a.id,status])).rows;
  const unread=(await c.query(`SELECT count(*)::int AS n FROM conversations co LEFT JOIN conversation_reads cr ON cr.conversation_id=co.id AND cr.user_id=$4 WHERE ${leadScope('co')} AND EXISTS(SELECT 1 FROM conversation_messages m WHERE m.conversation_id=co.id AND m.direction='inbound' AND m.created_at>COALESCE(cr.read_at,'epoch'))`,[...scopeArgs(a),a.id])).rows[0].n;
  return{items,page,total:items[0]?.total??0,pageSize:25,unread};
 });}
 async open(user:AuthUser,digest:string,leadId:string){return this.staff(user,digest,(c,a)=>this.openLinked(c,a,leadId));}
 async openLinked(c:PoolClient,a:AuthUser,leadId:string){
  const l=await new LeadWorkspaces(this.database).assertLeadAccess(a,leadId,c,true);
  return(await c.query('INSERT INTO conversations(organization_id,property_id,lead_id,owner_membership_id) VALUES($1,$2,$3,$4) ON CONFLICT(organization_id,lead_id) DO UPDATE SET lead_id=EXCLUDED.lead_id RETURNING id',[a.organization.id,l.property_id,l.id,l.owner_membership_id])).rows[0];
 }
 async detail(user:AuthUser,digest:string,id:string,page:number){return this.staff(user,digest,async(c,a)=>{
  const conversation=await this.access(c,a,id);
  await c.query("UPDATE conversation_messages SET status='uncertain',updated_at=now() WHERE conversation_id=$1 AND status='sending' AND sent_at<now()-interval '2 minutes'",[id]);
  const messages=(await c.query('SELECT m.*,u.display_name AS author_name,count(*) OVER()::int AS total FROM conversation_messages m LEFT JOIN users u ON u.id=m.created_by WHERE m.conversation_id=$1 ORDER BY m.created_at DESC,m.id DESC LIMIT 50 OFFSET $2',[id,(page-1)*50])).rows;
  const preferences=(await c.query('SELECT channel,allowed,evidence FROM contact_communication_preferences WHERE organization_id=$1 AND contact_id=$2',[a.organization.id,conversation.contact_id])).rows;
  const templates=(await c.query('SELECT id,name,channel,subject,body FROM communication_templates WHERE organization_id=$1 ORDER BY name,id LIMIT 100',[a.organization.id])).rows;
  const demo=await isIsolatedDemo(this.config,c),s=this.config.communications,enabled=s.enabled&&s.organizationId===a.organization.id;
  return{conversation,messages,page,total:messages[0]?.total??0,preferences,templates,delivery:{mode:demo?'simulation':enabled?'configured':'unconfigured',email:demo||Boolean(enabled&&s.resendKey&&s.resendFrom&&s.replyDomain&&s.resendWebhookSecret),sms:demo||Boolean(enabled&&s.twilioSid&&s.twilioToken&&s.twilioFrom)}};
 });}
 async read(user:AuthUser,digest:string,id:string){return this.staff(user,digest,async(c,a)=>{await this.access(c,a,id);await c.query('INSERT INTO conversation_reads(conversation_id,user_id) VALUES($1,$2) ON CONFLICT(conversation_id,user_id) DO UPDATE SET read_at=now()',[id,a.id]);return{read:true};});}
 async updateConversation(user:AuthUser,digest:string,id:string,input:z.infer<typeof conversationSchema>){return this.staff(user,digest,async(c,a)=>{
  const row=await this.access(c,a,id,true);if(row.version!==input.version)throw stale();const interests=(await c.query('SELECT property_id FROM lead_property_interests WHERE lead_id=$1 AND organization_id=$2',[row.lead_id,a.organization.id])).rows.map(r=>r.property_id);
  await eligibleOwner(c,a.organization.id,input.ownerMembershipId,[row.property_id,...interests]);
  await c.query('UPDATE conversations SET owner_membership_id=$2,status=$3,version=version+1,updated_at=now() WHERE id=$1',[id,input.ownerMembershipId,input.status]);await operationEvent(c,a.organization.id,row.property_id,row.lead_id,a.id,'inbox.updated','Conversation ownership or status updated.');return{updated:true};
 });}
 async draft(user:AuthUser,digest:string,id:string,input:z.infer<typeof draftSchema>){return this.staff(user,digest,(c,a)=>this.draftLinked(c,a,id,input));}
 async draftLinked(c:PoolClient,a:AuthUser,id:string,input:z.infer<typeof draftSchema>){
  const co=await this.access(c,a,id,true);await assertComposer(c,a,id);const old=(await c.query('SELECT * FROM conversation_messages WHERE organization_id=$1 AND request_key=$2',[a.organization.id,input.requestKey])).rows[0];if(old){if(old.conversation_id!==id||old.channel!==input.channel||old.body!==input.body||old.subject!==input.subject)throw new ApiError(409,'REQUEST_CONFLICT','Use a new key for a different draft.');return old;}
  const row=(await c.query("INSERT INTO conversation_messages(organization_id,conversation_id,request_key,direction,channel,subject,body,status,created_by) VALUES($1,$2,$3,'outbound',$4,$5,$6,'draft',$7) RETURNING *",[a.organization.id,id,input.requestKey,input.channel,input.subject,input.body,a.id])).rows[0];await operationEvent(c,a.organization.id,co.property_id,co.lead_id,a.id,'inbox.draft','Reply draft saved.');return row;
 }
 async editDraft(user:AuthUser,digest:string,id:string,messageId:string,input:z.infer<typeof editDraftSchema>){return this.staff(user,digest,async(c,a)=>{
  await this.access(c,a,id,true);await assertComposer(c,a,id);const row=(await c.query("UPDATE conversation_messages SET channel=$3,subject=$4,body=$5,version=version+1,updated_at=now() WHERE conversation_id=$1 AND id=$2 AND version=$6 AND status='draft' RETURNING *",[id,messageId,input.channel,input.subject,input.body,input.version])).rows[0];if(!row)throw stale();return row;
 });}
 async consent(user:AuthUser,digest:string,id:string,input:z.infer<typeof consentSchema>){return this.staff(user,digest,async(c,a)=>{
  const co=await this.access(c,a,id,true);await c.query('INSERT INTO contact_communication_preferences(organization_id,contact_id,channel,allowed,evidence,updated_by) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(organization_id,contact_id,channel) DO UPDATE SET allowed=$4,evidence=$5,updated_by=$6,updated_at=now()',[a.organization.id,co.contact_id,input.channel,input.allowed,input.evidence,a.id]);await operationEvent(c,a.organization.id,co.property_id,co.lead_id,a.id,'inbox.preference','Contact communication preference updated.');return{saved:true};
 });}
 replyAddress(conversationId:string){const token=createHmac('sha256',this.config.sessionSecret).update('email-reply:'+conversationId).digest('hex').slice(0,24);return'reply+'+conversationId.replaceAll('-','')+'.'+token+'@'+this.config.communications.replyDomain;}
 async send(user:AuthUser,digest:string,id:string,messageId:string,version:number,fetcher:typeof fetch=fetch,expectedReview?:string){
  const prepared=await this.staff(user,digest,async(c,a)=>{
   const co=await this.access(c,a,id,true);const m=(await c.query('SELECT * FROM conversation_messages WHERE conversation_id=$1 AND id=$2 FOR UPDATE',[id,messageId])).rows[0];if(!m)throw missing();if(m.status!=='draft')return{existing:m};if(m.version!==version)throw stale();await assertComposer(c,a,id);
   if(expectedReview){const contact=(await c.query('SELECT email,phone FROM contacts WHERE id=$1 AND organization_id=$2 FOR SHARE',[co.contact_id,a.organization.id])).rows[0];Object.assign(co,contact);if(reviewFingerprint(co,m)!==expectedReview)throw new ApiError(409,'REVIEW_CHANGED','The recipient or reply changed. Open a fresh preview.');}
   if(m.tour_id&&!(await c.query('SELECT id FROM viewings WHERE id=$1 AND organization_id=$2 AND version=$3 FOR SHARE',[m.tour_id,a.organization.id,m.tour_version])).rowCount)throw new ApiError(409,'TOUR_CHANGED','This tour changed after the draft was prepared. Review its current details and prepare a new reply.');
   await assertPropertyDraftCurrent(c,messageId);
   if(co.status==='closed')throw new ApiError(409,'CONVERSATION_CLOSED','Reopen the conversation before sending.');
   const preference=(await c.query('SELECT allowed FROM contact_communication_preferences WHERE organization_id=$1 AND contact_id=$2 AND channel=$3 FOR SHARE',[a.organization.id,co.contact_id,m.channel])).rows[0];if(!preference?.allowed)throw new ApiError(409,'CONSENT_REQUIRED','Record permission for this channel before sending.');
   const recipient=m.channel==='email'?co.email:co.phone;if(!(m.channel==='email'?/^[^\s@]+@[^\s@]+\.[^\s@]+$/:/^\+[1-9]\d{7,14}$/).test(recipient??''))throw new ApiError(409,'RECIPIENT_REQUIRED','A valid contact address is required.');
   const demo=await isIsolatedDemo(this.config,c),s=this.config.communications;
   if(!demo&&(!s.enabled||s.organizationId!==a.organization.id||(m.channel==='email'?!(s.resendKey&&s.resendFrom&&s.replyDomain&&s.resendWebhookSecret):!(s.twilioSid&&s.twilioToken&&s.twilioFrom))))throw new ApiError(503,'DELIVERY_UNCONFIGURED','Configure this organization’s delivery provider first.');
   await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['communications-send:'+a.organization.id]);
   if(Number((await c.query("SELECT count(*) AS n FROM conversation_messages WHERE organization_id=$1 AND sent_at>now()-interval '1 hour'",[a.organization.id])).rows[0].n)>=100)throw new ApiError(429,'DELIVERY_LIMIT','The organization hourly send limit has been reached.');
   const row=(await c.query("UPDATE conversation_messages SET status=$2,recipient=$3,reviewed_by=$4,sent_at=now(),version=version+1,updated_at=now() WHERE id=$1 RETURNING *",[messageId,demo?'simulated':'sending',recipient,a.id])).rows[0];
   await c.query('UPDATE conversations SET updated_at=now(),version=version+1 WHERE id=$1',[id]);await operationEvent(c,a.organization.id,co.property_id,co.lead_id,a.id,demo?'inbox.simulated':'inbox.send_requested',demo?'Reply simulated; nothing sent.':'Reviewed reply submitted for delivery.');return demo?{existing:row}:{message:row};
  });
  if(prepared.existing)return prepared.existing;const m=prepared.message!;
  try{
   const result=await sendCommunication(this.config,{id:m.id,channel:m.channel,recipient:m.recipient,subject:m.subject,body:m.body,replyTo:this.replyAddress(id)},fetcher);
   return this.database.transaction(async c=>{
    await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['delivery:'+result.provider+':'+result.id]);
    const event=(await c.query('SELECT * FROM communication_delivery_events WHERE organization_id=$1 AND provider=$2 AND provider_id=$3',[m.organization_id,result.provider,result.id])).rows[0];
    return(await c.query("UPDATE conversation_messages SET provider=$2,provider_id=$3,status=CASE WHEN status IN ('delivered','failed') THEN status ELSE $4 END,provider_event_at=COALESCE($5,provider_event_at),delivered_at=CASE WHEN $4='delivered' THEN $5 ELSE delivered_at END,updated_at=now() WHERE id=$1 RETURNING *",[m.id,result.provider,result.id,event?.status??'accepted',event?.occurred_at??null])).rows[0];
   });
  }catch(error){return(await this.database.query("UPDATE conversation_messages SET status=CASE WHEN status IN ('delivered','failed') THEN status ELSE $2 END,updated_at=now() WHERE id=$1 RETURNING *",[m.id,error instanceof DeliveryError&&!error.uncertain?'failed':'uncertain'])).rows[0];}
 }
 async inbound(c:PoolClient,org:string,channel:'email'|'sms',sender:string,subject:string,body:string,providerId:string,conversationId?:string){
  if(channel==='sms'&&/^(STOP|STOPALL|UNSUBSCRIBE|CANCEL|END|QUIT)$/i.test(body.trim()))await c.query("INSERT INTO contact_communication_preferences(organization_id,contact_id,channel,allowed,evidence) SELECT organization_id,id,'sms',false,'Inbound SMS opt-out' FROM contacts WHERE organization_id=$1 AND phone=$2 ON CONFLICT(organization_id,contact_id,channel) DO UPDATE SET allowed=false,evidence='Inbound SMS opt-out',updated_at=now()",[org,sender]);
  const candidates=(await c.query(`SELECT co.*,l.contact_id FROM conversations co JOIN leads l ON l.id=co.lead_id AND l.organization_id=co.organization_id JOIN contacts ct ON ct.id=l.contact_id WHERE co.organization_id=$1 AND ${channel==='email'?'lower(ct.email)=$2':'ct.phone=$2'} AND ($3::uuid IS NULL OR co.id=$3) ORDER BY co.id LIMIT 2`,[org,sender.toLowerCase(),conversationId??null])).rows;
  if(candidates.length!==1){await c.query('INSERT INTO unmatched_messages(organization_id,channel,sender,subject,body,provider_id) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING',[org,channel,sender,subject,body,providerId]);return;}
  const co=candidates[0];await c.query('SELECT id FROM leads WHERE id=$1 FOR UPDATE',[co.lead_id]);await c.query('SELECT id FROM conversations WHERE id=$1 FOR UPDATE',[co.id]);
  const inserted=await c.query("INSERT INTO conversation_messages(organization_id,conversation_id,request_key,direction,channel,subject,body,status,provider,provider_id) VALUES($1,$2,$3,'inbound',$4,$5,$6,'received',$7,$8) ON CONFLICT(provider,provider_id) DO NOTHING RETURNING id",[org,co.id,randomUUID(),channel,subject,body,channel==='email'?'resend':'twilio',providerId]);
  if(!inserted.rowCount)return;
  await c.query("UPDATE conversations SET status='open',snoozed_until=NULL,response_due_at=NULL,version=version+1,updated_at=now() WHERE id=$1",[co.id]);
  if(channel==='sms'&&/^(STOP|STOPALL|UNSUBSCRIBE|CANCEL|END|QUIT)$/i.test(body.trim()))await c.query("INSERT INTO contact_communication_preferences(organization_id,contact_id,channel,allowed,evidence) VALUES($1,$2,'sms',false,'Inbound SMS opt-out') ON CONFLICT(organization_id,contact_id,channel) DO UPDATE SET allowed=false,evidence='Inbound SMS opt-out',updated_at=now()",[org,co.contact_id]);
  await operationEvent(c,org,co.property_id,co.lead_id,null,'inbox.received','Incoming '+channel+' received.');
 }
 async receipt(c:PoolClient,provider:string,eventId:string,payload:string){const hash=createHash('sha256').update(payload).digest('hex');const row=(await c.query('INSERT INTO communication_receipts(provider,event_id,payload_hash) VALUES($1,$2,$3) ON CONFLICT DO NOTHING RETURNING event_id',[provider,eventId,hash])).rows[0];return Boolean(row);}
 async unmatched(user:AuthUser,digest:string,page:number){return this.staff(user,digest,async(c,a)=>{requireAdmin(a);return{items:(await c.query('SELECT *,count(*) OVER()::int AS total FROM unmatched_messages WHERE organization_id=$1 AND resolved_at IS NULL ORDER BY created_at DESC,id LIMIT 25 OFFSET $2',[a.organization.id,(page-1)*25])).rows};});}
 async resolveUnmatched(user:AuthUser,digest:string,messageId:string,conversationId:string){return this.staff(user,digest,async(c,a)=>{requireAdmin(a);const co=await this.access(c,a,conversationId,true);const m=(await c.query('SELECT * FROM unmatched_messages WHERE organization_id=$1 AND id=$2 AND resolved_at IS NULL FOR UPDATE',[a.organization.id,messageId])).rows[0];if(!m)throw missing();if((m.channel==='email'?co.email.toLowerCase():co.phone)!==m.sender.toLowerCase())throw new ApiError(409,'SENDER_MISMATCH','The sender must match the selected lead’s contact address.');await this.inbound(c,a.organization.id,m.channel,m.sender,m.subject,m.body,m.provider_id,conversationId);await c.query('UPDATE unmatched_messages SET resolved_at=now() WHERE id=$1',[messageId]);return{linked:true};});}
}
