import {previewDocument} from '../http/document-preview.js';
import { Router, raw, type Request, type RequestHandler, type Response } from 'express';
import { z } from 'zod';
import type { AuthUser } from '../../shared/contracts.js';
import { applicantLoginSchema, applicantInvitationAcceptSchema, applicantSaveSchema, applicantVersionSchema, applicantConsentSchema, applicationCreateSchema, applicationListSchema, applicationInvitationSchema, applicationParticipantSchema, applicationSettingsSchema, applicantDocumentSchema, type ApplicantDocument } from '../../shared/applicant-contracts.js';
import { allowedDocumentTypes, maximumDocumentBytes } from '../../shared/lead-workspace-contracts.js';
import type { ServerConfig } from '../config/env.js';
import type { Database } from '../db/pool.js';
import { ApiError } from '../http/errors.js';
import { protectOrigin, loginRateLimit } from '../middleware/security.js';
import { ApplicantPortal, type ApplicantPrincipal } from '../services/applicant-portal.js';
function parse<T>(schema: z.ZodType<T>, value: unknown): T {
    const result = schema.safeParse(value);
    if (!result.success)
        throw new ApiError(400, 'INVALID_INPUT', 'Check the application fields, identifiers and required values.');
    return result.data;
}
function body<T>(request: Request, schema: z.ZodType<T>): T {
    if (!request.is('application/json'))
        throw new ApiError(415, 'JSON_REQUIRED', 'Send this request as application/json.');
    return parse(schema, request.body);
}
const id = (value: unknown) => parse(z.uuid(), value);
const noQuery = (request: Request): void => {
    parse(z.object({}).strict(), request.query);
};
const user = (response: Response): ApplicantPrincipal => response.locals.applicant as ApplicantPrincipal;
const staff = (response: Response): AuthUser => response.locals.user as AuthUser;
function sendDocument(response: Response, result: {
    document: ApplicantDocument;
    content: Buffer;
}): void {
    const d = result.document, ascii = d.name.replace(/[^a-zA-Z0-9._ -]/g, '_').replace(/^[ .]+/, '') || 'document';
    response.setHeader('Content-Type', d.mediaType);
    response.setHeader('Content-Disposition', `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(d.name).replace(/['()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase())}`);
    response.setHeader('Content-Length', String(d.sizeBytes));
    response.setHeader('Cache-Control', 'no-store, private');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('X-Download-Options', 'noopen');
    response.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    response.send(result.content);
}
function security(config: ServerConfig): RequestHandler {
    return (request, response, next) => {
        response.setHeader('Cache-Control', 'no-store, private');
        response.setHeader('Referrer-Policy', 'no-referrer');
        if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method))
            return protectOrigin(config)(request, response, next);
        next();
    };
}
/** Deliberately independent from requireUser/staff sessions. No impersonation pathway exists. */
export function createApplicantPortalRouter(config: ServerConfig, database: Database): Router {
    const router = Router(), service = new ApplicantPortal(database, config), limited = loginRateLimit();
    router.use(security(config));
    router.get('/config', async (request, response) => {
        noQuery(request);
        response.json(await service.configPublic());
    });
    router.get('/auth/me', async (request, response) => {
        noQuery(request);
        const current = await service.currentUser(request);
        response.json({ user: current ? service.publicUser(current) : null });
    });
    router.post('/auth/login', limited, async (request, response) => {
        noQuery(request);
        response.json({ user: await service.login(request, response, body(request, applicantLoginSchema)) });
    });
    router.post('/auth/logout', async (request, response) => {
        noQuery(request);
        body(request, z.object({}).strict());
        await service.logout(request, response);
        response.status(204).end();
    });
    router.post('/invitations/inspect', limited, async (request, response) => {
        noQuery(request);
        const input = body(request, z.object({ token: z.string().regex(/^[a-f0-9]{64}$/) }).strict());
        response.json(await service.inspect(input.token));
    });
    router.post('/invitations/accept', limited, async (request, response) => {
        noQuery(request);
        response.json({ user: await service.accept(request, response, body(request, applicantInvitationAcceptSchema)) });
    });
    router.use(async (request, response, next) => {
        const current = await service.currentUser(request);
        if (!current)
            throw new ApiError(401, 'APPLICANT_AUTH_REQUIRED', 'Sign in to your applicant portal.');
        response.locals.applicant = current;
        next();
    });
    router.get('/applications', async (request, response) => {
        noQuery(request);
        response.json(await service.list(user(response)));
    });
    router.get('/applications/:applicationId', async (request, response) => {
        noQuery(request);
        response.json(await service.detail(user(response), id(request.params.applicationId)));
    });
    router.patch('/applications/:applicationId', async (request, response) => {
        noQuery(request);
        response.json(await service.save(user(response), id(request.params.applicationId), body(request, applicantSaveSchema)));
    });
    router.post('/applications/:applicationId/consents', async (request, response) => {
        noQuery(request);
        body(request, applicantConsentSchema);
        response.json(await service.consent(user(response), id(request.params.applicationId)));
    });
    router.post('/applications/:applicationId/ready', async (request, response) => {
        noQuery(request);
        response.json(await service.ready(user(response), id(request.params.applicationId), body(request, applicantVersionSchema).version));
    });
    router.post('/applications/:applicationId/submit', async (request, response) => {
        noQuery(request);
        response.json(await service.submit(user(response), id(request.params.applicationId), body(request, applicantVersionSchema).version));
    });
    router.post('/applications/:applicationId/documents', async (request, response, next) => {
        await service.detail(user(response), id(request.params.applicationId));
        parse(applicantDocumentSchema, request.query);
        const mediaType = (request.headers['content-type'] ?? '').split(';')[0]!.trim().toLowerCase();
        if (!(allowedDocumentTypes as readonly string[]).includes(mediaType))
            throw new ApiError(415, 'DOCUMENT_TYPE_DENIED', 'Choose PDF, PNG, JPEG or UTF-8 plain text.');
        if (request.headers['content-encoding'] && request.headers['content-encoding'] !== 'identity')
            throw new ApiError(415, 'DOCUMENT_ENCODING_DENIED', 'Upload the original uncompressed document.');
        response.locals.documentMediaType = mediaType;
        next();
    }, raw({ type: () => true, limit: maximumDocumentBytes, inflate: false }), async (request, response) => {
        const q = parse(applicantDocumentSchema, request.query);
        response.status(201).json({ document: await service.upload(user(response), id(request.params.applicationId), q.checklistId, q.name, String(response.locals.documentMediaType), request.body as Buffer) });
    });
    router.get('/applications/:applicationId/documents/:documentId/preview',async(request,response)=>{noQuery(request);const file=await service.download(user(response),id(request.params.applicationId),id(request.params.documentId));await previewDocument(response,database,{name:file.document.name,mediaType:file.document.mediaType,content:file.content});});
    router.get('/applications/:applicationId/documents/:documentId/download', async (request, response) => {
        noQuery(request);
        sendDocument(response, await service.download(user(response), id(request.params.applicationId), id(request.params.documentId)));
    });
    return router;
}
export function createApplicationStaffRouter(config: ServerConfig, database: Database, requireUser: RequestHandler): Router {
    const router = Router(), service = new ApplicantPortal(database, config);
    router.use(requireUser, security(config));
    router.get('/list', async (request, response) => {
        response.json(await service.staffList(staff(response), parse(applicationListSchema, request.query)));
    });
    router.post('/', async (request, response) => {
        noQuery(request);
        response.status(201).json(await service.staffCreate(staff(response), body(request, applicationCreateSchema).leadId));
    });
    router.get('/:applicationId', async (request, response) => {
        noQuery(request);
        response.json(await service.staffDetail(staff(response), id(request.params.applicationId)));
    });
    router.get('/:applicationId/preview', async (request, response) => {
        noQuery(request);
        response.json(await service.staffPreview(staff(response), id(request.params.applicationId)));
    });
    router.put('/:applicationId/settings', async (request, response) => {
        noQuery(request);
        response.json(await service.staffSettings(staff(response), id(request.params.applicationId), body(request, applicationSettingsSchema)));
    });
    router.post('/:applicationId/invitations', async (request, response) => {
        noQuery(request);
        const i = body(request, applicationInvitationSchema);
        response.status(201).json(await service.staffInvite(staff(response), id(request.params.applicationId), i.participantId, i.expiresInHours));
    });
    router.delete('/:applicationId/invitations/:invitationId', async (request, response) => {
        noQuery(request);
        await service.staffRevokeInvitation(staff(response), id(request.params.applicationId), id(request.params.invitationId));
        response.status(204).end();
    });
    router.post('/:applicationId/participants', async (request, response) => {
        noQuery(request);
        const i = body(request, applicationParticipantSchema);
        response.status(201).json(await service.staffParticipant(staff(response), id(request.params.applicationId), i.contactId, i.email));
    });
    router.post('/:applicationId/participants/:participantId/revoke', async (request, response) => {
        noQuery(request);
        body(request, z.object({}).strict());
        response.json(await service.staffRevokeParticipant(staff(response), id(request.params.applicationId), id(request.params.participantId)));
    });
    router.get('/:applicationId/documents/:documentId/preview',async(request,response)=>{noQuery(request);const file=await service.staffDownload(staff(response),id(request.params.applicationId),id(request.params.documentId));await previewDocument(response,database,{name:file.document.name,mediaType:file.document.mediaType,content:file.content});});
    router.get('/:applicationId/documents/:documentId/download', async (request, response) => {
        noQuery(request);
        sendDocument(response, await service.staffDownload(staff(response), id(request.params.applicationId), id(request.params.documentId)));
    });
    return router;
}
