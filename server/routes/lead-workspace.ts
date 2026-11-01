import {previewDocument} from '../http/document-preview.js';
import { Router, raw, type Request, type RequestHandler, type Response } from 'express';
import { z } from 'zod';
import type { AuthUser } from '../../shared/contracts.js';
import { allowedDocumentTypes, maximumDocumentBytes, workspacePageSchema, workspaceQuerySchema, workspaceNoteSchema, workspaceCallSchema, workspaceTaskCreateSchema, workspaceTaskUpdateSchema, workspaceDecisionSchema, workspaceDocumentQuerySchema } from '../../shared/lead-workspace-contracts.js';
import type { ServerConfig } from '../config/env.js';
import type { Database } from '../db/pool.js';
import { ApiError } from '../http/errors.js';
import { protectOrigin } from '../middleware/security.js';
import { LeadWorkspaces } from '../services/lead-workspace.js';
const actor = (r: Response): AuthUser => r.locals.user as AuthUser;
function parse<T>(schema: z.ZodType<T>, value: unknown): T { const result = schema.safeParse(value); if (!result.success)
    throw new ApiError(400, 'INVALID_INPUT', 'Check the lead workspace fields, identifiers and pagination.'); return result.data; }
const id = (value: unknown) => parse(z.uuid(), value);
function body<T>(r: Request, schema: z.ZodType<T>): T { if (!r.is('application/json'))
    throw new ApiError(415, 'JSON_REQUIRED', 'Send this request as application/json.'); return parse(schema, r.body); }
/** Staff-private endpoints. Ordinary authenticated staff permissions and all property interests apply. */
export function createLeadWorkspaceRouter(config: ServerConfig, database: Database, requireUser: RequestHandler): Router {
    const router = Router(), service = new LeadWorkspaces(database);
    router.use(requireUser, (request, response, next) => { response.setHeader('Cache-Control', 'no-store'); if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method))
        return protectOrigin(config)(request, response, next); next(); });
    router.get('/:leadId', async (request, response) => { response.json(await service.detail(actor(response), id(request.params.leadId), parse(workspaceQuerySchema, request.query))); });
    router.get('/:leadId/timeline', async (request, response) => { response.json(await service.timeline(actor(response), id(request.params.leadId), parse(workspacePageSchema, request.query))); });
    router.get('/:leadId/tasks', async (request, response) => { response.json(await service.tasks(actor(response), id(request.params.leadId), parse(workspacePageSchema, request.query))); });
    router.get('/:leadId/documents', async (request, response) => { response.json(await service.documents(actor(response), id(request.params.leadId), parse(workspacePageSchema, request.query))); });
    router.get('/:leadId/suggestions', async (request, response) => { response.json(await service.suggestions(actor(response), id(request.params.leadId), parse(workspacePageSchema, request.query))); });
    router.post('/:leadId/notes', async (request, response) => { response.status(201).json({ event: await service.note(actor(response), id(request.params.leadId), body(request, workspaceNoteSchema)) }); });
    router.post('/:leadId/calls', async (request, response) => { response.status(201).json({ event: await service.call(actor(response), id(request.params.leadId), body(request, workspaceCallSchema)) }); });
    router.post('/:leadId/decisions', async (request, response) => { response.status(201).json({ event: await service.decision(actor(response), id(request.params.leadId), body(request, workspaceDecisionSchema)) }); });
    router.post('/:leadId/tasks', async (request, response) => { response.status(201).json({ task: await service.createTask(actor(response), id(request.params.leadId), body(request, workspaceTaskCreateSchema)) }); });
    router.patch('/:leadId/tasks/:taskId', async (request, response) => { response.json({ task: await service.updateTask(actor(response), id(request.params.leadId), id(request.params.taskId), body(request, workspaceTaskUpdateSchema)) }); });
    router.post('/:leadId/documents', async (request, response, next) => {
        await service.assertLeadAccess(actor(response), id(request.params.leadId));
        parse(workspaceDocumentQuerySchema, request.query);
        const mediaType = (request.headers['content-type'] ?? '').split(';')[0]!.trim().toLowerCase();
        if (!(allowedDocumentTypes as readonly string[]).includes(mediaType))
            throw new ApiError(415, 'DOCUMENT_TYPE_DENIED', 'Choose PDF, PNG, JPEG or UTF-8 plain text.');
        if (request.headers['content-encoding'] && request.headers['content-encoding'] !== 'identity')
            throw new ApiError(415, 'DOCUMENT_ENCODING_DENIED', 'Upload the original uncompressed document.');
        response.locals.documentMediaType = mediaType;
        next();
    }, raw({ type: () => true, limit: maximumDocumentBytes, inflate: false }), async (request, response) => {
        const query = parse(workspaceDocumentQuerySchema, request.query);
        response.status(201).json({ document: await service.upload(actor(response), id(request.params.leadId), query.name, String(response.locals.documentMediaType), request.body as Buffer) });
    });
    router.get('/:leadId/documents/:documentId/preview',async(request,response)=>{const file=await service.download(actor(response),id(request.params.leadId),id(request.params.documentId));await previewDocument(response,database,{name:file.document.name,mediaType:file.document.mediaType,content:file.content});});
    router.get('/:leadId/documents/:documentId/download', async (request, response) => {
        const { document, content } = await service.download(actor(response), id(request.params.leadId), id(request.params.documentId));
        const ascii = document.name.replace(/[^a-zA-Z0-9._ -]/g, '_').replace(/^[ .]+/, '') || 'document';
        response.setHeader('Content-Type', document.mediaType);
        response.setHeader('Content-Disposition', `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(document.name).replace(/['()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase())}`);
        response.setHeader('Content-Length', String(document.sizeBytes));
        response.setHeader('Cache-Control', 'no-store, private');
        response.setHeader('X-Content-Type-Options', 'nosniff');
        response.setHeader('X-Download-Options', 'noopen');
        response.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
        response.send(content);
    });
    return router;
}
