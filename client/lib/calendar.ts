import {loadGoogleCalendar,initializeGoogleCalendar,type GoogleCalendarWorkspace} from './google-calendar';
import type {GoogleViewingSync} from '../../shared/google-calendar-contracts';
import { api, ApiError, errorMessage } from './api';
import { calendarDay } from './calendar-time';
import type { CalendarDirectory, CalendarOptions, CalendarSlots, CalendarViewing, CalendarEvent, CalendarInvitation, CalendarIssuedInvitation } from '../../shared/calendar-contracts';
import type { Paginated } from '../../shared/property-contracts';
export type CalendarWorkspacePayload = {kind:'google';google:GoogleCalendarWorkspace}|{kind:'restricted';message:string}|{kind:'directory';directory:CalendarDirectory;options:CalendarOptions}|{kind:'settings';options:CalendarOptions}|{kind:'book';options:CalendarOptions;slots:CalendarSlots|null;slotError:string|null;invitations:Paginated<CalendarInvitation>|null}|{kind:'detail';detail:{viewing:CalendarViewing;events:Paginated<CalendarEvent>};options:CalendarOptions;slots:CalendarSlots|null;slotError:string|null;invitations:Paginated<CalendarInvitation>|null};
const optionsQuery=(query:URLSearchParams):URLSearchParams=>new URLSearchParams(['propertyId','propertySearch','leadSearch','ownerSearch'].filter(key=>query.get(key)).map(key=>[key,query.get(key)!]));
async function loadSlots(options:CalendarOptions,query:URLSearchParams,signal:AbortSignal,viewing?:CalendarViewing):Promise<{slots:CalendarSlots|null;slotError:string|null}>{
 const leadId=viewing?.lead.id??query.get('lead'),ownerMembershipId=query.get('ownerMembershipId')??viewing?.owner?.membershipId,propertyId=options.selectedProperty?.id;
 if(!leadId||!ownerMembershipId||!propertyId||!options.settings?.configured||!options.settings.enabled)return{slots:null,slotError:null};
 const params=new URLSearchParams({propertyId,leadId,ownerMembershipId,date:query.get('date')??calendarDay(new Date(),options.settings.timeZone),days:'7',page:query.get('slotsPage')??'1',pageSize:'25'});
 if(query.get('durationMinutes'))params.set('durationMinutes',query.get('durationMinutes')!);
 if(viewing)params.set('excludeViewingId',viewing.id);
 const unitId=viewing?.unit?.id??query.get('unitId');if(unitId)params.set('unitId',unitId);
 try{return{slots:await api<CalendarSlots>('/api/calendar/slots?'+params,{signal}),slotError:null};}catch(error){if(error instanceof ApiError&&[400,403,409,422].includes(error.status))return{slots:null,slotError:errorMessage(error)};throw error;}
}
export async function loadCalendarWorkspace(query:URLSearchParams,signal:AbortSignal):Promise<CalendarWorkspacePayload>{
 if(query.get('view')==='google')return{kind:'google',google:await loadGoogleCalendar(signal)};
 const params=optionsQuery(query);if(query.get('lead'))params.set('leadId',query.get('lead')!);
 try{
  const viewingId=query.get('viewing');
  if(viewingId){const detail=await api<{viewing:CalendarViewing;events:Paginated<CalendarEvent>}>('/api/calendar/viewings/'+encodeURIComponent(viewingId),{signal});params.set('propertyId',detail.viewing.property.id);params.set('leadId',detail.viewing.lead.id);const options=await api<CalendarOptions>('/api/calendar/options?'+params,{signal});const availability=detail.viewing.canManage&&detail.viewing.managed&&detail.viewing.status==='scheduled'?await loadSlots(options,query,signal,detail.viewing):{slots:null,slotError:null};const invitations=options.access.canManage?await api<Paginated<CalendarInvitation>>('/api/calendar/invitations?'+new URLSearchParams({leadId:detail.viewing.lead.id,propertyId:detail.viewing.property.id,page:query.get('invitationsPage')??'1',pageSize:'25'}),{signal}):null;return{kind:'detail',detail,options,...availability,invitations};}
  const options=await api<CalendarOptions>('/api/calendar/options?'+params,{signal});
  if(query.get('view')==='settings')return{kind:'settings',options};
  if(query.get('view')==='book'){const availability=await loadSlots(options,query,signal);const invitations=options.access.canManage&&query.get('lead')&&options.selectedProperty?await api<Paginated<CalendarInvitation>>('/api/calendar/invitations?'+new URLSearchParams({leadId:query.get('lead')!,propertyId:options.selectedProperty.id,page:query.get('invitationsPage')??'1',pageSize:'25'}),{signal}):null;return{kind:'book',options,...availability,invitations};}
  const directoryQuery=new URLSearchParams();for(const key of ['date','timeZone','propertyId','ownerMembershipId','status','page','pageSize'])if(query.get(key))directoryQuery.set(key,query.get(key)!);directoryQuery.set('view',['day','agenda'].includes(query.get('view')??'')?query.get('view')!:'week');
  if(!directoryQuery.has('timeZone')&&options.settings)directoryQuery.set('timeZone',options.settings.timeZone);
  return{kind:'directory',directory:await api<CalendarDirectory>('/api/calendar?'+directoryQuery,{signal}),options};
 }catch(error){if(error instanceof ApiError&&error.status===403)return{kind:'restricted',message:'Your current membership does not allow this calendar record or property. Ask an organization administrator to review access.'};throw error;}
}
const value=(data:FormData,key:string):string=>String(data.get(key)??'').trim();
export function initializeCalendarWorkspace(signal:AbortSignal,navigate:(path:string,replace?:boolean,focusSelector?:string)=>void):void{
 initializeGoogleCalendar(signal,navigate);
 const workspace=document.querySelector<HTMLElement>('[data-calendar-workspace]');if(!workspace)return;
 const viewingId=new URLSearchParams(location.search).get('viewing');const status=workspace.querySelector<HTMLElement>('[data-google-viewing-status]');if(viewingId&&status)void api<GoogleViewingSync>('/api/google-calendar/viewings/'+encodeURIComponent(viewingId),{signal}).then(result=>{if(!signal.aborted)status.textContent='Local booking: saved. Google: '+result.googleStatus.replaceAll('_',' ')+'. '+result.message;}).catch(issue=>{if(!signal.aborted)status.textContent='Local booking remains saved. Google status not ready: '+errorMessage(issue);});
 workspace.addEventListener('click',async event=>{
  if(!(event.target instanceof Element))return;
  const copy=event.target.closest<HTMLButtonElement>('[data-calendar-copy]');
  if(copy){const input=workspace.querySelector<HTMLInputElement>('[data-calendar-issued-link]');const status=workspace.querySelector<HTMLElement>('[data-calendar-link-status]');if(!input)return;input.select();try{await navigator.clipboard.writeText(input.value);if(status)status.textContent='Booking link copied. Share it directly with the intended prospect.';}catch{if(status)status.textContent='Select and copy the booking link using your keyboard.';}return;}
  const add=event.target.closest<HTMLButtonElement>('[data-calendar-add-window]');
  if(add){const template=workspace.querySelector<HTMLTemplateElement>('[data-calendar-window-template]'),list=workspace.querySelector<HTMLElement>('[data-calendar-windows]');if(!template||!list)return;const number=list.children.length;if(number>=56)return;const node=template.content.cloneNode(true) as DocumentFragment;node.querySelectorAll<HTMLElement>('[id],[for]').forEach(element=>{if(element.id)element.id=element.id.replace('TEMPLATE',String(number));if(element.hasAttribute('for'))element.setAttribute('for',element.getAttribute('for')!.replace('TEMPLATE',String(number)));});list.append(node);return;}
 },{signal});
 workspace.addEventListener('submit',async event=>{
  const form=event.target;if(!(form instanceof HTMLFormElement)||(!form.hasAttribute('data-calendar-form')&&!form.hasAttribute('data-calendar-filter')))return;event.preventDefault();const data=new FormData(form);
  if(form.hasAttribute('data-calendar-filter')){const next=new URLSearchParams();for(const[key,item]of data)if(typeof item==='string'&&item.trim())next.set(key,item.trim());navigate('/admin/calendar?'+next,false,'[data-calendar-results]');return;}
  const submit=form.querySelector<HTMLButtonElement>('button[type=submit]'),error=form.querySelector<HTMLElement>('[data-calendar-error]');if(submit?.disabled)return;if(error)error.textContent='';if(submit){submit.disabled=true;submit.setAttribute('aria-busy','true');}
  const action=form.dataset.calendarForm;let endpoint='/api/calendar',method='POST';const body:Record<string,unknown>={requestKey:form.dataset.requestKey||=crypto.randomUUID()};
  try{
   if(action==='book'||action==='invitation'){Object.assign(body,{leadId:value(data,'leadId'),propertyId:value(data,'propertyId'),unitId:value(data,'unitId')||null,ownerMembershipId:value(data,'ownerMembershipId'),durationMinutes:Number(value(data,'durationMinutes'))});if(action==='book'){endpoint+='/viewings';body.startsAt=value(data,'startsAt');body.location=value(data,'location');}else{endpoint+='/invitations';body.expiresInHours=Number(value(data,'expiresInHours'));}}
   else if(action==='reschedule'){endpoint+='/viewings/'+encodeURIComponent(form.dataset.viewingId!)+'/reschedule';Object.assign(body,{version:Number(form.dataset.version),ownerMembershipId:value(data,'ownerMembershipId'),startsAt:value(data,'startsAt'),durationMinutes:Number(value(data,'durationMinutes')),location:value(data,'location')});}
   else if(action==='status'){endpoint+='/viewings/'+encodeURIComponent(form.dataset.viewingId!)+'/status';Object.assign(body,{version:Number(form.dataset.version),status:form.dataset.status,reason:value(data,'reason')});}
   else if(action==='revoke'){endpoint+='/invitations/'+encodeURIComponent(form.dataset.invitationId!)+'/revoke';}
   else if(action==='settings'){method='PUT';endpoint+='/properties/'+encodeURIComponent(value(data,'propertyId'))+'/settings';delete body.requestKey;Object.assign(body,{version:Number(form.dataset.version),enabled:data.get('enabled')==='on',timeZone:value(data,'timeZone'),durationMinutes:Number(value(data,'durationMinutes')),bufferBeforeMinutes:Number(value(data,'bufferBeforeMinutes')),bufferAfterMinutes:Number(value(data,'bufferAfterMinutes')),location:value(data,'location'),publicBookingEnabled:data.get('publicBookingEnabled')==='on'});}
   else if(action==='availability'){method='PUT';endpoint+='/properties/'+encodeURIComponent(value(data,'propertyId'))+'/staff/'+encodeURIComponent(value(data,'ownerMembershipId'))+'/availability';delete body.requestKey;const windows=[...form.querySelectorAll<HTMLElement>('[data-calendar-window]')].filter(row=>row.querySelector<HTMLInputElement>('[data-window-enabled]')?.checked).map(row=>({weekday:Number(row.querySelector<HTMLSelectElement>('[data-window-day]')!.value),start:row.querySelector<HTMLInputElement>('[data-window-start]')!.value,end:row.querySelector<HTMLInputElement>('[data-window-end]')!.value}));Object.assign(body,{version:Number(form.dataset.version),enabled:data.get('enabled')==='on',windows});}
   else throw new Error('This calendar action is not ready.');
   const fingerprint=JSON.stringify({endpoint,...body,requestKey:undefined});if(body.requestKey&&form.dataset.requestInput&&form.dataset.requestInput!==fingerprint)body.requestKey=form.dataset.requestKey=crypto.randomUUID();form.dataset.requestInput=fingerprint;
   const result=await api<{viewing?:CalendarViewing;invitation?:CalendarInvitation;token?:string;bookingPath?:string}>(endpoint,{method,body:JSON.stringify(body),signal});if(signal.aborted)return;
   if(action==='invitation'){showInvitation(workspace,result as CalendarIssuedInvitation);return;}
   if(action==='revoke'){const issued=workspace.querySelector<HTMLElement>('[data-calendar-issued]');if(issued&&issued.dataset.invitationId===form.dataset.invitationId){const input=issued.querySelector<HTMLInputElement>('input');if(input)input.value='';issued.remove();}}
   const query=new URLSearchParams(location.search);query.set('saved',action??'calendar');if(result.viewing){query.delete('view');query.set('viewing',result.viewing.id);query.delete('date');query.delete('slotsPage');}
   navigate('/admin/calendar?'+query,true,'[data-calendar-results]');
  }catch(issue){if(!signal.aborted&&error){error.textContent=errorMessage(issue);error.tabIndex=-1;error.focus();const reload=form.querySelector<HTMLElement>('[data-calendar-reload]');if(reload&&issue instanceof ApiError&&issue.status===409)reload.hidden=false;}}
  finally{if(!signal.aborted&&submit){submit.disabled=false;submit.removeAttribute('aria-busy');}}
 },{signal});
}
function showInvitation(workspace:HTMLElement,result:CalendarIssuedInvitation):void{
 const host=workspace.querySelector<HTMLElement>('[data-calendar-issued]');if(!host)return;
 const target=new URL(result.bookingPath,location.origin);if(target.origin!==location.origin||target.pathname!=='/book'||target.search||target.hash!=='#token='+result.token)throw new Error('The booking link could not be prepared. Reload the viewing before trying again.');
 host.dataset.invitationId=result.invitation.id;const input=host.querySelector<HTMLInputElement>('[data-calendar-issued-link]');if(input)input.value=target.href;const expiry=host.querySelector<HTMLElement>('[data-calendar-link-expiry]');if(expiry)expiry.textContent='Expires '+new Date(result.invitation.expiresAt).toLocaleString()+'. Copy this link now; it is shown only once. No message has been sent.';const revoke=host.querySelector<HTMLFormElement>('[data-calendar-form=revoke]');if(revoke)revoke.dataset.invitationId=result.invitation.id;host.hidden=false;host.focus();
}