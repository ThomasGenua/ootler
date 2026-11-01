import {scanDocument} from './document-scanner.js';
import { createHash, createHmac, randomBytes } from 'node:crypto';
import type { Request, Response } from 'express';
import type { PoolClient, QueryResult, QueryResultRow } from 'pg';
import type { z } from 'zod';
import type { AuthUser, OrganizationRole, Permission } from '../../shared/contracts.js';
import { applicantConsentText, applicantConsentVersion, type ApplicantUser, type ApplicantConfig, type ApplicationSummary, type ApplicantDocument, type ApplicantDetails, type PortalApplication, type StaffApplicationWorkspace, type StaffApplications, type IssuedApplicationInvitation, type applicationListSchema, type applicationSettingsSchema, type applicantSaveSchema } from '../../shared/applicant-contracts.js';
import type { ServerConfig } from '../config/env.js';
import type { Database } from '../db/pool.js';
import { ApiError } from '../http/errors.js';
import { hashPassword, verifyPassword } from './passwords.js';
import { isIsolatedDemo } from './demo-environment.js';
import { validateDocument } from './lead-workspace.js';
import { preparedApplicantDemo, applicantDemoEmail, applicantDemoPassword } from './applicant-demo.js';
type Row = QueryResultRow;
interface Connection {
    query<T extends QueryResultRow = QueryResultRow>(sql: string, values?: unknown[]): Promise<QueryResult<T>>;
}
export interface ApplicantPrincipal extends ApplicantUser {
    sessionDigest: string;
}
const cookieName = 'ootla.applicant.sid', lifetime = 8 * 60 * 60 * 1000;
const iso = (v: unknown): string => (v instanceof Date ? v : new Date(String(v))).toISOString();
const nullableIso = (v: unknown): string | null => v ? iso(v) : null;
const missing = (): never => {
    throw new ApiError(404, 'APPLICATION_NOT_FOUND', 'This application is unavailable or outside your authorized access.');
};
const invalidInvitation = (): never => {
    throw new ApiError(410, 'INVITATION_UNAVAILABLE', 'This invitation is unavailable, expired, used or revoked. Ask the property team for a new invitation.');
};
const denied = (): never => {
    throw new ApiError(403, 'APPLICATION_ACCESS_DENIED', 'Your current access does not permit this application action.');
};
const locked = (): never => {
    throw new ApiError(409, 'APPLICATION_READ_ONLY', 'This application is submitted, disabled or owned by a configured provider. Ask authorized staff about the next step.');
};
const stale = (): never => {
    throw new ApiError(409, 'APPLICATION_VERSION_CONFLICT', 'This information changed since you opened it. Refresh before saving.');
};
const propertyScope = (a: string) => '(' + a + ".organization_id=$1 AND ($2='organization_admin' OR EXISTS(SELECT 1 FROM property_access_assignments pa WHERE pa.organization_id=" + a + '.organization_id AND pa.property_id=' + a + '.property_id AND pa.membership_id=$3)))';
const applicationScope = (a: string) => propertyScope(a) + ' AND NOT EXISTS(SELECT 1 FROM lead_property_interests li WHERE li.organization_id=' + a + '.organization_id AND li.lead_id=' + a + ".lead_id AND NOT " + propertyScope('li') + ')';
const selectApplication = "SELECT a.*,p.name AS property_name,un.label AS unit_label,c.display_name AS contact_name,c.email AS contact_email,c.phone AS contact_phone,EXISTS(SELECT 1 FROM external_record_mappings em WHERE em.organization_id=a.organization_id AND em.application_id=a.id AND em.provider='yardi') AS mapped_yardi,(SELECT count(*)::int FROM application_participants ap WHERE ap.organization_id=a.organization_id AND ap.application_id=a.id AND ap.active) AS participant_count,(SELECT count(*)::int FROM application_participants ap WHERE ap.organization_id=a.organization_id AND ap.application_id=a.id AND ap.active AND ap.ready_at IS NOT NULL) AS ready_count FROM applications a JOIN properties p ON p.id=a.property_id AND p.organization_id=a.organization_id JOIN contacts c ON c.id=a.contact_id AND c.organization_id=a.organization_id LEFT JOIN units un ON un.id=a.unit_id AND un.organization_id=a.organization_id AND un.property_id=a.property_id";
const providerOwned = (r: Row): boolean => r.source_system === 'yardi' || r.mapped_yardi === true || (Array.isArray(r.source_owned_fields) && r.source_owned_fields.length > 0);
const summary = (r: Row, role?: 'primary' | 'co_applicant'): ApplicationSummary => ({ id: r.id, applicantName: r.contact_name, status: r.status, property: { id: r.property_id, name: r.property_name }, unit: r.unit_id ? { id: r.unit_id, label: r.unit_label } : null, leadId: r.lead_id, portalEnabled: r.portal_enabled, coApplicantsEnabled: r.co_applicants_enabled, version: r.portal_version, lastSavedAt: iso(r.updated_at), submittedAt: nullableIso(r.portal_submitted_at), participantCount: r.participant_count ?? 0, readyCount: r.ready_count ?? 0, ...(role ? { yourRole: role } : {}), sourceSystem: r.source_system, providerOwned: providerOwned(r) });
const details = (r: Row): ApplicantDetails => ({ displayName: String(r.details?.displayName ?? ''), phone: String(r.details?.phone ?? ''), currentAddress: String(r.details?.currentAddress ?? ''), moveInDate: String(r.details?.moveInDate ?? '') });
const document = (r: Row, staff = false): ApplicantDocument => ({ id: r.id, checklistId: r.checklist_item_id, name: r.name, mediaType: r.media_type, sizeBytes: r.size_bytes, createdAt: iso(r.created_at), downloadUrl: (staff ? '/api/applications' : '/api/applicant/applications') + '/' + r.application_id + '/documents/' + r.id + '/download' });
function tokenFrom(r: Request): string | null {
    const v = r.headers.cookie?.split(';').map(v => v.trim()).find(v => v.startsWith(cookieName + '='))?.slice(cookieName.length + 1);
    return v && /^[a-f0-9]{64}$/.test(v) ? v : null;
}
/** Applicant identities, sessions and explicit grants are separate from every staff authorization pathway. */
export class ApplicantPortal {
    private readonly dummy: Promise<string>;
    constructor(private readonly database: Database, private readonly config: ServerConfig) {
        this.dummy = hashPassword(randomBytes(32).toString('hex'));
    }
    private digest(token: string, purpose = 'session'): string {
        return createHmac('sha256', this.config.sessionSecret).update('ootla-applicant:' + purpose + ':' + token).digest('hex');
    }
    private cookieOptions() {
        return { httpOnly: true, sameSite: 'lax' as const, secure: this.config.production, path: '/' };
    }
    private async eligible(r: Row, c: Connection = this.database): Promise<boolean> {
        const isolated = this.config.demoMode && await isIsolatedDemo(this.config, c);
        if (this.config.demoMode && !isolated)
            return false;
        const demo = r.is_demo || r.environment === 'demo' || r.email === applicantDemoEmail;
        return demo ? Boolean(isolated && r.environment === 'demo') : r.environment === 'live';
    }
    async configPublic(): Promise<ApplicantConfig> {
        const result: ApplicantConfig = { demoEnabled: false, outboundMode: 'simulation' };
        if (await preparedApplicantDemo(this.config, this.database)) {
            result.demoEnabled = true;
            result.demoCredentials = { email: applicantDemoEmail, password: applicantDemoPassword };
        }
        return result;
    }
    private async principal(c: Connection, digest: string, lock = false): Promise<ApplicantPrincipal | null> {
        const r = (await c.query("SELECT u.id,u.email,u.display_name AS name,u.is_demo,o.id AS organization_id,o.name AS organization_name,o.environment,s.expires_at FROM applicant_sessions s JOIN users u ON u.id=s.user_id AND u.account_kind='applicant' AND u.active JOIN organizations o ON o.id=s.organization_id WHERE s.token_digest=$1 AND s.revoked_at IS NULL AND s.expires_at>now() AND EXISTS(SELECT 1 FROM application_participants ap JOIN applications a ON a.id=ap.application_id AND a.organization_id=ap.organization_id WHERE ap.user_id=u.id AND ap.organization_id=o.id AND ap.active AND ap.property_id=a.property_id AND a.portal_enabled AND (ap.role='primary' AND ap.contact_id=a.contact_id OR ap.role='co_applicant' AND a.co_applicants_enabled) AND EXISTS(SELECT 1 FROM contact_property_links cp WHERE cp.organization_id=a.organization_id AND cp.contact_id=ap.contact_id AND cp.property_id=a.property_id)) " + (lock ? 'FOR SHARE OF s,u' : ''), [digest])).rows[0];
        return r && await this.eligible(r, c) ? { id: r.id, email: r.email, name: r.name, organization: { id: r.organization_id, name: r.organization_name }, sessionExpiresAt: iso(r.expires_at), sessionDigest: digest } : null;
    }
    async currentUser(request: Request): Promise<ApplicantPrincipal | null> {
        const t = tokenFrom(request);
        return t ? this.principal(this.database, this.digest(t)) : null;
    }
    publicUser(user: ApplicantPrincipal): ApplicantUser {
        const { sessionDigest: _, ...safe } = user;
        return safe;
    }
    private async newSession(c: PoolClient, request: Request, userId: string, organizationId: string): Promise<{
        token: string;
    }> {
        const previous = tokenFrom(request);
        if (previous)
            await c.query('UPDATE applicant_sessions SET revoked_at=now() WHERE token_digest=$1', [this.digest(previous)]);
        const token = randomBytes(32).toString('hex');
        await c.query("INSERT INTO applicant_sessions(token_digest,user_id,organization_id,expires_at) VALUES($1,$2,$3,now()+interval '8 hours')", [this.digest(token), userId, organizationId]);
        return { token };
    }
    async login(request: Request, response: Response, input: {
        email: string;
        password: string;
    }): Promise<ApplicantUser> {
        const r = (await this.database.query("SELECT u.id,u.email,u.password_hash,u.is_demo,o.id AS organization_id,o.environment FROM users u JOIN application_participants ap ON ap.user_id=u.id AND ap.active JOIN applications a ON a.id=ap.application_id AND a.organization_id=ap.organization_id AND a.portal_enabled JOIN organizations o ON o.id=a.organization_id WHERE u.email=$1 AND u.account_kind='applicant' AND u.active AND ap.property_id=a.property_id AND (ap.role='primary' AND ap.contact_id=a.contact_id OR ap.role='co_applicant' AND a.co_applicants_enabled) AND EXISTS(SELECT 1 FROM contact_property_links cp WHERE cp.contact_id=ap.contact_id AND cp.organization_id=ap.organization_id AND cp.property_id=a.property_id) ORDER BY ap.created_at,ap.id LIMIT 1", [input.email])).rows[0];
        const valid = await verifyPassword(r?.password_hash ?? await this.dummy, input.password);
        if (!r || !valid || !await this.eligible(r))
            throw new ApiError(401, 'INVALID_CREDENTIALS', 'The email or password is incorrect.');
        const session = await this.database.transaction(async (c) => {
            const current = (await c.query("SELECT u.password_hash,u.email,u.is_demo,o.environment FROM users u JOIN organizations o ON o.id=$2 WHERE u.id=$1 AND u.active AND u.account_kind='applicant' FOR SHARE OF u,o", [r.id, r.organization_id])).rows[0];
            if (!current || current.password_hash !== r.password_hash || !await this.eligible(current, c))
                throw new ApiError(401, 'INVALID_CREDENTIALS', 'The email or password is incorrect.');
            const s = await this.newSession(c, request, r.id, r.organization_id);
            if (!await this.principal(c, this.digest(s.token)))
                denied();
            await c.query("INSERT INTO audit_events(organization_id,actor_user_id,action) VALUES($1,$2,'applicant.login')", [r.organization_id, r.id]);
            return s;
        });
        response.cookie(cookieName, session.token, { ...this.cookieOptions(), maxAge: lifetime });
        const user = await this.principal(this.database, this.digest(session.token));
        if (!user)
            denied();
        return this.publicUser(user!);
    }
    async logout(request: Request, response: Response): Promise<void> {
        const t = tokenFrom(request);
        if (t)
            await this.database.query('UPDATE applicant_sessions SET revoked_at=now() WHERE token_digest=$1 AND revoked_at IS NULL', [this.digest(t)]);
        response.clearCookie(cookieName, this.cookieOptions());
    }
    private async invitation(c: Connection, token: string, lock = false): Promise<Row> {
        const r = (await c.query("SELECT i.*,ap.contact_id,ap.user_id,ap.active,ap.role,ap.invited_email AS participant_email,ap.property_id AS grant_property_id,a.property_id AS current_property_id,a.portal_enabled,a.co_applicants_enabled,a.contact_id AS primary_contact_id,a.status,o.environment,p.name AS property_name,EXISTS(SELECT 1 FROM contact_property_links cp WHERE cp.organization_id=a.organization_id AND cp.contact_id=ap.contact_id AND cp.property_id=a.property_id) AS linked FROM application_invitations i JOIN application_participants ap ON ap.id=i.participant_id AND ap.organization_id=i.organization_id AND ap.application_id=i.application_id JOIN applications a ON a.id=i.application_id AND a.organization_id=i.organization_id JOIN organizations o ON o.id=i.organization_id JOIN properties p ON p.id=a.property_id AND p.organization_id=a.organization_id WHERE i.token_digest=$1 " + (lock ? 'FOR UPDATE OF i,ap,a' : ''), [this.digest(token, 'invitation')])).rows[0];
        if (!r || r.used_at || r.revoked_at || new Date(r.expires_at).getTime() <= Date.now() || !r.active || r.grant_property_id !== r.current_property_id || !r.portal_enabled || r.invited_email !== r.participant_email || !r.linked || r.role === 'primary' && r.contact_id !== r.primary_contact_id || r.role === 'co_applicant' && !r.co_applicants_enabled || !await this.eligible({ email: r.invited_email, is_demo: r.environment === 'demo', environment: r.environment }, c))
            invalidInvitation();
        return r;
    }
    async inspect(token: string): Promise<{
        email: string;
        expiresAt: string;
        requiresExistingPassword: boolean;
        propertyName: string;
    }> {
        const i = await this.invitation(this.database, token);
        return { email: i.invited_email, expiresAt: iso(i.expires_at), requiresExistingPassword: Boolean((await this.database.query('SELECT id FROM users WHERE email=$1', [i.invited_email])).rowCount), propertyName: i.property_name };
    }
    async accept(request: Request, response: Response, input: {
        token: string;
        password: string;
    }): Promise<ApplicantUser> {
        const invite = await this.invitation(this.database, input.token), existing = (await this.database.query('SELECT * FROM users WHERE email=$1', [invite.invited_email])).rows[0];
        const valid = await verifyPassword(existing?.password_hash ?? await this.dummy, input.password);
        if (existing && (existing.account_kind !== 'applicant' || !existing.active || !valid))
            throw new ApiError(401, 'INVALID_CREDENTIALS', 'Use the existing applicant account password, or ask staff for help with this invitation.');
        const newHash = existing ? null : await hashPassword(input.password);
        const session = await this.database.transaction(async (c) => {
            const i = await this.invitation(c, input.token, true);
            await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', ['applicant-email:' + i.invited_email]);
            let u = (await c.query('SELECT * FROM users WHERE email=$1 FOR UPDATE', [i.invited_email])).rows[0];
            if (existing && (!u || u.id !== existing.id || u.password_hash !== existing.password_hash) || !existing && u)
                throw new ApiError(409, 'APPLICANT_ACCOUNT_CHANGED', 'The applicant account changed. Try accepting this invitation again.');
            if (!u) {
                const person = (await c.query('SELECT display_name FROM contacts WHERE id=$1 AND organization_id=$2', [i.contact_id, i.organization_id])).rows[0]!;
                u = (await c.query("INSERT INTO users(email,display_name,password_hash,account_kind,is_demo) VALUES($1,$2,$3,'applicant',$4) RETURNING *", [i.invited_email, person.display_name, newHash, i.environment === 'demo'])).rows[0]!;
            }
            if (u.account_kind !== 'applicant' || !u.active || !await this.eligible({ ...u, environment: i.environment }, c))
                denied();
            if (i.user_id && i.user_id !== u.id)
                denied();
            if ((await c.query('SELECT id FROM application_participants WHERE organization_id=$1 AND application_id=$2 AND user_id=$3 AND active AND id<>$4', [i.organization_id, i.application_id, u.id, i.participant_id])).rowCount)
                throw new ApiError(409, 'PARTICIPANT_IDENTITY_CONFLICT', 'A separate applicant identity is required for each participant.');
            await c.query('UPDATE application_participants SET user_id=$2,updated_at=now() WHERE id=$1', [i.participant_id, u.id]);
            await c.query('UPDATE application_invitations SET used_at=now() WHERE id=$1', [i.id]);
            await this.event(c, i, u.id, 'applicant', 'invitation_accepted', 'An invited applicant activated their own application access.', i.participant_id);
            return this.newSession(c, request, u.id, i.organization_id);
        });
        response.cookie(cookieName, session.token, { ...this.cookieOptions(), maxAge: lifetime });
        const user = await this.principal(this.database, this.digest(session.token));
        if (!user)
            denied();
        return this.publicUser(user!);
    }
    private async event(c: PoolClient, a: Row, actorId: string, actorKind: 'staff' | 'applicant', kind: string, description: string, participantId: string | null = null, metadata: Record<string, unknown> = {}): Promise<void> {
        const applicationId = a.application_id ?? a.id;
        await c.query('INSERT INTO application_portal_events(organization_id,application_id,participant_id,actor_user_id,actor_kind,kind,summary,metadata) VALUES($1,$2,$3,$4,$5,$6,$7,$8)', [a.organization_id, applicationId, participantId, actorId, actorKind, kind, description, JSON.stringify(metadata)]);
        await c.query('INSERT INTO audit_events(organization_id,actor_user_id,action,metadata) VALUES($1,$2,$3,$4)', [a.organization_id, actorId, 'application.portal_' + kind, JSON.stringify({ applicationId, participantId, actorKind, ...metadata })]);
    }
    private async staffActor(c: PoolClient, user: AuthUser, privateAccess = true): Promise<AuthUser> {
        const r = (await c.query<{
            role: OrganizationRole;
            permissions: Permission[];
        }>("SELECT m.role,ARRAY(SELECT rp.permission FROM role_permissions rp WHERE rp.role_key=m.role ORDER BY rp.permission) AS permissions FROM organization_memberships m JOIN users u ON u.id=m.user_id AND u.active AND u.account_kind='staff' WHERE m.id=$1 AND m.organization_id=$2 AND m.user_id=$3 AND m.active AND EXISTS(SELECT 1 FROM role_permissions rp WHERE rp.role_key=m.role AND rp.permission=$4) FOR SHARE OF m,u", [user.membershipId, user.organization.id, user.id, privateAccess ? 'leasing.manage' : 'properties.read'])).rows[0];
        if (!r)
            denied();
        return { ...user, permissions: r.permissions, organization: { ...user.organization, role: r.role } };
    }
    private async staffApplication(c: PoolClient, user: AuthUser, id: string, lock = false): Promise<Row> {
        const a = (await c.query(selectApplication + ' WHERE a.organization_id=$1 AND a.id=$4 AND ' + applicationScope('a') + (lock ? ' FOR UPDATE OF a' : ''), [user.organization.id, user.organization.role, user.membershipId, id])).rows[0];
        if (!a)
            missing();
        if (lock && user.organization.role !== 'organization_admin') {
            const properties = (await c.query('SELECT property_id FROM lead_property_interests WHERE organization_id=$1 AND lead_id=$2 ORDER BY property_id FOR SHARE', [a.organization_id, a.lead_id])).rows.map(r => r.property_id);
            properties.push(a.property_id);
            const unique = [...new Set(properties)].sort();
            if ((await c.query('SELECT property_id FROM property_access_assignments WHERE organization_id=$1 AND membership_id=$2 AND property_id=ANY($3::uuid[]) FOR SHARE', [a.organization_id, user.membershipId, unique])).rowCount !== unique.length)
                denied();
        }
        return a;
    }
    private editable(a: Row): void {
        if (!a.portal_enabled || a.status !== 'draft' || providerOwned(a))
            locked();
    }
    private async portalAccess(c: PoolClient, user: ApplicantPrincipal, id: string, write = false): Promise<{
        a: Row;
        p: Row;
    }> {
        const current = await this.principal(c, user.sessionDigest, true);
        if (!current || current.id !== user.id || current.organization.id !== user.organization.id)
            throw new ApiError(401, 'APPLICANT_AUTH_REQUIRED', 'Sign in to your applicant portal.');
        const a = (await c.query(selectApplication + ' WHERE a.organization_id=$1 AND a.id=$2' + (write ? ' FOR UPDATE OF a' : ''), [current.organization.id, id])).rows[0];
        if (!a || !a.portal_enabled)
            missing();
        const p = (await c.query("SELECT ap.* FROM application_participants ap WHERE ap.application_id=$1 AND ap.organization_id=$2 AND ap.user_id=$3 AND ap.active AND ap.property_id=$6 AND (ap.role='primary' AND ap.contact_id=$4 OR ap.role='co_applicant' AND $5::boolean) AND EXISTS(SELECT 1 FROM contact_property_links cp WHERE cp.contact_id=ap.contact_id AND cp.organization_id=ap.organization_id AND cp.property_id=$6) " + (write ? 'FOR UPDATE OF ap' : ''), [a.id, a.organization_id, current.id, a.contact_id, a.co_applicants_enabled, a.property_id])).rows[0];
        if (!p)
            missing();
        if (write)
            this.editable(a);
        return { a, p };
    }
    private async participants(c: Connection, a: Row): Promise<Row[]> {
        return (await c.query("SELECT ap.*,co.display_name AS contact_name,co.phone AS contact_phone FROM application_participants ap JOIN contacts co ON co.id=ap.contact_id AND co.organization_id=ap.organization_id WHERE ap.organization_id=$1 AND ap.application_id=$2 AND ap.active ORDER BY CASE ap.role WHEN 'primary' THEN 0 ELSE 1 END,ap.created_at,ap.id", [a.organization_id, a.id])).rows;
    }
    private async items(c: Connection, a: Row): Promise<Row[]> {
        return (await c.query('SELECT id,label,required FROM application_checklist_items WHERE organization_id=$1 AND application_id=$2 AND active ORDER BY position,id', [a.organization_id, a.id])).rows;
    }
    private async documents(c: Connection, a: Row, participantId: string, staff = false): Promise<ApplicantDocument[]> {
        return (await c.query('SELECT d.id,d.application_id,d.checklist_item_id,d.name,d.media_type,d.size_bytes,d.created_at FROM application_documents d JOIN application_checklist_items ci ON ci.id=d.checklist_item_id AND ci.organization_id=d.organization_id AND ci.application_id=d.application_id AND ci.active WHERE d.organization_id=$1 AND d.application_id=$2 AND d.participant_id=$3 ORDER BY d.created_at,d.id', [a.organization_id, a.id, participantId])).rows.map(r => document(r, staff));
    }
    private async acceptedAt(c: Connection, a: Row, p: Row): Promise<string | null> {
        const r = (await c.query('SELECT accepted_at FROM application_consents WHERE organization_id=$1 AND application_id=$2 AND participant_id=$3 AND version=$4', [a.organization_id, a.id, p.id, applicantConsentVersion])).rows[0];
        return r ? iso(r.accepted_at) : null;
    }
    private async readiness(c: Connection, a: Row, p: Row): Promise<string[]> {
        const d = details(p), missingFields: string[] = [];
        if (!d.displayName)
            missingFields.push('Personal name');
        if (!d.phone)
            missingFields.push('Phone number');
        if (!d.currentAddress)
            missingFields.push('Current address');
        if (!d.moveInDate)
            missingFields.push('Preferred move-in date');
        const items = await this.items(c, a), docs = await this.documents(c, a, p.id);
        for (const item of items)
            if (item.required && !docs.some(d => d.checklistId === item.id))
                missingFields.push(item.label);
        if (!await this.acceptedAt(c, a, p))
            missingFields.push('Application information consent');
        return missingFields;
    }
    /** Safe progress facts only: staff reasons, reports and private document content are excluded. */
    private async journeyNextSteps(c:Connection,a:Row):Promise<string[]>{
        const readiness=(await c.query("SELECT to_regclass('public.application_decisions') IS NOT NULL AS decisions,to_regclass('public.lease_workflows') IS NOT NULL AS leases,to_regclass('public.application_payment_references') IS NOT NULL AS payments")).rows[0]!;
        const decision=readiness.decisions?(await c.query('SELECT decision FROM application_decisions WHERE organization_id=$1 AND application_id=$2 ORDER BY created_at DESC,id LIMIT 1',[a.organization_id,a.id])).rows[0]?.decision:null;
        const steps:string[]=a.status==='draft'?[
            ...(decision==='request_information'?['Staff reopened this application for additional information. Your previous documents and consent history remain saved.']:[]),
            'Save your personal details.','Upload each required document and record your consent.','Mark your own section ready. The primary applicant submits when everyone is ready.'
        ]:decision==='request_information'?['Staff requested additional information. The portal stays read-only until authorized staff reopens it.']:decision==='declined'?['Authorized staff recorded an application decision. Contact the property team for the applicable notice and next steps.']:decision==='withdrawn'?['Authorized staff recorded this application as withdrawn. Contact the property team about any further steps.']:decision==='approved'?['Authorized staff approved this application. Lease and move-in progress are shown separately; screening and payment status do not make this decision.']:['Your application has been submitted for authorized staff review.','Submission is not an approval or screening decision. Staff will confirm the next step.'];
        if(readiness.leases){
            const w=(await c.query('SELECT stage,move_in_at,signature_evidence_kind FROM lease_workflows WHERE organization_id=$1 AND application_id=$2',[a.organization_id,a.id])).rows[0];
            if(w){
                const labels:Record<string,string>={lease_preparation:'Lease preparation is in progress.',signature_requested:'Signature has been requested. Follow the property team’s signing instructions.',partially_signed:'The lease is partially signed; remaining signatures are pending.',fully_signed:'Authorized staff recorded the fully signed milestone. Move-in scheduling is next.',move_in_scheduled:'Move-in is scheduled for '+(w.move_in_at?new Date(w.move_in_at).toISOString():'the agreed time')+'. Review the property team’s arrangements.',completed:'Authorized staff recorded the move-in workflow as completed.'};
                steps.push((w.signature_evidence_kind==='demo_event'?'Demonstration: ':'')+(labels[w.stage]??'Contact the property team about lease progress.'));
                if(w.signature_evidence_kind==='manual_attestation')steps.push('Signature completion was manually attested by authorized staff; no live signing-provider verification is claimed.');
            }
        }
        if(readiness.payments){
            const p=(await c.query("SELECT status,source,verified_at,verified_at BETWEEN clock_timestamp()-interval '1 hour' AND clock_timestamp() AS verification_fresh FROM application_payment_references WHERE organization_id=$1 AND application_id=$2",[a.organization_id,a.id])).rows[0];
            if(p){
                const fresh=p.verification_fresh;
                steps.push(!fresh?'Payment verification is needed; an external portal return does not confirm a payment.':p.source==='ootla_payment_demo'?'Simulated provider status: '+p.status+'. This is demonstration evidence, not a live payment.':'Contact staff for the verified existing-provider payment status.');
            }
        }
        return steps;
    }
    private async portalDto(c: Connection, a: Row, p: Row, preview = false): Promise<PortalApplication> {
        const people = await this.participants(c, a), items = await this.items(c, a), docs = await this.documents(c, a, p.id, preview), missingFields = await this.readiness(c, a, p), acceptedAt = await this.acceptedAt(c, a, p);
        const readOnly = preview || a.status !== 'draft' || providerOwned(a) || !a.portal_enabled;
        return { application: summary(a, p.role), participant: { id: p.id, role: p.role, version: p.version, details: details(p), readyAt: nullableIso(p.ready_at) }, participants: people.map(v => ({ id: v.id, name: v.contact_name, role: v.role, ready: Boolean(v.ready_at), invited: Boolean(v.user_id) })), checklist: items.map(v => ({ id: v.id, label: v.label, required: v.required, document: docs.find(d => d.checklistId === v.id) ?? null })), consent: { version: applicantConsentVersion, text: applicantConsentText, acceptedAt }, readiness: { missing: missingFields, canMarkReady: !readOnly && !missingFields.length && !p.ready_at, canSubmit: !readOnly && p.role === 'primary' && !missingFields.length && people.length > 0 && people.every(v => Boolean(v.ready_at)) }, nextSteps: await this.journeyNextSteps(c,a), readOnly, preview };
    }
    async list(user: ApplicantPrincipal): Promise<{
        items: ApplicationSummary[];
    }> {
        return this.database.transaction(async (c) => {
            const current = await this.principal(c, user.sessionDigest, true);
            if (!current)
                throw new ApiError(401, 'APPLICANT_AUTH_REQUIRED', 'Sign in to your applicant portal.');
            const rows = (await c.query(selectApplication + " JOIN application_participants ap ON ap.application_id=a.id AND ap.organization_id=a.organization_id WHERE ap.user_id=$1 AND ap.organization_id=$2 AND ap.active AND ap.property_id=a.property_id AND a.portal_enabled AND (ap.role='primary' AND ap.contact_id=a.contact_id OR ap.role='co_applicant' AND a.co_applicants_enabled) AND EXISTS(SELECT 1 FROM contact_property_links cp WHERE cp.contact_id=ap.contact_id AND cp.organization_id=ap.organization_id AND cp.property_id=a.property_id) ORDER BY a.updated_at DESC,a.id LIMIT 100", [current.id, current.organization.id])).rows;
            return { items: rows.map(r => summary(r)) };
        });
    }
    async detail(user: ApplicantPrincipal, id: string): Promise<PortalApplication> {
        return this.database.transaction(async (c) => {
            const { a, p } = await this.portalAccess(c, user, id);
            return this.portalDto(c, a, p);
        });
    }
    private async touch(c: PoolClient, a: Row, p: Row, actorId: string, kind: string, description: string): Promise<void> {
        await c.query('UPDATE application_participants SET version=version+1,ready_at=NULL,updated_at=now() WHERE id=$1 AND organization_id=$2', [p.id, a.organization_id]);
        await c.query('UPDATE applications SET portal_version=portal_version+1,updated_at=now() WHERE id=$1 AND organization_id=$2', [a.id, a.organization_id]);
        await this.event(c, a, actorId, 'applicant', kind, description, p.id);
    }
    async save(user: ApplicantPrincipal, id: string, input: z.infer<typeof applicantSaveSchema>): Promise<PortalApplication> {
        await this.database.transaction(async (c) => {
            const { a, p } = await this.portalAccess(c, user, id, true);
            if (p.version !== input.version)
                stale();
            await c.query('UPDATE application_participants SET details=$2 WHERE id=$1', [p.id, JSON.stringify(input.details)]);
            await this.touch(c, a, p, user.id, 'details_saved', 'An applicant saved their own application details.');
        });
        return this.detail(user, id);
    }
    async consent(user: ApplicantPrincipal, id: string): Promise<PortalApplication> {
        await this.database.transaction(async (c) => {
            const { a, p } = await this.portalAccess(c, user, id, true);
            const inserted = await c.query('INSERT INTO application_consents(organization_id,application_id,participant_id,version,consent_text,actor_user_id) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(participant_id,version) DO NOTHING RETURNING id', [a.organization_id, a.id, p.id, applicantConsentVersion, applicantConsentText, user.id]);
            if (inserted.rowCount)
                await this.touch(c, a, p, user.id, 'consent_recorded', 'An applicant recorded versioned application-information consent.');
        });
        return this.detail(user, id);
    }
    async ready(user: ApplicantPrincipal, id: string, version: number): Promise<PortalApplication> {
        await this.database.transaction(async (c) => {
            const { a, p } = await this.portalAccess(c, user, id, true);
            if (p.version !== version)
                stale();
            if ((await this.readiness(c, a, p)).length)
                throw new ApiError(409, 'APPLICATION_INCOMPLETE', 'Complete the required personal details, documents and consent before marking your section ready.');
            if (!p.ready_at) {
                await c.query('UPDATE application_participants SET ready_at=now(),version=version+1,updated_at=now() WHERE id=$1', [p.id]);
                await c.query('UPDATE applications SET portal_version=portal_version+1,updated_at=now() WHERE id=$1', [a.id]);
                await this.event(c, a, user.id, 'applicant', 'participant_ready', 'An applicant marked their own application section ready.', p.id);
            }
        });
        return this.detail(user, id);
    }
    private async synchronizeLead(c: PoolClient, a: Row): Promise<void> {
        if (!a.lead_id)
            return;
        if (!(await c.query('SELECT id FROM leads WHERE organization_id=$1 AND id=$2 FOR UPDATE', [a.organization_id, a.lead_id])).rowCount)
            return;
        const latest = (await c.query('SELECT id,status FROM applications WHERE organization_id=$1 AND lead_id=$2 ORDER BY updated_at DESC,created_at DESC,id LIMIT 1', [a.organization_id, a.lead_id])).rows[0];
        if (latest)
            await c.query('UPDATE leads SET application_summary_id=$3,application_summary_status=$4,version=version+1,updated_at=now() WHERE organization_id=$1 AND id=$2 AND (application_summary_id IS DISTINCT FROM $3::uuid OR application_summary_status IS DISTINCT FROM $4)', [a.organization_id, a.lead_id, latest.id, latest.status]);
    }
    async submit(user: ApplicantPrincipal, id: string, version: number): Promise<PortalApplication> {
        await this.database.transaction(async (c) => {
            const { a, p } = await this.portalAccess(c, user, id);
            const current = (await c.query(selectApplication + ' WHERE a.id=$1 AND a.organization_id=$2 FOR UPDATE OF a', [a.id, a.organization_id])).rows[0]!;
            const grant = (await c.query("SELECT id FROM application_participants WHERE id=$1 AND application_id=$2 AND organization_id=$3 AND user_id=$4 AND active AND role='primary' AND contact_id=$5 AND property_id=$6 FOR UPDATE", [p.id, current.id, current.organization_id, user.id, current.contact_id, current.property_id])).rows[0];
            if (!grant || !current.portal_enabled)
                missing();
            if (p.role !== 'primary')
                denied();
            if (current.portal_submitted_at && current.status !== 'draft')
                return;
            this.editable(current);
            if (current.portal_version !== version)
                stale();
            const people = await this.participants(c, current);
            if (!people.length || people.some(v => !v.ready_at || !v.user_id))
                throw new ApiError(409, 'APPLICATION_INCOMPLETE', 'Every configured applicant must complete and mark their own section ready.');
            for (const person of people)
                if ((await this.readiness(c, current, person)).length)
                    throw new ApiError(409, 'APPLICATION_INCOMPLETE', 'Every configured applicant must complete the required details, documents and consent.');
            await c.query("UPDATE applications SET status='submitted',portal_submitted_at=now(),portal_version=portal_version+1,updated_at=now() WHERE id=$1", [current.id]);
            await this.synchronizeLead(c, current);
            await this.event(c, current, user.id, 'applicant', 'submitted', 'The primary applicant submitted the completed application for staff review. This is not an approval.', p.id, { status: 'submitted' });
        });
        return this.detail(user, id);
    }
    async upload(user: ApplicantPrincipal, id: string, checklistId: string, name: string, mediaType: string, content: Buffer): Promise<ApplicantDocument> {
        validateDocument(name, mediaType, content);
        return this.database.transaction(async (c) => {
            const { a, p } = await this.portalAccess(c, user, id, true);
            if (!(await c.query('SELECT id FROM application_checklist_items WHERE id=$1 AND organization_id=$2 AND application_id=$3 AND active FOR SHARE', [checklistId, a.organization_id, a.id])).rowCount)
                throw new ApiError(404, 'CHECKLIST_ITEM_NOT_FOUND', 'Choose an active item from your own application checklist.');
            await scanDocument(this.config,c,content);
            const r = (await c.query('INSERT INTO application_documents(organization_id,application_id,participant_id,checklist_item_id,name,media_type,size_bytes,sha256,content,uploaded_by_user_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(participant_id,checklist_item_id) DO UPDATE SET name=EXCLUDED.name,media_type=EXCLUDED.media_type,size_bytes=EXCLUDED.size_bytes,sha256=EXCLUDED.sha256,content=EXCLUDED.content,uploaded_by_user_id=EXCLUDED.uploaded_by_user_id,created_at=now() RETURNING id,application_id,checklist_item_id,name,media_type,size_bytes,created_at', [a.organization_id, a.id, p.id, checklistId, name, mediaType, content.length, createHash('sha256').update(content).digest('hex'), content, user.id])).rows[0]!;
            await this.touch(c, a, p, user.id, 'document_uploaded', 'An applicant saved a private checklist document.');
            return document(r);
        });
    }
    async download(user: ApplicantPrincipal, id: string, documentId: string): Promise<{
        document: ApplicantDocument;
        content: Buffer;
    }> {
        return this.database.transaction(async (c) => {
            const { a, p } = await this.portalAccess(c, user, id);
            const r = (await c.query('SELECT * FROM application_documents WHERE organization_id=$1 AND application_id=$2 AND participant_id=$3 AND id=$4', [a.organization_id, a.id, p.id, documentId])).rows[0];
            if (!r)
                missing();
            return { document: document(r), content: r.content };
        });
    }
    async staffList(user: AuthUser, input: z.infer<typeof applicationListSchema>): Promise<StaffApplications> {
        return this.database.transaction(async (c) => {
            const u = await this.staffActor(c, user, false), values = [u.organization.id, u.organization.role, u.membershipId, input.q, input.status], where = applicationScope('a') + " AND ($4='' OR strpos(lower(c.display_name),lower($4))>0 OR strpos(lower(p.name),lower($4))>0) AND ($5='all' OR a.status=$5)";
            const total = Number((await c.query('SELECT count(*) AS total FROM applications a JOIN contacts c ON c.id=a.contact_id AND c.organization_id=a.organization_id JOIN properties p ON p.id=a.property_id AND p.organization_id=a.organization_id WHERE ' + where, values)).rows[0]!.total), rows = (await c.query(selectApplication + ' WHERE ' + where + ' ORDER BY a.updated_at DESC,a.id LIMIT $6 OFFSET $7', [...values, input.pageSize, (input.page - 1) * input.pageSize])).rows;
            return { items: rows.map(r => summary(u.permissions.includes('leasing.manage') ? r : { ...r, contact_name: 'Applicant details restricted' })), total, page: input.page, pageSize: input.pageSize, totalPages: Math.ceil(total / input.pageSize) };
        });
    }
    private async initialize(c: PoolClient, a: Row): Promise<void> {
        if (a.status !== 'draft' || providerOwned(a))
            locked();
        const person = (await c.query('SELECT display_name,email,phone FROM contacts WHERE id=$1 AND organization_id=$2', [a.contact_id, a.organization_id])).rows[0]!;
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(person.email))
            throw new ApiError(409, 'CONTACT_EMAIL_REQUIRED', 'Save a valid primary contact email before enabling the portal.');
        await c.query("INSERT INTO application_participants(organization_id,application_id,contact_id,role,invited_email,details) VALUES($1,$2,$3,'primary',$4,$5) ON CONFLICT(application_id,organization_id,contact_id) DO NOTHING", [a.organization_id, a.id, a.contact_id, person.email, JSON.stringify({ displayName: person.display_name, phone: person.phone, currentAddress: '', moveInDate: '' })]);
        if (!(await c.query('SELECT id FROM application_checklist_items WHERE application_id=$1 AND organization_id=$2', [a.id, a.organization_id])).rowCount)
            await c.query("INSERT INTO application_checklist_items(organization_id,application_id,label,required,position) VALUES($1,$2,'Requested application document',true,0)", [a.organization_id, a.id]);
        await c.query('UPDATE applications SET portal_enabled=true,portal_version=portal_version+1,updated_at=now() WHERE id=$1 AND organization_id=$2 AND NOT portal_enabled', [a.id, a.organization_id]);
    }
    async staffCreate(user: AuthUser, leadId: string): Promise<StaffApplicationWorkspace> {
        const id = await this.database.transaction(async (c) => {
            const u = await this.staffActor(c, user);
            const lead = (await c.query('SELECT l.* FROM leads l WHERE l.id=$4 AND ' + propertyScope('l') + ' AND NOT EXISTS(SELECT 1 FROM lead_property_interests li WHERE li.organization_id=l.organization_id AND li.lead_id=l.id AND NOT ' + propertyScope('li') + ') FOR UPDATE OF l', [u.organization.id, u.organization.role, u.membershipId, leadId])).rows[0];
            if (!lead)
                missing();
            if (lead.intent !== 'leasing')
                throw new ApiError(409, 'LEASING_APPLICATION_REQUIRED', 'Create rental applications from a leasing lead.');
            const existing = (await c.query('SELECT id FROM applications WHERE organization_id=$1 AND lead_id=$2 ORDER BY created_at DESC,id LIMIT 1 FOR UPDATE', [u.organization.id, leadId])).rows[0];
            let appId = existing?.id;
            if (!appId)
                appId = (await c.query("INSERT INTO applications(organization_id,contact_id,property_id,unit_id,lead_id,status,source_system) VALUES($1,$2,$3,$4,$5,'draft','local') RETURNING id", [u.organization.id, lead.contact_id, lead.property_id, lead.unit_id, lead.id])).rows[0]!.id;
            const a = await this.staffApplication(c, u, appId, true);
            if (!a.portal_enabled) {
                await this.initialize(c, a);
                await this.event(c, a, u.id, 'staff', 'portal_enabled', 'Authorized staff enabled secure applicant access to the existing CRM application.');
            }
            await this.synchronizeLead(c, a);
            return appId;
        });
        return this.staffDetail(user, id);
    }
    async staffDetail(user: AuthUser, id: string): Promise<StaffApplicationWorkspace> {
        return this.database.transaction(async (c) => {
            const u = await this.staffActor(c, user), a = await this.staffApplication(c, u, id), people = await this.participants(c, a), items = await this.items(c, a);
            const participants = [];
            for (const p of people)
                participants.push({ id: p.id, contactId: p.contact_id, name: p.contact_name, email: p.invited_email, role: p.role, active: p.active, userBound: Boolean(p.user_id), readyAt: nullableIso(p.ready_at), details: details(p), version: p.version, documents: await this.documents(c, a, p.id, true), consentAcceptedAt: await this.acceptedAt(c, a, p) });
            const invites = (await c.query('SELECT id,participant_id,invited_email,expires_at,used_at,revoked_at FROM application_invitations WHERE organization_id=$1 AND application_id=$2 ORDER BY created_at DESC,id LIMIT 100', [a.organization_id, a.id])).rows, events = (await c.query('SELECT e.id,e.kind,e.summary,e.occurred_at,u.display_name FROM application_portal_events e JOIN users u ON u.id=e.actor_user_id WHERE e.organization_id=$1 AND e.application_id=$2 ORDER BY e.occurred_at DESC,e.id LIMIT 100', [a.organization_id, a.id])).rows;
            return { application: summary(a), primaryContact: { id: a.contact_id, name: a.contact_name, email: a.contact_email, phone: a.contact_phone }, participants, checklist: items.map(v => ({ id: v.id, label: v.label, required: v.required })), invitations: invites.map(v => ({ id: v.id, participantId: v.participant_id, email: v.invited_email, expiresAt: iso(v.expires_at), usedAt: nullableIso(v.used_at), revokedAt: nullableIso(v.revoked_at) })), events: events.map(v => ({ id: v.id, kind: v.kind, summary: v.summary, occurredAt: iso(v.occurred_at), actorName: v.display_name })), previewUrl: '/admin/applications?application=' + a.id + '&preview=1' };
        });
    }
    async staffSettings(user: AuthUser, id: string, input: z.infer<typeof applicationSettingsSchema>): Promise<StaffApplicationWorkspace> {
        await this.database.transaction(async (c) => {
            const u = await this.staffActor(c, user), a = await this.staffApplication(c, u, id, true);
            if (a.portal_version !== input.version)
                stale();
            if (!a.portal_enabled)
                await this.initialize(c, a);
            else
                this.editable(a);
            if (!input.coApplicantsEnabled && (await c.query("SELECT id FROM application_participants WHERE application_id=$1 AND organization_id=$2 AND active AND role='co_applicant'", [a.id, a.organization_id])).rowCount)
                throw new ApiError(409, 'ACTIVE_CO_APPLICANTS', 'Revoke configured co-applicants before disabling their application sections.');
            const ids = input.checklist.flatMap(v => v.id ? [v.id] : []);
            if (new Set(ids).size !== ids.length)
                throw new ApiError(400, 'DUPLICATE_CHECKLIST_ITEM', 'Each checklist item must occur once.');
            if (ids.length && (await c.query('SELECT id FROM application_checklist_items WHERE application_id=$1 AND organization_id=$2 AND id=ANY($3::uuid[]) FOR SHARE', [a.id, a.organization_id, ids])).rowCount !== ids.length)
                throw new ApiError(400, 'INVALID_CHECKLIST_ITEM', 'Use checklist items belonging to this application.');
            await c.query('UPDATE application_checklist_items SET active=false WHERE application_id=$1 AND organization_id=$2', [a.id, a.organization_id]);
            for (const [index, item] of input.checklist.entries()) {
                if (item.id)
                    await c.query('UPDATE application_checklist_items SET label=$2,required=$3,position=$4,active=true WHERE id=$1 AND organization_id=$5 AND application_id=$6', [item.id, item.label, item.required, index, a.organization_id, a.id]);
                else
                    await c.query('INSERT INTO application_checklist_items(organization_id,application_id,label,required,position) VALUES($1,$2,$3,$4,$5)', [a.organization_id, a.id, item.label, item.required, index]);
            }
            await c.query('UPDATE applications SET co_applicants_enabled=$2,portal_version=portal_version+1,updated_at=now() WHERE id=$1', [a.id, input.coApplicantsEnabled]);
            await c.query('UPDATE application_participants SET ready_at=NULL,version=version+1,updated_at=now() WHERE application_id=$1 AND organization_id=$2 AND active', [a.id, a.organization_id]);
            await this.event(c, a, u.id, 'staff', 'checklist_configured', 'Authorized staff updated the application checklist and participant policy. Applicants must review their readiness again.');
        });
        return this.staffDetail(user, id);
    }
    async staffInvite(user: AuthUser, id: string, participantId: string, hours: number): Promise<IssuedApplicationInvitation> {
        return this.database.transaction(async (c) => {
            const u = await this.staffActor(c, user), a = await this.staffApplication(c, u, id, true);
            this.editable(a);
            const p = (await c.query('SELECT * FROM application_participants WHERE id=$1 AND application_id=$2 AND organization_id=$3 AND active FOR UPDATE', [participantId, a.id, a.organization_id])).rows[0];
            if (!p || p.role === 'co_applicant' && !a.co_applicants_enabled)
                missing();
            const token = randomBytes(32).toString('hex');
            await c.query('UPDATE application_invitations SET revoked_at=now() WHERE participant_id=$1 AND organization_id=$2 AND used_at IS NULL AND revoked_at IS NULL', [p.id, a.organization_id]);
            const r = (await c.query("INSERT INTO application_invitations(organization_id,application_id,participant_id,token_digest,invited_email,created_by_user_id,expires_at) VALUES($1,$2,$3,$4,$5,$6,now()+$7*interval '1 hour') RETURNING id,expires_at", [a.organization_id, a.id, p.id, this.digest(token, 'invitation'), p.invited_email, u.id, hours])).rows[0]!;
            await this.event(c, a, u.id, 'staff', 'invitation_issued', 'Authorized staff created a time-limited applicant invitation. Delivery requires copying the link; no message was sent.', p.id);
            return { id: r.id, url: this.config.appUrl + '/applicant/invite#token=' + token, expiresAt: iso(r.expires_at), delivery: 'copy_link', message: 'Copy this private invitation link to the intended applicant using your approved process. Ootla has not sent email, SMS or another outbound message.' };
        });
    }
    async staffRevokeInvitation(user: AuthUser, id: string, invitationId: string): Promise<void> {
        await this.database.transaction(async (c) => {
            const u = await this.staffActor(c, user), a = await this.staffApplication(c, u, id, true);
            if (!(await c.query('UPDATE application_invitations SET revoked_at=COALESCE(revoked_at,now()) WHERE id=$1 AND organization_id=$2 AND application_id=$3 RETURNING id', [invitationId, a.organization_id, a.id])).rowCount)
                missing();
            await this.event(c, a, u.id, 'staff', 'invitation_revoked', 'Authorized staff revoked an applicant invitation.');
        });
    }
    async staffParticipant(user: AuthUser, id: string, contactId: string, email: string): Promise<StaffApplicationWorkspace> {
        await this.database.transaction(async (c) => {
            const u = await this.staffActor(c, user), a = await this.staffApplication(c, u, id, true);
            this.editable(a);
            if (!a.co_applicants_enabled)
                throw new ApiError(409, 'CO_APPLICANTS_DISABLED', 'Enable co-applicant sections before adding another applicant.');
            if (Number((await c.query('SELECT count(*) AS total FROM application_participants WHERE application_id=$1 AND organization_id=$2 AND active', [a.id, a.organization_id])).rows[0]!.total) >= 6)
                throw new ApiError(409, 'PARTICIPANT_LIMIT', 'This application supports at most six configured applicants.');
            const person = (await c.query('SELECT co.* FROM contacts co JOIN contact_property_links cp ON cp.contact_id=co.id AND cp.organization_id=co.organization_id WHERE co.id=$1 AND co.organization_id=$2 AND cp.property_id=$3 FOR SHARE OF co,cp', [contactId, a.organization_id, a.property_id])).rows[0];
            if (!person)
                throw new ApiError(400, 'INVALID_CONTACT', 'Choose an existing contact explicitly linked to this application property.');
            if (person.email !== email)
                throw new ApiError(409, 'CONTACT_EMAIL_MISMATCH', 'Confirm and save this contact email in Contacts before issuing applicant access.');
            if ((await c.query('SELECT id FROM application_participants WHERE application_id=$1 AND organization_id=$2 AND (contact_id=$3 OR active AND invited_email=$4)', [a.id, a.organization_id, contactId, email])).rowCount)
                throw new ApiError(409, 'DUPLICATE_PARTICIPANT', 'Choose a separate explicitly identified applicant and email. No contacts were merged.');
            let householdId = a.household_id;
            if (!householdId) {
                householdId = (await c.query('INSERT INTO households(organization_id,name) VALUES($1,$2) RETURNING id', [a.organization_id, 'Application household'])).rows[0]!.id;
                await c.query('INSERT INTO household_property_links(organization_id,household_id,property_id) VALUES($1,$2,$3)', [a.organization_id, householdId, a.property_id]);
                await c.query("INSERT INTO household_members(organization_id,household_id,contact_id,relationship) VALUES($1,$2,$3,'primary applicant')", [a.organization_id, householdId, a.contact_id]);
            }
            await c.query("INSERT INTO household_members(organization_id,household_id,contact_id,relationship) VALUES($1,$2,$3,'co-applicant') ON CONFLICT DO NOTHING", [a.organization_id, householdId, person.id]);
            await c.query("INSERT INTO application_participants(organization_id,application_id,contact_id,role,invited_email,details) VALUES($1,$2,$3,'co_applicant',$4,$5)", [a.organization_id, a.id, person.id, email, JSON.stringify({ displayName: person.display_name, phone: person.phone, currentAddress: '', moveInDate: '' })]);
            await c.query('UPDATE applications SET household_id=$2,portal_version=portal_version+1,updated_at=now() WHERE id=$1', [a.id, householdId]);
            await c.query('UPDATE application_participants SET ready_at=NULL,version=version+1 WHERE application_id=$1 AND organization_id=$2 AND active', [a.id, a.organization_id]);
            await this.event(c, a, u.id, 'staff', 'participant_added', 'Authorized staff configured a separately identified co-applicant. Each applicant has private details and documents.');
        });
        return this.staffDetail(user, id);
    }
    async staffRevokeParticipant(user: AuthUser, id: string, participantId: string): Promise<StaffApplicationWorkspace> {
        await this.database.transaction(async (c) => {
            const u = await this.staffActor(c, user), a = await this.staffApplication(c, u, id, true);
            this.editable(a);
            const p = (await c.query("UPDATE application_participants SET active=false,ready_at=NULL,version=version+1,updated_at=now() WHERE id=$1 AND application_id=$2 AND organization_id=$3 AND role='co_applicant' AND active RETURNING id", [participantId, a.id, a.organization_id])).rows[0];
            if (!p)
                missing();
            await c.query('UPDATE application_invitations SET revoked_at=COALESCE(revoked_at,now()) WHERE participant_id=$1 AND organization_id=$2 AND used_at IS NULL', [p.id, a.organization_id]);
            await c.query('UPDATE applications SET portal_version=portal_version+1,updated_at=now() WHERE id=$1', [a.id]);
            await this.event(c, a, u.id, 'staff', 'participant_revoked', 'Authorized staff revoked a co-applicant application grant.', p.id);
        });
        return this.staffDetail(user, id);
    }
    async staffPreview(user: AuthUser, id: string): Promise<PortalApplication> {
        return this.database.transaction(async (c) => {
            const u = await this.staffActor(c, user), a = await this.staffApplication(c, u, id), p = (await this.participants(c, a)).find(v => v.role === 'primary');
            if (!p)
                throw new ApiError(409, 'PORTAL_NOT_ENABLED', 'Enable the application portal before opening its read-only staff preview.');
            return this.portalDto(c, a, p, true);
        });
    }
    async staffDownload(user: AuthUser, id: string, documentId: string): Promise<{
        document: ApplicantDocument;
        content: Buffer;
    }> {
        return this.database.transaction(async (c) => {
            const u = await this.staffActor(c, user), a = await this.staffApplication(c, u, id), r = (await c.query('SELECT * FROM application_documents WHERE id=$1 AND organization_id=$2 AND application_id=$3', [documentId, a.organization_id, a.id])).rows[0];
            if (!r)
                missing();
            await c.query('INSERT INTO audit_events(organization_id,actor_user_id,action,metadata) VALUES($1,$2,$3,$4)', [a.organization_id, u.id, 'application.document_downloaded', JSON.stringify({ applicationId: a.id, documentId: r.id })]);
            return { document: document(r, true), content: r.content };
        });
    }
}
