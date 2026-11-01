import {Router,raw,type Request,type Response,type RequestHandler} from 'express';
import {z} from 'zod';
import * as schema from '../../shared/property-operations-contracts.js';
import type {AuthUser} from '../../shared/contracts.js';
import type {ServerConfig} from '../config/env.js';
import type {Database} from '../db/pool.js';
import {ApiError} from '../http/errors.js';
import {readSessionDigest} from '../services/sessions.js';
import {protectOrigin} from '../middleware/security.js';
import {Maintenance} from '../services/maintenance.js';
import {Tenancies} from '../services/tenancies.js';
import {Vacancies} from '../services/vacancies.js';
import {DuplicateReview} from '../services/duplicate-review.js';
import {ResponsePolicies} from '../services/response-policies.js';
import {ResidentWorkflows} from '../services/resident-workflows.js';
import {ApplicantPortal,type ApplicantPrincipal} from '../services/applicant-portal.js';
function parse<T>(s:z.ZodType<T>,v:unknown):T{const r=s.safeParse(v);if(!r.success)throw new ApiError(400,'INVALID_INPUT','Check the supplied fields.');return r.data;}
const id=(v:unknown)=>parse(z.uuid(),v);
function body<T>(r:Request,s:z.ZodType<T>){if(!r.is('application/json'))throw new ApiError(415,'JSON_REQUIRED','Send application/json.');return parse(s,r.body);}
function download(s:Response,file:Record<string,any>){s.setHeader('Content-Disposition',"attachment; filename*=UTF-8''"+encodeURIComponent(file.name));s.type(file.media_type).send(file.content);}
function gates(config:ServerConfig):RequestHandler{return(r,s,next)=>{s.setHeader('Cache-Control','no-store, private');s.setHeader('Referrer-Policy','no-referrer');if(!['GET','HEAD','OPTIONS'].includes(r.method))return protectOrigin(config)(r,s,next);next();};}
export function createPropertyOperationsRouter(config:ServerConfig,db:Database,requireUser:RequestHandler){
 const r=Router(),m=new Maintenance(db,config),t=new Tenancies(db,config),v=new Vacancies(db,config),du=new DuplicateReview(db,config),pol=new ResponsePolicies(db,config);
 const a=(s:Response)=>s.locals.user as AuthUser,d=(r:Request)=>{const value=readSessionDigest(r,config);if(!value)throw new ApiError(401,'AUTH_REQUIRED','Sign in to your staff account.');return value;},q=(r:Request)=>parse(schema.portfolioQuery,r.query);
 r.use(requireUser,gates(config));
 r.get('/vendors',async(req,s)=>s.json(await m.vendors(a(s),d(req),q(req))));
 r.post('/vendors',async(req,s)=>s.status(201).json(await m.saveVendor(a(s),d(req),null,body(req,schema.vendorSchema))));
 r.patch('/vendors/:id',async(req,s)=>s.json(await m.saveVendor(a(s),d(req),id(req.params.id),body(req,schema.vendorSchema))));
 r.get('/maintenance',async(req,s)=>s.json(await m.listOrders(a(s),d(req),q(req))));
 r.post('/maintenance',async(req,s)=>s.status(201).json(await m.create(a(s),d(req),body(req,schema.workOrderCreate))));
 r.get('/maintenance/:id',async(req,s)=>s.json(await m.detail(a(s),d(req),id(req.params.id))));
 r.patch('/maintenance/:id',async(req,s)=>s.json(await m.update(a(s),d(req),id(req.params.id),body(req,schema.workOrderUpdate))));
 r.post('/maintenance/:id/photos',raw({type:['image/png','image/jpeg'],limit:'20mb',inflate:false}),async(req,s)=>{const q=parse(z.object({name:z.string().min(1).max(180)}).strict(),req.query);s.status(201).json(await m.upload(a(s),d(req),id(req.params.id),q.name,req.get('content-type')?.split(';')[0]??'',req.body));});
 r.get('/maintenance/:id/photos/:photo',async(req,s)=>download(s,await m.photo(a(s),d(req),id(req.params.id),id(req.params.photo))));
 r.get('/residents',async(req,s)=>s.json(await t.residents(a(s),d(req),q(req))));
 r.get('/tenancies',async(req,s)=>s.json(await t.listPlans(a(s),d(req),q(req))));
 r.post('/tenancies',async(req,s)=>s.status(201).json(await t.create(a(s),d(req),body(req,schema.tenancySchema))));
 r.get('/tenancies/:id',async(req,s)=>s.json(await t.detail(a(s),d(req),id(req.params.id))));
 r.post('/tenancies/:id/offers',async(req,s)=>s.status(201).json(await t.createOffer(a(s),d(req),id(req.params.id),body(req,schema.renewalSchema))));
 r.post('/tenancies/:id/offers/:offer',async(req,s)=>s.json(await t.offerAction(a(s),d(req),id(req.params.id),id(req.params.offer),body(req,schema.renewalAction))));
 r.post('/tenancies/:id/followup',async(req,s)=>s.json(await t.followup(a(s),d(req),id(req.params.id),body(req,schema.followupSchema))));
 r.post('/tenancies/:id/move-out',async(req,s)=>s.json(await t.moveOut(a(s),d(req),id(req.params.id),body(req,schema.moveOutSchema))));
 r.get('/vacancies',async(req,s)=>s.json(await v.listUnits(a(s),d(req),q(req))));
 r.get('/vacancies/:id',async(req,s)=>s.json(await v.detail(a(s),d(req),id(req.params.id))));
 r.post('/turnovers',async(req,s)=>s.json(await v.save(a(s),d(req),body(req,schema.turnoverSchema))));
 r.post('/waitlist',async(req,s)=>s.status(201).json(await v.addWaitlist(a(s),d(req),body(req,schema.waitlistSchema))));
 r.post('/waitlist/:id',async(req,s)=>s.json(await v.waitAction(a(s),d(req),id(req.params.id),body(req,schema.waitlistAction))));
 r.get('/duplicates',async(req,s)=>s.json(await du.candidates(a(s),d(req),q(req))));
 r.get('/duplicates/:first/:second',async(req,s)=>s.json(await du.detail(a(s),d(req),id(req.params.first),id(req.params.second))));
 r.post('/duplicates',async(req,s)=>s.json(await du.resolve(a(s),d(req),body(req,schema.duplicateSchema))));
 r.get('/response-policies',async(req,s)=>s.json(await pol.policies(a(s),d(req),q(req))));
 r.post('/response-policies',async(req,s)=>s.json(await pol.save(a(s),d(req),body(req,schema.responsePolicySchema))));
 return r;
}
export function createResidentWorkflowsRouter(config:ServerConfig,db:Database){
 const r=Router(),sessions=new ApplicantPortal(db,config),service=new ResidentWorkflows(db,config),user=(s:Response)=>s.locals.resident as ApplicantPrincipal;
 r.use(gates(config),async(req,s,next)=>{const u=await sessions.currentUser(req);if(!u)throw new ApiError(401,'APPLICANT_AUTH_REQUIRED','Sign in to your resident workspace.');s.locals.resident=u;next();});
 r.get('/',async(_req,s)=>s.json(await service.workspace(user(s))));
 r.post('/renewals/:id',async(req,s)=>s.json(await service.respond(user(s),id(req.params.id),body(req,schema.renewalResponse))));
 r.post('/maintenance/:id',async(req,s)=>s.json(await service.confirmWork(user(s),id(req.params.id),body(req,schema.workConfirmation))));
 r.get('/maintenance/:id/photos',async(req,s)=>s.json(await service.photos(user(s),id(req.params.id))));
 r.get('/maintenance/:id/photos/:photo',async(req,s)=>download(s,await service.photo(user(s),id(req.params.id),id(req.params.photo))));
 return r;
}
