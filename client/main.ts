import {patchLocalHtml,captureLocalScroll,updateSummaryFromShell} from './lib/local-update';
import {loadRenewalWorkspace,initializeRenewalWorkspace} from './lib/renewals';
import {renewalWorkspacePage,renewalHeaderSummary} from './pages/renewals';
import {loadResidentAdministrationWorkspace,initializeResidentAdministration} from './lib/resident-administration';
import {residentAdministrationPage,residentAdministrationHeaderSummary} from './pages/resident-administration';
import './renewals.css';
import {initializeTablePagination} from './lib/table-pagination-controller';
import type {PublicAccessPresentation} from '../shared/public-access';
import {staffInvitationPage} from './pages/staff-invitation';
import {takeStaffInvitation,initializeStaffInvitation} from './lib/staff-invitation';
import {previewEntryPage} from './pages/preview-entry';
import type {PreviewEntry} from '../shared/preview-entry-contracts';
import {customerError} from './lib/customer-copy';
import { initializePhotoCredits } from './lib/photo-credits';
import { applyRouteSeo } from './lib/seo';
import './styles.css';
import './admin.css';
import './calendar.css';
import './home-preview.css';
import './public-workflow.css';
import './home.css';
import './public-pages.css';
import './workflows.css';
import './ai-demo.css';
import './platform.css';
import './integrations.css';
import './public-information.css';
import './property-foundation.css';
import './leads.css';
import './lead-workspace.css';
import './tasks.css';
import './table-pagination.css';
import './maintenance-directory.css';
import './imports.css';
import './brand.css';
import './account.css';
import './workspace-navigation.css';
import { settingsNavigation, reportsNavigation } from './pages/workspace-navigation';
import './applicant.css';
import './ai-assistant.css';
import './conversations.css';
import './ask-ootla.css';
import './automations.css';
import './google-analytics.css';
import './portfolio-reports.css';
import './resident.css';
import './maintenance-detail.css';
import './maintenance-conversation.css';
import './voice.css';
import './organization-admin.css';
import {loadOrganizationWorkspace,initializeOrganizationWorkspace} from './lib/organization-admin';
import {organizationWorkspacePage,organizationHeaderSummary} from './pages/organization-admin';
import {loadOperationsWorkspace,initializeOperationsWorkspace} from './lib/operations';
import {operationsWorkspacePage,operationsHeaderSummary} from './pages/operations';
import {loadVoiceWorkspace,initializeVoiceWorkspace} from './lib/voice';
import {voiceWorkspacePage,voiceHeaderSummary} from './pages/voice';
import {takeResidentInvitation,initializeResidentAuthentication,loadResidentWorkspace,initializeResidentWorkspace} from './lib/resident';
import {residentLoginPage,residentInvitationPage,residentErrorPage} from './pages/resident-auth';
import {residentWorkspacePage} from './pages/resident';
import {loadMaintenanceWorkspace,initializeMaintenanceWorkspace} from './lib/maintenance';
import {maintenanceWorkspacePage,maintenanceHeaderSummary} from './pages/maintenance';
import {loadPortfolioWorkspace} from './lib/portfolio-reports';
import {createPortfolioNavigation,type ReportNavigator} from './lib/report-navigation';
import {portfolioReportsPage,portfolioHeaderSummary} from './pages/portfolio-reports';
import {loadGoogleAnalyticsWorkspace,initializeGoogleAnalyticsWorkspace} from './lib/google-analytics';
import {googleAnalyticsPage,analyticsHeaderSummary} from './pages/google-analytics';
import {loadAutomationWorkspace,initializeAutomationWorkspace} from './lib/automations';
import {automationWorkspacePage} from './pages/automations';
import {initializeAskOotla,type AskOotlaController} from './lib/ask-ootla';
import {loadConversationWorkspace,initializeConversationWorkspace} from './lib/conversations';
import {conversationWorkspacePage} from './pages/conversations';
import {initializePublicConversation} from './lib/public-conversation';
import type {AskContext} from '../shared/conversation-contracts';
import {loadAiWorkspace,initializeAiAssistant} from './lib/ai-assistant';
import {aiAssistantPage} from './pages/ai-assistant';
import { paymentDemoPage } from './pages/payments';
import { takePaymentDemoToken, initializePaymentDemo } from './lib/payments';
import { loadApplicationsWorkspace, initializeApplicationsWorkspace } from './lib/applications';
import { applicationsWorkspacePage } from './pages/applications';
import { takeApplicantInvitation, renderApplicantAuthentication, initializeApplicantAuthentication, loadApplicantWorkspace, applicantWorkspacePage, initializeApplicantWorkspace, applicantRouteError } from './lib/applicant';
import './connectors.css';
import './public-refresh.css';
import './design-system.css';
import './admin-shell.css';
import {initializeAdminShell,closeAdminDrawer,toggleAdminDrawer,toggleAdminRail,clearAdminShellPreference} from './lib/admin-shell';
import {loadCalendarWorkspace} from './lib/calendar';
import {createCalendarNavigation,type CalendarNavigator} from './lib/calendar-navigation';
import { calendarWorkspacePage } from './pages/calendar';
import { bookingPage } from './pages/booking';
import { initializeBooking } from './lib/booking';
import { loadConnectorWorkspace, initializeConnectorWorkspace } from './lib/connectors';
import { connectorWorkspacePage } from './pages/connectors';
import { accountWorkspacePage } from './pages/account';
import { initializeAccountWorkspace } from './lib/account';
import type { AccountSnapshot } from '../shared/account-contracts';
import { loadImportsWorkspace, initializeImportsWorkspace } from './lib/imports';
import { importWorkspacePage } from './pages/imports';
import { loadTasksWorkspace, initializeTasksWorkspace } from './lib/tasks';
import { taskWorkspacePage } from './pages/tasks';
import type { TaskRecord, TaskReminder } from '../shared/task-contracts';
import type { Paginated } from '../shared/property-contracts';
import { initializeLeadWorkspace08 } from './lib/lead-workspace';
import { initializeLeadDetail } from './lib/lead-detail';
import { loadLeadWorkspace, initializeLeadWorkspace } from './lib/leads';
import { leadWorkspacePage } from './pages/leads';
import { persistentDashboardOverview } from './pages/dashboard';
import { loadPropertyWorkspace, initializePropertyWorkspace } from './lib/property-foundation';
import { propertyWorkspacePage } from './pages/properties';
import { initializeOnboardingDemo } from './lib/onboarding';
import { initializeAiDemonstrations } from './lib/ai-demo';
import { initializePublicWorkflow } from './lib/public-workflow';
import { api, ApiError, errorMessage, type AuthUser, type Overview, type DemoData } from './lib/api';
import { loading } from './lib/ui';
import type { AdminPageSummary, AdminSummaryPage } from '../shared/admin-summary-contracts';
import { clearHeaderPreference, readHeaderCollapsed, toggleHeaderSummary } from './lib/admin-header';
import { adminError, adminShell } from './pages/admin';
import { initializeLogin, loginPage } from './pages/login';
import { notFoundPage, publicPage } from './pages/public';

