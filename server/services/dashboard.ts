import type {AuthUser,DashboardPeriod,DashboardSummary} from '../../shared/contracts.js';
import type {Database} from '../db/pool.js';
import {leadScope,scopeArgs} from './operations-access.js';
/** Counts saved records within the same property and owner scope as the dashboard. */
export async function loadDashboard(database:Pick<Database,'query'>,user:AuthUser,period:DashboardPeriod,filter:{propertyId?:string;ownerMembershipId?:string}={}):Promise<DashboardSummary>{
 const lead=leadScope('l').replaceAll('l.lead_id','l.id');
 const property=(alias:string)=>` AND ($5::uuid IS NULL OR ${alias}.property_id=$5)`;
 const owner=(alias:string)=>` AND ($6::uuid IS NULL OR ${alias}.owner_membership_id=$6)`;
 const within=(column:string)=>` AND (b.since IS NULL OR (${column}>=b.since AND ${column}<=b.until))`;
 const row=(await database.query(`WITH bounds AS (SELECT CASE $4::text WHEN 'month' THEN date_trunc('month',now() AT TIME ZONE 'Africa/Lagos') AT TIME ZONE 'Africa/Lagos' WHEN 'week' THEN date_trunc('week',now() AT TIME ZONE 'Africa/Lagos') AT TIME ZONE 'Africa/Lagos' ELSE NULL::timestamptz END AS since,now() AS until)
 SELECT
 (SELECT count(*)::int FROM leads l CROSS JOIN bounds b WHERE ${lead}${property('l')}${owner('l')}${within('l.created_at')}) AS new_leads,
 (SELECT count(*)::int FROM viewings v CROSS JOIN bounds b WHERE ${leadScope('v')}${property('v')}${owner('v')} AND v.status<>'cancelled'${within('v.created_at')}) AS tours_booked,
 (SELECT count(*)::int FROM applications a LEFT JOIN leads l ON l.id=a.lead_id CROSS JOIN bounds b WHERE ${leadScope('a')}${property('a')}${owner('l')}${within('a.created_at')}) AS applications,
 (SELECT count(*)::int FROM lease_workflows w JOIN applications a ON a.id=w.application_id AND a.organization_id=w.organization_id LEFT JOIN leads l ON l.id=a.lead_id CROSS JOIN bounds b WHERE ${leadScope('a')}${property('a')}${owner('l')} AND w.signature_verified_at IS NOT NULL${within('w.signature_verified_at')}) AS leases_signed`,[...scopeArgs(user),period,filter.propertyId??null,filter.ownerMembershipId??null])).rows[0]!;
 return{period,timeZone:'Africa/Lagos',metrics:{newLeads:row.new_leads,toursBooked:row.tours_booked,applications:row.applications,leasesSigned:row.leases_signed}};
}
