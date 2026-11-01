import { api, ApiError, errorMessage } from './api';
import type { GoogleCalendarStatus,GoogleCalendarBusy,GoogleCalendarChoices,GoogleCalendarChoice } from '../../shared/google-calendar-contracts';
import {escapeHtml as e} from './ui';
export interface GoogleCalendarWorkspace {status:GoogleCalendarStatus|null;busy:GoogleCalendarBusy|null;error?:string}
export async function loadGoogleCalendar(signal:AbortSignal):Promise<GoogleCalendarWorkspace>{
 let status:GoogleCalendarStatus;
 try{status=await api<GoogleCalendarStatus>('/api/google-calendar',{signal});}catch(issue){if(signal.aborted||issue instanceof ApiError&&issue.status===401)throw issue;return{status:null,busy:null,error:errorMessage(issue)};}
 let busy:GoogleCalendarBusy|null=null;
 if(status.selectedCalendars.length){const from=new Date();from.setUTCHours(0,0,0,0);const until=new Date(from.getTime()+7*86400000);try{busy=await api<GoogleCalendarBusy>('/api/google-calendar/busy?'+new URLSearchParams({from:from.toISOString(),until:until.toISOString()}),{signal});}catch(issue){if(signal.aborted||issue instanceof ApiError&&issue.status===401)throw issue;return{status,busy:null,error:'Google busy periods are not ready. '+errorMessage(issue)};}}

 return{status,busy};
}
export function initializeGoogleCalendar(signal:AbortSignal,navigate:(path:string,replace?:boolean,focusSelector?:string)=>void):void{
 const host=document.querySelector<HTMLElement>('[data-google-calendar]');if(!host)return;
 let choices:GoogleCalendarChoice[]=[],nextPageToken:string|null=null,writeTarget=host.dataset.googleWriteTarget??'';
 const error=host.querySelector<HTMLElement>('[data-google-error]')!,message=host.querySelector<HTMLElement>('[data-google-message]')!,selection=host.querySelector<HTMLElement>('[data-google-selection]')!;
 const render=()=>{selection.innerHTML='<form data-google-selection-form><h4>Calendars visible to your authorized account</h4><p>Select busy sources and exactly one writable target for Ootla-owned events.</p><fieldset class="vc-slots"><legend>Selected calendars</legend>'+choices.map((c,i)=>'<label class="vc-check"><input type="checkbox" name="calendarIds" value="'+e(c.id)+'" '+(c.selected?'checked':'')+'/> '+e(c.name)+' · '+e(c.timeZone)+'</label>').join('')+'</fieldset><div class="vc-field"><label for="google-write-target">Ootla event calendar</label><select id="google-write-target" name="writeCalendarId" required><option value="">Choose a writable calendar</option>'+choices.filter(c=>c.writable).map(c=>'<option value="'+e(c.id)+'" '+(c.id===writeTarget?'selected':'')+'>'+e(c.name)+'</option>').join('')+'</select></div><div class="vc-actions"><button type="submit" class="vc-button vc-primary">Save calendar selection</button>'+(nextPageToken?'<button type="button" class="vc-button" data-google-action="more">Load more calendars</button>':'')+'</div></form>';};
 host.addEventListener('click',async event=>{
  const target=event.target instanceof Element?event.target.closest<HTMLButtonElement>('[data-google-action]'):null;if(!target||target.disabled)return;
  target.disabled=true;error.textContent='';message.textContent='';
  try{
   const action=target.dataset.googleAction;
   if(action==='connect'){const result=await api<{authorizationUrl:string}>('/api/google-calendar/oauth/start',{method:'POST',body:'{}',signal});const url=new URL(result.authorizationUrl);if(url.protocol!=='https:'||url.hostname!=='accounts.google.com')throw new Error('Authorization destination is invalid.');location.assign(url.href);return;}
   if(action==='calendars'||action==='more'){if(action==='more'){const form=selection.querySelector<HTMLFormElement>('[data-google-selection-form]');if(form){const data=new FormData(form),selected=new Set(data.getAll('calendarIds'));choices=choices.map(c=>({...c,selected:selected.has(c.id)}));writeTarget=String(data.get('writeCalendarId')??'');}}const result=await api<GoogleCalendarChoices>('/api/google-calendar/calendars'+(action==='more'&&nextPageToken?'?'+new URLSearchParams({pageToken:nextPageToken}):''),{signal});choices=action==='more'?[...choices,...result.items.filter(c=>!choices.some(old=>old.id===c.id))]:result.items;nextPageToken=result.nextPageToken;render();selection.querySelector<HTMLElement>('h4')?.scrollIntoView({block:'nearest'});return;}
   if(action==='disconnect'&&!window.confirm('Disconnect Google Calendar? Local bookings and existing Google events will be retained.'))return;
   await api('/api/google-calendar/'+action,{method:'POST',body:'{}',signal});
   message.textContent=action==='disconnect'?'Google disconnected. Local bookings remain available.':'Google synchronization work queued. Local bookings remain saved. Refresh to see job results.';
   if(action==='disconnect')navigate('/admin/calendar?view=google',true);
  }catch(issue){if(!signal.aborted)error.textContent=errorMessage(issue);}finally{if(!signal.aborted)target.disabled=false;}
 },{signal});
 host.addEventListener('submit',async event=>{const form=event.target;if(!(form instanceof HTMLFormElement)||!form.hasAttribute('data-google-selection-form'))return;event.preventDefault();const data=new FormData(form),button=form.querySelector<HTMLButtonElement>('button[type=submit]')!;button.disabled=true;error.textContent='';try{await api('/api/google-calendar/selection',{method:'PUT',body:JSON.stringify({calendarIds:data.getAll('calendarIds'),writeCalendarId:data.get('writeCalendarId')}),signal});navigate('/admin/calendar?view=google',true);}catch(issue){if(!signal.aborted)error.textContent=errorMessage(issue);}finally{if(!signal.aborted)button.disabled=false;}},{signal});
}
