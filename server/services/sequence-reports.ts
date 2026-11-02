import type {AuthUser} from '../../shared/contracts.js';
import type {z} from 'zod';
import type {productivityQuery} from '../../shared/productivity-contracts.js';
import {Operations,actualLeadScope} from './operations.js';
import {scopeArgs,propertyScope,missing} from './operations-access.js';
export class SequenceReports extends Operations {
 async report(u:AuthUser,d:string,id:string,q:z.infer<typeof productivityQuery>){return this.staff(u,d,async(c,a)=>{
  const sequence=(await c.query(`SELECT s.id,s.name,s.steps FROM followup_sequences s WHERE ${propertyScope('s')} AND s.id=$4`,[...scopeArgs(a),id])).rows[0];if(!sequence)throw missing();
  const args=[...scopeArgs(a),id,q.days],cohort=`${actualLeadScope('l')} AND e.sequence_id=$4 AND e.started_at>=now()-$5*interval '1 day' AND e.started_at<=now()`;
  const outcomes=(await c.query(`SELECT e.status,e.stop_reason,count(*)::int AS total FROM sequence_enrollments e JOIN leads l ON l.id=e.lead_id WHERE ${cohort} GROUP BY e.status,e.stop_reason ORDER BY e.status,e.stop_reason`,args)).rows;
  const steps=(await c.query(`WITH cohort AS (SELECT e.id,e.lead_id,e.started_at FROM sequence_enrollments e JOIN leads l ON l.id=e.lead_id WHERE ${cohort}), windows AS (SELECT r.step,r.enrollment_id,c.lead_id,r.created_at,m.status,m.sent_at,coalesce((SELECT min(next_m.sent_at) FROM sequence_step_runs next_r JOIN conversation_messages next_m ON next_m.id=next_r.draft_id WHERE next_r.enrollment_id=r.enrollment_id AND next_m.sent_at>m.sent_at AND next_m.status IN ('accepted','delivered')),now()) AS until FROM sequence_step_runs r JOIN cohort c ON c.id=r.enrollment_id LEFT JOIN conversation_messages m ON m.id=r.draft_id)
   SELECT step,count(*)::int AS generated,count(*) FILTER(WHERE status='draft')::int AS drafts,count(*) FILTER(WHERE status='simulated')::int AS simulated,count(*) FILTER(WHERE status IN ('accepted','delivered'))::int AS sent,count(*) FILTER(WHERE status='delivered')::int AS delivered,count(*) FILTER(WHERE status IN ('failed','uncertain'))::int AS delivery_issues,
   count(*) FILTER(WHERE sent_at IS NOT NULL AND status IN ('accepted','delivered') AND EXISTS(SELECT 1 FROM conversations co JOIN conversation_messages m ON m.conversation_id=co.id WHERE co.lead_id=w.lead_id AND m.direction='inbound' AND m.created_at>=w.sent_at AND m.created_at<w.until))::int AS replied,
   count(*) FILTER(WHERE sent_at IS NOT NULL AND status IN ('accepted','delivered') AND EXISTS(SELECT 1 FROM viewings v WHERE v.lead_id=w.lead_id AND v.created_at>=w.sent_at AND v.created_at<w.until AND v.status<>'cancelled'))::int AS booked,
   count(*) FILTER(WHERE sent_at IS NOT NULL AND status IN ('accepted','delivered') AND EXISTS(SELECT 1 FROM applications app WHERE app.lead_id=w.lead_id AND app.created_at>=w.sent_at AND app.created_at<w.until))::int AS applied
   FROM windows w GROUP BY step ORDER BY step`,args)).rows;
  return{sequence,days:q.days,outcomes,steps,notice:'Enrollment cohort in the selected period. Outcomes are observed after a live send and before the next sent step; they do not prove the message caused the outcome. Simulated sends are separate.'};
 });}
}
