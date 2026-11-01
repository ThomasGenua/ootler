import { createHash } from 'node:crypto';
import { taskCreateSchema as parseTaskCreate } from '../../shared/task-contracts.js';
import type { PoolClient, QueryResult, QueryResultRow } from 'pg';
import type { z } from 'zod';
import type { AuthUser, OrganizationRole } from '../../shared/contracts.js';
import { leasingStages, salesStages, type LeadOwner } from '../../shared/lead-contracts.js';
import type { Paginated } from '../../shared/property-contracts.js';
import type { TaskRecord, TaskDirectory, TaskDetail, TaskEvent, TaskOptions, TaskReminder, TaskTeam, TaskRoutingRule, taskCreateSchema, taskUpdateSchema, taskDirectorySchema, taskTeamSchema, taskRoutingSchema } from '../../shared/task-contracts.js';
import type { Database } from '../db/pool.js';
import { ApiError } from '../http/errors.js';
interface Queryable {
    query<T extends QueryResultRow = QueryResultRow>(sql: string, values?: unknown[]): Promise<QueryResult<T>>;
}
type Row = QueryResultRow;
export interface TaskCreationOptions {requestKey:string;namespace:'lease_move_in'|'ai_follow_up'|'inspection_repair'|'leasing_workflow';origin:'system'|'ai_simulation';purpose:'crm'|'move_in'}
const escapedLike = (v:string):string => '%' + v.replace(/[\\%_]/g,c=>'\\'+c) + '%';
type Page = {
    page: number;
    pageSize: number;
};
const iso = (v: unknown) => v ? (v instanceof Date ? v : new Date(String(v))).toISOString() : null;
const paged = <T>(items: T[], total: number, p: Page): Paginated<T> => ({ items, total, page: p.page, pageSize: p.pageSize, totalPages: Math.ceil(total / p.pageSize) });
const parameters = (u: AuthUser): unknown[] => [u.organization.id, u.organization.role, u.membershipId];
export const scope = (a: string) => `${a}.organization_id=$1 AND ($2='organization_admin' OR EXISTS(SELECT 1 FROM property_access_assignments pa WHERE pa.organization_id=${a}.organization_id AND pa.property_id=${a}.property_id AND pa.membership_id=$3)) AND (${a}.lead_id IS NULL OR NOT EXISTS(SELECT 1 FROM lead_property_interests li WHERE li.organization_id=${a}.organization_id AND li.lead_id=${a}.lead_id AND $2<>'organization_admin' AND NOT EXISTS(SELECT 1 FROM property_access_assignments la WHERE la.organization_id=li.organization_id AND la.property_id=li.property_id AND la.membership_id=$3)))`;
export const relevant = (t: string, l: string, v: string) => `${t}.status='open' AND (${l}.id IS NULL OR ${l}.pipeline_stage NOT IN ('lost_closed','leased','won') OR (${l}.pipeline_stage='leased' AND to_jsonb(${t})->>'purpose'='move_in')) AND (${t}.tour_id IS NULL OR (${v}.id IS NOT NULL AND ${v}.status<>'cancelled' AND ${v}.lead_id=${t}.lead_id AND ${v}.property_id=${t}.property_id)) AND (${t}.application_id IS NULL OR EXISTS(SELECT 1 FROM applications ra WHERE ra.id=${t}.application_id AND ra.organization_id=${t}.organization_id AND ra.property_id=${t}.property_id AND ra.lead_id IS NOT DISTINCT FROM ${t}.lead_id AND ra.contact_id IS NOT DISTINCT FROM ${t}.contact_id))`;
const eligible = (m: string, t: string) => `${m}.active AND EXISTS(SELECT 1 FROM users eu WHERE eu.id=${m}.user_id AND eu.active AND eu.account_kind='staff') AND EXISTS(SELECT 1 FROM role_permissions ep WHERE ep.role_key=${m}.role AND ep.permission='leasing.manage') AND (${m}.role='organization_admin' OR (EXISTS(SELECT 1 FROM property_access_assignments ea WHERE ea.organization_id=${t}.organization_id AND ea.property_id=${t}.property_id AND ea.membership_id=${m}.id) AND NOT EXISTS(SELECT 1 FROM lead_property_interests ei WHERE ei.organization_id=${t}.organization_id AND ei.lead_id=${t}.lead_id AND NOT EXISTS(SELECT 1 FROM property_access_assignments eia WHERE eia.organization_id=ei.organization_id AND eia.property_id=ei.property_id AND eia.membership_id=${m}.id))))`;
const joins = `JOIN properties p ON p.id=t.property_id AND p.organization_id=t.organization_id LEFT JOIN contacts c ON c.id=t.contact_id AND c.organization_id=t.organization_id LEFT JOIN leads l ON l.id=t.lead_id AND l.organization_id=t.organization_id LEFT JOIN units un ON un.id=l.unit_id AND un.organization_id=l.organization_id LEFT JOIN viewings v ON v.id=t.tour_id AND v.organization_id=t.organization_id AND v.property_id=t.property_id AND v.lead_id=t.lead_id LEFT JOIN applications ap ON ap.id=t.application_id AND ap.organization_id=t.organization_id AND ap.property_id=t.property_id AND ap.contact_id=t.contact_id AND ap.lead_id IS NOT DISTINCT FROM t.lead_id LEFT JOIN organization_memberships om ON om.id=t.owner_membership_id AND om.organization_id=t.organization_id LEFT JOIN users ou ON ou.id=om.user_id LEFT JOIN users cu ON cu.id=t.completed_by_user_id LEFT JOIN task_teams tt ON tt.id=t.team_id AND tt.organization_id=t.organization_id`;
const select = `t.*,p.name AS property_name,p.property_type AS property_type,c.display_name AS contact_name,l.pipeline_stage,l.intent,un.bedrooms AS unit_bedrooms,om.user_id AS owner_user_id,om.role AS owner_role,ou.display_name AS owner_name,cu.display_name AS completer_name,tt.name AS team_name,ap.id AS linked_application_id,ap.status AS linked_application_status,v.id AS linked_tour_id,v.status AS linked_tour_status,v.starts_at AS linked_tour_starts_at,(${relevant('t', 'l', 'v')}) AS actionable`;
function unitDescription(r: Row): string | null {
    if (r.unit_bedrooms === null || r.unit_bedrooms === undefined) return null;
    const names: Record<string,string> = { apartment: 'apartment', apartments: 'apartment', townhome: 'townhome', townhomes: 'townhome', townhouse: 'townhouse', townhouses: 'townhouse', condo: 'condo', condominium: 'condominium', house: 'house', houses: 'house', single_family: 'home' };
    const noun=names[String(r.property_type).toLowerCase()]??'unit';
    return r.unit_bedrooms===0?'Studio '+noun:r.unit_bedrooms+'-bedroom '+noun;
}
const dto = (r: Row): TaskRecord => { const label = [...leasingStages, ...salesStages].find(s => s.key === r.pipeline_stage)?.label ?? null; const lead = r.lead_id ? `/admin/leads?lead=${r.lead_id}` : null; return { id: r.id, purpose: r.purpose ?? 'crm', propertyId: r.property_id, propertyName: r.property_name, leadId: r.lead_id, contactId: r.contact_id, contactName: r.contact_name ?? null, applicationId: r.application_id, tourId: r.tour_id, title: r.title, details: r.details, dueAt: iso(r.due_at)!, overdue: r.status === 'open' && new Date(r.due_at).getTime() < Date.now(), priority: r.priority, status: r.status, origin: r.origin, owner: r.owner_membership_id ? { membershipId: r.owner_membership_id, userId: r.owner_user_id, name: r.owner_name, role: r.owner_role } : null, team: r.team_id ? { id: r.team_id, name: r.team_name } : null, assignment: r.assignment, assignmentNotice: r.assignment_notice, version: r.version, createdAt: iso(r.created_at)!, updatedAt: iso(r.updated_at)!, completedAt: iso(r.completed_at), completedBy: r.completed_by_user_id ? { id: r.completed_by_user_id, name: r.completer_name } : null, relatedUrl: r.purpose==='move_in'&&r.application_id ? '/admin/applications?application='+r.application_id : lead ?? (r.contact_id ? `/admin/contacts?contact=${r.contact_id}` : `/admin/properties?property=${r.property_id}`), relatedLabel: r.purpose==='move_in'&&r.application_id ? 'Open lease and move-in' : r.application_id ? (r.lead_id?'Open lead context for application':'Open contact context for application') : r.tour_id ? 'Open lead context for tour' : r.lead_id ? 'Open lead' : r.contact_id ? 'Open contact' : 'Open property', linkedRecord:r.application_id?{kind:'application',id:r.application_id,status:r.linked_application_status??null,startsAt:null,available:Boolean(r.linked_application_id)}:r.tour_id?{kind:'tour',id:r.tour_id,status:r.linked_tour_status??null,startsAt:iso(r.linked_tour_starts_at),available:Boolean(r.linked_tour_id)}:undefined, leadStage: r.pipeline_stage ?? null, leadStageLabel: label, unitDescription: unitDescription(r), actionable: r.actionable }; };
const missing = (): never => { throw new ApiError(404, 'TASK_NOT_FOUND', 'This task is unavailable or outside your assigned property access.'); };
function translate(e: unknown): never { if (e instanceof ApiError)
    throw e; const code = (e as {
    code?: string;
})?.code; if (['23503', '23514', '23505'].includes(code ?? ''))
    throw new ApiError(400, 'INVALID_RELATIONSHIP', 'Use valid task records, teams and owners from this organization and property context.'); throw e; }
