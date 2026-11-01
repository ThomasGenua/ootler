import {Router,type Request,type Response,type RequestHandler} from 'express';
import {z} from 'zod';
import * as S from '../../shared/productivity-contracts.js';
import type {AuthUser} from '../../shared/contracts.js';
import type {ServerConfig} from '../config/env.js';
import type {Database} from '../db/pool.js';
import {ApiError} from '../http/errors.js';
import {protectOrigin} from '../middleware/security.js';
import {readSessionDigest} from '../services/sessions.js';
import {LeasingProductivity} from '../services/leasing-productivity.js';
import {UnitShortlists} from '../services/unit-shortlists.js';
import {FollowupSequences} from '../services/followup-sequences.js';
import {PropertyPlaybooks} from '../services/property-playbooks.js';
const parse=<T>(schema:z.ZodType<T>,value:unknown):T=>{const result=schema.safeParse(value);if(!result.success)throw new ApiError(400,'INVALID_INPUT','Check the supplied fields.');return result.data;};
const id=(v:unknown)=>parse(z.uuid(),v),body=<T>(r:Request,s:z.ZodType<T>)=>{if(!r.is('application/json'))throw new ApiError(415,'JSON_REQUIRED','Send application/json.');return parse(s,r.body);};
function gate(config:ServerConfig):RequestHandler{return(r,s,next)=>{s.setHeader('Cache-Control','no-store, private');s.setHeader('Referrer-Policy','no-referrer');if(!['GET','HEAD','OPTIONS'].includes(r.method))return protectOrigin(config)(r,s,next);next();};}
export function createProductivityRouter(config:ServerConfig,db:Database,requireUser:RequestHandler){
 const r=Router(),p=new LeasingProductivity(db,config),s=new UnitShortlists(db,config),seq=new FollowupSequences(db,config),pb=new PropertyPlaybooks(db,config);
 const a=(res:Response)=>res.locals.user as AuthUser,d=(req:Request)=>{const v=readSessionDigest(req,config);if(!v)throw new ApiError(401,'AUTH_REQUIRED','Sign in.');return v;},q=(req:Request)=>parse(S.productivityQuery,req.query);
 r.use(requireUser,gate(config));
 r.get('/feedback/:id',async(req,res)=>res.json(await p.feedback(a(res),d(req),id(req.params.id))));
 r.post('/feedback/:id',async(req,res)=>res.json(await p.saveFeedback(a(res),d(req),id(req.params.id),body(req,S.feedbackSchema))));
 r.get('/dashboard',async(req,res)=>res.json(await p.dashboard(a(res),d(req),q(req))));
 r.get('/preferences',async(req,res)=>res.json(await p.preferences(a(res),d(req))));
 r.post('/preferences',async(req,res)=>res.json(await p.savePreferences(a(res),d(req),body(req,S.dashboardPreferenceSchema))));
 r.get('/workload',async(req,res)=>res.json(await p.workload(a(res),d(req),q(req))));
 r.get('/insights',async(req,res)=>res.json(await p.insights(a(res),d(req),q(req))));
 r.get('/shortlists',async(req,res)=>res.json(await s.directory(a(res),d(req),q(req))));
 r.post('/shortlists',async(req,res)=>res.status(201).json(await s.create(a(res),d(req),body(req,S.shortlistCreateSchema))));
 r.get('/shortlists/:id',async(req,res)=>res.json(await s.detail(a(res),d(req),id(req.params.id))));
 r.post('/shortlists/:id/revoke',async(req,res)=>{body(req,z.object({confirmed:z.literal(true)}).strict());res.json(await s.revoke(a(res),d(req),id(req.params.id)));});
 r.get('/sequences',async(req,res)=>res.json(await seq.directory(a(res),d(req),q(req))));
 r.post('/sequences',async(req,res)=>res.status(201).json(await seq.create(a(res),d(req),body(req,S.sequenceSchema))));
 r.post('/sequences/run',async(req,res)=>res.json(await seq.run(a(res),d(req))));
 r.get('/sequences/:id',async(req,res)=>res.json(await seq.detail(a(res),d(req),id(req.params.id),q(req))));
 r.post('/sequences/:id/enroll',async(req,res)=>res.json(await seq.enroll(a(res),d(req),id(req.params.id),body(req,S.sequenceEnrollmentSchema))));
 r.post('/enrollments/:id',async(req,res)=>res.json(await seq.control(a(res),d(req),id(req.params.id),body(req,S.versionActionSchema))));
 r.get('/playbooks',async(req,res)=>res.json(await pb.directory(a(res),d(req))));
 r.post('/playbooks',async(req,res)=>res.status(201).json(await pb.create(a(res),d(req),body(req,S.playbookCreateSchema))));
 r.get('/playbooks/:id/preview',async(req,res)=>res.json(await pb.preview(a(res),d(req),id(req.params.id),id(req.query.propertyId))));
 r.post('/playbooks/:id/apply',async(req,res)=>res.json(await pb.apply(a(res),d(req),id(req.params.id),body(req,S.playbookApplySchema))));
 return r;
}
export function createShortlistRouter(config:ServerConfig,db:Database){const r=Router(),s=new UnitShortlists(db,config),token=(req:Request)=>req.get('authorization')?.replace(/^Bearer /,'')??'';r.use(gate(config));r.get('/',async(req,res)=>res.json(await s.publicRead(token(req))));r.post('/',async(req,res)=>res.json(await s.respond(token(req),body(req,S.shortlistResponseSchema))));return r;}
