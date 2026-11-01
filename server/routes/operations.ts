import {Attention} from '../services/attention.js';
import {InboxTeam} from '../services/inbox-team.js';
import {attentionQuery,noteSchema,timingSchema,composerSchema} from '../../shared/connected-contracts.js';
import { Router,raw,type Request,type Response,type RequestHandler } from 'express';
import { z } from 'zod';
import type { AuthUser } from '../../shared/contracts.js';
import { pageQuery,formSchema,inquirySchema,draftSchema,editDraftSchema,conversationSchema,consentSchema,templateSchema,ruleSchema,residentRequestSchema,residentUpdateSchema,savedViewSchema,bulkAssignmentSchema,knowledgeSchema } from '../../shared/operations-contracts.js';
import type { ServerConfig } from '../config/env.js';
import type { Database } from '../db/pool.js';
import { ApiError } from '../http/errors.js';
import { readSessionDigest } from '../services/sessions.js';
import { protectOrigin,loginRateLimit } from '../middleware/security.js';
import { Operations } from '../services/operations.js';
import { IntakeService } from '../services/intake.js';
import { Inbox } from '../services/inbox.js';
import { FollowupAutomation } from '../services/followup-automation.js';
import { ResidentRequests } from '../services/resident-requests.js';
import { ApplicantPortal,type ApplicantPrincipal } from '../services/applicant-portal.js';
import { OperationsAnalytics } from '../services/operations-analytics.js';
function parse<T>(schema:z.ZodType<T>,input:unknown):T{const result=schema.safeParse(input);if(!result.success)throw new ApiError(400,'INVALID_INPUT','Check the supplied fields.');return result.data;}
const id=(v:unknown)=>parse(z.uuid(),v);
function json<T>(r:Request,schema:z.ZodType<T>){if(!r.is('application/json'))throw new ApiError(415,'JSON_REQUIRED','Send application/json.');return parse(schema,r.body);}
const actor=(s:Response)=>s.locals.user as AuthUser;
const versionSchema=z.object({version:z.number().int().positive(),confirmed:z.literal(true)}).strict();
function download(s:Response,file:Record<string,any>){s.setHeader('Content-Disposition',"attachment; filename*=UTF-8''"+encodeURIComponent(file.name));s.type(file.media_type).send(file.content);}
export function createOperationsRouter(config:ServerConfig,database:Database,requireUser:RequestHandler,fetcher:typeof fetch=fetch){
 const router=Router(),service=new Operations(database,config),inbox=new Inbox(database,config),automations=new FollowupAutomation(database,config),residents=new ResidentRequests(database,config);
 const digest=(r:Request)=>{const value=readSessionDigest(r,config);if(!value)throw new ApiError(401,'AUTH_REQUIRED','Sign in to your staff account.');return value;};
 router.use(requireUser,(r,s,next)=>{s.setHeader('Cache-Control','no-store, private');s.setHeader('Referrer-Policy','no-referrer');if(!['GET','HEAD','OPTIONS'].includes(r.method))return protectOrigin(config)(r,s,next);next();});
 router.get('/options',async(r,s)=>{const q=parse(pageQuery,r.query);s.json(await service.options(actor(s),digest(r),q.q,q.page));});
 router.get('/search',async(r,s)=>{const q=parse(pageQuery,r.query);s.json(await service.search(actor(s),digest(r),q.q,q.page));});
 router.get('/reports',async(r,s)=>{const q=parse(z.object({days:z.coerce.number().int().min(1).max(730).default(90)}).strict(),r.query);s.json(await new OperationsAnalytics(database,config).report(actor(s),digest(r),q.days));});
 for(const kind of ['forms','rules','knowledge','templates','activity','runs','saved-views'] as const)router.get('/'+kind,async(r,s)=>{const q=parse(pageQuery,r.query);s.json(await service.list(actor(s),digest(r),kind,q.q,q.page));});
 router.post('/forms',async(r,s)=>s.status(201).json(await service.saveForm(actor(s),digest(r),null,json(r,formSchema))));
 router.patch('/forms/:id',async(r,s)=>s.json(await service.saveForm(actor(s),digest(r),id(r.params.id),json(r,formSchema))));
 router.post('/rules',async(r,s)=>s.status(201).json(await service.saveRule(actor(s),digest(r),null,json(r,ruleSchema))));
 router.patch('/rules/:id',async(r,s)=>s.json(await service.saveRule(actor(s),digest(r),id(r.params.id),json(r,ruleSchema))));
 router.post('/rules/run',async(r,s)=>{json(r,z.object({confirmed:z.literal(true)}).strict());s.json(await automations.run(actor(s),digest(r)));});
 router.post('/knowledge',async(r,s)=>s.status(201).json(await service.saveKnowledge(actor(s),digest(r),null,json(r,knowledgeSchema))));
 router.patch('/knowledge/:id',async(r,s)=>s.json(await service.saveKnowledge(actor(s),digest(r),id(r.params.id),json(r,knowledgeSchema))));
 router.post('/templates',async(r,s)=>s.status(201).json(await service.saveTemplate(actor(s),digest(r),null,json(r,templateSchema))));
 router.patch('/templates/:id',async(r,s)=>s.json(await service.saveTemplate(actor(s),digest(r),id(r.params.id),json(r,templateSchema))));
 router.post('/saved-views',async(r,s)=>s.status(201).json(await service.saveView(actor(s),digest(r),json(r,savedViewSchema))));
 router.delete('/saved-views/:id',async(r,s)=>s.json(await service.deleteView(actor(s),digest(r),id(r.params.id))));
 router.post('/bulk-assignment',async(r,s)=>s.json(await service.bulkAssign(actor(s),digest(r),json(r,bulkAssignmentSchema))));
 router.get('/inbox',async(r,s)=>{const q=parse(pageQuery.extend({status:z.enum(['','open','closed']).default('open')}),r.query);s.json(await inbox.listInbox(actor(s),digest(r),q.q,q.page,q.status));});
 router.post('/inbox/open',async(r,s)=>s.json(await inbox.open(actor(s),digest(r),json(r,z.object({leadId:z.uuid()}).strict()).leadId)));
 router.get('/inbox/unmatched',async(r,s)=>{const q=parse(pageQuery,r.query);s.json(await inbox.unmatched(actor(s),digest(r),q.page));});
 router.post('/inbox/unmatched/:id',async(r,s)=>s.json(await inbox.resolveUnmatched(actor(s),digest(r),id(r.params.id),json(r,z.object({conversationId:z.uuid()}).strict()).conversationId)));
 router.get('/attention',async(r,s)=>s.json(await new Attention(database,config).queue(actor(s),digest(r),parse(attentionQuery,r.query))));
 router.get('/inbox/:id/team',async(r,s)=>{const q=parse(pageQuery,r.query);s.json(await new InboxTeam(database,config).team(actor(s),digest(r),id(r.params.id),q.page));});
 router.get('/inbox/:id/journey',async(r,s)=>s.json(await new InboxTeam(database,config).journey(actor(s),digest(r),id(r.params.id))));
 router.post('/inbox/:id/notes',async(r,s)=>s.status(201).json(await new InboxTeam(database,config).note(actor(s),digest(r),id(r.params.id),json(r,noteSchema))));
 router.post('/inbox/:id/notes/:noteId/read',async(r,s)=>{json(r,z.object({}).strict());s.json(await new InboxTeam(database,config).acknowledge(actor(s),digest(r),id(r.params.id),id(r.params.noteId)));});
 router.patch('/inbox/:id/timing',async(r,s)=>s.json(await new InboxTeam(database,config).timing(actor(s),digest(r),id(r.params.id),json(r,timingSchema))));
 router.post('/inbox/:id/composer',async(r,s)=>s.json(await new InboxTeam(database,config).compose(actor(s),digest(r),id(r.params.id),json(r,composerSchema))));
 router.get('/inbox/:id',async(r,s)=>{const q=parse(pageQuery,r.query);s.json(await inbox.detail(actor(s),digest(r),id(r.params.id),q.page));});
 router.post('/inbox/:id/read',async(r,s)=>{json(r,z.object({}).strict());s.json(await inbox.read(actor(s),digest(r),id(r.params.id)));});
 router.patch('/inbox/:id',async(r,s)=>s.json(await inbox.updateConversation(actor(s),digest(r),id(r.params.id),json(r,conversationSchema))));
 router.post('/inbox/:id/preferences',async(r,s)=>s.json(await inbox.consent(actor(s),digest(r),id(r.params.id),json(r,consentSchema))));
 router.post('/inbox/:id/drafts',async(r,s)=>s.status(201).json(await inbox.draft(actor(s),digest(r),id(r.params.id),json(r,draftSchema))));
 router.patch('/inbox/:id/drafts/:messageId',async(r,s)=>s.json(await inbox.editDraft(actor(s),digest(r),id(r.params.id),id(r.params.messageId),json(r,editDraftSchema))));
 router.post('/inbox/:id/drafts/:messageId/send',loginRateLimit(),async(r,s)=>s.json(await inbox.send(actor(s),digest(r),id(r.params.id),id(r.params.messageId),json(r,versionSchema).version,fetcher)));
 router.get('/residents',async(r,s)=>{const q=parse(pageQuery,r.query);s.json(await residents.listStaff(actor(s),digest(r),q.q,q.page));});
 router.get('/residents/:id',async(r,s)=>s.json(await residents.staffDetail(actor(s),digest(r),id(r.params.id))));
 router.patch('/residents/:id',async(r,s)=>s.json(await residents.update(actor(s),digest(r),id(r.params.id),json(r,residentUpdateSchema))));
 router.get('/residents/:id/documents/:documentId',async(r,s)=>download(s,await residents.staffDownload(actor(s),digest(r),id(r.params.id),id(r.params.documentId))));
 return router;
}
export function createIntakeRouter(config:ServerConfig,database:Database){const router=Router(),service=new IntakeService(database,config);router.use((_r,s,next)=>{s.setHeader('Cache-Control','no-store');next();});router.get('/:id',async(r,s)=>s.json(await service.form(id(r.params.id))));router.post('/:id',protectOrigin(config),async(r,s)=>s.status(201).json(await service.submit(id(r.params.id),json(r,inquirySchema),r.ip??'unknown')));return router;}
export function createResidentRouter(config:ServerConfig,database:Database){
 const router=Router(),sessions=new ApplicantPortal(database,config),service=new ResidentRequests(database,config);
 router.use(async(r,s,next)=>{s.setHeader('Cache-Control','no-store, private');s.setHeader('Referrer-Policy','no-referrer');const user=await sessions.currentUser(r);if(!user)throw new ApiError(401,'APPLICANT_AUTH_REQUIRED','Sign in through the applicant portal to open your resident workspace.');s.locals.resident=user;if(!['GET','HEAD','OPTIONS'].includes(r.method))return protectOrigin(config)(r,s,next);next();});
 const resident=(s:Response)=>s.locals.resident as ApplicantPrincipal;
 router.get('/',async(_r,s)=>s.json(await service.portal(resident(s))));
 router.post('/requests',async(r,s)=>s.status(201).json(await service.create(resident(s),json(r,residentRequestSchema))));
 router.get('/requests/:id',async(r,s)=>s.json(await service.detail(resident(s),id(r.params.id))));
 router.post('/requests/:id/replies',async(r,s)=>s.json(await service.reply(resident(s),id(r.params.id),json(r,z.object({body:z.string().trim().min(1).max(3000)}).strict()).body)));
 router.post('/requests/:id/documents',raw({type:['application/pdf','image/png','image/jpeg','text/plain'],limit:'20mb',inflate:false}),async(r,s)=>{const q=parse(z.object({name:z.string().min(1).max(180)}).strict(),r.query);s.status(201).json(await service.upload(resident(s),id(r.params.id),q.name,r.get('content-type')?.split(';')[0]??'',r.body));});
 router.get('/requests/:id/documents/:documentId',async(r,s)=>download(s,await service.download(resident(s),id(r.params.id),id(r.params.documentId))));return router;
}
