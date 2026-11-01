import {api,errorMessage} from './api';
import {escapeHtml as e} from './ui';
import {button,pill} from '../components/bento';
import type {ChatEntry,AssistantAction} from '../../shared/assistant-chat-contracts';
import type {CalendarOptions,CalendarDirectory,CalendarSlots,CalendarViewing} from '../../shared/calendar-contracts';
import type {LeadDetail} from '../../shared/lead-contracts';
const option=(value:string,label:string,chosen:string)=>`<option value="${e(value)}" ${value===chosen?'selected':''}>${e(label)}</option>`;
const select=(name:string,label:string,choices:string)=>`<label>${label}<select name="${name}">${choices}</select></label>`;
export function workflowProposalCard(entry:ChatEntry){const p=entry.proposal!;return `<section class="b-action-card" data-chat-action="${e(entry.id)}"><header><strong>${e(p.title)}</strong>${pill(entry.decision??'pending')}</header><p class="b-preserve">${e(p.body)}</p>${entry.decision==='pending'?`<div class="b-action-buttons">${button('Approve',{kind:'primary',attrs:'data-chat-decision="approve" '+(!p.action?'disabled':'')})}${button(p.action?'Edit details':'Choose details',{attrs:'data-chat-edit'})}${button('Skip',{kind:'ghost',attrs:'data-chat-decision="skip"'})}</div><div data-workflow-editor-host></div>`:entry.resultUrl?button('Open saved record',{href:entry.resultUrl,kind:'ghost'}):''}<p role="alert" data-action-error></p></section>`;}
export async function openWorkflowEditor(entry:ChatEntry,host:HTMLElement,signal:AbortSignal,onSave:(entry:ChatEntry)=>void){
 const target=host.querySelector<HTMLElement>('[data-workflow-editor-host]')!,workflow=entry.proposal!.workflow!,leadId=entry.leadId!;
 target.textContent='Loading current records…';
 try{
  const detail=await api<LeadDetail>('/api/leads/'+leadId,{signal});
  let tours:CalendarViewing[]=[],viewing:CalendarViewing|undefined;
  if(workflow==='reschedule'){const directory=await api<CalendarDirectory>('/api/calendar?'+new URLSearchParams({leadId,view:'agenda',upcoming:'true',status:'scheduled',pageSize:'100'}),{signal});tours=directory.items.filter(v=>v.canManage);viewing=tours[0];if(!viewing)throw Error('There are no upcoming managed tours to reschedule.');}
  let options:CalendarOptions;
  const render=async(propertyId?:string)=>{
   options=await api<CalendarOptions>('/api/calendar/options?'+new URLSearchParams({leadId,...(propertyId?{propertyId}:{})}),{signal});if(signal.aborted)return;
   const selected=options.selectedProperty!.id,owner=viewing?.owner?.membershipId??detail.lead.owner?.membershipId??options.owners[0]?.membershipId??'';
   target.innerHTML=`<form data-workflow-editor>${workflow==='reschedule'?select('viewingId','Tour to reschedule',tours.map(v=>option(v.id,v.property.name+' · '+new Date(v.startsAt).toLocaleString(),viewing!.id)).join('')):''}${workflow==='book'?select('propertyId','Property',options.properties.items.map(p=>option(p.id,p.name,selected)).join('')):''}${select('ownerMembershipId','Assigned staff',(workflow==='assign'?option('','Unassigned',owner):'')+options.owners.map(o=>option(o.membershipId,o.name,owner)).join(''))}${workflow!=='assign'?`${select('unitId','Unit',option('','Any unit',viewing?.unit?.id??'')+options.units.map(u=>option(u.id,u.label,viewing?.unit?.id??'')).join(''))}<label>Search from date<input type="date" name="date" value="${new Date().toISOString().slice(0,10)}" required/></label><p>Times use ${e(options.settings?.timeZone??'the property timezone')}. Duration: ${options.settings?.durationMinutes??30} minutes.</p><button type="button" class="b-button" data-find-action-slots>Find available times</button><div data-action-slots></div>`:''}<button class="b-button b-button-primary" type="submit">Save action preview</button><p role="alert" data-workflow-error></p></form>`;
   const form=target.querySelector<HTMLFormElement>('form')!,value=(name:string)=>(form.elements.namedItem(name) as HTMLInputElement|HTMLSelectElement|null)?.value??'',error=form.querySelector('[data-workflow-error]')!;
   if(workflow==='reschedule')form.querySelector<HTMLSelectElement>('[name=unitId]')!.disabled=true;
   form.addEventListener('change',async event=>{const el=event.target as HTMLInputElement;try{if(el.name==='viewingId'){viewing=tours.find(v=>v.id===el.value);await render(viewing!.property.id);}else if(el.name==='propertyId')await render(el.value);else if(el.name!=='startsAt'){const slots=form.querySelector('[data-action-slots]');if(slots)slots.innerHTML='';}}catch(issue){error.textContent=errorMessage(issue);}},{signal});
   form.querySelector('[data-find-action-slots]')?.addEventListener('click',async()=>{try{
    const slots=await api<CalendarSlots>('/api/calendar/slots?'+new URLSearchParams({leadId,propertyId:selected,ownerMembershipId:value('ownerMembershipId'),date:value('date'),days:'7',pageSize:'100',...(value('unitId')?{unitId:value('unitId')}:{}),...(viewing?{excludeViewingId:viewing.id}:{})}),{signal});
    form.querySelector('[data-action-slots]')!.innerHTML=slots.items.length?select('startsAt','Available time',slots.items.map(s=>option(s.startsAt,new Date(s.startsAt).toLocaleString(undefined,{timeZone:slots.timeZone})+' '+s.utcOffset,'')).join(''))+'<p>'+e(slots.notice??'Availability is checked again when you approve.')+'</p>':'<p>'+e(slots.notice??'No available times. Try another date.')+'</p>';
   }catch(issue){error.textContent=errorMessage(issue);}},{signal});
   form.addEventListener('submit',async event=>{event.preventDefault();const submit=form.querySelector<HTMLButtonElement>('[type=submit]')!;submit.disabled=true;error.textContent='';try{
    let action:AssistantAction;
    if(workflow==='assign')action={kind:'assign',ownerMembershipId:value('ownerMembershipId')||null,leadVersion:detail.lead.version};
    else if(!value('startsAt'))throw Error('Find and select an available time first.');
    else if(workflow==='book')action={kind:'book',propertyId:selected,unitId:value('unitId')||null,ownerMembershipId:value('ownerMembershipId'),startsAt:value('startsAt'),durationMinutes:options.settings!.durationMinutes};
    else action={kind:'reschedule',viewingId:viewing!.id,version:viewing!.version,ownerMembershipId:value('ownerMembershipId'),startsAt:value('startsAt'),durationMinutes:options.settings!.durationMinutes};
    const saved=await api<ChatEntry>('/api/pilot/assistant/chat/'+entry.id+'/decision',{method:'POST',body:JSON.stringify({operation:'edit',version:entry.version,action}),signal});if(!signal.aborted)onSave(saved);
   }catch(issue){error.textContent=errorMessage(issue);submit.disabled=false;}},{signal});
  };
  await render(viewing?.property.id);
 }catch(issue){if(!signal.aborted)target.textContent=errorMessage(issue);}
}
