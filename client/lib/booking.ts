import {api,errorMessage} from './api';
import {escapeHtml as e} from './ui';
import {viewingTime,calendarDay,shiftCalendarDate} from './calendar-time';
import type {PublicCalendarInvitation} from '../../shared/calendar-contracts';
export function initializeBooking(signal:AbortSignal,options?:{host:HTMLElement;apiPrefix:string}):void{
 const host=options?.host??document.querySelector<HTMLElement>('[data-booking-content]');if(!host)return;
 const token=options?'0'.repeat(64):new URLSearchParams(location.hash.slice(1)).get('token')??'';
 const payload=(value:Record<string,unknown>)=>{if(options)delete value.token;return JSON.stringify(value);};
 const prefix=options?.apiPrefix??'/api/public/calendar';
 if(!options)history.replaceState(history.state,'',location.pathname+location.search);
 if(!/^[a-f0-9]{64}$/.test(token)){host.innerHTML='<h2>Booking link needed</h2><p>Open the private booking link shared by your leasing team. If this page was refreshed, reopen that original link.</p>';return;}
 let current:PublicCalendarInvitation|null=null,date:string|undefined,page=1,managing=false,pendingPayload='',requestKey=crypto.randomUUID(),loading=false;
 const key=(body:unknown)=>{const fingerprint=JSON.stringify(body);if(fingerprint!==pendingPayload){pendingPayload=fingerprint;requestKey=crypto.randomUUID();}return requestKey;};
 const render=(data:PublicCalendarInvitation)=>{
  current=data;const booking=data.booking;
  host.innerHTML='<h2>'+e(data.propertyLabel)+'</h2>'+(booking?'<p class="vc-notice">Viewing status: '+e(booking.status.replaceAll('_',' '))+'</p><p class="bk-detail">'+e(viewingTime(booking.startsAt,booking.endsAt,data.timeZone))+'<br/>'+e(data.location)+'</p>':'<p class="bk-detail">'+e(data.location)+'<small>'+e(data.timeZone)+' · '+data.durationMinutes+' minutes</small></p>')+(data.notice?'<p class="vc-notice">'+e(data.notice)+'</p>':'');
  if(booking&&!managing){if(booking.canManage)host.innerHTML+='<div class="vc-actions"><button class="vc-button" type="button" data-booking-change>Choose another time</button></div><details><summary>Cancel this viewing</summary><form data-booking-cancel><label><input name="confirmed" type="checkbox" required/> I want to cancel this viewing.</label><button class="vc-button" type="submit">Cancel viewing</button></form></details>';host.innerHTML+='<p class="vc-error" role="alert" data-booking-error></p>';return;}
  if(booking&&!booking.canManage){managing=false;render(data);return;}
  host.innerHTML+='<form data-public-booking><fieldset class="vc-slots"><legend>'+(booking?'Replacement viewing times':'Available viewing times')+'</legend><div class="vc-slot-options">'+data.slots.items.map((slot,i)=>'<label class="vc-slot-option"><input type="radio" name="slot" value="'+i+'" required/><span>'+e(viewingTime(slot.startsAt,slot.endsAt,data.timeZone))+'</span></label>').join('')+'</div></fieldset>'+(data.slots.items.length?'<button type="submit" class="vc-button vc-primary">'+(booking?'Confirm new time':'Confirm viewing')+'</button>':'<p>No available times in this period. Try another week or contact your leasing team.</p>')+'</form><p class="vc-error" role="alert" data-booking-error></p><div class="vc-actions">'+(data.slots.page>1?'<button class="vc-button" type="button" data-booking-page="previous">Previous times</button>':'')+(data.slots.page<data.slots.totalPages?'<button class="vc-button" type="button" data-booking-page="next">More times</button>':'')+'<button class="vc-button" type="button" data-booking-page="earlier">Earlier week</button><button class="vc-button" type="button" data-booking-page="week">Following week</button>'+(booking?'<button class="vc-button" type="button" data-booking-back>Keep current time</button>':'')+'</div><p class="vc-hint">Availability is checked again when you confirm. An existing booking stays in place until its replacement is confirmed.</p>';
 };
 const load=async()=>{if(loading)return;loading=true;try{const data=await api<PublicCalendarInvitation>(prefix+'/availability',{method:'POST',body:payload({token,date,days:7,page,pageSize:25,manage:managing}),signal});if(!signal.aborted)render(data);}catch(issue){if(!signal.aborted){const error=host.querySelector('[data-booking-error]');if(error)error.textContent=errorMessage(issue);else host.innerHTML='<h2>Booking unavailable</h2><p>'+e(errorMessage(issue))+'</p><p>Contact the team who shared your link. For a refreshed page, reopen the original private link.</p>';}}finally{loading=false;}};
 host.addEventListener('click',event=>{
  const button=event.target instanceof Element?event.target.closest<HTMLButtonElement>('button[type=button]'):null;if(!button||!current||loading)return;
  if(button.hasAttribute('data-booking-change')){managing=true;page=1;date=undefined;}
  else if(button.hasAttribute('data-booking-back')){managing=false;page=1;}
  else if(button.dataset.bookingPage){const action=button.dataset.bookingPage,today=calendarDay(new Date(),current.timeZone);if(action==='week'||action==='earlier'){const candidate=shiftCalendarDate(date??today,action==='week'?7:-7);date=candidate<today?today:candidate>shiftCalendarDate(today,14)?shiftCalendarDate(today,14):candidate;page=1;}else page+=action==='next'?1:-1;}
  else return;void load();
 },{signal});
 host.addEventListener('submit',async event=>{
  const form=event.target;if(!(form instanceof HTMLFormElement)||!current||(!form.hasAttribute('data-public-booking')&&!form.hasAttribute('data-booking-cancel')))return;event.preventDefault();if(!form.reportValidity())return;
  const submit=form.querySelector<HTMLButtonElement>('button[type=submit]')!;if(submit.disabled)return;submit.disabled=true;const error=host.querySelector('[data-booking-error]')!;error.textContent='';
  try{const cancel=form.hasAttribute('data-booking-cancel'),slot=current.slots.items[Number(new FormData(form).get('slot'))];let body:Record<string,unknown>;
   if(cancel)body={token,version:current.booking!.version,action:'cancel'};
   else{if(!slot)throw Error('Choose an available time.');body={token,startsAt:slot.startsAt,slotKey:slot.slotKey,...(current.booking?{version:current.booking.version,action:'reschedule'}:{})};}
   await api(prefix+'/'+(current.booking?'manage':'book'),{method:'POST',body:payload({...body,requestKey:key(body)}),signal});managing=false;await load();
  }catch(issue){if(!signal.aborted){error.textContent=errorMessage(issue);submit.disabled=false;}}
 },{signal});void load();
}
