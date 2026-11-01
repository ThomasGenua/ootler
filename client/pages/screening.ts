import {staffCopy} from '../lib/api';
import type { ScreeningWorkspace, ScreeningConsent } from '../../shared/screening-contracts';
import { escapeHtml as e } from '../lib/ui';

const titles: Record<string,string> = {
 consent_required:'Consent required',ready_to_submit:'Ready to submit',submitted:'Submitted',
 provider_reviewing:'Provider reviewing',report_received:'Report received',failed:'Failed',staff_review_pending:'Staff review pending',
};
const title=(status:string):string=>titles[status]??status.replaceAll('_',' ').replace(/^./,character=>character.toUpperCase());
const date=(value:string|null):string=>value?new Date(value).toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'}):'Not yet';
const error='<p class="ap-error" data-screening-error role="alert"></p>';
function action(action:string,label:string,extra=''):string {
 return '<form method="post" data-screening-action="'+e(action)+'" '+extra+'>'+error+'<button type="submit" class="ap-button ap-small">'+e(label)+'</button></form>';
}
function reportUrl(value:string|null|undefined,applicationId:string,screeningId:string):string|null {
 if(!value)return null;
 const expected='/api/application-journey/'+encodeURIComponent(applicationId)+'/screening/'+encodeURIComponent(screeningId)+'/report';
 return value===expected?expected:null;
}
/** Private screening summaries only. Report contents never enter the page payload. */
export function screeningPanel(data:ScreeningWorkspace,applicationId:string):string {
 const demo=data.mode==='demo',access=data.access;
 return '<section class="ap-panel" data-screening-workspace data-application-id="'+e(applicationId)+'" aria-labelledby="screening-heading">'+
 '<div class="ap-list-heading"><h3 id="screening-heading">Screening and staff review</h3><span class="ap-tag '+(demo?'ap-amber':'')+'">'+(demo?'Demo adapter':'Not connected')+'</span></div>'+
 '<p class="ap-muted">'+e(staffCopy(data.notice))+'</p><p><strong>'+e(title(data.status))+'</strong></p>'+
 '<p class="ap-message" data-screening-success role="status" hidden></p>'+
 '<ul class="ap-list">'+data.participants.map(person=>'<li class="ap-list-item"><div class="ap-list-heading"><div><h4>'+e(person.name)+'</h4><p class="ap-muted">'+e(person.role.replaceAll('_',' '))+'</p></div><span class="ap-tag">'+e(title(person.status))+'</span></div>'+
 '<p class="ap-muted">'+(person.consentAcceptedAt?'Separate screening consent recorded '+e(date(person.consentAcceptedAt))+'.':'Screening consent must be recorded by this applicant in their own portal. Application-information consent is separate.')+'</p>'+
 (demo&&access.canRequest&&!person.screeningId&&person.consentAcceptedAt?action('request','Request demo screening','data-participant-id="'+e(person.id)+'"'):'')+'</li>').join('')+'</ul>'+
 (data.screenings.length?'<h4>Provider request history</h4><ul class="ap-list">'+data.screenings.map(screening=>{
  const download=access.canReadReports&&screening.reportAvailable?reportUrl(screening.reportUrl,applicationId,screening.id):null;
  return '<li class="ap-list-item"><div class="ap-list-heading"><span class="ap-tag">'+e(title(screening.status))+'</span><span class="ap-muted">Provider failures '+screening.attempts+' of '+screening.maxAttempts+'</span></div><p class="ap-muted">Updated '+e(date(screening.updatedAt))+'</p>'+
  (screening.error?'<p class="ap-message ap-warning">'+e(staffCopy(screening.error))+'</p>':'')+
  (screening.nextAttemptAt?'<p class="ap-muted">Retry available after '+e(date(screening.nextAttemptAt))+'</p>':'')+
  (screening.reviewedAt?'<p class="ap-muted">Staff report review recorded '+e(date(screening.reviewedAt))+'</p>':'')+
  (download?'<p><a class="ap-button ap-small" href="'+e(download)+'">Download private demo report</a></p>':'')+'</li>';
 }).join('')+'</ul>':'')+
 (demo&&access.canProcess&&data.screenings.some(record=>['submitted','provider_reviewing','report_received'].includes(record.status))?'<div class="ap-actions">'+action('process','Advance demo screening')+action('fail','Simulate temporary provider failure')+'</div>':'')+
 (demo&&access.canProcess&&data.screenings.some(record=>record.status==='failed'&&record.attempts<record.maxAttempts)?'<div class="ap-actions">'+action('retry','Retry failed demo screening')+'</div>':'')+
 (access.canReview&&data.screenings.some(record=>record.status==='staff_review_pending'&&!record.reviewedAt)?'<div class="ap-actions">'+action('review','Record staff report review')+'</div>':'')+
 '<h4>Application decision</h4><p class="ap-muted">Screening status and the application decision are separate. Authorized staff record the decision; AI never approves or rejects an applicant.</p>'+
 (data.decisions.length?'<ol class="ap-list">'+data.decisions.map(decision=>'<li class="ap-list-item"><strong>'+e(title(decision.decision))+'</strong><p>'+e(decision.reason)+'</p><p class="ap-muted">'+e(decision.actorName)+' · '+e(date(decision.createdAt))+'</p></li>').join('')+'</ol>':'<p class="ap-muted">No staff decision recorded.</p>')+
 (access.canDecide?'<form method="post" data-screening-action="decision"><div class="ap-field"><label for="screening-decision">Staff decision</label><select id="screening-decision" name="decision" required><option value="">Choose a decision</option><option value="request_information">Request additional information</option><option value="approved">Approved</option><option value="declined">Declined</option><option value="withdrawn">Withdrawn</option></select></div><div class="ap-field"><label for="screening-reason">Reason and next steps</label><textarea id="screening-reason" name="reason" required minlength="5" maxlength="2000" rows="3"></textarea></div><label class="ap-inline-check"><input name="confirmed" type="checkbox" required/><span>I am recording an authorized staff decision after review.</span></label>'+error+'<button type="submit" class="ap-button">Record staff decision</button></form>':'<p class="ap-muted">A submitted application and authorized review permissions are required. Decisions and sensitive reports are restricted to organization administrators and property managers.</p>')+
 '<p class="ap-message ap-warning">'+e(data.policy.message)+'</p><p class="ap-error" data-screening-global-error role="alert"></p></section>';
}

