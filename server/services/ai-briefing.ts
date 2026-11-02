import type {AuthUser} from '../../shared/contracts.js';
import type {z} from 'zod';
import {briefingResult,type briefingQuery} from '../../shared/ai-workflow-contracts.js';
import {Operations} from './operations.js';
import {attentionSql} from './attention.js';
import {leadScope,propertyScope,propertyAccess,scopeArgs,missing,stale,requireAdmin} from './operations-access.js';
import {AiWorkflowRunner} from './ai-workflow-runner.js';
import {fingerprint} from './workflow-signatures.js';
import {ApiError} from '../http/errors.js';
export class AiBriefing extends Operations {
 async facts(u:AuthUser,d:string,q:z.infer<typeof briefingQuery>){return this.staff(u,d,async(c,a)=>{
  if(q.propertyId)await propertyAccess(c,a,q.propertyId);
  const args=[...scopeArgs(a),q.owner,'all',q.propertyId??null];
  const rows=(await c.query(attentionSql+" SELECT *,count(*) OVER()::int AS total FROM filtered WHERE ($6::uuid IS NULL OR property_id=$6) ORDER BY urgency,(due_at>now()),due_at,kind,id LIMIT 30",args)).rows;
  const tours=(await c.query(`SELECT v.id,v.starts_at,p.name AS property_name,l.display_name FROM viewings v JOIN properties p ON p.id=v.property_id JOIN leads l ON l.id=v.lead_id WHERE ${leadScope('v')} AND v.status='scheduled' AND v.starts_at BETWEEN now() AND now()+interval '2 days' AND ($4='all' OR v.owner_membership_id=$3) AND ($5::uuid IS NULL OR v.property_id=$5) ORDER BY v.starts_at,v.id LIMIT 10`,[...scopeArgs(a),q.owner,q.propertyId??null])).rows;
  const items=[...rows.map(r=>({id:r.kind+':'+r.id,title:r.title,kind:r.kind,property:r.property_name,dueAt:new Date(r.due_at).toISOString(),urgency:r.urgency,url:r.url,action:r.action})),...tours.map(r=>({id:'tour:'+r.id,title:'Prepare tour for '+r.display_name,kind:'tour',property:r.property_name,dueAt:new Date(r.starts_at).toISOString(),urgency:2,url:'/admin/calendar?viewing='+r.id,action:'Review viewing details and prepare'}))];
  return{items,total:rows[0]?.total??0,scope:q,generatedAt:new Date().toISOString()};
 });}
 async generate(u:AuthUser,d:string,q:z.infer<typeof briefingQuery>,key:string,fetcher:typeof fetch=fetch){
  const facts=await this.facts(u,d,q),safe=facts.items.map((x,index)=>({sourceId:x.id,kind:x.kind,dueAt:x.dueAt,urgency:x.urgency,action:x.action,order:index}));
  const run=await new AiWorkflowRunner(this.database,this.config,fetcher).run({organizationId:u.organization.id,actorId:u.id,propertyId:q.propertyId},'briefing',key,{scope:q,items:safe},briefingResult,'Write a concise operational briefing using only supplied records. Explain why existing tasks need attention, without inventing causes or outcomes. Keep urgent items before ordinary work. Reference only provided sourceId values. These are operational actions for staff review, never applicant rankings or decisions. No action has been executed. Do not include unsupported counts or claim all portfolio records were inspected.',()=>({summary:facts.items.length?`${facts.total} attention items match your scope. Review urgent work and prepare upcoming tours.`:'No attention items or upcoming tours match this scope.',priorities:facts.items.slice(0,8).map(x=>({sourceId:x.id,reason:x.action+'. Due '+new Date(x.dueAt).toISOString().slice(0,16).replace('T',' ')+' UTC.'}))}));
  const fresh=await this.facts(u,d,q);if(fingerprint(fresh.items)!==fingerprint(facts.items))throw stale();if(run.result.priorities.some(p=>!facts.items.some(x=>x.id===p.sourceId)))throw new ApiError(502,'AI_SOURCE_MISMATCH','The briefing referenced an unavailable record. Refresh the briefing.');
  return{...run,...fresh,priorities:run.result.priorities.map(p=>({...fresh.items.find(x=>x.id===p.sourceId)!,reason:p.reason})).sort((a,b)=>a.urgency-b.urgency),notice:'A snapshot of up to 30 attention items and 10 upcoming tours. Open a record to review and act.'};
 }
 async feedback(u:AuthUser,d:string,id:string,feedback:string){return this.staff(u,d,async(c,a)=>{const r=(await c.query(`SELECT r.* FROM ai_workflow_runs r WHERE r.id=$4 AND r.actor_id=$5 AND r.kind IN ('briefing','reply') AND r.organization_id=$1 AND ($2::text IS NOT NULL) AND ($3::uuid IS NOT NULL)`,[...scopeArgs(a),id,a.id])).rows[0];if(!r)throw missing();if(r.property_id)await propertyAccess(c,a,r.property_id);await c.query('UPDATE ai_workflow_runs SET feedback=$2 WHERE id=$1',[id,feedback]);return{saved:true};});}
 async usage(u:AuthUser,d:string){return this.staff(u,d,async(c,a)=>{requireAdmin(a);return{items:(await c.query("SELECT kind,mode,status,count(*)::int AS requests,sum(input_tokens)::bigint AS input_tokens,sum(output_tokens)::bigint AS output_tokens,round(avg(latency_ms))::int AS latency_ms,count(*) FILTER(WHERE feedback='accepted')::int AS accepted,count(*) FILTER(WHERE feedback='edited')::int AS edited,count(*) FILTER(WHERE feedback='dismissed')::int AS dismissed FROM ai_workflow_runs WHERE organization_id=$1 AND created_at>now()-interval '30 days' GROUP BY kind,mode,status ORDER BY kind,mode,status",[a.organization.id])).rows,limits:{organizationPerDay:200,staffPerHour:20,publicPerHour:60},notice:'Token usage is measured from provider responses. Cost is not estimated without your model/account pricing. Demo runs make no provider calls.'};});}
}
