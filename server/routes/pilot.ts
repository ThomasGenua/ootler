import {AssistantChat} from '../services/assistant-chat.js';
import {chatRequestSchema,chatDecisionSchema} from '../../shared/assistant-chat-contracts.js';
import { assistantRevisionSchema } from '../../shared/operations-contracts.js';
import { Router, type Request, type Response, type RequestHandler } from 'express';
import { z } from 'zod';
import type { AuthUser } from '../../shared/contracts.js';
import { assistantRequestSchema, inviteStaffSchema, recoveryStaffSchema, acceptStaffSchema } from '../../shared/pilot-contracts.js';
import type { ServerConfig } from '../config/env.js';
import type { Database } from '../db/pool.js';
import { protectOrigin, loginRateLimit } from '../middleware/security.js';
import { readSessionDigest } from '../services/sessions.js';
import { ApiError } from '../http/errors.js';
import { AssistantService } from '../services/assistant.js';
import { TeamService } from '../services/team.js';
import { leasingAnalytics } from '../services/analytics.js';
import { staffOrganizationAccess } from '../services/application-access.js';
function parse<T>(schema:z.ZodType<T>,value:unknown):T{const r=schema.safeParse(value);if(!r.success)throw new ApiError(400,'INVALID_INPUT','Check the requested fields.');return r.data;}
const actor=(r:Response)=>r.locals.user as AuthUser;
const id=(v:unknown)=>parse(z.uuid(),v);
function json<T>(r:Request,s:z.ZodType<T>):T{if(!r.is('application/json'))throw new ApiError(415,'JSON_REQUIRED','Send application/json.');return parse(s,r.body);}
export function createPilotRouter(config:ServerConfig,database:Database,requireUser:RequestHandler){
 const router=Router(),assistant=new AssistantService(database,config),team=new TeamService(database,config),chat=new AssistantChat(database,config);
 const digest=(r:Request)=>{const d=readSessionDigest(r,config);if(!d)throw new ApiError(401,'AUTH_REQUIRED','Sign in to your staff account.');return d;};
 router.use((r,s,next)=>{s.setHeader('Cache-Control','no-store, private');s.setHeader('Referrer-Policy','no-referrer');if(!['GET','HEAD','OPTIONS'].includes(r.method))return protectOrigin(config)(r,s,next);next();});
 router.post('/staff-access/accept',loginRateLimit(),async(r,s)=>s.json(await team.accept(json(r,acceptStaffSchema))));
 router.use(requireUser);
 router.get('/assistant/chat',async(r,s)=>s.json(await chat.history(actor(s),digest(r))));
 router.post('/assistant/chat/:id/decision',async(r,s)=>s.json(await chat.decide(actor(s),digest(r),id(r.params.id),json(r,chatDecisionSchema))));
 router.post('/assistant/chat',async(r,s)=>{
  const entry=await chat.generate(actor(s),digest(r),json(r,chatRequestSchema));
  // Stream only validated output; the existing provider adapter returns a complete structured answer.
  s.setHeader('Content-Type','application/x-ndjson; charset=utf-8');s.setHeader('X-Accel-Buffering','no');s.flushHeaders();
  for(const text of entry.answer.match(/.{1,48}(?:\s|$)|.{1,48}/gs)??[])s.write(JSON.stringify({type:'text',text})+'\n');
  s.end(JSON.stringify({type:'done',entry})+'\n');
 });
 router.get('/assistant/status',async(r,s)=>s.json(await assistant.status(actor(s),digest(r))));
 router.post('/assistant/settings',async(r,s)=>{const input=json(r,z.object({enabled:z.boolean(),confirmed:z.literal(true)}).strict());s.json(await assistant.configure(actor(s),digest(r),input.enabled));});
 router.post('/assistant',async(r,s)=>s.json(await assistant.generate(actor(s),digest(r),json(r,assistantRequestSchema))));
 router.get('/assistant/history/:leadId',async(r,s)=>s.json(await assistant.history(actor(s),digest(r),id(r.params.leadId))));
 router.post('/assistant/:id/revision',async(r,s)=>s.json(await assistant.revise(actor(s),digest(r),id(r.params.id),json(r,assistantRevisionSchema))));
 router.post('/assistant/:id/review',async(r,s)=>{json(r,z.object({confirmed:z.literal(true)}).strict());s.json(await assistant.review(actor(s),digest(r),id(r.params.id)));});
 router.get('/team',async(r,s)=>{const q=parse(z.object({page:z.coerce.number().int().min(1).max(100000).default(1),propertyPage:z.coerce.number().int().min(1).max(100000).default(1),q:z.string().trim().max(200).default('')}).strict(),r.query);s.json(await team.workspace(actor(s),digest(r),q.page,q.propertyPage,q.q));});
 router.post('/team/invitations',loginRateLimit(),async(r,s)=>s.status(201).json(await team.invite(actor(s),digest(r),json(r,inviteStaffSchema))));
 router.post('/team/recovery',loginRateLimit(),async(r,s)=>s.status(201).json(await team.recovery(actor(s),digest(r),json(r,recoveryStaffSchema))));
 router.post('/team/links/:id/revoke',async(r,s)=>{json(r,z.object({}).strict());s.json(await team.revoke(actor(s),digest(r),id(r.params.id)));});
 router.get('/analytics',async(r,s)=>{const q=parse(z.object({days:z.coerce.number().int().min(1).max(730).default(90)}).strict(),r.query);s.json(await leasingAnalytics(database,config,actor(s),digest(r),q.days));});
 router.get('/onboarding',async(r,s)=>{const result=await database.transaction(async c=>{
  const user=await staffOrganizationAccess(c,config,actor(s),digest(r),{permission:'memberships.manage'});
  const org=user.organization.id;
  const row=(await c.query(`SELECT (SELECT count(*) FROM properties WHERE organization_id=$1)::int AS properties,(SELECT count(*) FROM units WHERE organization_id=$1)::int AS units,(SELECT count(*) FROM organization_memberships WHERE organization_id=$1 AND active)::int AS staff,(SELECT count(*) FROM task_routing_rules WHERE organization_id=$1 AND enabled)::int AS routing,(SELECT count(*) FROM applications WHERE organization_id=$1)::int AS applications,(SELECT count(*) FROM lease_workflows WHERE organization_id=$1 AND stage='completed')::int AS completed`,[org])).rows[0];
  return{counts:row,googleConfigured:config.googleCalendar.enabled,aiConfigured:config.ai.enabled,yardiLiveVerified:false,demo:config.demoMode};
 });s.json(result);});
 return router;
}