export function screeningConsentPanel(data:ScreeningConsent,applicationId:string):string {
 return '<section class="ap-panel" data-screening-consent-workspace data-application-id="'+e(applicationId)+'" aria-labelledby="screening-consent-heading"><div class="ap-list-heading"><h2 id="screening-consent-heading">Separate screening consent</h2><span class="ap-tag '+(data.configured?'ap-amber':'')+'">'+(data.configured?'Demo screening':'Not configured')+'</span></div><p>'+e(data.text)+'</p><p class="ap-muted">Purpose: '+e(data.purpose)+' · Version '+e(data.version)+'. This consent is separate from your application-information consent.</p>'+
 (data.acceptedAt?'<p class="ap-message">Recorded '+e(date(data.acceptedAt))+'. Staff remain responsible for review and decisions.</p>':data.configured?'<form method="post" data-screening-consent data-consent-version="'+e(data.version)+'"><label class="ap-inline-check"><input type="checkbox" name="accepted" required/><span>I have read and agree to the separate screening consent above.</span></label>'+error+'<button type="submit" class="ap-button">Record screening consent</button></form>':'<p class="ap-muted">An approved live provider and its consent requirements must be configured before live screening. No provider request will be sent.</p>')+
 '<p class="ap-message" data-screening-success role="status" hidden></p></section>';
}
