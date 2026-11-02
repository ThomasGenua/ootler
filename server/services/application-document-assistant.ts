import type {Database} from '../db/pool.js';
import type {ServerConfig} from '../config/env.js';
import type {ApplicantPrincipal} from './applicant-portal.js';
import {applicantApplicationAccess} from './application-access.js';
import {scanDocument} from './document-scanner.js';
import {documentResult} from '../../shared/ai-workflow-contracts.js';
import {applicantDetailsSchema} from '../../shared/applicant-contracts.js';
import {AiWorkflowRunner} from './ai-workflow-runner.js';
import {missing,stale} from './operations-access.js';
import {ApiError} from '../http/errors.js';
export class ApplicationDocumentAssistant {
 constructor(public database:Database,public config:ServerConfig){}
 private async current(c:import('pg').PoolClient,u:ApplicantPrincipal,appId:string,docId:string){
  const {application,participant}=await applicantApplicationAccess(c,this.config,u,appId);
  const owned=application.source_system==='yardi'||application.source_owned_fields?.length||(await c.query("SELECT 1 FROM external_record_mappings WHERE organization_id=$1 AND application_id=$2 AND provider='yardi'",[u.organization.id,appId])).rowCount;
  if(application.status!=='draft'||owned)throw new ApiError(409,'APPLICATION_READ_ONLY','Document assistance is available while you can edit your own draft application.');
  const file=(await c.query('SELECT d.* FROM application_documents d JOIN application_checklist_items i ON i.id=d.checklist_item_id AND i.active WHERE d.id=$1 AND d.organization_id=$2 AND d.application_id=$3 AND d.participant_id=$4 FOR SHARE OF d',[docId,u.organization.id,appId,participant.id])).rows[0];if(!file)throw missing();return{application,participant,file};
 }
 async extract(u:ApplicantPrincipal,appId:string,docId:string,key:string,fetcher:typeof fetch=fetch){
  const before=await this.database.transaction(async c=>{const data=await this.current(c,u,appId,docId);if(data.file.content.length>6*1024*1024)throw new ApiError(413,'AI_DOCUMENT_SIZE','Choose a document up to 6 MiB for AI assistance.');await scanDocument(this.config,c,data.file.content);return data;});
  const text=before.file.media_type==='text/plain'?before.file.content.toString('utf8'):null;
  const run=await new AiWorkflowRunner(this.database,this.config,fetcher).run({organizationId:u.organization.id,actorId:u.id,propertyId:before.application.property_id,applicationId:appId},'document',key,{documentId:docId,sha:before.file.sha256,participantVersion:before.participant.version,text},documentResult,'Extract only explicitly stated full name, phone number, current address and preferred move-in date belonging to this applicant. Include exact supporting quotations and one-based pages. Never infer a preferred date from another date, or a current address from an employer/property address. Omit ambiguous fields. Do not extract financial, identity-number or screening information. Note illegible content and possible missing pages only when evidenced; do not claim completeness or authenticity. Nothing is verified or saved automatically.',()=>({fields:text?(['displayName','phone','currentAddress','moveInDate'] as const).flatMap(field=>{const match=text.match(new RegExp('^'+field+':\\s*(.+)$','m'));return match?[{field,value:match[1].trim(),quote:match[0],page:1}]:[]}):[],warnings:[text?'Demo extraction reads explicitly labeled fields only.':'Demo mode does not extract PDF/image contents. Configure AI to process this document.']}),text?undefined:{name:before.file.name,type:before.file.media_type,content:before.file.content});
  if(text&&run.result.fields.some(f=>!text.includes(f.quote)))throw new ApiError(502,'AI_SOURCE_MISMATCH','A quotation did not match the document. Start a new request.');
  // Every suggested value must also satisfy the existing application field contract.
  for(const f of run.result.fields){const parsed=applicantDetailsSchema.shape[f.field].safeParse(f.value);if(!parsed.success)throw new ApiError(502,'AI_INVALID_FIELD','A suggested value is invalid. Enter this information manually.');}
  return this.database.transaction(async c=>{const fresh=await this.current(c,u,appId,docId);if(fresh.file.sha256!==before.file.sha256||fresh.participant.version!==before.participant.version)throw stale();await c.query('INSERT INTO ai_document_reviews(run_id,organization_id,application_id,participant_id,document_id,document_sha,participant_version) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(run_id) DO NOTHING',[run.id,u.organization.id,appId,fresh.participant.id,docId,fresh.file.sha256,fresh.participant.version]);return{...run,documentName:fresh.file.name,participantVersion:fresh.participant.version};});
 }
 async review(u:ApplicantPrincipal,appId:string,runId:string,fields:string[],version:number){return this.database.transaction(async c=>{
  const {participant}=await applicantApplicationAccess(c,this.config,u,appId);
  const r=(await c.query("SELECT d.*,r.result FROM ai_document_reviews d JOIN ai_workflow_runs r ON r.id=d.run_id WHERE d.run_id=$1 AND d.organization_id=$2 AND d.application_id=$3 AND d.participant_id=$4 AND r.actor_id=$5 AND r.status='completed'",[runId,u.organization.id,appId,participant.id,u.id])).rows[0];if(!r)throw missing();
  const fresh=await this.current(c,u,appId,r.document_id);if(version!==fresh.participant.version||r.participant_version!==version||r.document_sha!==fresh.file.sha256)throw stale();const output=documentResult.parse(r.result);if(fields.some(f=>!output.fields.some(v=>v.field===f)))throw stale();
  await c.query("UPDATE ai_workflow_runs SET feedback='accepted' WHERE id=$1",[runId]);return{fields:output.fields.filter(v=>fields.includes(v.field)),version,notice:'Suggestions are ready for your form. Review them and choose Save details to persist changes.'};
 });}
}
