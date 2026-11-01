import {escapeHtml as e,icon,type IconName} from './ui';
import {containDialogFocus} from './dialog-focus';

/** Render-only primitives. Plain labels are escaped; `content` arguments are trusted component HTML. */
export type DsTone='neutral'|'accent'|'success'|'warning'|'error';
export type DsButtonOptions={variant?:'primary'|'secondary'|'quiet'|'danger';size?:'small';icon?:IconName;action?:string;type?:'button'|'submit'|'reset';disabled?:boolean;controls?:string;expanded?:boolean};
function classes(base:string,extra?:string):string{return base+(extra?' '+extra:'');}
function safeHref(value:string):string{return /^(?:\/(?!\/)|#[\w-]+$|https?:\/\/)/i.test(value)?value:'/';}
function buttonAttrs(o:DsButtonOptions):string{return ' type="'+(o.type??'button')+'"'+(o.action?' data-ds-action="'+e(o.action)+'"':'')+(o.disabled?' disabled':'')+(o.controls?' aria-controls="'+e(o.controls)+'"':'')+(o.expanded!==undefined?' aria-expanded="'+o.expanded+'"':'');}
export function dsButton(label:string,o:DsButtonOptions={}):string{return '<button class="'+classes('ds-button ds-button--'+(o.variant??'secondary'),o.size?'ds-button--small':'')+'"'+buttonAttrs(o)+'>'+(o.icon?icon(o.icon):'')+'<span>'+e(label)+'</span></button>';}
export function dsIconButton(label:string,name:IconName,o:DsButtonOptions={}):string{return '<button class="ds-button ds-icon-button ds-button--'+(o.variant??'quiet')+'"'+buttonAttrs(o)+' aria-label="'+e(label)+'" title="'+e(label)+'">'+icon(name)+'</button>';}
export type DsFieldOptions={id:string;label:string;name?:string;value?:string;type?:'text'|'email'|'password'|'number'|'date'|'search'|'textarea';placeholder?:string;help?:string;error?:string;required?:boolean;disabled?:boolean;autocomplete?:string};
export function dsField(o:DsFieldOptions):string{
 const described=[o.help?o.id+'-help':'',o.error?o.id+'-error':''].filter(Boolean).join(' '),attrs=' id="'+e(o.id)+'" name="'+e(o.name??o.id)+'"'+(o.required?' required':'')+(o.disabled?' disabled':'')+(o.placeholder?' placeholder="'+e(o.placeholder)+'"':'')+(o.autocomplete?' autocomplete="'+e(o.autocomplete)+'"':'')+(described?' aria-describedby="'+e(described)+'"':'')+(o.error?' aria-invalid="true"':'');
 const control=o.type==='textarea'?'<textarea class="ds-input" rows="3"'+attrs+'>'+e(o.value??'')+'</textarea>':'<input class="ds-input" type="'+(o.type??'text')+'" value="'+e(o.value??'')+'"'+attrs+'/>';
 return '<div class="ds-field"><label class="ds-label" for="'+e(o.id)+'">'+e(o.label)+'</label>'+control+(o.help?'<small class="ds-help" id="'+e(o.id)+'-help">'+e(o.help)+'</small>':'')+(o.error?'<small class="ds-field-error" id="'+e(o.id)+'-error">'+e(o.error)+'</small>':'')+'</div>';
}
export function dsSelect(id:string,label:string,options:ReadonlyArray<{value:string;label:string}>,value='',help=''):string{return '<div class="ds-field"><label class="ds-label" for="'+e(id)+'">'+e(label)+'</label><select class="ds-input" id="'+e(id)+'" name="'+e(id)+'"'+(help?' aria-describedby="'+e(id)+'-help"':'')+'>'+options.map(o=>'<option value="'+e(o.value)+'"'+(o.value===value?' selected':'')+'>'+e(o.label)+'</option>').join('')+'</select>'+(help?'<small class="ds-help" id="'+e(id)+'-help">'+e(help)+'</small>':'')+'</div>';}
export function dsSearch(id:string,label:string,placeholder:string,value=''):string{return '<div class="ds-search">'+icon('search')+'<label class="ds-sr-only" for="'+e(id)+'">'+e(label)+'</label><input class="ds-input" id="'+e(id)+'" name="q" type="search" placeholder="'+e(placeholder)+'" value="'+e(value)+'" maxlength="200"/></div>';}
export function dsFilter(id:string,content:string,count=0):string{return '<details class="ds-menu ds-filter"><summary class="ds-button ds-button--secondary" aria-controls="'+e(id)+'">'+icon('menu')+'Filters'+(count?'<span class="ds-badge ds-badge--neutral">'+e(count)+'</span>':'')+icon('chevron-down')+'</summary><div class="ds-menu-items" id="'+e(id)+'">'+content+'</div></details>';}
export function dsMenu(id:string,label:string,items:ReadonlyArray<{label:string;action:string;icon?:IconName}>):string{return '<details class="ds-menu"><summary class="ds-button ds-button--secondary" aria-controls="'+e(id)+'">'+e(label)+icon('chevron-down')+'</summary><div class="ds-menu-items" id="'+e(id)+'" aria-label="'+e(label)+'">'+items.map(item=>dsButton(item.label,{variant:'quiet',action:item.action,...(item.icon?{icon:item.icon}:{})})).join('')+'</div></details>';}
export function dsCard(title:string,content:string,footer=''):string{return '<section class="ds-card"><header class="ds-card-header"><h3>'+e(title)+'</h3></header><div class="ds-card-body">'+content+'</div>'+(footer?'<footer class="ds-card-footer">'+footer+'</footer>':'')+'</section>';}
export function dsSummary(metrics:ReadonlyArray<{label:string;value:number;detail?:string}>):string{return '<dl class="ds-summary">'+metrics.map(m=>'<div class="ds-metric"><dt>'+e(m.label)+'</dt><dd>'+e(Number.isFinite(m.value)?m.value.toLocaleString():0)+(m.detail?'<small>'+e(m.detail)+'</small>':'')+'</dd></div>').join('')+'</dl>';}
export function dsBadge(label:string,tone:DsTone='neutral'):string{return '<span class="ds-badge ds-badge--'+tone+'">'+e(label)+'</span>';}
export function dsTabs(id:string,tabs:ReadonlyArray<{id:string;label:string;content:string}>,active=tabs[0]?.id):string{return '<div class="ds-tabs" data-ds-tabs><div class="ds-tab-list" role="tablist" aria-label="'+e(id.replaceAll('-',' '))+'">'+tabs.map(tab=>'<button type="button" class="ds-tab" role="tab" id="'+e(id+'-'+tab.id)+'" aria-controls="'+e(id+'-'+tab.id+'-panel')+'" aria-selected="'+(tab.id===active)+'" tabindex="'+(tab.id===active?'0':'-1')+'">'+e(tab.label)+'</button>').join('')+'</div>'+tabs.map(tab=>'<section class="ds-tab-panel" role="tabpanel" id="'+e(id+'-'+tab.id+'-panel')+'" aria-labelledby="'+e(id+'-'+tab.id)+'" tabindex="0"'+(tab.id===active?'':' hidden')+'>'+tab.content+'</section>').join('')+'</div>';}
export function dsTable(caption:string,headers:readonly string[],rows:readonly (readonly string[])[]):string{return '<div class="ds-table-frame" tabindex="0" role="region" aria-label="'+e(caption)+'"><table class="ds-table"><caption class="ds-sr-only">'+e(caption)+'</caption><thead><tr>'+headers.map(h=>'<th scope="col">'+e(h)+'</th>').join('')+'</tr></thead><tbody>'+rows.map(row=>'<tr>'+row.map(cell=>'<td>'+e(cell)+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>';}
export function dsDialog(id:string,title:string,content:string,footer='',kind:'dialog'|'drawer'|'confirm'='dialog'):string{return '<dialog class="ds-dialog'+(kind==='dialog'?'':' ds-dialog--'+kind)+'" id="'+e(id)+'" aria-labelledby="'+e(id)+'-title"'+(kind==='confirm'?' role="alertdialog"':'')+'><header class="ds-dialog-head"><h2 id="'+e(id)+'-title" tabindex="-1">'+e(title)+'</h2>'+dsIconButton('Close '+title,'close',{action:'close-dialog'})+'</header><div class="ds-dialog-body">'+content+'</div>'+(footer?'<footer class="ds-dialog-footer">'+footer+'</footer>':'')+'</dialog>';}
export function dsToast(message:string,tone:'success'|'error'='success'):string{return '<div class="ds-toast ds-toast--'+tone+'" role="'+(tone==='error'?'alert':'status')+'">'+icon(tone==='error'?'info':'check')+'<span>'+e(message)+'</span></div>';}
export function dsSkeleton(label='Loading',lines=3):string{return '<div class="ds-skeleton" role="status" aria-label="'+e(label)+'"><span class="ds-sr-only">'+e(label)+'</span>'+Array.from({length:Math.max(1,Math.min(6,Math.floor(lines)||1))},()=>'<span aria-hidden="true"></span>').join('')+'</div>';}
export function dsState(title:string,description:string,kind:'empty'|'error'='empty',action=''):string{return '<div class="ds-state ds-state--'+kind+'"'+(kind==='error'?' role="alert"':'')+'>'+icon(kind==='error'?'info':'file')+'<h3>'+e(title)+'</h3><p>'+e(description)+'</p>'+action+'</div>';}
export function dsAvatar(name:string,size:'small'|'medium'|'large'='medium'):string{const initials=name.trim().split(/\s+/).slice(0,2).map(part=>Array.from(part)[0]??'').join('').toLocaleUpperCase();return '<span class="ds-avatar ds-avatar--'+size+'" role="img" aria-label="'+e(name)+'">'+e(initials||'?')+'</span>';}
export function dsAttachment(name:string,meta:string,href:string,thumbnail?:{src:string;alt:string}):string{return '<a class="ds-attachment" href="'+e(safeHref(href))+'"'+(/^https?:\/\//i.test(href)?' rel="noopener noreferrer"':'')+'>'+(thumbnail?'<img class="ds-attachment-thumb" src="'+e(safeHref(thumbnail.src))+'" alt="'+e(thumbnail.alt)+'" loading="lazy"/>':icon('file'))+'<span class="ds-attachment-meta"><strong>'+e(name)+'</strong><small>'+e(meta)+'</small></span>'+icon('arrow-up')+'</a>';}

/** Keyboard behavior for the render-only primitives; AbortSignal owns each binding lifecycle. */
export function initializeDsTabs(root:Document|HTMLElement,signal:AbortSignal):void{
 for(const list of root.querySelectorAll<HTMLElement>('.ds-tabs [role="tablist"]')){
  const tabs=[...list.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
  const activate=(tab:HTMLButtonElement)=>{for(const candidate of tabs){const active=candidate===tab;candidate.setAttribute('aria-selected',String(active));candidate.tabIndex=active?0:-1;const panel=candidate.ownerDocument.getElementById(candidate.getAttribute('aria-controls')!);if(panel)panel.hidden=!active;}tab.focus({preventScroll:true});};
  list.addEventListener('click',event=>{const tab=event.target instanceof Element?event.target.closest<HTMLButtonElement>('[role="tab"]'):null;if(tab&&tabs.includes(tab))activate(tab);},{signal});
  list.addEventListener('keydown',event=>{const current=tabs.indexOf(document.activeElement as HTMLButtonElement);if(current<0)return;let next:number|undefined;if(event.key==='ArrowRight')next=(current+1)%tabs.length;else if(event.key==='ArrowLeft')next=(current-1+tabs.length)%tabs.length;else if(event.key==='Home')next=0;else if(event.key==='End')next=tabs.length-1;if(next!==undefined){event.preventDefault();activate(tabs[next]!);}},{signal});
 }
}
export function initializeDsMenus(root:Document|HTMLElement,signal:AbortSignal):void{
 for(const menu of root.querySelectorAll<HTMLDetailsElement>('.ds-menu')){
  menu.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();menu.open=false;menu.querySelector<HTMLElement>('summary')?.focus({preventScroll:true});}},{signal});
  menu.addEventListener('click',event=>{if(menu.classList.contains('ds-filter'))return;const action=event.target instanceof Element?event.target.closest('button'):null;if(action)menu.open=false;},{signal});
 }
 const doc=root instanceof Document?root:root.ownerDocument;
 doc.addEventListener('click',event=>{if(!(event.target instanceof Node))return;for(const menu of root.querySelectorAll<HTMLDetailsElement>('.ds-menu[open]'))if(!menu.contains(event.target))menu.open=false;},{signal});
}
export function bindDsDialog(dialog:HTMLDialogElement,signal:AbortSignal):{open:(opener:HTMLElement)=>void;close:()=>void}{
 let returnFocus:HTMLElement|undefined;
 containDialogFocus(dialog,signal);
 dialog.addEventListener('close',()=>{if(returnFocus?.isConnected)returnFocus.focus({preventScroll:true});},{signal});
 dialog.addEventListener('click',event=>{
  if(event.target instanceof Element&&event.target.closest('[data-ds-action="close-dialog"]')){dialog.close();return;}
  if(event.target!==dialog)return;const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();
 },{signal});
 return {open:(opener:HTMLElement)=>{if(dialog.open)return;returnFocus=opener.closest('details')?.querySelector<HTMLElement>('summary')??opener;dialog.showModal();dialog.querySelector<HTMLElement>('h2')?.focus({preventScroll:true});},close:()=>dialog.close()};
}
