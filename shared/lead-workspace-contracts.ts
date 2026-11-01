import { z } from 'zod';
import type { LeadDetail, LeadOwner } from './lead-contracts.js';
import type { ContactDetail, Paginated } from './property-contracts.js';
const line = (max: number) => z.string().trim().min(1).max(max).refine(v => !/[\u0000-\u001f\u007f]/.test(v));
const paragraph = (max: number) => z.string().trim().min(1).max(max).refine(v => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(v));
export const workspacePageSchema = z.object({ page: z.coerce.number().int().min(1).max(1000000).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(25) }).strict();
export const workspaceQuerySchema = z.object({ timelinePage: z.coerce.number().int().min(1).max(1000000).default(1), tasksPage: z.coerce.number().int().min(1).max(1000000).default(1), documentsPage: z.coerce.number().int().min(1).max(1000000).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(10) }).strict();
export const workspaceNoteSchema = z.object({ body: paragraph(10000) }).strict();
export const workspaceCallSchema = z.object({ summary: paragraph(5000), outcome: z.enum(['connected', 'voicemail', 'no_answer', 'other']), direction: z.enum(['inbound', 'outbound']), durationMinutes: z.number().int().min(0).max(1440).nullable().default(null) }).strict();
export const workspaceTaskCreateSchema = z.object({ title: line(300), details: z.string().trim().max(5000).refine(v => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(v)).default(''), dueAt: z.iso.datetime({ offset: true }), ownerMembershipId: z.uuid().nullable().default(null) }).strict();
export const workspaceTaskUpdateSchema = z.object({ version: z.number().int().positive(), title: line(300).optional(), details: z.string().trim().max(5000).refine(v => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(v)).optional(), dueAt: z.iso.datetime({ offset: true }).optional(), ownerMembershipId: z.uuid().nullable().optional(), status: z.enum(['open', 'completed', 'cancelled']).optional() }).strict().refine(v => Object.keys(v).length > 1);
export const workspaceDecisionSchema = z.object({ summary: paragraph(5000), context: z.enum(['follow_up', 'application_review']), applicationId: z.uuid().nullable().default(null) }).strict();
export const workspaceDocumentQuerySchema = z.object({ name: z.string().trim().min(1).max(180).refine(v => !/[\/\\\u0000-\u001f\u007f]/.test(v) && !v.startsWith('.') && !v.endsWith('.') && !v.endsWith(' ')) }).strict();
export interface WorkspaceActor {
    id: string;
    name: string;
}
export interface WorkspaceTask {
    id: string;
    leadId: string;
    contactId: string;
    title: string;
    details: string;
    dueAt: string;
    status: 'open' | 'completed' | 'cancelled';
    owner: LeadOwner | null;
    createdBy: WorkspaceActor | null;
    completedBy: WorkspaceActor | null;
    completedAt: string | null;
    version: number;
    createdAt: string;
    updatedAt: string;
    simulated: boolean;
}
export interface WorkspaceDocument {
    scanStatus?:'clamav'|'demo'|'legacy_unscanned';
    id: string;
    leadId: string;
    contactId: string;
    name: string;
    mediaType: string;
    sizeBytes: number;
    sha256: string;
    uploadedBy: WorkspaceActor;
    createdAt: string;
    downloadUrl: string;
}
export type TimelineKind = 'note' | 'call' | 'task_created' | 'task_updated' | 'document_uploaded' | 'staff_decision' | 'lead_created' | 'lead_updated' | 'stage_changed' | 'application_summary' | 'lease_verified' | 'communication' | 'tour' | 'application' | 'provider_update';
export interface TimelineEvent {
    id: string;
    kind: TimelineKind;
    title: string;
    summary: string;
    occurredAt: string;
    actor: WorkspaceActor | null;
    simulated: boolean;
    provenance: 'staff' | 'record' | 'demo_simulation' | 'verified_provider';
    metadata: Record<string, unknown>;
}
export interface PropertySuggestion {
    propertyId: string;
    propertyName: string;
    unitId: string;
    unitLabel: string;
    city: string;
    bedrooms: number;
    monthlyRent: number;
    availabilitySource: string;
    lastVerifiedAt: string;
    reasons: string[];
    cautions: string[];
    moveInDateConfirmed: false;
}
export interface PropertySuggestions extends Paginated<PropertySuggestion> {
    notice: string;
    criteriaUsed: string[];
    verifiedWithinDays: number;
    requestedMoveInOn: string | null;
}
export interface LeadWorkspace {
    leadDetail: LeadDetail;
    contact: ContactDetail;
    tasks: Paginated<WorkspaceTask>;
    documents: Paginated<WorkspaceDocument>;
    timeline: Paginated<TimelineEvent>;
    suggestions: PropertySuggestions;
    owners: LeadOwner[];
    ownerTotal: number;
    ai: {
        mode: 'simulation';
        notice: string;
        drafts: string[];
    };
    access: {
        canManage: true;
    };
}
export const allowedDocumentTypes = ['application/pdf', 'image/png', 'image/jpeg', 'text/plain'] as const;
export const maximumDocumentBytes = 20 * 1024 * 1024;
