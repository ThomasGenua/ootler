import type {AuthUser} from './api';
import {captureLocalScroll} from './local-update';
import {initializeDsMenus} from './design-system';

let preferenceKey:string|undefined;
const preferences=new Map<string,boolean>();
const previousInert=new Map<HTMLElement,boolean>();
const mobile=window.matchMedia('(max-width: 900px)');
let opener:HTMLElement|undefined;
const root=document.documentElement;

function restoreInert():void {
  for(const [element,value] of previousInert)if(element.isConnected)element.inert=value;
  previousInert.clear();
}
function syncDrawer():void {
  const aside=document.querySelector<HTMLElement>('.admin-shell-v2 #admin-sidebar-nav');
  if(!aside){restoreInert();root.dataset.adminDrawer='closed';return;}
  const open=mobile.matches&&root.dataset.adminDrawer==='open';
  aside.classList.toggle('is-open',open);
  aside.inert=mobile.matches&&!open;
  if(mobile.matches&&!open)aside.setAttribute('aria-hidden','true');else aside.removeAttribute('aria-hidden');
  if(open){aside.setAttribute('role','dialog');aside.setAttribute('aria-modal','true');}
  else{aside.removeAttribute('role');aside.removeAttribute('aria-modal');}
  const toggle=document.querySelector<HTMLButtonElement>('[data-action="admin-menu"]');
  toggle?.setAttribute('aria-expanded',String(open));
  toggle?.setAttribute('aria-label',open?'Close navigation':'Open navigation');
  const scrim=document.querySelector<HTMLButtonElement>('.admin-rail-scrim');
  if(scrim)scrim.hidden=!open;
  if(open){
    for(const element of document.querySelectorAll<HTMLElement>('.admin-shell-body,.ask-floating-launcher')){
      if(!previousInert.has(element))previousInert.set(element,element.inert);
      element.inert=true;
    }
  }else restoreInert();
}
export function closeAdminDrawer(returnFocus=true):void {
  const wasOpen=root.dataset.adminDrawer==='open';
  root.dataset.adminDrawer='closed';syncDrawer();
  if(wasOpen&&returnFocus&&opener?.isConnected)opener.focus({preventScroll:true});
  opener=undefined;
}
export function toggleAdminDrawer(button:HTMLButtonElement):void {
  if(!mobile.matches)return;
  if(root.dataset.adminDrawer==='open'){closeAdminDrawer();return;}
  opener=button;root.dataset.adminDrawer='open';syncDrawer();
  document.querySelector<HTMLElement>('.admin-rail [data-action="rail-close"]')?.focus({preventScroll:true});
}
function syncRail():void {
  const collapsed=root.dataset.adminRail==='collapsed';
  const button=document.querySelector<HTMLButtonElement>('[data-action="rail-collapse"]');
  const label=collapsed?'Expand navigation':'Collapse navigation';
  button?.setAttribute('aria-expanded',String(!collapsed));button?.setAttribute('aria-label',label);
  if(button){button.title=label;const text=button.querySelector('span');if(text)text.textContent=collapsed?'Expand':'Collapse';}
  // Icons retain accessible names when their visible labels are collapsed.
  for(const link of document.querySelectorAll<HTMLAnchorElement>('.admin-rail-nav>a')){
    const label=link.querySelector('.admin-nav-label')?.textContent?.trim();
    if(label)link.setAttribute('aria-label',label);
  }
}
export function toggleAdminRail():void {
  const app=document.querySelector('.admin-shell-v2');if(!app||mobile.matches)return;
  const restore=captureLocalScroll(app),collapsed=root.dataset.adminRail!=='collapsed';
  root.dataset.adminRail=collapsed?'collapsed':'expanded';syncRail();
  if(preferenceKey){preferences.set(preferenceKey,collapsed);try{sessionStorage.setItem(preferenceKey,String(collapsed));}catch{/* Presentation preference works in memory. */}}
  restore();
}
export function clearAdminShellPreference():void {
  closeAdminDrawer(false);
  if(preferenceKey){preferences.delete(preferenceKey);try{sessionStorage.removeItem(preferenceKey);}catch{/* Storage may be disabled. */}}
  preferenceKey=undefined;delete root.dataset.adminRail;
}