const permission = (u: AuthUser) => { if (!u.permissions.includes('leasing.manage'))
    throw new ApiError(403, 'TASK_ACCESS_DENIED', 'Task details require authorized staff with lead-management access.'); };
const policy = { channel: 'in_app', maximumAttempts: 3, maximumSnoozes: 3, snoozeMinutes: [15, 60, 1440], maximumSnoozeDays: 7 } as const;
export class Tasks {
    constructor(private readonly database: Database) { }
    private async authorize(c: PoolClient, u: AuthUser): Promise<AuthUser> { const m = (await c.query<{
        role: OrganizationRole;
    }>(`SELECT m.role FROM organization_memberships m JOIN users u ON u.id=m.user_id AND u.active AND u.account_kind='staff' WHERE m.id=$1 AND m.organization_id=$2 AND m.user_id=$3 AND m.active AND EXISTS(SELECT 1 FROM role_permissions rp WHERE rp.role_key=m.role AND rp.permission='leasing.manage') FOR SHARE OF m,u`, [u.membershipId, u.organization.id, u.id])).rows[0]; if (!m)
        throw new ApiError(403, 'TASK_ACCESS_DENIED', 'Your current membership cannot manage tasks.'); return { ...u, organization: { ...u.organization, role: m.role } }; }
    private async write<T>(u: AuthUser, fn: (c: PoolClient, a: AuthUser) => Promise<T>): Promise<T> { return this.database.transaction(async (c) => { try {
        return await fn(c, await this.authorize(c, u));
    }
    catch (e) {
        return translate(e);
    } }); }
    private async lockContext(c: PoolClient, u: AuthUser, propertyId: string, leadId: string | null): Promise<void> { const ids = leadId ? (await c.query('SELECT property_id FROM lead_property_interests WHERE organization_id=$1 AND lead_id=$2 ORDER BY property_id FOR SHARE', [u.organization.id, leadId])).rows.map(r => String(r.property_id)) : []; for (const property of [...new Set([propertyId, ...ids])].sort()) {
        if (!(await c.query(`SELECT p.id FROM properties p WHERE p.organization_id=$1 AND p.id=$4 AND ($2='organization_admin' OR EXISTS(SELECT 1 FROM property_access_assignments pa WHERE pa.organization_id=p.organization_id AND pa.property_id=p.id AND pa.membership_id=$3)) FOR SHARE OF p`, [...parameters(u), property])).rowCount)
            throw new ApiError(403, 'PROPERTY_ACCESS_DENIED', 'Every related property must be within your assigned staff access.');
        if (u.organization.role !== 'organization_admin' && !(await c.query('SELECT property_id FROM property_access_assignments WHERE organization_id=$1 AND membership_id=$2 AND property_id=$3 FOR SHARE', [u.organization.id, u.membershipId, property])).rowCount)
            throw new ApiError(403, 'PROPERTY_ACCESS_DENIED', 'Your assigned property access changed.');
    } }
    private async fetch(q: Queryable, u: AuthUser, id: string): Promise<TaskRecord> { const r = (await q.query(`SELECT ${select} FROM tasks t ${joins} WHERE ${scope('t')} AND t.id=$4`, [...parameters(u), id])).rows[0]; if (!r)
        missing(); return dto(r); }
    private async event(c: PoolClient, u: AuthUser, t: Row, kind: TaskEvent['kind'], metadata: Record<string, unknown>): Promise<void> { await c.query('INSERT INTO task_events(organization_id,task_id,kind,actor_user_id,actor_membership_id,metadata) VALUES($1,$2,$3,$4,$5,$6)', [u.organization.id, t.id, kind, u.id, u.membershipId, JSON.stringify(metadata)]); await c.query('INSERT INTO audit_events(organization_id,actor_user_id,action,metadata) VALUES($1,$2,$3,$4)', [u.organization.id, u.id, `task.${kind}`, JSON.stringify({ taskId: t.id, ...metadata })]); if (t.lead_id)
        await c.query(`INSERT INTO lead_workspace_events(organization_id,lead_id,property_id,contact_id,kind,summary,actor_user_id,actor_membership_id,metadata) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [u.organization.id, t.lead_id, t.property_id, t.contact_id, kind === 'created' ? 'task_created' : 'task_updated', t.title, u.id, u.membershipId, JSON.stringify({ taskId: t.id, event: kind, ...metadata })]); }
    private async owner(c: PoolClient, u: AuthUser, t: Row, id: string | null): Promise<void> { if (!id)
        return; const m = (await c.query(`SELECT m.id,m.role FROM organization_memberships m JOIN users u ON u.id=m.user_id AND u.active AND u.account_kind='staff' WHERE m.id=$1 AND m.organization_id=$2 AND m.active AND EXISTS(SELECT 1 FROM role_permissions rp WHERE rp.role_key=m.role AND rp.permission='leasing.manage') FOR SHARE OF m,u`, [id, u.organization.id])).rows[0]; if (!m)
        throw new ApiError(400, 'INVALID_OWNER', 'Choose an active authorized staff member.'); if (m.role !== 'organization_admin') {
        const interests = t.lead_id ? (await c.query('SELECT property_id FROM lead_property_interests WHERE organization_id=$1 AND lead_id=$2 ORDER BY property_id FOR SHARE', [u.organization.id, t.lead_id])).rows.map(r => String(r.property_id)) : [];
        const ids = [...new Set([t.property_id, ...interests])];
        if ((await c.query('SELECT property_id FROM property_access_assignments WHERE organization_id=$1 AND membership_id=$2 AND property_id=ANY($3::uuid[]) FOR SHARE', [u.organization.id, id, ids])).rowCount !== ids.length)
            throw new ApiError(400, 'INVALID_OWNER', 'The assigned agent needs access to every related property.');
    } }
    private async route(c: PoolClient, u: AuthUser, t: Row): Promise<{
        owner: string | null;
        team: string | null;
        notice: string | null;
    }> { await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`ootla.task.routing:${u.organization.id}:${t.property_id}`]); const rule = (await c.query('SELECT * FROM task_routing_rules WHERE organization_id=$1 AND property_id=$2 AND enabled FOR SHARE', [u.organization.id, t.property_id])).rows[0]; if (!rule)
        return { owner: null, team: null, notice: 'No enabled routing rule. Work remains unassigned.' }; if(rule.team_id) await c.query('SELECT id FROM task_teams WHERE organization_id=$1 AND id=$2 FOR SHARE',[u.organization.id,rule.team_id]); const candidates = (await c.query(`SELECT m.id FROM organization_memberships m CROSS JOIN (SELECT $1::uuid AS organization_id,$2::uuid AS property_id,$3::uuid AS lead_id) ctx WHERE m.organization_id=$1 AND (${eligible('m', 'ctx')}) AND ($4::uuid IS NULL OR EXISTS(SELECT 1 FROM task_team_members tm WHERE tm.organization_id=m.organization_id AND tm.team_id=$4 AND tm.membership_id=m.id)) ORDER BY (SELECT count(*) FROM tasks ot WHERE ot.organization_id=m.organization_id AND ot.owner_membership_id=m.id AND ot.status='open'),m.id LIMIT 100`, [u.organization.id, t.property_id, t.lead_id, rule.team_id])).rows; for (const candidate of candidates) {
        try {
            await this.owner(c, u, t, candidate.id);
            return { owner: candidate.id, team: rule.team_id, notice: null };
        }
        catch (e) {
            if (!(e instanceof ApiError) || e.code !== 'INVALID_OWNER')
                throw e;
        }
    } return { owner: null, team: rule.team_id, notice: 'No eligible agent is available for the configured property/team. Work remains unassigned.' }; }
    private async schedule(c: PoolClient, t: Row): Promise<void> { if (t.status !== 'open' || !t.owner_membership_id)
        return; await c.query(`INSERT INTO task_reminders(organization_id,task_id,generation,recipient_membership_id,scheduled_at,next_attempt_at) SELECT t.organization_id,t.id,t.reminder_generation,t.owner_membership_id,t.due_at,t.due_at FROM tasks t LEFT JOIN leads l ON l.id=t.lead_id AND l.organization_id=t.organization_id LEFT JOIN viewings v ON v.id=t.tour_id AND v.organization_id=t.organization_id JOIN organization_memberships m ON m.id=t.owner_membership_id AND m.organization_id=t.organization_id WHERE t.id=$1 AND ${relevant('t', 'l', 'v')} AND ${eligible('m', 't')} ON CONFLICT(task_id,generation,recipient_membership_id) DO NOTHING`, [t.id]); }
    async list(u: AuthUser, p: z.infer<typeof taskDirectorySchema>): Promise<TaskDirectory> { permission(u); const values = parameters(u), parts = [scope('t')]; const add = (sql: string, v: unknown) => { values.push(v); parts.push(sql.replace('?', `$${values.length}`)); }; if (p.view === 'my')
        add('t.owner_membership_id=?', u.membershipId); if (p.view === 'unassigned')
        parts.push('t.owner_membership_id IS NULL'); if (p.propertyId)
        add('t.property_id=?', p.propertyId); if (p.ownerMembershipId)
        add('t.owner_membership_id=?', p.ownerMembershipId); if (p.teamId)
        add('t.team_id=?', p.teamId); if (p.status !== 'all')
        add('t.status=?', p.status); if (p.priority)
        add('t.priority=?', p.priority); if (p.overdue)
        parts.push(`t.status='open' AND t.due_at${p.overdue === 'true' ? '<' : '>='}now()`); if (p.q) {
        values.push(`%${p.q.replace(/[\\%_]/g, '\\$&')}%`);
        parts.push(`(t.title ILIKE $${values.length} OR p.name ILIKE $${values.length} OR c.display_name ILIKE $${values.length})`);
    } const where = parts.join(' AND '); const total = Number((await this.database.query(`SELECT count(*) AS total FROM tasks t ${joins} WHERE ${where}`, values)).rows[0]?.total ?? 0); const order = { due_asc: 't.due_at ASC,t.id', due_desc: 't.due_at DESC,t.id', created_desc: 't.created_at DESC,t.id' }[p.sort]; values.push(p.pageSize, (p.page - 1) * p.pageSize); const rows = (await this.database.query(`SELECT ${select} FROM tasks t ${joins} WHERE ${where} ORDER BY ${order} LIMIT $${values.length - 1} OFFSET $${values.length}`, values)).rows; return { ...paged(rows.map(dto), total, p), access: { canManage: true, canConfigure: u.organization.role === 'organization_admin' } }; }
    async detail(u: AuthUser, id: string, p: Page): Promise<TaskDetail> { permission(u); const task = await this.fetch(this.database, u, id); const total = Number((await this.database.query('SELECT count(*) AS total FROM task_events WHERE organization_id=$1 AND task_id=$2', [u.organization.id, id])).rows[0]?.total ?? 0); const rows = (await this.database.query('SELECT e.*,u.display_name AS actor_name FROM task_events e LEFT JOIN users u ON u.id=e.actor_user_id WHERE e.organization_id=$1 AND e.task_id=$2 ORDER BY e.occurred_at DESC,e.id LIMIT $3 OFFSET $4', [u.organization.id, id, p.pageSize, (p.page - 1) * p.pageSize])).rows; return { task, history: paged(rows.map(r => ({ id: r.id, kind: r.kind, actor: r.actor_user_id ? { id: r.actor_user_id, name: r.actor_name } : null, occurredAt: iso(r.occurred_at)!, metadata: r.metadata })), total, p), access: { canManage: true } }; }
    async followups(u: AuthUser, stages: string[], q = ''): Promise<{
        items: TaskRecord[];
        limit: 3;
    }> { if (!u.permissions.includes('leasing.manage'))
        return { items: [], limit: 3 }; const values = parameters(u), parts = [scope('t'), relevant('t', 'l', 'v')]; const legacy: Record<string, string> = { new: 'new_inquiry', viewing_scheduled: 'tour_scheduled', qualified: 'qualified' }; const canonical = stages.map(key => legacy[key] ?? key); if (canonical.length) {
        values.push(canonical);
        parts.push('l.pipeline_stage=ANY($' + values.length + '::text[])');
    } if (q) {
        values.push('%' + q.replace(/[\\%_]/g, '\\$&') + '%');
        parts.push('(t.title ILIKE $' + values.length + ' OR p.name ILIKE $' + values.length + ' OR c.display_name ILIKE $' + values.length + ')');
    } const rows = (await this.database.query(`WITH actionable AS(SELECT ${select},row_number() OVER(PARTITION BY COALESCE(t.lead_id,t.id) ORDER BY t.due_at,t.id) AS lead_rank FROM tasks t ${joins} WHERE ${parts.join(' AND ')}) SELECT * FROM actionable WHERE lead_rank=1 ORDER BY due_at,id LIMIT 3`, values)).rows; return { items: rows.map(dto), limit: 3 }; }
    async create(u: AuthUser, i: z.infer<typeof taskCreateSchema>): Promise<TaskRecord> {
        return this.write(u, (c,a) => this.createRow(c,a,i,'manual','crm'));
    }
    /** Internal domain-service entry point; the HTTP task schema cannot set origin/purpose or receipts. */
    async createLinked(c:PoolClient,u:AuthUser,input:z.infer<typeof taskCreateSchema>,options:TaskCreationOptions):Promise<TaskRecord> {
        const a=await this.authorize(c,u),parsed=parseTaskCreate.safeParse(input);
        if(!parsed.success)throw new ApiError(400,'INVALID_TASK','Use valid task fields and related records.');
        if(!['lease_move_in','ai_follow_up','inspection_repair','leasing_workflow'].includes(options.namespace)||!['system','ai_simulation'].includes(options.origin)||!['crm','move_in'].includes(options.purpose)||!options.requestKey||options.requestKey.length>200||!(/^[a-zA-Z0-9:_-]+$/).test(options.requestKey)||options.namespace==='lease_move_in'&&(options.purpose!=='move_in'||options.origin!=='system'||!parsed.data.applicationId)||options.namespace==='ai_follow_up'&&options.purpose!=='crm'||options.namespace==='inspection_repair'&&(options.purpose!=='crm'||options.origin!=='system'||Boolean(parsed.data.leadId)))throw new ApiError(400,'INVALID_TASK_OPERATION','Use a supported internal task operation.');
        const i=parsed.data,payloadHash=createHash('sha256').update(JSON.stringify({input:i,origin:options.origin,purpose:options.purpose})).digest('hex');
        await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['ootla.task.once:'+a.organization.id+':'+options.namespace+':'+options.requestKey]);
        const receipt=(await c.query('SELECT payload_hash,task_id FROM task_creation_receipts WHERE organization_id=$1 AND namespace=$2 AND request_key=$3',[a.organization.id,options.namespace,options.requestKey])).rows[0];
        if(receipt){if(receipt.payload_hash!==payloadHash)throw new ApiError(409,'TASK_REQUEST_CONFLICT','This task request key was already used for different fields.');return this.fetch(c,a,receipt.task_id);}
        const task=await this.createRow(c,a,i,options.origin,options.purpose);
        await c.query('INSERT INTO task_creation_receipts(organization_id,namespace,request_key,payload_hash,task_id,actor_user_id) VALUES($1,$2,$3,$4,$5,$6)',[a.organization.id,options.namespace,options.requestKey,payloadHash,task.id,a.id]);
        return task;
    }
    async createOnce(u:AuthUser,input:z.infer<typeof taskCreateSchema>,options:TaskCreationOptions):Promise<TaskRecord>{return this.write(u,(c,a)=>this.createLinked(c,a,input,options));}
    private async createRow(c:PoolClient,a:AuthUser,i:z.infer<typeof taskCreateSchema>,origin:'manual'|'system'|'ai_simulation',purpose:'crm'|'move_in'):Promise<TaskRecord>{
            let leadId = i.leadId, contactId = i.contactId;
            for (const [table, ref] of [['applications', i.applicationId], ['viewings', i.tourId]] as const) {
                if (!ref)
                    continue;
                const linked = (await c.query(`SELECT * FROM ${table} WHERE organization_id=$1 AND property_id=$2 AND id=$3 FOR SHARE`, [a.organization.id, i.propertyId, ref])).rows[0];
                if (!linked)
                    throw new ApiError(400, 'INVALID_RELATIONSHIP', 'Choose a related record at this property.');
                if (leadId && leadId !== linked.lead_id)
                    throw new ApiError(400, 'INVALID_RELATIONSHIP', 'Related records must use the same lead.');
                leadId = linked.lead_id;
                if (table === 'applications') {
                    if (contactId && contactId !== linked.contact_id)
                        throw new ApiError(400, 'INVALID_RELATIONSHIP', 'Related records must use the same contact.');
                    contactId = linked.contact_id;
                }
            }
            if (leadId) {
                const lead = (await c.query('SELECT * FROM leads WHERE organization_id=$1 AND property_id=$2 AND id=$3 FOR SHARE', [a.organization.id, i.propertyId, leadId])).rows[0];
                if (!lead || (contactId && contactId !== lead.contact_id))
                    throw new ApiError(400, 'INVALID_RELATIONSHIP', 'Choose the canonical contact belonging to this lead.');
                contactId = lead.contact_id;
            }
            await this.lockContext(c, a, i.propertyId, leadId);
            if (contactId && !(await c.query('SELECT contact_id FROM contact_property_links WHERE organization_id=$1 AND property_id=$2 AND contact_id=$3 FOR SHARE', [a.organization.id, i.propertyId, contactId])).rowCount)
                throw new ApiError(400, 'INVALID_RELATIONSHIP', 'This contact is not associated with the task property.');
            const context = { property_id: i.propertyId, lead_id: leadId };
            const route = i.assignment === 'routing' ? await this.route(c, a, context) : { owner: i.ownerMembershipId, team: null, notice: null };
            await this.owner(c, a, context, route.owner);
            const row = (await c.query(`INSERT INTO tasks(organization_id,property_id,lead_id,contact_id,application_id,tour_id,title,details,due_at,priority,status,origin,owner_membership_id,team_id,assignment,assignment_notice,created_by_user_id,created_by_membership_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'open',$17,$11,$12,$13,$14,$15,$16) RETURNING *`, [a.organization.id, i.propertyId, leadId, contactId, i.applicationId, i.tourId, i.title, i.details, i.dueAt, i.priority, route.owner, route.team, i.assignment, route.notice, a.id, a.membershipId, origin])).rows[0]!;
            if (purpose === 'move_in') await c.query("UPDATE tasks SET purpose='move_in' WHERE id=$1 AND organization_id=$2", [row.id,a.organization.id]);
            await this.event(c, a, row, 'created', { dueAt: i.dueAt, ownerMembershipId: route.owner, priority: i.priority, origin, purpose });
            await this.schedule(c, row);
            return this.fetch(c, a, row.id);

    }
    async update(u: AuthUser, id: string, i: z.infer<typeof taskUpdateSchema>): Promise<TaskRecord> { return this.write(u, async (c, a) => { const old = (await c.query(`SELECT t.* FROM tasks t WHERE ${scope('t')} AND t.id=$4 FOR UPDATE OF t`, [...parameters(a), id])).rows[0]; if (!old)
        missing(); await this.lockContext(c, a, old.property_id, old.lead_id); if (old.version !== i.version)
        throw new ApiError(409, 'TASK_VERSION_CONFLICT', 'This task changed. Refresh before saving.'); let owner = i.ownerMembershipId === undefined ? old.owner_membership_id : i.ownerMembershipId; let team = old.team_id, notice = old.assignment_notice, assignment = i.assignment ?? (i.ownerMembershipId !== undefined ? 'manual' : old.assignment); if (i.assignment === 'routing') {
        const routed = await this.route(c, a, old);
        owner = routed.owner;
        team = routed.team;
        notice = routed.notice;
    }
    else if (i.ownerMembershipId !== undefined) {
        team = null;
        notice = null;
    } if (i.ownerMembershipId !== undefined || i.assignment === 'routing')
        await this.owner(c, a, old, owner); const status = i.status ?? old.status; const statusChanged = status !== old.status; const newGeneration = statusChanged || owner !== old.owner_membership_id || (i.dueAt !== undefined && new Date(i.dueAt).getTime() !== new Date(old.due_at).getTime()); const row = (await c.query(`UPDATE tasks SET title=$1,details=$2,due_at=$3,priority=$4,status=$5,owner_membership_id=$6,team_id=$7,assignment=$8,assignment_notice=$9,version=version+1,reminder_generation=reminder_generation+$10,completed_at=CASE WHEN $11 THEN CASE WHEN $5='completed' THEN now() ELSE NULL END ELSE completed_at END,completed_by_user_id=CASE WHEN $11 THEN CASE WHEN $5='completed' THEN $12::uuid ELSE NULL END ELSE completed_by_user_id END,completed_by_membership_id=CASE WHEN $11 THEN CASE WHEN $5='completed' THEN $13::uuid ELSE NULL END ELSE completed_by_membership_id END,updated_at=now() WHERE id=$14 AND organization_id=$15 RETURNING *`, [i.title ?? old.title, i.details ?? old.details, i.dueAt ?? old.due_at, i.priority ?? old.priority, status, owner, team, assignment, notice, newGeneration ? 1 : 0, statusChanged, a.id, a.membershipId, id, a.organization.id])).rows[0]!; const kind: TaskEvent['kind'] = statusChanged ? (status === 'completed' ? 'completed' : status === 'cancelled' ? 'cancelled' : 'reopened') : owner !== old.owner_membership_id ? 'assigned' : 'updated'; await this.event(c, a, row, kind, { fields: Object.keys(i).filter(k => k !== 'version'), previousStatus: old.status, status, previousOwnerMembershipId: old.owner_membership_id, ownerMembershipId: owner, dueAt: iso(row.due_at) }); await this.schedule(c, row); return this.fetch(c, a, id); }); }
    async options(u: AuthUser, propertyId?: string, leadId?: string,q=''): Promise<TaskOptions> {
        permission(u);
        if (leadId && !propertyId) {
            const l = (await this.database.query('SELECT property_id FROM leads WHERE organization_id=$1 AND id=$2', [u.organization.id, leadId])).rows[0];
            if (!l)
                throw new ApiError(404, 'LEAD_NOT_FOUND', 'This lead is unavailable.');
            propertyId = l.property_id;
        }
        if (propertyId)
            await this.database.transaction(c => this.lockContext(c, u, propertyId!, leadId ?? null));
        const vals: unknown[] = [u.organization.id,propertyId??null,leadId??null,escapedLike(q)];
        const where = `m.organization_id=$1 AND m.active AND u.active AND u.account_kind='staff' AND (u.display_name ILIKE $4 OR u.email ILIKE $4) AND EXISTS(SELECT 1 FROM role_permissions rp WHERE rp.role_key=m.role AND rp.permission='leasing.manage') AND ($2::uuid IS NULL OR m.role='organization_admin' OR (EXISTS(SELECT 1 FROM property_access_assignments pa WHERE pa.organization_id=m.organization_id AND pa.membership_id=m.id AND pa.property_id=$2) AND NOT EXISTS(SELECT 1 FROM lead_property_interests li WHERE li.organization_id=m.organization_id AND li.lead_id=$3 AND NOT EXISTS(SELECT 1 FROM property_access_assignments la WHERE la.organization_id=li.organization_id AND la.property_id=li.property_id AND la.membership_id=m.id))))`;
        const ownerTotal = Number((await this.database.query(`SELECT count(*) AS total FROM organization_memberships m JOIN users u ON u.id=m.user_id WHERE ${where}`, vals)).rows[0]?.total ?? 0);
        const owners = (await this.database.query(`SELECT m.id,m.user_id,m.role,u.display_name FROM organization_memberships m JOIN users u ON u.id=m.user_id WHERE ${where} ORDER BY lower(u.display_name),m.id LIMIT 100`, vals)).rows.map(r => ({ membershipId: r.id, userId: r.user_id, name: r.display_name, role: r.role }));
        const teams = (await this.database.query(`SELECT t.id,t.name,COALESCE((SELECT jsonb_agg(tm.membership_id ORDER BY tm.membership_id) FROM task_team_members tm WHERE tm.team_id=t.id AND tm.organization_id=t.organization_id),'[]'::jsonb) AS members FROM task_teams t WHERE organization_id=$1 ORDER BY lower(name),id LIMIT 100`, [u.organization.id])).rows.map(r => ({ id: r.id, name: r.name, membershipIds: r.members }));
        const rules = (await this.database.query(`SELECT r.*,p.name AS property_name,t.name AS team_name FROM task_routing_rules r JOIN properties p ON p.id=r.property_id AND p.organization_id=r.organization_id LEFT JOIN task_teams t ON t.id=r.team_id AND t.organization_id=r.organization_id WHERE r.organization_id=$1 AND ($2='organization_admin' OR EXISTS(SELECT 1 FROM property_access_assignments pa WHERE pa.organization_id=r.organization_id AND pa.property_id=r.property_id AND pa.membership_id=$3)) AND ($4::uuid IS NULL OR r.property_id=$4) ORDER BY lower(p.name),r.id LIMIT 100`, [...parameters(u), propertyId ?? null])).rows.map(r => ({ id: r.id, propertyId: r.property_id, propertyName: r.property_name, teamId: r.team_id, teamName: r.team_name, enabled: r.enabled }));
        return { owners, ownerTotal, teams, rules, access: { canManage: true, canConfigure: u.organization.role === 'organization_admin' }, reminderPolicy: policy };
    }
    async relatedOptions(u: AuthUser, propertyId: string, leadId?: string, q = ''): Promise<{
        tours: {
            id: string;
            leadId: string;
            startsAt: string;
            status: string;
        }[];
        applications: {
            id: string;
            leadId: string | null;
            contactId: string;
            status: string;
        }[];
    }> { permission(u); await this.database.transaction(c => this.lockContext(c, u, propertyId, leadId ?? null)); const args = [...parameters(u),propertyId,leadId??null,escapedLike(q)]; const tours = (await this.database.query(`SELECT v.* FROM viewings v WHERE ${scope('v')} AND v.property_id=$4 AND ($5::uuid IS NULL OR v.lead_id=$5) AND (v.id::text ILIKE $6 OR v.status ILIKE $6 OR v.starts_at::text ILIKE $6 OR EXISTS(SELECT 1 FROM leads ql JOIN contacts qc ON qc.id=ql.contact_id AND qc.organization_id=ql.organization_id WHERE ql.id=v.lead_id AND ql.organization_id=v.organization_id AND qc.display_name ILIKE $6)) ORDER BY v.starts_at DESC,v.id LIMIT 50`, args)).rows.map(r => ({ id: r.id, leadId: r.lead_id, startsAt: iso(r.starts_at)!, status: r.status })); const applications = (await this.database.query(`SELECT a.* FROM applications a WHERE ${scope('a')} AND a.property_id=$4 AND ($5::uuid IS NULL OR a.lead_id=$5) AND (a.id::text ILIKE $6 OR a.status ILIKE $6 OR EXISTS(SELECT 1 FROM contacts qc WHERE qc.id=a.contact_id AND qc.organization_id=a.organization_id AND qc.display_name ILIKE $6)) ORDER BY a.created_at DESC,a.id LIMIT 50`, args)).rows.map(r => ({ id: r.id, leadId: r.lead_id, contactId: r.contact_id, status: r.status })); return { tours, applications }; }
    async team(u: AuthUser, input: z.infer<typeof taskTeamSchema>, id?: string): Promise<TaskTeam> { return this.write(u, async (c, a) => { if (a.organization.role !== 'organization_admin')
        throw new ApiError(403, 'ADMIN_REQUIRED', 'Only an organization administrator can configure task teams.'); for (const member of input.membershipIds) {
        if (!(await c.query(`SELECT m.id FROM organization_memberships m JOIN users u ON u.id=m.user_id AND u.active AND u.account_kind='staff' WHERE m.id=$1 AND m.organization_id=$2 AND m.active AND EXISTS(SELECT 1 FROM role_permissions rp WHERE rp.role_key=m.role AND rp.permission='leasing.manage') FOR SHARE OF m,u`, [member, a.organization.id])).rowCount)
            throw new ApiError(400, 'INVALID_TEAM_MEMBER', 'Team members must be active authorized staff in this organization.');
    } let team: Row; if (id) {
        const previous = (await c.query('SELECT * FROM task_teams WHERE organization_id=$1 AND id=$2 FOR UPDATE', [a.organization.id, id])).rows[0];
        if (!previous)
            throw new ApiError(404, 'TEAM_NOT_FOUND', 'This task team is unavailable.');
        team = (await c.query('UPDATE task_teams SET name=$1 WHERE organization_id=$2 AND id=$3 RETURNING *', [input.name, a.organization.id, id])).rows[0]!;
        await c.query('DELETE FROM task_team_members WHERE organization_id=$1 AND team_id=$2', [a.organization.id, id]);
    }
    else
        team = (await c.query('INSERT INTO task_teams(organization_id,name) VALUES($1,$2) RETURNING *', [a.organization.id, input.name])).rows[0]!; for (const member of input.membershipIds)
        await c.query('INSERT INTO task_team_members(organization_id,team_id,membership_id) VALUES($1,$2,$3)', [a.organization.id, team.id, member]); await c.query('INSERT INTO audit_events(organization_id,actor_user_id,action,metadata) VALUES($1,$2,$3,$4)', [a.organization.id, a.id, id ? 'task_team.updated' : 'task_team.created', JSON.stringify({ teamId: team.id, membershipIds: input.membershipIds })]); return { id: team.id, name: team.name, membershipIds: input.membershipIds }; }); }
    async routing(u: AuthUser, i: z.infer<typeof taskRoutingSchema>): Promise<TaskRoutingRule> { return this.write(u, async (c, a) => { if (a.organization.role !== 'organization_admin')
        throw new ApiError(403, 'ADMIN_REQUIRED', 'Only an organization administrator can configure task routing.'); await this.lockContext(c, a, i.propertyId, null); if (i.teamId && !(await c.query('SELECT id FROM task_teams WHERE organization_id=$1 AND id=$2 FOR SHARE', [a.organization.id, i.teamId])).rowCount)
        throw new ApiError(400, 'INVALID_TEAM', 'Choose a team from this organization.'); const r = (await c.query(`INSERT INTO task_routing_rules(organization_id,property_id,team_id,enabled) VALUES($1,$2,$3,$4) ON CONFLICT(organization_id,property_id) DO UPDATE SET team_id=EXCLUDED.team_id,enabled=EXCLUDED.enabled,updated_at=now() RETURNING *`, [a.organization.id, i.propertyId, i.teamId, i.enabled])).rows[0]!; await c.query('INSERT INTO audit_events(organization_id,actor_user_id,action,metadata) VALUES($1,$2,$3,$4)', [a.organization.id, a.id, 'task_routing.configured', JSON.stringify({ ruleId: r.id, ...i })]); const p = (await c.query('SELECT name FROM properties WHERE organization_id=$1 AND id=$2', [a.organization.id, i.propertyId])).rows[0]!; const team = i.teamId ? (await c.query('SELECT name FROM task_teams WHERE organization_id=$1 AND id=$2', [a.organization.id, i.teamId])).rows[0] : null; return { id: r.id, propertyId: r.property_id, propertyName: p.name, teamId: r.team_id, teamName: team?.name ?? null, enabled: r.enabled }; }); }
    private reminderDto(r: Row): TaskReminder { return { id: r.id, taskId: r.task_id, title: r.title, dueAt: iso(r.due_at)!, propertyName: r.property_name, relatedUrl: r.lead_id ? `/admin/leads?lead=${r.lead_id}` : r.contact_id ? `/admin/contacts?contact=${r.contact_id}` : `/admin/properties?property=${r.property_id}`, deliveredAt: iso(r.delivered_at), status: r.status === 'delivered' ? 'delivered' : 'snoozed', snoozedUntil: iso(r.snoozed_until), snoozeCount: r.snooze_count, canSnooze: r.status === 'delivered' && r.snooze_count < 3 && Date.now()+15*60000<=new Date(r.first_delivered_at).getTime()+7*86400000 }; }
    async reminders(u: AuthUser, p: Page): Promise<Paginated<TaskReminder>> { permission(u); const where = `${scope('t')} AND r.recipient_membership_id=$3 AND r.generation=t.reminder_generation AND r.recipient_membership_id=t.owner_membership_id AND (r.status='delivered' OR (r.status='pending' AND r.snoozed_until>now())) AND ${relevant('t', 'l', 'v')} AND ${eligible('om', 't')} AND (t.assignment<>'routing' OR t.team_id IS NULL OR EXISTS(SELECT 1 FROM task_team_members tm WHERE tm.team_id=t.team_id AND tm.organization_id=t.organization_id AND tm.membership_id=om.id))`; const total = Number((await this.database.query(`SELECT count(*) AS total FROM task_reminders r JOIN task_notifications n ON n.reminder_id=r.id JOIN tasks t ON t.id=r.task_id AND t.organization_id=r.organization_id ${joins} WHERE ${where}`, parameters(u))).rows[0]?.total ?? 0); const rows = (await this.database.query(`SELECT r.*,n.created_at AS first_delivered_at,t.property_id,t.title,t.due_at,t.lead_id,t.contact_id,p.name AS property_name FROM task_reminders r JOIN task_notifications n ON n.reminder_id=r.id JOIN tasks t ON t.id=r.task_id AND t.organization_id=r.organization_id ${joins} WHERE ${where} ORDER BY COALESCE(r.delivered_at,r.created_at) DESC,r.id LIMIT $4 OFFSET $5`, [...parameters(u), p.pageSize, (p.page - 1) * p.pageSize])).rows; return paged(rows.map(r => this.reminderDto(r)), total, p); }
    async snooze(u: AuthUser, id: string, minutes: 15 | 60 | 1440): Promise<TaskReminder> { return this.write(u, async (c, a) => { await c.query(`SELECT t.id FROM tasks t JOIN task_reminders r ON r.task_id=t.id AND r.organization_id=t.organization_id WHERE ${scope('t')} AND r.id=$4 AND r.recipient_membership_id=$3 FOR UPDATE OF t`,[...parameters(a),id]); const r = (await c.query(`SELECT r.*,n.created_at AS first_delivered_at,t.title,t.property_id,t.lead_id,t.contact_id,t.due_at,p.name AS property_name FROM task_reminders r JOIN task_notifications n ON n.reminder_id=r.id JOIN tasks t ON t.id=r.task_id AND t.organization_id=r.organization_id ${joins} WHERE ${scope('t')} AND r.id=$4 AND r.recipient_membership_id=$3 AND r.recipient_membership_id=t.owner_membership_id AND r.generation=t.reminder_generation AND ${relevant('t', 'l', 'v')} AND ${eligible('om', 't')} AND (t.assignment<>'routing' OR t.team_id IS NULL OR EXISTS(SELECT 1 FROM task_team_members tm WHERE tm.team_id=t.team_id AND tm.organization_id=t.organization_id AND tm.membership_id=om.id)) FOR UPDATE OF r,t`, [...parameters(a), id])).rows[0]; if (!r)
        throw new ApiError(404, 'REMINDER_NOT_FOUND', 'This reminder is unavailable or belongs to another staff member.'); await this.lockContext(c, a, r.property_id, r.lead_id); if (![15,60,1440].includes(minutes)) throw new ApiError(400,'SNOOZE_POLICY_LIMIT','Choose a 15-minute, 1-hour or 1-day snooze.');
            if (r.status !== 'delivered' || r.snooze_count >= 3 || Date.now()+minutes*60000>new Date(r.first_delivered_at).getTime()+7*86400000)
        throw new ApiError(409, 'SNOOZE_POLICY_LIMIT', 'Only delivered reminders can be snoozed, up to three times within seven days of the first in-app delivery.'); const updated = (await c.query(`UPDATE task_reminders SET status='pending',snooze_count=snooze_count+1,snoozed_until=now()+($2::integer*interval '1 minute'),next_attempt_at=now()+($2::integer*interval '1 minute'),attempts=0 WHERE id=$1 RETURNING *`, [id, minutes])).rows[0]!; await this.event(c, a, { id: r.task_id, title: r.title, lead_id: r.lead_id, property_id: r.property_id, contact_id: r.contact_id }, 'reminder_snoozed', { reminderId: id, minutes, snoozedUntil: iso(updated.snoozed_until) }); return this.reminderDto({ ...r, ...updated }); }); }
}
/** One bounded in-app-only worker batch. Delivery is durable and idempotent across processes. */
export async function processTaskReminders(database: Database, options: {
    batchSize?: number;
} = {}): Promise<{
    enqueued: number;
    delivered: number;
    retried: number;
    failed: number;
    cancelled: number;
}> {
    const result = { enqueued: 0, delivered: 0, retried: 0, failed: 0, cancelled: 0 }, batch = Math.min(100, Math.max(1, Math.floor(options.batchSize ?? 50)));
    if (!database.pool)
        return result;
    const ready = await database.query<{
        ready: boolean;
    }>(`SELECT to_regclass('public.task_reminders') IS NOT NULL AS ready`);
    if (!ready.rows[0]?.ready)
        return result;
    return database.transaction(async (c) => {
        const valid = `r.generation=t.reminder_generation AND r.recipient_membership_id=t.owner_membership_id AND ${relevant('t', 'l', 'v')} AND ${eligible('m', 't')} AND (t.assignment<>'routing' OR t.team_id IS NULL OR EXISTS(SELECT 1 FROM task_team_members tm WHERE tm.team_id=t.team_id AND tm.organization_id=t.organization_id AND tm.membership_id=m.id))`;
        const cancelled = await c.query(`WITH stale AS(SELECT r.id FROM task_reminders r JOIN tasks t ON t.id=r.task_id AND t.organization_id=r.organization_id LEFT JOIN leads l ON l.id=t.lead_id AND l.organization_id=t.organization_id LEFT JOIN viewings v ON v.id=t.tour_id AND v.organization_id=t.organization_id LEFT JOIN organization_memberships m ON m.id=r.recipient_membership_id AND m.organization_id=r.organization_id WHERE r.status<>'cancelled' AND NOT COALESCE((${valid}),false) ORDER BY r.id LIMIT $1 FOR UPDATE OF r SKIP LOCKED) UPDATE task_reminders r SET status='cancelled',cancelled_at=now() FROM stale s WHERE r.id=s.id`, [batch]);
        result.cancelled = cancelled.rowCount ?? 0;
        const inserted = await c.query(`INSERT INTO task_reminders(organization_id,task_id,generation,recipient_membership_id,scheduled_at,next_attempt_at) SELECT t.organization_id,t.id,t.reminder_generation,t.owner_membership_id,t.due_at,t.due_at FROM tasks t JOIN organization_memberships m ON m.id=t.owner_membership_id AND m.organization_id=t.organization_id LEFT JOIN leads l ON l.id=t.lead_id AND l.organization_id=t.organization_id LEFT JOIN viewings v ON v.id=t.tour_id AND v.organization_id=t.organization_id WHERE ${relevant('t', 'l', 'v')} AND ${eligible('m', 't')} AND (t.assignment<>'routing' OR t.team_id IS NULL OR EXISTS(SELECT 1 FROM task_team_members tm WHERE tm.team_id=t.team_id AND tm.organization_id=t.organization_id AND tm.membership_id=m.id)) AND NOT EXISTS(SELECT 1 FROM task_reminders old WHERE old.task_id=t.id AND old.generation=t.reminder_generation AND old.recipient_membership_id=t.owner_membership_id) ORDER BY t.due_at,t.id LIMIT $1 ON CONFLICT(task_id,generation,recipient_membership_id) DO NOTHING`, [batch]);
        result.enqueued = inserted.rowCount ?? 0;
        const lockedTasks = (await c.query(`SELECT t.id FROM tasks t JOIN task_reminders r ON r.task_id=t.id AND r.organization_id=t.organization_id JOIN organization_memberships m ON m.id=r.recipient_membership_id AND m.organization_id=r.organization_id LEFT JOIN leads l ON l.id=t.lead_id AND l.organization_id=t.organization_id LEFT JOIN viewings v ON v.id=t.tour_id AND v.organization_id=t.organization_id WHERE r.status IN ('pending','retry') AND r.next_attempt_at<=now() AND r.attempts<3 AND ${valid} ORDER BY r.next_attempt_at,r.id LIMIT $1 FOR SHARE OF t SKIP LOCKED`, [batch])).rows.map(r => r.id);
        const due = lockedTasks.length ? (await c.query(`SELECT r.* FROM task_reminders r JOIN tasks t ON t.id=r.task_id AND t.organization_id=r.organization_id JOIN organization_memberships m ON m.id=r.recipient_membership_id AND m.organization_id=r.organization_id LEFT JOIN leads l ON l.id=t.lead_id AND l.organization_id=t.organization_id LEFT JOIN viewings v ON v.id=t.tour_id AND v.organization_id=t.organization_id WHERE t.id=ANY($1::uuid[]) AND r.status IN ('pending','retry') AND r.next_attempt_at<=now() AND r.attempts<3 AND ${valid} ORDER BY r.next_attempt_at,r.id LIMIT $2 FOR UPDATE OF r SKIP LOCKED`, [lockedTasks, batch])).rows : [];
        for (const r of due) {
            await c.query('SAVEPOINT task_reminder_delivery');
            try {
                // Lock assignment and eligibility while delivering; a concurrent completion either precedes this check or cancels after it.
                const current = (await c.query(`SELECT t.id FROM tasks t JOIN organization_memberships m ON m.id=t.owner_membership_id AND m.organization_id=t.organization_id LEFT JOIN leads l ON l.id=t.lead_id AND l.organization_id=t.organization_id LEFT JOIN viewings v ON v.id=t.tour_id AND v.organization_id=t.organization_id WHERE t.id=$1 AND t.organization_id=$2 AND t.reminder_generation=$3 AND t.owner_membership_id=$4 AND ${relevant('t', 'l', 'v')} AND ${eligible('m', 't')} AND (t.assignment<>'routing' OR t.team_id IS NULL OR EXISTS(SELECT 1 FROM task_team_members tm WHERE tm.team_id=t.team_id AND tm.organization_id=t.organization_id AND tm.membership_id=m.id)) FOR SHARE OF t,m`, [r.task_id, r.organization_id, r.generation, r.recipient_membership_id])).rowCount;
                if (!current) {
                    await c.query("UPDATE task_reminders SET status='cancelled',cancelled_at=now() WHERE id=$1", [r.id]);
                    result.cancelled++;
                }
                else {
                    await c.query('INSERT INTO task_notifications(organization_id,reminder_id,recipient_membership_id) VALUES($1,$2,$3) ON CONFLICT(reminder_id) DO NOTHING', [r.organization_id, r.id, r.recipient_membership_id]);
                    await c.query("UPDATE task_reminders SET status='delivered',delivered_at=now(),attempts=attempts+1 WHERE id=$1", [r.id]);
                    result.delivered++;
                }
                await c.query('RELEASE SAVEPOINT task_reminder_delivery');
            }
            catch {
                await c.query('ROLLBACK TO SAVEPOINT task_reminder_delivery');
                const attempts = Number(r.attempts) + 1;
                await c.query("UPDATE task_reminders SET attempts=$2,status=CASE WHEN $2>=3 THEN 'failed' ELSE 'retry' END,next_attempt_at=now()+($3::integer*interval '1 second') WHERE id=$1", [r.id, attempts, Math.min(300, 30 * 2 ** (attempts - 1))]);
                await c.query('RELEASE SAVEPOINT task_reminder_delivery');
                if (attempts >= 3)
                    result.failed++;
                else
                    result.retried++;
            }
        }
        return result;
    });
}
/** Lifecycle used by the existing dev/production server; no network communications are sent. */
export function startTaskReminderWorker(database: Database): () => Promise<void> { let stopped = false, running: Promise<unknown> | null = null; const tick = () => { if (stopped || running)
    return; running = processTaskReminders(database).catch(() => console.error('In-app task reminders could not run; the bounded worker will try again.')).finally(() => { running = null; }); }; const timer = setInterval(tick, 30000); timer.unref(); tick(); return async () => { stopped = true; clearInterval(timer); await running; }; }