document.documentElement.classList.add('ootla-theme');
const app = document.querySelector<HTMLDivElement>('#app')!;
const publicRoutes = new Set(['/', '/platform', '/ai-workflows', '/workflows/leasing', '/workflows/resident-support', '/integrations', '/contact', '/privacy']);
const residentRoutes = new Set(['/resident','/resident/login','/resident/invite']);
const applicantRoutes = new Set(['/applicant', '/applicant/login', '/applicant/invite']);
const adminRoutes = new Set(['/admin/renewals', '/admin/resident-access', '/admin', '/admin/contacts', '/admin/leads', '/admin/properties', '/admin/applications', '/admin/calendar', '/admin/tasks', '/admin/imports', '/admin/profile', '/admin/settings', '/admin/analytics', '/admin/ai', '/admin/integrations', '/admin/conversations', '/admin/automations', '/admin/reports', '/admin/maintenance', '/admin/voice', '/admin/organization', '/admin/integration-health', '/admin/audit']);
const titles: Record<string, string> = {
  '/admin/renewals':'Property renewals - Ootla', '/admin/resident-access':'Resident access - Ootla',
  '/staff/invite':'Your Ootla invitation - Ootla',
  '/admin/organization':'Organization administration - Ootla', '/admin/integration-health':'Integration health - Ootla', '/admin/audit':'Audit history - Ootla',
  '/admin/voice':'Voice simulation - Ootla',
  '/resident':'My home - Ootla', '/resident/login':'Resident sign in - Ootla', '/resident/invite':'Resident invitation - Ootla', '/admin/maintenance':'Maintenance - Ootla',
  '/admin/reports':'CRM reports - Ootla',
  '/admin/conversations':'Customer conversations — Ootla',
  '/admin/automations':'Follow-ups & automation — Ootla',
  '/': 'OotlaAI — Keep leads moving. Keep people informed.', '/platform': 'The platform — OotlaAI', '/ai-workflows': 'AI workflows — OotlaAI', '/integrations': 'Integrations — OotlaAI', '/workflows/leasing': 'Leasing workflow — OotlaAI', '/workflows/resident-support': 'Resident support workflow — OotlaAI', '/admin/login': 'Staff sign in — Ootla',
  '/contact': 'Contact — OotlaAI', '/privacy': 'Privacy — OotlaAI',
  '/admin/profile': 'My profile \u2014 Ootla',
  '/admin/settings': 'Settings \u2014 Ootla',
  '/admin/imports': 'Customer-data import \u2014 Ootla',
  '/admin/contacts': 'Contacts \u2014 Ootla',
  '/admin': 'Overview — Ootla', '/admin/leads': 'Leads — Ootla', '/admin/properties': 'Properties — Ootla', '/admin/applications': 'Applications — Ootla', '/admin/calendar': 'Calendar — Ootla', '/admin/tasks': 'Tasks — Ootla', '/admin/analytics': 'Analytics — Ootla', '/admin/ai': 'AI assistant — Ootla', '/admin/integrations': 'Integrations — Ootla'
};
let currentController = new AbortController();
let routeGeneration = 0;
let currentBindingsController = new AbortController();
let currentAssistantController = new AbortController();
let assistantHandle:AskOotlaController|undefined;
let assistantIdentity = '';
let renderedUrl = location.href;
let submittedForm:HTMLFormElement|null = null;
type InPlaceRefresh={previousUrl:string;committedForm:HTMLFormElement|null};
function disposeStaffAssistant():void{
 currentAssistantController.abort();assistantHandle=undefined;assistantIdentity='';
}
function updateStaffAssistant(user:AuthUser,context:AskContext,label?:string):void{
 const identity=user.id+':'+user.organization.id;
 if(assistantHandle&&assistantIdentity===identity&&document.querySelector('#ask-ootla-dialog')){assistantHandle.updateContext(context,label);return;}
 disposeStaffAssistant();currentAssistantController=new AbortController();assistantIdentity=identity;
 assistantHandle=initializeAskOotla(currentAssistantController.signal,context,user,label);
}
function sameWorkspace(url:URL,previous=new URL(location.href)):boolean{
 if(url.origin!==previous.origin||url.pathname!==previous.pathname||!document.querySelector('#main-content'))return false;
 if(!adminRoutes.has(url.pathname)&&!['/resident','/applicant'].includes(url.pathname))return false;
 for(const key of ['lead','task','request','application','viewing','relationship','property','contact','unit','conversation','batch','connection'])if(url.searchParams.get(key)!==previous.searchParams.get(key))return false;
 if(['new','create','edit'].some(view=>url.searchParams.get('view')===view||previous.searchParams.get('view')===view)&&url.searchParams.get('view')!==previous.searchParams.get('view'))return false;
 return true;
}
document.addEventListener('submit',event=>{submittedForm=event.target instanceof HTMLFormElement?event.target:null;},{capture:true});

