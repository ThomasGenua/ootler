import type {PoolClient} from 'pg';
import type {AuthUser} from '../../shared/contracts.js';
import {leadScope,scopeArgs} from './operations-access.js';
/** A shared, access-scoped chronology for the dashboard and operations activity page. */
export async function activityFeed(c:PoolClient,user:AuthUser,q:string,page:number){
 const scope=leadScope('r'),ls=leadScope('l').replaceAll('l.lead_id','l.id');
 const items=(await c.query(`WITH activity AS (
 SELECT 'operation:'||r.id::text AS id,r.kind,r.summary,r.property_id,r.lead_id,r.created_at FROM operation_events r WHERE ${scope}
 UNION ALL SELECT 'lead:'||e.id::text,e.kind,ct.display_name||' · '||replace(e.kind,'_',' '),l.property_id,l.id,e.occurred_at FROM lead_events e JOIN leads l ON l.id=e.lead_id AND l.organization_id=e.organization_id JOIN contacts ct ON ct.id=l.contact_id AND ct.organization_id=l.organization_id WHERE ${ls}
 UNION ALL SELECT 'viewing:'||e.id::text,'viewing.'||e.kind,ct.display_name||' · Viewing '||e.kind,v.property_id,v.lead_id,e.occurred_at FROM viewing_events e JOIN viewings v ON v.id=e.viewing_id AND v.organization_id=e.organization_id JOIN leads l ON l.id=v.lead_id AND l.organization_id=v.organization_id JOIN contacts ct ON ct.id=l.contact_id AND ct.organization_id=l.organization_id WHERE ${ls} AND ${leadScope('v')}
 UNION ALL SELECT 'lease:'||e.id::text,'lease.'||e.stage,ct.display_name||' · '||replace(e.stage,'_',' '),a.property_id,a.lead_id,e.created_at FROM lease_workflow_events e JOIN lease_workflows w ON w.id=e.workflow_id AND w.organization_id=e.organization_id JOIN applications a ON a.id=w.application_id AND a.organization_id=w.organization_id JOIN leads l ON l.id=a.lead_id AND l.organization_id=a.organization_id JOIN contacts ct ON ct.id=l.contact_id AND ct.organization_id=l.organization_id WHERE ${ls} AND ${leadScope('a')}
 ) SELECT *,count(*) OVER()::int AS total FROM activity WHERE strpos(lower(summary||' '||kind),lower($4))>0 ORDER BY created_at DESC,id DESC LIMIT 25 OFFSET $5`,[...scopeArgs(user),q,(page-1)*25])).rows;
 return{items,page,total:items[0]?.total??0,pageSize:25};
}