/** Remove only redundant directory chrome; keep record headers and controller-owned forms/buttons. */
function normalizeDirectoryHeading():void {
  const main=document.querySelector<HTMLElement>('.admin-shell-v2 #main-content');
  const title=document.querySelector<HTMLElement>('#workspace-title');
  if(!main||!title)return;
  const query=new URLSearchParams(location.search);
  if(['lead','property','contact','application','task','request','viewing','relationship','conversation','batch','rule','session'].some(key=>query.has(key)))return;
  const heading=main.querySelector<HTMLElement>('.pw-heading,.tw-heading,.lw-heading,.cv-heading,.workspace-heading,.ac-heading,.rw-heading,.vc-heading,.im-heading,.cn-heading,.ai-page-header,.ap-intro,.followup-heading');
  const localTitle=heading?.querySelector<HTMLElement>('h2');
  if(!heading||!localTitle||localTitle.id)return;
  if(location.pathname==='/admin/tasks'||['new','create','edit'].includes(query.get('view')??''))title.textContent=localTitle.textContent;
  if(location.pathname==='/admin/ai')title.textContent='Ask Ootla';
  if(location.pathname==='/admin/profile'&&query.get('edit')==='1')title.textContent='Edit profile';
  const actions=document.querySelector('[data-shell-actions]');
  // Ordinary navigation links use the global router. Modal/form buttons stay in their owning workspace.
  if(actions)for(const link of heading.querySelectorAll<HTMLAnchorElement>('a[data-link]')){
    if(link.closest('form,details')||link.hasAttribute('data-action')||link.querySelector('input,select,textarea'))continue;
    actions.append(link);
  }
  // Overview's follow-up heading names a real section, not a duplicate page title.
  if(location.pathname!=='/admin')localTitle.hidden=true;
  const titleGroup=localTitle.parentElement;
  if(titleGroup)for(const child of titleGroup.children){
    if(child.matches('p,.eyebrow')&&!child.querySelector('a,button,input,select,textarea,summary')&&!child.hasAttribute('role'))(child as HTMLElement).hidden=true;
  }
  heading.classList.add('admin-context-heading');
  // Remove empty title containers, never hide a remaining interactive control or record badge.
  for(const child of [...heading.children])if(child instanceof HTMLElement&&child!==localTitle&&!child.querySelector('a,button,input,select,textarea,summary')&&[...child.children].length&&[...child.children].every(node=>(node as HTMLElement).hidden))child.hidden=true;
  const visible=[...heading.children].some(node=>!(node as HTMLElement).hidden&&Boolean(node.textContent?.trim()||node.querySelector('button,input,select,textarea')));
  if(!visible)heading.hidden=true;
}
export function initializeAdminShell(user:AuthUser,signal:AbortSignal):void {
  const app=document.querySelector('.admin-shell-v2');if(!app)return;
  const key='ootla:rail-collapsed:'+user.id+':'+user.organization.id;
  if(preferenceKey!==key){closeAdminDrawer(false);preferenceKey=key;}
  let collapsed=preferences.get(key)??false;
  try{const stored=sessionStorage.getItem(key);if(stored!==null)collapsed=stored==='true';}catch{/* Keep memory preference. */}
  root.dataset.adminRail=collapsed?'collapsed':'expanded';
  const restore=captureLocalScroll(app);normalizeDirectoryHeading();syncRail();syncDrawer();restore();
  initializeDsMenus(app as HTMLElement,signal);
  mobile.addEventListener('change',()=>{if(!mobile.matches)closeAdminDrawer(false);else syncDrawer();},{signal});
  document.addEventListener('keydown',event=>{
    if(!mobile.matches||root.dataset.adminDrawer!=='open')return;
    if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();closeAdminDrawer();return;}
    if(event.key!=='Tab')return;
    const aside=document.querySelector<HTMLElement>('.admin-rail');
    const controls=[...(aside?.querySelectorAll<HTMLElement>('a[href],button,[tabindex]')??[])].filter(element=>!element.hasAttribute('disabled')&&element.tabIndex>=0&&element.getClientRects().length>0);
    const first=controls[0],last=controls.at(-1);if(!first||!last)return;
    if(event.shiftKey&&(document.activeElement===first||!aside?.contains(document.activeElement))){event.preventDefault();last.focus({preventScroll:true});}
    else if(!event.shiftKey&&(document.activeElement===last||!aside?.contains(document.activeElement))){event.preventDefault();first.focus({preventScroll:true});}
  },{signal,capture:true});
}
