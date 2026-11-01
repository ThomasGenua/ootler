import {previewDocument} from '../http/document-preview.js';
import {Router,raw,type Request,type Response,type RequestHandler} from 'express';
import {z} from 'zod';
import * as S from '../../shared/property-collaboration-contracts.js';
import {portfolioQuery} from '../../shared/property-operations-contracts.js';
import type {AuthUser} from '../../shared/contracts.js';
import type {ServerConfig} from '../config/env.js';
import type {Database} from '../db/pool.js';
import {ApiError} from '../http/errors.js';
import {readSessionDigest} from '../services/sessions.js';
import {protectOrigin} from '../middleware/security.js';
import {VendorWorkspace} from '../services/vendor-workspace.js';
import {Inspections} from '../services/inspections.js';
import {ResidentDocuments,ResidentDocumentPortal} from '../services/resident-documents.js';
import {NotificationCenter} from '../services/notification-center.js';
import {PropertyInsights} from '../services/property-insights.js';
import {ApplicantPortal,type ApplicantPrincipal} from '../services/applicant-portal.js';
const parse=<T>(s:z.ZodType<T>,v:unknown):T=>{const r=s.safeParse(v);if(!r.success)throw new ApiError(400,'INVALID_INPUT','Check the supplied fields.');return r.data;};
const id=(v:unknown)=>parse(z.uuid(),v),number=(v:unknown)=>parse(z.coerce.number().int().positive(),v);
const body=<T>(r:Request,s:z.ZodType<T>)=>{if(!r.is('application/json'))throw new ApiError(415,'JSON_REQUIRED','Send application/json.');return parse(s,r.body);};
const preview=(s:Response,db:Database,f:Record<string,any>)=>previewDocument(s,db,{name:f.name,mediaType:f.media_type,content:f.content});
const send=(s:Response,f:Record<string,any>)=>{s.setHeader('Content-Disposition',"attachment; filename*=UTF-8''"+encodeURIComponent(f.name));s.type(f.media_type).send(f.content);};
const bytes=raw({type:['image/png','image/jpeg','application/pdf','text/plain'],limit:'20mb',inflate:false});
const fileQuery=z.object({name:z.string().min(1).max(180)});
function gates(config:ServerConfig):RequestHandler{return(r,s,next)=>{s.setHeader('Cache-Control','no-store, private');s.setHeader('Referrer-Policy','no-referrer');if(!['GET','HEAD','OPTIONS'].includes(r.method))return protectOrigin(config)(r,s,next);next();};}
export function createPropertyCollaborationRouter(config:ServerConfig,db:Database,requireUser:RequestHandler){
 const r=Router(),v=new VendorWorkspace(db,config),i=new Inspections(db,config),docs=new ResidentDocuments(db,config),n=new NotificationCenter(db,config),insights=new PropertyInsights(db,config);
 const a=(s:Response)=>s.locals.user as AuthUser,d=(r:Request)=>{const value=readSessionDigest(r,config);if(!value)throw new ApiError(401,'AUTH_REQUIRED','Sign in.');return value;},q=(r:Request)=>parse(portfolioQuery,r.query),type=(r:Request)=>r.get('content-type')?.split(';')[0]??'';
 r.use(requireUser,gates(config));
 r.get('/vendor-jobs/:id',async(req,s)=>s.json(await v.staffDetail(a(s),d(req),id(req.params.id))));
 r.post('/vendor-jobs/:id/access',async(req,s)=>s.json(await v.access(a(s),d(req),id(req.params.id),body(req,S.jobAccess))));
 r.post('/vendor-jobs/:id/quotes/:quote',async(req,s)=>s.json(await v.decide(a(s),d(req),id(req.params.id),id(req.params.quote),body(req,S.quoteDecision))));
 r.get('/vendor-jobs/:id/files/:file',async(req,s)=>send(s,await v.file(a(s),d(req),id(req.params.id),id(req.params.file))));
 r.get('/vendor-jobs/:id/files/:file/preview',async(req,s)=>preview(s,db,await v.file(a(s),d(req),id(req.params.id),id(req.params.file))));
 r.get('/approval-policies',async(req,s)=>s.json(await v.policies(a(s),d(req))));
 r.post('/approval-policies',async(req,s)=>s.json(await v.policy(a(s),d(req),body(req,S.approvalPolicy))));
 r.get('/inspection-templates',async(req,s)=>s.json(await i.templates(a(s),d(req))));
 r.post('/inspection-templates',async(req,s)=>s.status(201).json(await i.template(a(s),d(req),null,body(req,S.templateSchema))));
 r.patch('/inspection-templates/:id',async(req,s)=>s.json(await i.template(a(s),d(req),id(req.params.id),body(req,S.templateSchema))));
 r.get('/inspections',async(req,s)=>s.json(await i.directory(a(s),d(req),q(req))));
 r.post('/inspections',async(req,s)=>s.status(201).json(await i.create(a(s),d(req),body(req,S.inspectionCreate))));
 r.get('/inspections/:id',async(req,s)=>s.json(await i.detail(a(s),d(req),id(req.params.id))));
 r.post('/inspections/:id',async(req,s)=>s.json(await i.save(a(s),d(req),id(req.params.id),body(req,S.inspectionSave))));
 r.post('/inspections/:id/photos',bytes,async(req,s)=>{const f=parse(fileQuery.extend({itemKey:z.uuid()}).strict(),req.query);s.status(201).json(await i.upload(a(s),d(req),id(req.params.id),f.itemKey,f.name,type(req),req.body));});
 r.get('/inspections/:id/photos/:photo',async(req,s)=>send(s,await i.photo(a(s),d(req),id(req.params.id),id(req.params.photo))));
 r.get('/inspections/:id/photos/:photo/preview',async(req,s)=>preview(s,db,await i.photo(a(s),d(req),id(req.params.id),id(req.params.photo))));
 r.get('/documents',async(req,s)=>s.json(await docs.directory(a(s),d(req),q(req))));
 r.post('/documents',async(req,s)=>s.status(201).json(await docs.create(a(s),d(req),body(req,S.documentCreate))));
 r.get('/documents/:id',async(req,s)=>s.json(await docs.detail(a(s),d(req),id(req.params.id))));
 r.post('/documents/:id',async(req,s)=>s.json(await docs.action(a(s),d(req),id(req.params.id),body(req,S.documentAction))));
 r.post('/documents/:id/files',bytes,async(req,s)=>{const f=parse(fileQuery.extend({version:z.coerce.number().int().positive()}).strict(),req.query);s.status(201).json(await docs.upload(a(s),d(req),id(req.params.id),f.version,f.name,type(req),req.body));});
 r.get('/documents/:id/files/:number',async(req,s)=>send(s,await docs.file(a(s),d(req),id(req.params.id),number(req.params.number))));
 r.get('/documents/:id/files/:number/preview',async(req,s)=>preview(s,db,await docs.file(a(s),d(req),id(req.params.id),number(req.params.number))));
 r.get('/notifications',async(req,s)=>s.json(await n.directory(a(s),d(req),parse(S.notificationQuery,req.query))));
 r.post('/notifications',async(req,s)=>s.json(await n.act(a(s),d(req),body(req,S.notificationAction))));
 r.post('/notification-preferences',async(req,s)=>s.json(await n.preferences(a(s),d(req),body(req,S.notificationPreferences))));
 r.get('/insights',async(req,s)=>s.json(await insights.report(a(s),d(req),parse(S.dashboardQuery,req.query))));
 return r;
}
export function createVendorWorkspaceRouter(config:ServerConfig,db:Database){
 const r=Router(),v=new VendorWorkspace(db,config),token=(req:Request)=>req.get('authorization')?.replace(/^Bearer /,'')??'';r.use(gates(config));
 r.get('/',async(req,s)=>s.json(await v.portal(token(req))));
 r.post('/updates',async(req,s)=>s.json(await v.update(token(req),body(req,S.vendorUpdate))));
 r.post('/quotes',async(req,s)=>s.status(201).json(await v.quote(token(req),body(req,S.quoteCreate))));
 r.post('/files',bytes,async(req,s)=>{const f=parse(fileQuery.extend({category:z.enum(['photo','invoice'])}).strict(),req.query);s.status(201).json(await v.upload(token(req),f.category,f.name,req.get('content-type')?.split(';')[0]??'',req.body));});
 return r;
}
export function createResidentDocumentsRouter(config:ServerConfig,db:Database){
 const r=Router(),sessions=new ApplicantPortal(db,config),docs=new ResidentDocumentPortal(db,config),user=(s:Response)=>s.locals.resident as ApplicantPrincipal;r.use(gates(config),async(req,s,next)=>{const u=await sessions.currentUser(req);if(!u)throw new ApiError(401,'APPLICANT_AUTH_REQUIRED','Sign in to your resident workspace.');s.locals.resident=u;next();});
 r.get('/',async(_req,s)=>s.json(await docs.documents(user(s))));
 r.post('/:id/acknowledge',async(req,s)=>s.json(await docs.acknowledge(user(s),id(req.params.id),body(req,S.acknowledge).number)));
 r.get('/:id/files/:number',async(req,s)=>send(s,await docs.downloadDocument(user(s),id(req.params.id),number(req.params.number))));
 r.get('/:id/files/:number/preview',async(req,s)=>preview(s,db,await docs.downloadDocument(user(s),id(req.params.id),number(req.params.number))));
 return r;
}
