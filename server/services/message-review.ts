import type {z} from 'zod';
import type {AuthUser} from '../../shared/contracts.js';
import type {productivityQuery} from '../../shared/productivity-contracts.js';
import type {reviewPreviewSchema,reviewApproveSchema,reviewSkipSchema} from '../../shared/workflow-contracts.js';
import {Inbox} from './inbox.js';
import {leadScope,scopeArgs,missing,stale,operationEvent} from './operations-access.js';
import {assertComposer} from './inbox-composer.js';
import {ApiError} from '../http/errors.js';
import {signWorkflow,readWorkflow,reviewFingerprint} from './workflow-signatures.js';
type Snapshot={conversationId:string;messageId:string;version:number;fingerprint:string};
type Preview={actor:string;organization:string;expires:number;items:Snapshot[]};
export class MessageReview extends Inbox {
 async queue(u:AuthUser,d:string,q:z.infer<typeof productivityQuery>){return this.staff(u,d,async(c,a)=>({items:(await c.query(`SELECT m.id,m.conversation_id,m.channel,m.subject,m.body,m.version,m.created_at,co.lead_id,co.status AS conversation_status,ct.display_name,CASE WHEN m.channel='email' THEN ct.email ELSE ct.phone END AS recipient,p.name AS property_name,coalesce(pref.allowed,false) AS allowed,count(*) OVER()::int AS total FROM conversation_messages m JOIN conversations co ON co.id=m.conversation_id JOIN leads l ON l.id=co.lead_id JOIN contacts ct ON ct.id=l.contact_id JOIN properties p ON p.id=co.property_id LEFT JOIN contact_communication_preferences pref ON pref.organization_id=co.organization_id AND pref.contact_id=ct.id AND pref.channel=m.channel WHERE ${leadScope('co')} AND m.status='draft' AND ($4::uuid IS NULL OR co.property_id=$4) AND ($5::uuid IS NULL OR co.owner_membership_id=$5) AND strpos(lower(ct.display_name||' '||m.subject),lower($6))>0 ORDER BY m.created_at,m.id LIMIT 20 OFFSET $7`,[...scopeArgs(a),q.propertyId??null,q.owner==='me'?a.membershipId:null,q.q,(q.page-1)*20])).rows,page:q.page,pageSize:20}));}
 async preview(u:AuthUser,d:string,input:z.infer<typeof reviewPreviewSchema>){return this.staff(u,d,async(c,a)=>{
  const items=[],snapshots:Snapshot[]=[];
  // Acquire lead locks in stable order for overlapping batches.
  const order=(await c.query('SELECT co.id,co.lead_id FROM conversations co WHERE co.organization_id=$1 AND co.id=ANY($2::uuid[]) ORDER BY co.lead_id,co.id',[a.organization.id,input.items.map(i=>i.conversationId)])).rows;
  if(new Set(order.map(r=>r.id)).size!==new Set(input.items.map(i=>i.conversationId)).size)throw missing();
  for(const row of order){const co=await this.access(c,a,row.id,true);for(const i of input.items.filter(i=>i.conversationId===row.id)){const m=(await c.query("SELECT * FROM conversation_messages WHERE id=$1 AND conversation_id=$2 AND status='draft' FOR SHARE",[i.messageId,co.id])).rows[0];if(!m||m.version!==i.version)throw stale();const preference=(await c.query('SELECT allowed FROM contact_communication_preferences WHERE organization_id=$1 AND contact_id=$2 AND channel=$3',[a.organization.id,co.contact_id,m.channel])).rows[0];if(!preference?.allowed||co.status!=='open')throw new ApiError(409,'REVIEW_BLOCKED','Open the conversation and record channel permission before approving this reply.');snapshots.push({...i,fingerprint:reviewFingerprint(co,m)});items.push({...i,name:co.display_name,recipient:m.channel==='email'?co.email:co.phone,channel:m.channel,subject:m.subject,body:m.body});}}
  return{items,token:signWorkflow(this.config.sessionSecret,'message-review',{actor:a.id,organization:a.organization.id,expires:Date.now()+10*60_000,items:snapshots} satisfies Preview)};
 });}
 async approve(u:AuthUser,d:string,input:z.infer<typeof reviewApproveSchema>){
  const p=readWorkflow<Preview>(this.config.sessionSecret,'message-review',input.token);
  if(p.actor!==u.id||p.organization!==u.organization.id||p.expires<Date.now()||input.messageIds.some(id=>!p.items.some(i=>i.messageId===id)))throw new ApiError(409,'PREVIEW_EXPIRED','Review the selected replies again.');
  const results=[];for(const item of p.items.filter(i=>input.messageIds.includes(i.messageId))){try{const m=await this.send(u,d,item.conversationId,item.messageId,item.version,fetch,item.fingerprint);results.push({messageId:item.messageId,status:m.status});}catch(error){if(!(error instanceof ApiError))throw error;results.push({messageId:item.messageId,status:'blocked',error:error.message});}}
  return{results};
 }
 async skip(u:AuthUser,d:string,i:z.infer<typeof reviewSkipSchema>){return this.staff(u,d,async(c,a)=>{const co=await this.access(c,a,i.conversationId,true);await assertComposer(c,a,co.id);const m=(await c.query("UPDATE conversation_messages SET status='cancelled',version=version+1,updated_at=now() WHERE id=$1 AND conversation_id=$2 AND version=$3 AND status='draft' RETURNING id",[i.messageId,co.id,i.version])).rows[0];if(!m)throw stale();await operationEvent(c,a.organization.id,co.property_id,co.lead_id,a.id,'inbox.skipped','Draft skipped in the review queue.');return{skipped:true};});}
}