let reportNavigation: ReportNavigator | null = null;
let calendarNavigation: CalendarNavigator | null = null;
export function navigate(path: string, replace = false, focusSelector?: string): void {
  const url = new URL(path, location.origin);
  if (reportNavigation && location.pathname === '/admin/reports' && url.origin === location.origin && url.pathname === '/admin/reports') { reportNavigation(url, replace, focusSelector); return; }
  if (calendarNavigation && location.pathname === '/admin/calendar' && url.origin === location.origin && url.pathname === '/admin/calendar') { calendarNavigation(url, replace, focusSelector); return; }
  const refresh:InPlaceRefresh|undefined = sameWorkspace(url) ? {previousUrl:location.href,committedForm:replace&&submittedForm?.isConnected?submittedForm:null} : undefined;
  submittedForm=null;
  if (!focusSelector && !refresh) closeAdminDrawer(false);
  if (url.origin !== location.origin) return;
  if (replace) history.replaceState({}, '', url.pathname + url.search + url.hash);
  else history.pushState({}, '', url.pathname + url.search + url.hash);
  const retainedScroll=['#maintenance-results','#renewal-results','#resident-access-results'].includes(focusSelector??'') || focusSelector?.startsWith('#table-pagination-') ? window.scrollY : undefined;
  void render(true, focusSelector,retainedScroll,refresh);
}
async function render(moveFocus = false, focusSelector?: string, retainedScroll?:number,refresh?:InPlaceRefresh): Promise<void> {
  reportNavigation = null;
  calendarNavigation = null;
  if(!refresh)currentBindingsController.abort();
  if(!adminRoutes.has(location.pathname.replace(/\/$/,''))){disposeStaffAssistant();closeAdminDrawer(false);}
  currentController.abort();
  currentController = new AbortController();
  const { signal } = currentController;
  const generation = ++routeGeneration;
  if(refresh){app.dataset.refreshPending='true';document.querySelector('#main-content')?.setAttribute('aria-busy','true');}else delete app.dataset.refreshPending;
  const writePage=(html:string)=>{
   if(!refresh){app.innerHTML=html;return;}
   const restore=captureLocalScroll(app);patchLocalHtml(app,html,{committedForm:refresh.committedForm});restore();
  };
  const showRefreshError=(issue:unknown)=>{if(!refresh)return;history.replaceState({},'',refresh.previousUrl);delete app.dataset.refreshPending;document.querySelector('#main-content')?.removeAttribute('aria-busy');let output=document.querySelector<HTMLElement>('[data-workspace-refresh-error]');if(!output){output=document.createElement('p');output.className='cv-error';output.dataset.workspaceRefreshError='';output.setAttribute('role','alert');document.querySelector('#main-content')?.append(output);}output.textContent=customerError(issue);};
  const path = location.pathname.replace(/\/$/, '') || '/';
  const staffInvitation = path === '/staff/invite' ? takeStaffInvitation() : null;
  const query = new URLSearchParams(location.search);
  const residentInvitation = path === '/resident/invite' ? takeResidentInvitation() : null;
  const applicantInvitation = path === '/applicant/invite' ? takeApplicantInvitation() : null;
  const paymentDemoToken = path === '/payment-demo' ? takePaymentDemoToken() : null;
  if(!refresh) delete document.body.dataset.accountMotion;
  document.title = titles[path] ?? 'Page not found — Ootla';
  applyRouteSeo(path);
  document.body.className = residentRoutes.has(path) ? 'resident-body' : applicantRoutes.has(path) ? 'applicant-body' : adminRoutes.has(path) ? 'admin-body' : path === '/admin/login' || path === '/staff/invite' ? 'login-body' : 'public-body';
  if(path==='/staff/invite'){
    writePage(staffInvitationPage(Boolean(staffInvitation)));
    initializeStaffInvitation(signal,staffInvitation);
  } else if(path==='/try'){
    document.title='Try Ootla';writePage(previewEntryPage(true));
    if(query.size){writePage(previewEntryPage());return;}
    try{
      const response=await fetch('/api/preview-entry',{credentials:'same-origin',cache:'no-store',signal});
      if(![200,503].includes(response.status)||!response.headers.get('content-type')?.includes('application/json'))throw new Error('Preview entry unavailable.');
      const entry=await response.json() as PreviewEntry;if(signal.aborted||generation!==routeGeneration)return;
      if(entry.kind==='unavailable'||!entry.destination){writePage(previewEntryPage());return;}
      const target=new URL(entry.destination);
      if(!['staff_sign_in','isolated_preview','separate_preview'].includes(entry.kind)||!['http:','https:'].includes(target.protocol)||target.username||target.password||target.pathname!=='/admin/login'||target.search||target.hash||['staff_sign_in','isolated_preview'].includes(entry.kind)&&target.origin!==location.origin||entry.kind==='separate_preview'&&target.origin===location.origin)throw new Error('Preview entry unavailable.');
      location.replace(target.href);return;
    }catch{if(signal.aborted||generation!==routeGeneration)return;writePage(previewEntryPage());}
  } else if(residentRoutes.has(path)){
    if(path!=='/resident'){writePage(path==='/resident/invite'?residentInvitationPage(Boolean(residentInvitation)):residentLoginPage());void initializeResidentAuthentication(signal,navigate,residentInvitation);}
    else{if(!refresh) writePage(loading('Loading your private resident workspace'));try{const resident=await loadResidentWorkspace(query,signal);if(signal.aborted||generation!==routeGeneration)return;writePage(residentWorkspacePage(resident,query));initializeResidentWorkspace(signal,navigate,resident);}catch(issue){if(signal.aborted||generation!==routeGeneration)return;if(issue instanceof ApiError&&issue.status===401){navigate('/resident/login',true);return;}if(refresh)showRefreshError(issue);else writePage(residentErrorPage(customerError(issue)));}}
  } else if (path === '/payment-demo') {
    document.body.className = 'applicant-body';
    document.title = 'Payment preview — Ootla';
    writePage(paymentDemoPage());
    void initializePaymentDemo(signal, paymentDemoToken);
  } else if (applicantRoutes.has(path)) {
    document.title = path === '/applicant/login' ? 'Applicant sign in — Ootla' : path === '/applicant/invite' ? 'Your application invitation — Ootla' : 'My applications — Ootla';
    if (path !== '/applicant') {
      writePage(renderApplicantAuthentication(path, applicantInvitation));
      void initializeApplicantAuthentication(signal, navigate, applicantInvitation);
    } else {
      if(!refresh) writePage(loading('Loading your private applications'));
      try {
        const applicant = await loadApplicantWorkspace(query, signal);
        if (signal.aborted || generation !== routeGeneration) return;
        writePage(applicantWorkspacePage(applicant));
        initializeApplicantWorkspace(signal, navigate);
      } catch (issue) {
        if (signal.aborted || generation !== routeGeneration) return;
        const errorPage = applicantRouteError(issue, navigate);
        if (errorPage === null) return;
        if(refresh)showRefreshError(issue);else writePage(errorPage);
      }
    }
  } else if (path === '/book') {
    document.title='Book a viewing — Ootla';
    writePage(bookingPage());
    initializeBooking(signal);
  } else if (publicRoutes.has(path)) {
    let demoAccess = false;
    try {
      const response = await api<PublicAccessPresentation>('/api/public-access', { cache: 'no-store', signal: AbortSignal.any([signal, AbortSignal.timeout(2500)]) });
      demoAccess = response.demoAccess === true;
    } catch { /* Access controls remain hidden if runtime verification is unavailable. */ }
    if (signal.aborted || generation !== routeGeneration) return;
    writePage(publicPage(path, demoAccess));
    initializePublicConversation(signal);
    initializePhotoCredits(signal);
    if (path === '/') initializePublicWorkflow(signal);
    if (path === '/ai-workflows') initializeAiDemonstrations(signal);
    if (path === '/integrations') initializeOnboardingDemo(signal);
  }
  else if (path === '/admin/login') {
    writePage(loginPage());
    void initializeLogin(signal, navigate);
  } else if (adminRoutes.has(path)) {
    if(!refresh) writePage(loading());
    try {
      const { user } = await api<{ user: AuthUser }>('/api/auth/me', { signal });
      if(assistantIdentity&&assistantIdentity!==user.id+':'+user.organization.id)disposeStaffAssistant();
      const account = await api<AccountSnapshot>('/api/account', { signal });
      if (signal.aborted || generation !== routeGeneration) return;
      document.body.dataset.accountMotion = account.preferences.motion;
      if (path === '/admin/leads' && !query.has('view') && account.preferences.leadView === 'board') query.set('view','board');
      const accountPage = path === '/admin/profile' || path === '/admin/settings' ? { kind: path === '/admin/profile' ? 'profile' as const : 'settings' as const, account } : undefined;
      const period = new URLSearchParams({ period: query.get('period') ?? 'month' });
      const [overview, pageSummary] = await Promise.all([
        api<Overview>(`/api/admin/overview?${period}`, { signal }),
        path === '/admin' ? Promise.resolve(undefined) : api<AdminPageSummary>(`/api/admin/summary?${new URLSearchParams({ page: path.slice('/admin/'.length) as AdminSummaryPage, period: query.get('period') ?? 'month' })}`, { signal }),
      ]);
      const headerCollapsed = readHeaderCollapsed(user);
      const organization = path === '/admin/organization' ? await loadOrganizationWorkspace(query,signal) : undefined;
      const operations = path === '/admin/integration-health' || path === '/admin/audit' ? await loadOperationsWorkspace(path,query,signal) : undefined;
      const voice = path === '/admin/voice' ? await loadVoiceWorkspace(query,signal) : undefined;
      const renewals = path === '/admin/renewals' ? await loadRenewalWorkspace(query,signal) : undefined;
      const residentAdministration = path === '/admin/resident-access' ? await loadResidentAdministrationWorkspace(query,signal) : undefined;
      const maintenance = path === '/admin/maintenance' ? await loadMaintenanceWorkspace(query,signal) : undefined;
      const portfolio = path === '/admin/reports' ? await loadPortfolioWorkspace(query,signal) : undefined;
      const analytics = path === '/admin/analytics' ? await loadGoogleAnalyticsWorkspace(query,signal) : undefined;
      const automations = path === '/admin/automations' ? await loadAutomationWorkspace(query,signal) : undefined;
      const conversations = path === '/admin/conversations' ? await loadConversationWorkspace(query,signal) : undefined;
      const ai = path === '/admin/ai' ? await loadAiWorkspace(query,signal) : undefined;
      const applications = path === '/admin/applications' ? await loadApplicationsWorkspace(query, signal) : undefined;
      const foundation = path === '/admin/properties' || path === '/admin/contacts'
        ? await loadPropertyWorkspace(path, query, signal) : undefined;
      const leads = path === '/admin/leads' ? await loadLeadWorkspace(query, signal) : undefined;
      const calendar = path === '/admin/calendar' ? await loadCalendarWorkspace(query,signal) : undefined;
      const calendarSummary = calendar && pageSummary ? {...pageSummary,scopeLabel:'Your viewing schedule'} : pageSummary;
      const imports = path === '/admin/imports' ? await loadImportsWorkspace(query, signal) : undefined;
      const connectors = path === '/admin/integrations' ? await loadConnectorWorkspace(query, signal) : undefined;
      const canManageTasks = user.permissions.includes('leasing.manage');
      const tasks = path === '/admin/tasks' && canManageTasks ? await loadTasksWorkspace(query, signal) : undefined;
      const reminders = canManageTasks ? await api<Paginated<TaskReminder>>('/api/tasks/reminders?pageSize=5', { signal }) : undefined;
      const followupQuery = new URLSearchParams();
      for (const key of ['q', 'stages']) if (query.has(key)) followupQuery.set(key, query.get(key)!);
      const followups = path === '/admin' ? (canManageTasks ? await api<{ items: TaskRecord[] }>(`/api/tasks/follow-ups?${followupQuery}`, { signal }) : { items: [] }) : undefined;
      const demo = !renewals && !residentAdministration && !organization && !operations && !voice && !maintenance && !portfolio && !analytics && !automations && !conversations && !ai && !applications && !calendar && !accountPage && !connectors && path !== '/admin/imports' && path !== '/admin/tasks' && !foundation && !leads && !followups && overview.demoEnabled && user.organization.role === 'organization_admin'
        ? await api<DemoData>('/api/demo/data', { signal })
        : undefined;
      if (signal.aborted || generation !== routeGeneration) return;
      const workspaceContent = renewals ? renewalWorkspacePage(renewals,user) : residentAdministration ? residentAdministrationPage(residentAdministration,user) : organization ? organizationWorkspacePage(organization,query) : operations ? operationsWorkspacePage(operations,query) : voice ? voiceWorkspacePage(voice,query) : maintenance ? maintenanceWorkspacePage(maintenance,user) : portfolio ? portfolioReportsPage(portfolio,query) : analytics ? googleAnalyticsPage(analytics,query) : automations ? automationWorkspacePage(automations,query,reminders) : conversations ? conversationWorkspacePage(conversations,query) : ai ? aiAssistantPage(ai,user,query) : applications ? applicationsWorkspacePage(applications, user, query) : calendar ? calendarWorkspacePage(calendar,user,query) : accountPage ? accountWorkspacePage(accountPage, user, query) : connectors ? connectorWorkspacePage(connectors, user, query) : imports ? importWorkspacePage(imports, user, query) : foundation ? propertyWorkspacePage(foundation, user, query) : leads ? leadWorkspacePage(leads, user, query) : tasks ? taskWorkspacePage(tasks, user, query) : path === '/admin/tasks' ? '<section class="card module-empty"><h2>Tasks are restricted to authorized staff</h2><p>Your current role does not grant access to private task details. Ask an organization administrator to review your permissions.</p></section>' : followups ? persistentDashboardOverview(followups.items, Boolean(overview.demoEnabled)) : undefined;
      const sectionNavigation = ['/admin/resident-access','/admin/settings','/admin/organization','/admin/integrations','/admin/imports','/admin/automations','/admin/integration-health','/admin/audit'].includes(path)
        ? settingsNavigation(path,user) : ['/admin/reports','/admin/analytics'].includes(path) ? reportsNavigation(path) : '';
      const groupedContent = workspaceContent === undefined ? undefined : sectionNavigation + workspaceContent;
      writePage(adminShell(path, user, overview, false, demo, query, groupedContent, reminders, renewals ? renewalHeaderSummary(renewals) : residentAdministration ? residentAdministrationHeaderSummary(residentAdministration) : organization ? organizationHeaderSummary(organization) : operations ? operationsHeaderSummary(operations) : voice ? voiceHeaderSummary(voice) : maintenance ? maintenanceHeaderSummary(maintenance) : portfolio ? portfolioHeaderSummary(portfolio) : analytics ? analyticsHeaderSummary(analytics) : calendarSummary, headerCollapsed));
      currentBindingsController.abort();currentBindingsController=new AbortController();
      const bindingSignal=currentBindingsController.signal;
      initializeAdminShell(user,bindingSignal);
      if (!portfolio && !calendar) initializeTablePagination(bindingSignal,navigate);
      if (organization) initializeOrganizationWorkspace(bindingSignal,navigate,organization);
      if (operations) initializeOperationsWorkspace(bindingSignal,navigate);
      if (voice) initializeVoiceWorkspace(bindingSignal,navigate,voice);
      if (maintenance) initializeMaintenanceWorkspace(bindingSignal,navigate,maintenance,summary=>updateSummaryFromShell(adminShell(path,user,overview,false,undefined,new URLSearchParams(location.search),'',reminders,summary,readHeaderCollapsed(user))));
      if (renewals) initializeRenewalWorkspace(bindingSignal,navigate,renewals,summary=>updateSummaryFromShell(adminShell(path,user,overview,false,undefined,new URLSearchParams(location.search),'',reminders,summary,readHeaderCollapsed(user))));
      if (residentAdministration) initializeResidentAdministration(bindingSignal,navigate,residentAdministration);
      if (portfolio) reportNavigation = createPortfolioNavigation(bindingSignal,navigate,portfolio,user,overview,(context,label)=>updateStaffAssistant(user,context,label));
      if (analytics) initializeGoogleAnalyticsWorkspace(bindingSignal,navigate);
      if (automations) initializeAutomationWorkspace(bindingSignal,navigate,automations);
      if (conversations) initializeConversationWorkspace(bindingSignal,navigate,conversations);
      const askContext:AskContext={page:path};
      if(!portfolio&&query.get('propertyId'))askContext.propertyId=query.get('propertyId')!;
      if(foundation?.kind==='property')askContext.propertyId=foundation.detail.property.id;
      if(foundation?.kind==='contact')askContext.contactId=foundation.detail.contact.id;
      if(leads?.kind==='detail'){askContext.propertyId=leads.detail.lead.propertyId;askContext.leadId=leads.detail.lead.id;askContext.contactId=leads.detail.lead.contactId;if(leads.detail.lead.unitId)askContext.unitId=leads.detail.lead.unitId;}
      if(applications?.kind==='detail'){askContext.propertyId=applications.detail.application.property.id;askContext.applicationId=applications.detail.application.id;if(applications.detail.application.unit)askContext.unitId=applications.detail.application.unit.id;if(applications.detail.application.leadId)askContext.leadId=applications.detail.application.leadId;}
      if(calendar?.kind==='detail'){askContext.propertyId=calendar.detail.viewing.property.id;askContext.viewingId=calendar.detail.viewing.id;askContext.leadId=calendar.detail.viewing.lead.id;if(calendar.detail.viewing.unit)askContext.unitId=calendar.detail.viewing.unit.id;}
      if(tasks?.kind==='detail'){askContext.propertyId=tasks.detail.task.propertyId;askContext.taskId=tasks.detail.task.id;if(tasks.detail.task.contactId)askContext.contactId=tasks.detail.task.contactId;if(tasks.detail.task.leadId)askContext.leadId=tasks.detail.task.leadId;if(tasks.detail.task.applicationId)askContext.applicationId=tasks.detail.task.applicationId;}
      if(ai?.kind==='ready'&&ai.options.selectedProperty){askContext.propertyId=ai.options.selectedProperty.id;if(query.get('leadId'))askContext.leadId=query.get('leadId')!;if(query.get('applicationId'))askContext.applicationId=query.get('applicationId')!;}
      if(conversations?.kind==='ready'&&conversations.detail){askContext.propertyId=conversations.detail.conversation.property.id;askContext.leadId=conversations.detail.conversation.leadId;}
      if(automations?.kind==='ready'&&automations.detail?.rule.propertyId)askContext.propertyId=automations.detail.rule.propertyId;
      if(analytics?.kind==='ready'&&analytics.status.selectedProperty?.crmPropertyId)askContext.propertyId=analytics.status.selectedProperty.crmPropertyId;
      if(portfolio?.kind==='ready'&&portfolio.report){const q=portfolio.report.query;askContext.report={from:q.from,to:q.to,attention:q.attention,q:q.q,...(q.groupId?{groupId:q.groupId}:{}),...(q.region?{region:q.region}:{}),...(q.agentMembershipId?{agentMembershipId:q.agentMembershipId}:{}),...(q.teamId?{teamId:q.teamId}:{})};if(q.propertyId)askContext.propertyId=q.propertyId;}
      if(maintenance?.kind==='ready'&&maintenance.detail){askContext.propertyId=maintenance.detail.request.property.id;askContext.maintenanceRequestId=maintenance.detail.request.id;if(maintenance.detail.request.unit)askContext.unitId=maintenance.detail.request.unit.id;}
      if(voice?.kind==='ready'&&voice.detail){askContext.propertyId=voice.detail.session.property.id;askContext.leadId=voice.detail.session.leadId;}
      updateStaffAssistant(user,askContext);
      if (ai) initializeAiAssistant(bindingSignal,navigate,ai);
      if (applications) initializeApplicationsWorkspace(bindingSignal,navigate,user);
      if (calendar) calendarNavigation = createCalendarNavigation(bindingSignal,navigate,calendar,user,overview,(context,label)=>updateStaffAssistant(user,context,label));
      if (accountPage) initializeAccountWorkspace(bindingSignal, navigate);
      if (connectors) initializeConnectorWorkspace(bindingSignal, navigate);
      if (imports) initializeImportsWorkspace(bindingSignal, navigate);
      if (tasks) initializeTasksWorkspace(bindingSignal, navigate);
      if (foundation) initializePropertyWorkspace(bindingSignal, navigate);
      if (leads) { initializeLeadWorkspace(bindingSignal, navigate); if (leads.kind === 'detail') { initializeLeadWorkspace08(bindingSignal, navigate); initializeLeadDetail(bindingSignal, navigate); } }

    } catch (error) {
      if (signal.aborted || generation !== routeGeneration) return;
      if (error instanceof ApiError && error.status === 401) {
        const returnTo = path + location.search;
        navigate(`/admin/login?returnTo=${encodeURIComponent(returnTo)}`, true);
        return;
      }
      if(refresh){showRefreshError(error);return;}
      writePage(adminError(['/admin/organization','/admin/integration-health','/admin/audit','/admin/integrations'].includes(path)?errorMessage(error):customerError(error)));
    }
  } else writePage(notFoundPage());
  if (!refresh && moveFocus && generation === routeGeneration) {
    const requestedFocus = focusSelector ? document.querySelector<HTMLElement>(focusSelector) : null;
    if (requestedFocus) {
      if(retainedScroll!==undefined)window.scrollTo({top:Math.min(retainedScroll,Math.max(0,document.documentElement.scrollHeight-window.innerHeight)),behavior:'instant'});
      requestedFocus.focus({ preventScroll: true });
      if (focusSelector?.startsWith('#lead08-')) requestedFocus.scrollIntoView({ block: 'start', behavior: 'instant' });
    }
    else {
      window.scrollTo({ top: 0, behavior: 'instant' });
      const main = document.querySelector<HTMLElement>('#main-content');
      main?.setAttribute('tabindex', '-1');
      main?.focus({ preventScroll: true });
    }
  }
  if(generation===routeGeneration){renderedUrl=location.href;delete app.dataset.refreshPending;document.querySelector('#main-content')?.removeAttribute('aria-busy');}
  if (generation === routeGeneration && publicRoutes.has(path) && location.hash) {
    let anchorId: string;
    try { anchorId = decodeURIComponent(location.hash.slice(1)); }
    catch { return; }
    const anchor = document.getElementById(anchorId);
    if (anchor && app.contains(anchor)) {
      anchor.scrollIntoView({ behavior: 'instant', block: 'start' });
      if (moveFocus) {
        anchor.setAttribute('tabindex', '-1');
        anchor.focus({ preventScroll: true });
      }
    }
  }
}
const popoverSelector = '[data-action="lead-search"], [data-action="notifications"], [data-action="account-menu"]';
function closePopovers(except?: HTMLButtonElement): void {
  document.querySelectorAll<HTMLButtonElement>(popoverSelector).forEach(button => {
    if (button === except) return;
    button.setAttribute('aria-expanded', 'false');
    const panel = document.getElementById(button.getAttribute('aria-controls') ?? '');
    if (panel) panel.hidden = true;
  });
}
function togglePopover(button: HTMLButtonElement): void {
  const opening = button.getAttribute('aria-expanded') !== 'true';
  closePopovers(button);
  button.setAttribute('aria-expanded', String(opening));
  const panel = document.getElementById(button.getAttribute('aria-controls') ?? '');
  if (panel) {
    panel.hidden = !opening;
    if (opening) panel.querySelector<HTMLElement>('input,button,a[href]')?.focus();
  }
}
document.addEventListener('click', (event) => {
  if (!(event.target instanceof Element)) return;
  if (!event.target.closest('.admin-header-actions')) closePopovers();
  if (!event.target.closest('.public-workflow-menu')) document.querySelectorAll<HTMLDetailsElement>('.public-workflow-menu[open]').forEach(menu => { menu.open = false; });
  const anchor = event.target.closest<HTMLAnchorElement>('a[data-link]');
  if (anchor && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey && event.button === 0 && (!anchor.target || anchor.target === '_self')) {
    const url = new URL(anchor.href, location.origin);
    if (url.origin === location.origin) { event.preventDefault(); navigate(url.pathname + url.search + url.hash); }
    return;
  }
  const button = event.target.closest<HTMLButtonElement>('button[data-action]');
  if (!button) return;
  const action = button.dataset.action;
  if (action === 'retry') void render();
  if (action === 'public-menu') {
    const expanded = button.getAttribute('aria-expanded') === 'true';
    button.setAttribute('aria-expanded', String(!expanded));
    document.getElementById(button.getAttribute('aria-controls') ?? '')?.classList.toggle('is-open', !expanded);
    button.setAttribute('aria-label', expanded ? 'Open navigation' : 'Close navigation');
  }
  if (action === 'admin-menu') toggleAdminDrawer(button);
  if (action === 'rail-close') closeAdminDrawer();
  if (action === 'rail-collapse') toggleAdminRail();
  if (action === 'lead-search' || action === 'notifications' || action === 'account-menu') togglePopover(button);
  if (action === 'header-summary') toggleHeaderSummary(button);
  if (action === 'logout') void logout(button);
});
document.addEventListener('change', (event) => {
  const input = event.target;
  if (input instanceof HTMLSelectElement && input.id === 'dashboard-period') {
    const url = new URL(location.href);
    url.searchParams.set('period', input.value);
    navigate(url.pathname + url.search, false, '#dashboard-period');
  }
  if (input instanceof HTMLInputElement && input.name === 'stage') {
    const stages = [...document.querySelectorAll<HTMLInputElement>('input[name="stage"]:checked')].map(item => item.value);
    const url = new URL(location.href);
    if (url.pathname !== '/admin/leads') url.pathname = '/admin';
    url.searchParams.delete('lead');
    if (url.pathname === '/admin/leads') {
      const canonical: Record<string, string> = { new: 'new_inquiry', contacted: 'contacted', viewing_scheduled: 'tour_scheduled', qualified: 'application_started' };
      const selected = input.checked ? input.value : stages.at(-1);
      url.searchParams.delete('stages');
      url.searchParams.delete('stage');
      url.searchParams.delete('page');
      if (selected && canonical[selected]) { url.searchParams.set('stage', canonical[selected]); url.searchParams.set('intent', 'leasing'); }
      if (url.searchParams.get('view') === 'new') url.searchParams.delete('view');
    } else {
      url.searchParams.delete('view');
      if (stages.length) url.searchParams.set('stages', stages.join(','));
      else url.searchParams.delete('stages');
    }
    navigate(url.pathname + url.search, false, `input[name="stage"][value="${input.value}"]`);
  }
});
document.addEventListener('submit', (event) => {
  const form = event.target;
  if (!(form instanceof HTMLFormElement) || form.id !== 'lead-search-form') return;
  event.preventDefault();
  const query = String(new FormData(form).get('q') ?? '').trim().slice(0, 200);
  const parameters = new URLSearchParams();
  if (query) parameters.set('q', query);
  const period = new URLSearchParams(location.search).get('period');
  if (period) parameters.set('period', period);
  navigate('/admin/leads' + (parameters.size ? '?' + parameters : ''));
});
document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  const workflowMenu = document.querySelector<HTMLDetailsElement>('.public-workflow-menu[open]');
  if (workflowMenu) { workflowMenu.open = false; workflowMenu.querySelector<HTMLElement>('summary')?.focus(); return; }
  const popover = document.querySelector<HTMLButtonElement>(`${popoverSelector.split(',').map(selector => selector.trim() + '[aria-expanded="true"]').join(',')}`);
  if (popover) { closePopovers(); popover.focus(); return; }
  const open = document.querySelector<HTMLButtonElement>('[data-action="public-menu"][aria-expanded="true"], [data-action="admin-menu"][aria-expanded="true"]');
  if (open) { open.click(); open.focus(); }
});
async function logout(button: HTMLButtonElement): Promise<void> {
  button.disabled = true;
  try {
    await api('/api/auth/logout', { method: 'POST' });
    clearHeaderPreference();
    clearAdminShellPreference();
    navigate('/admin/login', true);
  } catch (error) {
    button.disabled = false;
    const errorElement = document.querySelector('#logout-error');
    if (errorElement) errorElement.textContent = customerError(error);
  }
}
window.addEventListener('popstate', () => { if (reportNavigation && location.pathname === '/admin/reports') reportNavigation(new URL(location.href),false,undefined,true); else if(calendarNavigation && location.pathname === '/admin/calendar') calendarNavigation(new URL(location.href),false,undefined,true); else {const previous=new URL(renderedUrl,location.origin),target=new URL(location.href);void render(true,undefined,undefined,sameWorkspace(target,previous)?{previousUrl:renderedUrl,committedForm:null}:undefined);} });
void render();