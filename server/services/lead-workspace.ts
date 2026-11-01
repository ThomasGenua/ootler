import {scanDocument} from './document-scanner.js';
import {noOpenInspectionRepairs} from './inspection-readiness.js';
import { createHash } from 'node:crypto';
import { TextDecoder } from 'node:util';
import type { PoolClient, QueryResult, QueryResultRow } from 'pg';
import type { z } from 'zod';
import type { AuthUser, OrganizationRole } from '../../shared/contracts.js';
import type { LeadOwner } from '../../shared/lead-contracts.js';
import type { Paginated } from '../../shared/property-contracts.js';
import { allowedDocumentTypes, maximumDocumentBytes, type LeadWorkspace, type WorkspaceTask, type WorkspaceDocument, type TimelineEvent, type PropertySuggestions, type PropertySuggestion, type workspaceNoteSchema, type workspaceCallSchema, type workspaceTaskCreateSchema, type workspaceTaskUpdateSchema, type workspaceDecisionSchema, type workspaceQuerySchema } from '../../shared/lead-workspace-contracts.js';
import type { Database } from '../db/pool.js';
import { ApiError } from '../http/errors.js';
import { Leads } from './leads.js';
import { Tasks } from './tasks.js';
import { PropertyFoundation } from './property-foundation.js';
interface Queryable {
    query<T extends QueryResultRow = QueryResultRow>(sql: string, values?: unknown[]): Promise<QueryResult<T>>;
}
type Row = QueryResultRow;
type Page = {
    page: number;
    pageSize: number;
};
const iso = (v: unknown): string => (v instanceof Date ? v : new Date(String(v))).toISOString();
const page = <T>(items: T[], total: number, p: Page): Paginated<T> => ({ items, total, page: p.page, pageSize: p.pageSize, totalPages: Math.ceil(total / p.pageSize) });
const params = (u: AuthUser): unknown[] => [u.organization.id, u.organization.role, u.membershipId];
const propertyScope = (a: string) => `${a}.organization_id=$1 AND ($2='organization_admin' OR EXISTS(SELECT 1 FROM property_access_assignments pa WHERE pa.organization_id=${a}.organization_id AND pa.property_id=${a}.id AND pa.membership_id=$3))`;
const missing = (): never => { throw new ApiError(404, 'LEAD_NOT_FOUND', 'This lead is unavailable or outside your assigned property access.'); };
const privateDenied = (): never => { throw new ApiError(403, 'PRIVATE_WORKSPACE_DENIED', 'This staff-private workspace requires lead-management permission and access to every property interest.'); };
const actor = (id: unknown, name: unknown) => id ? { id: String(id), name: String(name ?? 'Staff member') } : null;
const taskSelect = `t.*,om.user_id AS owner_user_id,om.role AS owner_role,ou.display_name AS owner_name,cu.display_name AS creator_name,du.display_name AS completer_name`;
const taskJoins = `LEFT JOIN organization_memberships om ON om.id=t.owner_membership_id AND om.organization_id=t.organization_id LEFT JOIN users ou ON ou.id=om.user_id LEFT JOIN users cu ON cu.id=t.created_by_user_id LEFT JOIN users du ON du.id=t.completed_by_user_id`;
const taskDto = (r: Row): WorkspaceTask => ({ id: r.id, leadId: r.lead_id, contactId: r.contact_id, title: r.title, details: r.details, dueAt: iso(r.due_at), status: r.status, owner: r.owner_membership_id ? { membershipId: r.owner_membership_id, userId: r.owner_user_id, name: r.owner_name, role: r.owner_role } : null, createdBy: actor(r.created_by_user_id, r.creator_name), completedBy: actor(r.completed_by_user_id, r.completer_name), completedAt: r.completed_at ? iso(r.completed_at) : null, version: r.version, createdAt: iso(r.created_at), updatedAt: iso(r.updated_at), simulated: typeof r.seed_key === 'string' && r.seed_key.startsWith('stage03.') });
const documentSelect = `d.scan_status,d.id,d.lead_id,d.contact_id,d.name,d.media_type,d.size_bytes,d.sha256,d.uploaded_by_user_id,d.created_at,u.display_name AS uploaded_by_name`;
const documentDto = (r: Row): WorkspaceDocument => ({ scanStatus:r.scan_status,id: r.id, leadId: r.lead_id, contactId: r.contact_id, name: r.name, mediaType: r.media_type, sizeBytes: r.size_bytes, sha256: r.sha256, uploadedBy: { id: r.uploaded_by_user_id, name: r.uploaded_by_name }, createdAt: iso(r.created_at), downloadUrl: `/api/lead-workspaces/${r.lead_id}/documents/${r.id}/download` });
const eventTitles: Record<string, string> = { note: 'Internal note added', call: 'Call logged', task_created: 'Follow-up task created', task_updated: 'Follow-up task updated', document_uploaded: 'Document uploaded', staff_decision: 'Staff review note', created: 'Lead created', updated: 'Lead updated', stage_changed: 'Lead stage changed', application_summary: 'Application summary synchronized', lease_verified: 'Lease milestone verified' };
function eventDto(r: Row): TimelineEvent { return { id: r.id, kind: r.kind, title: r.title, summary: r.summary, occurredAt: iso(r.occurred_at), actor: actor(r.actor_user_id, r.actor_name), simulated: r.simulated, provenance: r.provenance, metadata: r.metadata ?? {} }; }
function translate(error: unknown): never {
    if (error instanceof ApiError)
        throw error;
    const code = (error as {
        code?: string;
    })?.code;
    if (code === '23503')
        throw new ApiError(400, 'INVALID_RELATIONSHIP', 'Use records from the same organization, property and contact.');
    if (code === '23514' || code === '22003')
        throw new ApiError(400, 'INVALID_INPUT', 'Check the workspace fields.');
    throw error;
}
/** Staff-only persistent lead context. No model, email, telephony, provider write or applicant decision. */
export class LeadWorkspaces {
    constructor(private readonly database: Database) { }
    async assertLeadAccess(u: AuthUser, id: string, q: Queryable = this.database, lock = false): Promise<Row> {
        const r = (await q.query(`SELECT l.*,EXISTS(SELECT 1 FROM lead_property_interests i WHERE i.organization_id=l.organization_id AND i.lead_id=l.id AND $2<>'organization_admin' AND NOT EXISTS(SELECT 1 FROM property_access_assignments pa WHERE pa.organization_id=i.organization_id AND pa.property_id=i.property_id AND pa.membership_id=$3)) AS hidden_interests FROM leads l WHERE l.organization_id=$1 AND l.id=$4 AND ($2='organization_admin' OR EXISTS(SELECT 1 FROM property_access_assignments pa WHERE pa.organization_id=l.organization_id AND pa.property_id=l.property_id AND pa.membership_id=$3)) ${lock ? 'FOR UPDATE OF l' : ''}`, [...params(u), id])).rows[0];
        if (!r)
            missing();
        if (!u.permissions.includes('leasing.manage') || r.hidden_interests)
            privateDenied();
        if (lock) {
            const interests = (await q.query('SELECT property_id FROM lead_property_interests WHERE organization_id=$1 AND lead_id=$2 ORDER BY property_id FOR SHARE', [u.organization.id, id])).rows;
            for (const propertyId of [...new Set<string>([r.property_id, ...interests.map(i => String(i.property_id))])].sort()) {
                if (!(await q.query(`SELECT p.id FROM properties p WHERE ${propertyScope('p')} AND p.id=$4 FOR SHARE OF p`, [...params(u), propertyId])).rowCount)
                    privateDenied();
                if (u.organization.role !== 'organization_admin' && !(await q.query('SELECT property_id FROM property_access_assignments WHERE organization_id=$1 AND membership_id=$2 AND property_id=$3 FOR SHARE', [u.organization.id, u.membershipId, propertyId])).rowCount)
                    privateDenied();
            }
        }
        return r;
    }
    private async write<T>(u: AuthUser, id: string, fn: (c: PoolClient, a: AuthUser, l: Row) => Promise<T>): Promise<T> {
        return this.database.transaction(async (c) => {
            try {
                const current = (await c.query<{
                    role: OrganizationRole;
                }>(`SELECT m.role FROM organization_memberships m JOIN users u ON u.id=m.user_id AND u.active AND u.account_kind='staff' WHERE m.id=$1 AND m.organization_id=$2 AND m.user_id=$3 AND m.active AND EXISTS(SELECT 1 FROM role_permissions rp WHERE rp.role_key=m.role AND rp.permission='leasing.manage') FOR SHARE OF m,u`, [u.membershipId, u.organization.id, u.id])).rows[0];
                if (!current)
                    privateDenied();
                const a = { ...u, organization: { ...u.organization, role: current.role } };
                return await fn(c, a, await this.assertLeadAccess(a, id, c, true));
            }
            catch (error) {
                return translate(error);
            }
        });
    }
    private async event(c: PoolClient, u: AuthUser, l: Row, kind: string, summary: string, metadata: Record<string, unknown>): Promise<TimelineEvent> {
        const r = (await c.query(`INSERT INTO lead_workspace_events(organization_id,lead_id,property_id,contact_id,kind,summary,actor_user_id,actor_membership_id,metadata) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`, [u.organization.id, l.id, l.property_id, l.contact_id, kind, summary, u.id, u.membershipId, JSON.stringify(metadata)])).rows[0]!;
        await c.query('INSERT INTO audit_events(organization_id,actor_user_id,action,metadata) VALUES($1,$2,$3,$4)', [u.organization.id, u.id, `lead_workspace.${kind}`, JSON.stringify({ leadId: l.id, contactId: l.contact_id, eventId: r.id, ...metadata })]);
        return { id: `workspace:${r.id}`, kind: kind as TimelineEvent['kind'], title: eventTitles[kind] ?? kind, summary, occurredAt: iso(r.occurred_at), actor: { id: u.id, name: u.name }, simulated: false, provenance: 'staff', metadata };
    }
    async note(u: AuthUser, id: string, i: z.infer<typeof workspaceNoteSchema>): Promise<TimelineEvent> { return this.write(u, id, (c, a, l) => this.event(c, a, l, 'note', i.body, {})); }
    async call(u: AuthUser, id: string, i: z.infer<typeof workspaceCallSchema>): Promise<TimelineEvent> { return this.write(u, id, (c, a, l) => this.event(c, a, l, 'call', i.summary, { outcome: i.outcome, direction: i.direction, durationMinutes: i.durationMinutes, communicationState: 'staff_logged_only', outboundSent: false })); }
    async decision(u: AuthUser, id: string, i: z.infer<typeof workspaceDecisionSchema>): Promise<TimelineEvent> {
        return this.write(u, id, async (c, a, l) => {
            if (i.context === 'application_review' && !i.applicationId)
                throw new ApiError(400, 'APPLICATION_REQUIRED', 'Choose the linked application for this staff review note.');
            if (i.applicationId && !(await c.query('SELECT id FROM applications WHERE organization_id=$1 AND lead_id=$2 AND contact_id=$3 AND property_id=$4 AND id=$5 FOR SHARE', [a.organization.id, id, l.contact_id, l.property_id, i.applicationId])).rowCount)
                throw new ApiError(400, 'INVALID_RELATIONSHIP', 'Use an application linked to this lead and contact.');
            return this.event(c, a, l, 'staff_decision', i.summary, { context: i.context, applicationId: i.applicationId, decisionEffect: 'review_note_only', applicationStatusChanged: false });
        });
    }
    private async owner(c: PoolClient, u: AuthUser, l: Row, id: string | null): Promise<void> {
        if (!id)
            return;
        const r = (await c.query(`SELECT m.id,m.role FROM organization_memberships m JOIN users u ON u.id=m.user_id AND u.active AND u.account_kind='staff' WHERE m.id=$1 AND m.organization_id=$2 AND m.active AND EXISTS(SELECT 1 FROM role_permissions rp WHERE rp.role_key=m.role AND rp.permission='leasing.manage') FOR SHARE OF m,u`, [id, u.organization.id])).rows[0];
        if (!r)
            throw new ApiError(400, 'INVALID_OWNER', 'Choose an active lead-management staff member from this organization.');
        if (r.role !== 'organization_admin') {
            const interests = (await c.query('SELECT property_id FROM lead_property_interests WHERE organization_id=$1 AND lead_id=$2 ORDER BY property_id', [u.organization.id, l.id])).rows.map(p => p.property_id);
            const ids = [...new Set([l.property_id, ...interests])];
            const grants = await c.query('SELECT property_id FROM property_access_assignments WHERE organization_id=$1 AND membership_id=$2 AND property_id=ANY($3::uuid[]) FOR SHARE', [u.organization.id, id, ids]);
            if (grants.rowCount !== ids.length)
                throw new ApiError(400, 'INVALID_OWNER', 'The task owner needs access to every property interest.');
        }
    }
    private async task(q: Queryable, u: AuthUser, leadId: string, taskId: string): Promise<WorkspaceTask> {
        const r = (await q.query(`SELECT ${taskSelect} FROM tasks t ${taskJoins} WHERE t.organization_id=$1 AND t.lead_id=$2 AND t.id=$3`, [u.organization.id, leadId, taskId])).rows[0];
        if (!r)
            throw new ApiError(404, 'TASK_NOT_FOUND', 'This task is unavailable in this lead workspace.');
        return taskDto(r);
    }
    async tasks(u: AuthUser, id: string, p: Page): Promise<Paginated<WorkspaceTask>> { await this.assertLeadAccess(u, id); const total = Number((await this.database.query('SELECT count(*) AS total FROM tasks WHERE organization_id=$1 AND lead_id=$2', [u.organization.id, id])).rows[0]?.total ?? 0); const rows = (await this.database.query(`SELECT ${taskSelect} FROM tasks t ${taskJoins} WHERE t.organization_id=$1 AND t.lead_id=$2 ORDER BY CASE WHEN t.status='open' THEN 0 ELSE 1 END,t.due_at,t.id LIMIT $3 OFFSET $4`, [u.organization.id, id, p.pageSize, (p.page - 1) * p.pageSize])).rows; return page(rows.map(taskDto), total, p); }
    async createTask(u: AuthUser, id: string, i: z.infer<typeof workspaceTaskCreateSchema>): Promise<WorkspaceTask> {
        const lead = await this.assertLeadAccess(u,id);
        const created = await new Tasks(this.database).create(u,{...i,propertyId:lead.property_id,leadId:id,contactId:lead.contact_id,applicationId:null,tourId:null,priority:'normal',assignment:'manual'});
        return this.task(this.database,u,id,created.id);
    }
    async updateTask(u: AuthUser, id: string, taskId: string, i: z.infer<typeof workspaceTaskUpdateSchema>): Promise<WorkspaceTask> {
        await this.assertLeadAccess(u,id);
        await this.task(this.database,u,id,taskId);
        await new Tasks(this.database).update(u,taskId,i);
        return this.task(this.database,u,id,taskId);
    }
    async documents(u: AuthUser, id: string, p: Page): Promise<Paginated<WorkspaceDocument>> { await this.assertLeadAccess(u, id); const total = Number((await this.database.query('SELECT count(*) AS total FROM lead_documents WHERE organization_id=$1 AND lead_id=$2', [u.organization.id, id])).rows[0]?.total ?? 0); const rows = (await this.database.query(`SELECT ${documentSelect} FROM lead_documents d JOIN users u ON u.id=d.uploaded_by_user_id WHERE d.organization_id=$1 AND d.lead_id=$2 ORDER BY d.created_at DESC,d.id LIMIT $3 OFFSET $4`, [u.organization.id, id, p.pageSize, (p.page - 1) * p.pageSize])).rows; return page(rows.map(documentDto), total, p); }
    async upload(u: AuthUser, id: string, name: string, mediaType: string, content: Buffer): Promise<WorkspaceDocument> {
        validateDocument(name, mediaType, content);
        return this.write(u, id, async (c, a, l) => {
            await scanDocument(this.database.config,c,content);
            const digest = createHash('sha256').update(content).digest('hex');
            const r = (await c.query(`INSERT INTO lead_documents(organization_id,lead_id,property_id,contact_id,name,media_type,size_bytes,sha256,content,uploaded_by_user_id,uploaded_by_membership_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`, [a.organization.id, id, l.property_id, l.contact_id, name, mediaType, content.length, digest, content, a.id, a.membershipId])).rows[0]!;
            await this.event(c, a, l, 'document_uploaded', name, { documentId: r.id, mediaType, sizeBytes: content.length });
            const document = (await c.query(`SELECT ${documentSelect} FROM lead_documents d JOIN users u ON u.id=d.uploaded_by_user_id WHERE d.organization_id=$1 AND d.lead_id=$2 AND d.id=$3`, [a.organization.id, id, r.id])).rows[0]!;
            return documentDto(document);
        });
    }
    async download(u: AuthUser, id: string, documentId: string): Promise<{
        document: WorkspaceDocument;
        content: Buffer;
    }> {
        return this.write(u, id, async (c, a) => {
            const r = (await c.query(`SELECT ${documentSelect},d.content FROM lead_documents d JOIN users u ON u.id=d.uploaded_by_user_id WHERE d.organization_id=$1 AND d.lead_id=$2 AND d.id=$3`, [a.organization.id, id, documentId])).rows[0];
            if (!r)
                throw new ApiError(404, 'DOCUMENT_NOT_FOUND', 'This document is unavailable in this lead workspace.');
            return { document: documentDto(r), content: r.content };
        });
    }
    async suggestions(u: AuthUser, id: string, p: Page): Promise<PropertySuggestions> {
        const l = await this.assertLeadAccess(u, id), prefs = l.preferences as {
            bedrooms: number | null;
            budgetMin: number | null;
            budgetMax: number | null;
            locations: string[];
            moveInOn: string | null;
        };
        const criteriaUsed: string[] = [];
        if (prefs.budgetMin !== null || prefs.budgetMax !== null)
            criteriaUsed.push('Stated monthly budget');
        if (prefs.locations.length)
            criteriaUsed.push('Stated location');
        if (prefs.bedrooms !== null)
            criteriaUsed.push('Stated bedrooms');
        if (prefs.moveInOn)
            criteriaUsed.push('Requested move-in date: requires staff confirmation');
        const notice = 'Property matches use stated housing preferences and recently verified current availability only. No eligibility or protected-characteristic scoring. Move-in-date availability is not confirmed; staff must confirm it separately. Free-text requirements are not interpreted by this simulation.';
        if (l.intent === 'sales')
            return { ...page<PropertySuggestion>([], 0, p), notice: 'Sales opportunity: rental availability suggestions do not apply. Sales inventory and price evidence await configuration.', criteriaUsed: [], verifiedWithinDays: 7, requestedMoveInOn: prefs.moveInOn };
        const values = [...params(u), prefs.bedrooms, prefs.budgetMin, prefs.budgetMax, prefs.locations];
        const where = `${propertyScope('p')} AND ${noOpenInspectionRepairs('un')} AND NOT EXISTS(SELECT 1 FROM unit_turnovers turnover WHERE turnover.unit_id=un.id AND turnover.status<>'ready') AND un.status='available' AND un.availability_source IN ('staff_reported','import','yardi') AND un.availability_verified_at IS NOT NULL AND un.availability_verified_at>=now()-interval '7 days' AND un.availability_verified_at<=now() AND ($4::int IS NULL OR un.bedrooms=$4) AND ($5::numeric IS NULL OR un.monthly_rent>=$5) AND ($6::numeric IS NULL OR un.monthly_rent<=$6) AND (cardinality($7::text[])=0 OR EXISTS(SELECT 1 FROM unnest($7::text[]) loc WHERE strpos(lower(p.city||' '||p.address),lower(loc))>0))`;
        const total = Number((await this.database.query(`SELECT count(*) AS total FROM units un JOIN properties p ON p.id=un.property_id AND p.organization_id=un.organization_id WHERE ${where}`, values)).rows[0]?.total ?? 0);
        const rows = (await this.database.query(`SELECT un.id,un.label,un.bedrooms,un.monthly_rent,un.availability_source,un.availability_verified_at,p.id AS property_id,p.name,p.city,p.address FROM units un JOIN properties p ON p.id=un.property_id AND p.organization_id=un.organization_id WHERE ${where} ORDER BY un.availability_verified_at DESC,lower(p.name),p.id,lower(un.label),un.id LIMIT $8 OFFSET $9`, [...values, p.pageSize, (p.page - 1) * p.pageSize])).rows;
        const items: PropertySuggestion[] = rows.map(r => ({ propertyId: r.property_id, propertyName: r.name, unitId: r.id, unitLabel: r.label, city: r.city, bedrooms: r.bedrooms, monthlyRent: Number(r.monthly_rent), availabilitySource: r.availability_source, lastVerifiedAt: iso(r.availability_verified_at), reasons: [...(prefs.bedrooms !== null ? [`Matches the stated ${prefs.bedrooms}-bedroom preference.`] : []), ...(prefs.budgetMin !== null || prefs.budgetMax !== null ? [`Monthly rent ${Number(r.monthly_rent).toLocaleString('en-US')} is within the stated budget.`] : []), ...(prefs.locations.length ? [`Address or city matches a stated location: ${prefs.locations.filter(loc => `${r.city} ${r.address}`.toLowerCase().includes(loc.toLowerCase())).join(', ') || 'matching address'}.`] : []), 'Currently reported available with verification in the last seven days.'], cautions: [...(prefs.moveInOn ? [`Requested move-in ${prefs.moveInOn}; future-date availability evidence is not configured, so this date is unconfirmed.`] : ['A move-in date has not been stated; confirm the required date with the prospect.']), 'Availability may change; confirm again before offering a viewing or lease.'], moveInDateConfirmed: false }));
        return { ...page(items, total, p), notice, criteriaUsed, verifiedWithinDays: 7, requestedMoveInOn: prefs.moveInOn };
    }
    async timeline(u: AuthUser, id: string, p: Page): Promise<Paginated<TimelineEvent>> {
        await this.assertLeadAccess(u, id);
        // During additive rollout, established lead reads remain usable before migration 013.
        const portalReady = (await this.database.query<{ ready: boolean }>("SELECT to_regclass('public.application_portal_events') IS NOT NULL AS ready")).rows[0]?.ready;
        const sql = timelineSql + (portalReady ? portalTimelineSql : '');
        const total = Number((await this.database.query(`WITH entries AS (${sql}) SELECT count(*) AS total FROM entries`, [u.organization.id, id])).rows[0]?.total ?? 0);
        const rows = (await this.database.query(`WITH entries AS (${sql}) SELECT * FROM entries ORDER BY occurred_at DESC,id ASC LIMIT $3 OFFSET $4`, [u.organization.id, id, p.pageSize, (p.page - 1) * p.pageSize])).rows;
        return page(rows.map(eventDto), total, p);
    }
    async detail(u: AuthUser, id: string, i: z.infer<typeof workspaceQuerySchema>): Promise<LeadWorkspace> {
        const l = await this.assertLeadAccess(u, id), leads = new Leads(this.database), foundation = new PropertyFoundation(this.database);
        const [leadDetail, contact, tasks, documents, timeline, suggestions, owners] = await Promise.all([leads.detail(u, id, { page: 1, pageSize: 10 }), foundation.contactDetail(u, l.contact_id, { page: 1, pageSize: 10 }), this.tasks(u, id, { page: i.tasksPage, pageSize: i.pageSize }), this.documents(u, id, { page: i.documentsPage, pageSize: i.pageSize }), this.timeline(u, id, { page: i.timelinePage, pageSize: i.pageSize }), this.suggestions(u, id, { page: 1, pageSize: 5 }), this.owners(u, l)]);
        const drafts = [`Review ${leadDetail.lead.name}'s stated preferences and confirm the next step with the assigned agent.`, leadDetail.lead.nextAction ? `Staff reminder draft: ${leadDetail.lead.nextAction}${leadDetail.lead.nextActionAt ? ` (due ${leadDetail.lead.nextActionAt})` : ''}. This draft has not been sent.` : 'Staff reminder draft: agree the next action and due date with the assigned agent. This draft has not been sent.', suggestions.total ? `Check the ${suggestions.total} recently verified current-availability match${suggestions.total === 1 ? '' : 'es'} and confirm the requested move-in date before proposing a viewing.` : 'No recently verified property matches are currently available in your assigned access. Ask staff to verify inventory before proposing a property.'];
        return { leadDetail, contact, tasks, documents, timeline, suggestions, owners: owners.items, ownerTotal: owners.total, ai: { mode: 'simulation', notice: 'This panel contains deterministic guidance from saved lead context. Open assistant drafts for provider status and reviewable assistance. Nothing in this panel sends messages, makes decisions or executes actions.', drafts }, access: { canManage: true } };
    }
    private async owners(u: AuthUser, l: Row): Promise<{
        items: LeadOwner[];
        total: number;
    }> { const rows = (await this.database.query(`SELECT m.id,m.user_id,m.role,u.display_name,count(*) OVER()::int AS total FROM organization_memberships m JOIN users u ON u.id=m.user_id AND u.active AND u.account_kind='staff' WHERE m.organization_id=$1 AND m.active AND EXISTS(SELECT 1 FROM role_permissions rp WHERE rp.role_key=m.role AND rp.permission='leasing.manage') AND (m.role='organization_admin' OR (EXISTS(SELECT 1 FROM property_access_assignments primary_pa WHERE primary_pa.organization_id=m.organization_id AND primary_pa.membership_id=m.id AND primary_pa.property_id=$3) AND NOT EXISTS(SELECT 1 FROM lead_property_interests i WHERE i.organization_id=m.organization_id AND i.lead_id=$2 AND NOT EXISTS(SELECT 1 FROM property_access_assignments pa WHERE pa.organization_id=m.organization_id AND pa.property_id=i.property_id AND pa.membership_id=m.id)))) ORDER BY lower(u.display_name),m.id LIMIT 50`, [u.organization.id, l.id, l.property_id])).rows; return { items: rows.map(r => ({ membershipId: r.id, userId: r.user_id, name: r.display_name, role: r.role })), total: rows[0]?.total ?? 0 }; }
}
export function validateDocument(name: string, mediaType: string, content: Buffer): void {
    if (!Buffer.isBuffer(content) || !content.length || content.length > maximumDocumentBytes)
        throw new ApiError(content?.length > maximumDocumentBytes ? 413 : 400, 'INVALID_DOCUMENT', 'Choose a nonempty document of at most 20 MiB.');
    if (!(allowedDocumentTypes as readonly string[]).includes(mediaType))
        throw new ApiError(415, 'DOCUMENT_TYPE_DENIED', 'Choose PDF, PNG, JPEG or UTF-8 plain text.');
    if (/[\/\\\u0000-\u001f\u007f]/.test(name) || name.startsWith('.') || name.endsWith('.') || name.length > 180)
        throw new ApiError(400, 'INVALID_DOCUMENT_NAME', 'Use a plain filename without paths or control characters.');
    const lower = name.toLowerCase();
    let valid = false;
    if (mediaType === 'application/pdf')
        valid = lower.endsWith('.pdf') && content.subarray(0, 5).toString('ascii') === '%PDF-' && content.subarray(Math.max(0, content.length - 1024)).includes(Buffer.from('%%EOF'));
    if (mediaType === 'image/png')
        valid = lower.endsWith('.png') && completePng(content);
    if (mediaType === 'image/jpeg')
        valid = /\.jpe?g$/.test(lower) && completeJpeg(content);
    if (mediaType === 'text/plain') {
        try {
            const value = new TextDecoder('utf-8', { fatal: true }).decode(content);
            valid = lower.endsWith('.txt') && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value) && !/<\s*(?:!doctype|html|script|svg|iframe|object|embed)\b/i.test(value) && !/^\s*(?:MZ|#!|<\?php|powershell\b|@echo\s+off)/i.test(value);
        }
        catch {
            valid = false;
        }
    }
    if (!valid)
        throw new ApiError(400, 'DOCUMENT_CONTENT_MISMATCH', 'The filename, media type and document content must agree. Active HTML, SVG and executable uploads are not accepted.');
}
/** Bounded structural checks reject signature-only/truncated images; files are served as attachments. */
function completePng(content: Buffer): boolean {
    if (content.length < 45 || !content.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
        return false;
    let offset = 8, sawHeader = false, sawData = false;
    while (offset + 12 <= content.length) {
        const size = content.readUInt32BE(offset), end = offset + 12 + size;
        if (end > content.length)
            return false;
        const kind = content.subarray(offset + 4, offset + 8).toString('ascii');
        if (!/^[A-Za-z]{4}$/.test(kind))
            return false;
        if (!sawHeader) {
            if (kind !== 'IHDR' || size !== 13 || content.readUInt32BE(offset + 8) === 0 || content.readUInt32BE(offset + 12) === 0)
                return false;
            sawHeader = true;
        }
        else if (kind === 'IHDR')
            return false;
        if (kind === 'IDAT' && size > 0)
            sawData = true;
        if (kind === 'IEND')
            return size === 0 && sawData && end === content.length;
        offset = end;
    }
    return false;
}
function completeJpeg(content: Buffer): boolean {
    if (content.length < 32 || content[0] !== 255 || content[1] !== 216)
        return false;
    let offset = 2, sawFrame = false, sawScan = false, sawData = false;
    while (offset < content.length) {
        if (content[offset] !== 255)
            return false;
        while (offset < content.length && content[offset] === 255)
            offset++;
        const marker = content[offset++];
        if (marker === 217)
            return sawFrame && sawScan && sawData && offset === content.length;
        if (marker === undefined || marker === 0 || marker === 216)
            return false;
        if (marker === 1 || marker >= 208 && marker <= 215)
            continue;
        if (offset + 2 > content.length)
            return false;
        const size = content.readUInt16BE(offset);
        if (size < 2 || offset + size > content.length)
            return false;
        if ([192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207].includes(marker)) {
            if (size < 8 || content.readUInt16BE(offset + 3) === 0 || content.readUInt16BE(offset + 5) === 0)
                return false;
            sawFrame = true;
        }
        offset += size;
        if (marker === 218) {
            if (!sawFrame || size < 6)
                return false;
            sawScan = true;
            while (offset < content.length) {
                if (content[offset] !== 255) {
                    sawData = true;
                    offset++;
                    continue;
                }
                const next = content[offset + 1];
                if (next === 0 || next !== undefined && next >= 208 && next <= 215) {
                    sawData = true;
                    offset += 2;
                    continue;
                }
                break;
            }
        }
    }
    return false;
}
const timelineSql = `
 SELECT 'workspace:'||e.id::text AS id,e.kind,CASE e.kind WHEN 'note' THEN 'Internal note added' WHEN 'call' THEN 'Call logged' WHEN 'task_created' THEN 'Follow-up task created' WHEN 'task_updated' THEN 'Follow-up task updated' WHEN 'document_uploaded' THEN 'Document uploaded' ELSE 'Staff review note' END AS title,e.summary,e.occurred_at,e.actor_user_id,u.display_name AS actor_name,false AS simulated,'staff'::text AS provenance,e.metadata FROM lead_workspace_events e JOIN users u ON u.id=e.actor_user_id WHERE e.organization_id=$1 AND e.lead_id=$2
 UNION ALL SELECT 'lead:'||e.id::text,CASE e.kind WHEN 'created' THEN 'lead_created' WHEN 'updated' THEN 'lead_updated' ELSE e.kind END,CASE e.kind WHEN 'created' THEN 'Lead created' WHEN 'updated' THEN 'Lead updated' WHEN 'stage_changed' THEN 'Lead stage changed' WHEN 'application_summary' THEN 'Application summary synchronized' ELSE 'Lease milestone verified' END,CASE e.kind WHEN 'stage_changed' THEN COALESCE(e.previous_stage,'')||' to '||e.stage WHEN 'application_summary' THEN 'Application record status: '||COALESCE(e.metadata->>'status','not linked') WHEN 'lease_verified' THEN CASE WHEN e.metadata->>'evidenceKind'='demo_event' THEN 'An isolated demonstration event recorded the matching local lease milestone. No live signature-provider verification is claimed.' ELSE 'Authorized staff attested the matching local lease milestone. No signing-provider verification is claimed.' END ELSE 'Saved lead record change.' END,e.occurred_at,e.actor_user_id,u.display_name,COALESCE(e.metadata->>'simulated','false')='true',CASE WHEN e.metadata->>'simulated'='true' THEN 'demo_simulation' ELSE 'staff' END,e.metadata FROM lead_events e JOIN users u ON u.id=e.actor_user_id WHERE e.organization_id=$1 AND e.lead_id=$2
 UNION ALL SELECT 'activity:'||a.id::text,'communication','Simulated communication example',a.summary,a.occurred_at,NULL::uuid,NULL::text,true,'demo_simulation',jsonb_build_object('legacyKind',a.kind,'outboundSent',false) FROM lead_activities a WHERE a.organization_id=$1 AND a.lead_id=$2
 UNION ALL SELECT 'viewing-event:'||ve.id::text,'tour','Viewing '||replace(ve.kind,'_',' '),CASE WHEN ve.origin='public' THEN 'Public booking action. ' ELSE 'Staff scheduling action. ' END||'Notification recorded in simulation; Google sync is tracked separately.',ve.occurred_at,ve.actor_user_id,vu.display_name,false,CASE WHEN ve.origin='staff' THEN 'staff' ELSE 'record' END,ve.metadata||jsonb_build_object('viewingId',ve.viewing_id,'origin',ve.origin,'notification','simulation') FROM viewing_events ve JOIN viewings vv ON vv.id=ve.viewing_id AND vv.organization_id=ve.organization_id LEFT JOIN users vu ON vu.id=ve.actor_user_id WHERE ve.organization_id=$1 AND vv.lead_id=$2
 UNION ALL SELECT 'tour-created:'||v.id::text,'tour','Viewing recorded',CASE WHEN v.seed_key LIKE 'stage03.%' THEN 'Synthetic demo viewing record; not a live calendar booking.' ELSE 'Viewing record created. Confirmed status is recorded separately from public requested access windows.' END,v.created_at,NULL::uuid,NULL::text,COALESCE(v.seed_key LIKE 'stage03.%',false),'record',jsonb_build_object('viewingId',v.id,'scheduledFor',v.starts_at,'status',v.status,'providerBookingConfirmed',false) FROM viewings v WHERE v.organization_id=$1 AND v.lead_id=$2
 UNION ALL SELECT 'tour-updated:'||v.id::text,'tour','Viewing record updated','Recorded viewing status: '||v.status,v.updated_at,NULL::uuid,NULL::text,COALESCE(v.seed_key LIKE 'stage03.%',false),'record',jsonb_build_object('viewingId',v.id,'scheduledFor',v.starts_at,'status',v.status,'providerBookingConfirmed',false) FROM viewings v WHERE v.organization_id=$1 AND v.lead_id=$2 AND v.updated_at<>v.created_at
 UNION ALL SELECT 'application:'||a.id::text,'application','Application record created','Current application status: '||a.status||'. Screening and applicant decisions require an approved provider, consent and staff review.',a.created_at,NULL::uuid,NULL::text,(a.source_system='demo'),'record',jsonb_build_object('applicationId',a.id,'status',a.status,'source',a.source_system) FROM applications a WHERE a.organization_id=$1 AND a.lead_id=$2
 UNION ALL SELECT 'application-audit:'||ae.id::text,'staff_decision','Application record updated by staff','Staff changed the application record; this event does not represent AI approval or screening.',ae.created_at,ae.actor_user_id,u.display_name,false,'staff',jsonb_build_object('applicationId',a.id,'fields',ae.metadata->'fields','applicationStatus',a.status) FROM audit_events ae JOIN applications a ON a.organization_id=ae.organization_id AND a.id::text=ae.metadata->>'recordId' LEFT JOIN users u ON u.id=ae.actor_user_id WHERE ae.organization_id=$1 AND a.lead_id=$2 AND ae.action='application.foundation_updated'
 UNION ALL SELECT 'provider:'||p.id::text,'provider_update','Verified provider update',p.summary,p.occurred_at,NULL::uuid,NULL::text,false,'verified_provider',jsonb_build_object('provider',p.provider,'externalEventId',p.external_event_id,'verifiedAt',p.verified_at,'verificationReference',p.verification_reference,'mappingId',p.mapping_id) FROM provider_verified_updates p JOIN external_record_mappings m ON m.id=p.mapping_id AND m.organization_id=p.organization_id AND m.provider=p.provider WHERE p.organization_id=$1 AND p.lead_id=$2 AND p.verified_at<=now() AND p.occurred_at<=p.verified_at
`;

const portalTimelineSql = `
 UNION ALL SELECT 'portal:'||e.id::text,'application','Application portal update',e.summary,e.occurred_at,e.actor_user_id,u.display_name,COALESCE(e.metadata->>'simulated','false')='true',CASE WHEN e.metadata->>'simulated'='true' THEN 'demo_simulation' ELSE 'record' END,e.metadata||jsonb_build_object('applicationId',a.id,'kind',e.kind,'actorKind',e.actor_kind) FROM application_portal_events e JOIN applications a ON a.id=e.application_id AND a.organization_id=e.organization_id JOIN users u ON u.id=e.actor_user_id WHERE e.organization_id=$1 AND a.lead_id=$2
`;
