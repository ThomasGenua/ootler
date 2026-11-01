import { api, ApiError, errorMessage } from './api';
import { applicantErrorPage, applicantInvitationPage, applicantLoginPage } from '../pages/applicant';
import type { ScreeningConsent } from '../../shared/screening-contracts';
import { initializeScreeningConsent } from './screening';
import type { PaymentWorkspace } from '../../shared/payment-contracts';
import { initializePaymentWorkspace } from './payments';

export type ApplicantNavigate=(path:string,replace?:boolean,focusSelector?:string)=>void;
/** Remove invitation secrets synchronously, before config loading, routing or requests. */
export function takeApplicantInvitation():string|null{
 const fragment=location.hash;
 history.replaceState(history.state,'',location.pathname+location.search);
 if(!/^#token=[a-f0-9]{64}$/.test(fragment))return null;
 return fragment.slice(7);
}
function errorIn(form:HTMLElement,issue:unknown):void{
 const output=form.querySelector<HTMLElement>('[data-applicant-error]')??document.querySelector<HTMLElement>('[data-applicant-global-error]');
 if(!output)return;output.textContent=errorMessage(issue);output.tabIndex=-1;output.focus();
}
async function enablePortalForm(signal:AbortSignal):Promise<{demoEnabled:boolean;demoCredentials?:{email:string;password:string}}|null>{
 const setup=document.querySelector<HTMLElement>('[data-applicant-setup]'),form=document.querySelector<HTMLFormElement>('[data-applicant-form]');
 try{
  const [publicConfig,portalConfig]=await Promise.all([api<{appUrl:string;databaseReady:boolean}>('/api/config',{signal}),api<{demoEnabled:boolean;demoCredentials?:{email:string;password:string}}>('/api/applicant/config',{signal})]);
  if(signal.aborted)return null;
  const origin=new URL(publicConfig.appUrl);
  if(origin.origin!==publicConfig.appUrl||origin.origin!==location.origin)throw new Error('Open this portal at '+origin.origin+'. Ask your leasing team for a fresh invitation if needed.');
  if(!publicConfig.databaseReady)throw new Error('The application database is not ready. Please try again or contact your leasing team.');
  if(setup)setup.hidden=true;
  const submit=form?.querySelector<HTMLButtonElement>('button[type=submit]');if(submit)submit.disabled=false;
  return portalConfig;
 }catch(issue){if(!signal.aborted&&setup){setup.classList.add('ap-warning');setup.textContent=errorMessage(issue);}return null;}
}
export async function initializeApplicantAuthentication(signal:AbortSignal,navigate:ApplicantNavigate,token:string|null=null):Promise<void>{
 const form=document.querySelector<HTMLFormElement>('[data-applicant-form]');if(!form)return;
 let enabled=false,pending=false,invitation=token;
 signal.addEventListener('abort',()=>{invitation=null;},{once:true});
 form.addEventListener('submit',async event=>{
  event.preventDefault();if(!enabled||pending||!form.reportValidity())return;
  pending=true;const submit=form.querySelector<HTMLButtonElement>('button[type=submit]');if(submit)submit.disabled=true;form.setAttribute('aria-busy','true');
  const error=form.querySelector<HTMLElement>('[data-applicant-error]');if(error)error.textContent='';
  try{
   const data=new FormData(form),password=String(data.get('password')??'');
   if(form.dataset.applicantForm==='accept'){
    if(!invitation)throw new Error('Open your complete invitation again or ask for a replacement.');
    await api('/api/applicant/invitations/accept',{method:'POST',body:JSON.stringify({token:invitation,password}),signal});invitation=null;
   }else await api('/api/applicant/auth/login',{method:'POST',body:JSON.stringify({email:String(data.get('email')??'').trim(),password}),signal});
   if(!signal.aborted)navigate('/applicant',true);
  }catch(issue){if(!signal.aborted)errorIn(form,issue);}
  finally{if(!signal.aborted){pending=false;if(submit)submit.disabled=false;form.removeAttribute('aria-busy');}}
 },{signal});
 const config=await enablePortalForm(signal);if(!config||signal.aborted)return;
 if(form.dataset.applicantForm==='accept'){
  const submit=form.querySelector<HTMLButtonElement>('button[type=submit]');if(submit)submit.disabled=true;
  try{if(!invitation)throw new Error('This invitation is missing. Open your complete link again.');const inspected=await api<{email:string;expiresAt:string;requiresExistingPassword:boolean;propertyName:string}>('/api/applicant/invitations/inspect',{method:'POST',body:JSON.stringify({token:invitation}),signal});if(signal.aborted)return;const setup=document.querySelector<HTMLElement>('[data-applicant-setup]');if(setup){setup.hidden=false;setup.textContent='Invitation for '+inspected.email+' at '+inspected.propertyName+'. Expires '+new Date(inspected.expiresAt).toLocaleString()+'.';}const password=form.querySelector<HTMLInputElement>('[name=password]');if(password){password.autocomplete=inspected.requiresExistingPassword?'current-password':'new-password';}if(submit)submit.disabled=false;}catch(issue){if(!signal.aborted)errorIn(form,issue);return;}
 }
 enabled=true;
 const slot=form.querySelector<HTMLElement>('[data-applicant-demo]');
 if(slot&&config.demoEnabled&&config.demoCredentials){
  const button=document.createElement('button');button.type='button';button.className='ap-button';button.textContent='Fill demo applicant credentials';button.id='fill-demo-applicant';
  const copy=document.createElement('p');copy.className='ap-muted';copy.textContent='Isolated example applicant. Fills the masked fields; use Sign in to authenticate.';
  slot.className='ap-actions';slot.append(button,copy);
  button.addEventListener('click',()=>{const email=form.elements.namedItem('email')as HTMLInputElement|null,password=form.elements.namedItem('password')as HTMLInputElement|null;if(!email||!password||!config.demoCredentials)return;email.value=config.demoCredentials.email;password.value=config.demoCredentials.password;password.type='password';form.querySelector<HTMLButtonElement>('button[type=submit]')?.focus();},{signal});
 }
}
export function renderApplicantAuthentication(path:string,token:string|null):string{
 return path==='/applicant/invite'?applicantInvitationPage(Boolean(token)):applicantLoginPage();
}
export function applicantRouteError(issue:unknown,navigate:ApplicantNavigate):string|null{
 if(issue instanceof ApiError&&issue.status===401){navigate('/applicant/login',true);return null;}return applicantErrorPage(errorMessage(issue));
}

import type { ApplicantUser, ApplicationSummary, PortalApplication } from '../../shared/applicant-contracts';
import { applicantApplicationPage, applicantDirectoryPage } from '../pages/applicant';
export type ApplicantWorkspace={user:ApplicantUser;items:ApplicationSummary[];detail:PortalApplication|null;screening:ScreeningConsent|null;payment:PaymentWorkspace|null};
export async function loadApplicantWorkspace(query:URLSearchParams,signal:AbortSignal):Promise<ApplicantWorkspace>{
 const {user}=await api<{user:ApplicantUser|null}>('/api/applicant/auth/me',{signal});
 if(!user)throw new ApiError(401,'Sign in to open your application.');
 const {items}=await api<{items:ApplicationSummary[]}>('/api/applicant/applications',{signal});
 const selected=query.get('application');
 const detail=selected?await api<PortalApplication>('/api/applicant/applications/'+encodeURIComponent(selected),{signal}):null;
 const [screening,payment]=selected?await Promise.all([api<ScreeningConsent>('/api/applicant/application-journey/'+encodeURIComponent(selected)+'/screening-consent',{signal}),api<PaymentWorkspace>('/api/applicant/application-payments/'+encodeURIComponent(selected),{signal})]):[null,null];
 return{user,items,detail,screening,payment};
}
export function applicantWorkspacePage(data:ApplicantWorkspace):string{
 return data.detail?applicantApplicationPage(data.user,data.detail,data.screening,data.payment):applicantDirectoryPage(data.user,data.items);
}
const allowedTypes=new Set(['application/pdf','image/png','image/jpeg','text/plain']);
export async function uploadApplicantDocument(endpoint:string,file:File,signal:AbortSignal):Promise<void>{
 if(!file.size||file.size>20*1024*1024)throw new Error('Choose a non-empty document of up to 20 MiB.');
 if(!allowedTypes.has(file.type))throw new Error('Choose a PDF, PNG, JPEG or plain text document.');
 const response=await fetch(endpoint,{method:'POST',credentials:'same-origin',headers:{'Content-Type':file.type},body:file,signal});
 if(!response.ok){let message='The document could not be uploaded.';try{const body=await response.json()as{error?:string|{message?:string}};message=typeof body.error==='string'?body.error:body.error?.message??message;}catch{}throw new ApiError(response.status,message);}
}
export function initializeApplicantWorkspace(signal:AbortSignal,navigate:ApplicantNavigate):void{
 initializeScreeningConsent(signal,navigate);
 initializePaymentWorkspace(signal,navigate);
 const workspace=document.querySelector<HTMLElement>('[data-applicant-workspace]');
 document.querySelector<HTMLButtonElement>('[data-applicant-logout]')?.addEventListener('click',async event=>{
  const button=event.currentTarget as HTMLButtonElement;button.disabled=true;try{await api('/api/applicant/auth/logout',{method:'POST',body:'{}',signal});if(!signal.aborted)navigate('/applicant/login',true);}catch(issue){if(!signal.aborted){errorIn(document.body,issue);button.disabled=false;}}
 },{signal});
 if(!workspace)return;
 workspace.addEventListener('submit',async event=>{
  const form=event.target;if(!(form instanceof HTMLFormElement)||!form.hasAttribute('data-applicant-form'))return;event.preventDefault();
  if(!form.reportValidity())return;const submit=form.querySelector<HTMLButtonElement>('button[type=submit]');if(submit?.disabled)return;
  const error=form.querySelector<HTMLElement>('[data-applicant-error]');if(error)error.textContent='';
  if(submit)submit.disabled=true;form.setAttribute('aria-busy','true');
  const id=workspace.dataset.applicationId!,base='/api/applicant/applications/'+encodeURIComponent(id),data=new FormData(form),version=Number(workspace.dataset.participantVersion);
  try{
   const action=form.dataset.applicantForm;
   if(action==='details')await api(base,{method:'PATCH',body:JSON.stringify({version,details:{displayName:String(data.get('displayName')??'').trim(),phone:String(data.get('phone')??'').trim(),currentAddress:String(data.get('currentAddress')??'').trim(),moveInDate:String(data.get('moveInDate')??'')}}),signal});
   else if(action==='upload'){const file=data.get('document');if(!(file instanceof File))throw new Error('Choose a document first.');await uploadApplicantDocument(base+'/documents?'+new URLSearchParams({checklistId:form.dataset.checklistId!,name:file.name}),file,signal);}
   else if(action==='consent')await api(base+'/consents',{method:'POST',body:JSON.stringify({version:'application-v1',accepted:true}),signal});
   else if(action==='ready')await api(base+'/ready',{method:'POST',body:JSON.stringify({version}),signal});
   else if(action==='submit')await api(base+'/submit',{method:'POST',body:JSON.stringify({version:Number(workspace.dataset.applicationVersion)}),signal});
   else return;
   if(!signal.aborted){const query=new URLSearchParams({application:id,saved:action!});navigate('/applicant?'+query,true,'[data-applicant-success]');}
  }catch(issue){if(!signal.aborted){errorIn(form,issue);if(issue instanceof ApiError&&issue.status===409){const hint=document.createElement('a');hint.href='/applicant?application='+encodeURIComponent(id);hint.dataset.link='';hint.className='ap-button';hint.textContent='Reload saved application';error?.append(document.createElement('br'),hint);}}}
  finally{if(!signal.aborted){if(submit)submit.disabled=false;form.removeAttribute('aria-busy');}}
 },{signal});
 const saved=new URLSearchParams(location.search).get('saved'),messages:Record<string,string>={details:'Your details have been saved. You can leave and resume later.',upload:'Your document has been saved privately.',consent:'Your consent has been recorded.',ready:'Your section is ready for submission.',submit:'Your application has been submitted for staff review.'};
 const success=workspace.querySelector<HTMLElement>('[data-applicant-success]');if(saved&&messages[saved]&&success){success.hidden=false;success.tabIndex=-1;success.textContent=messages[saved];}
}
