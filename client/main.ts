import {initializeStaffPages} from './lib/staff-pages';
import {initializeStaffAssistant} from './lib/staff-assistant';
import './operations.css';
import { initializePhotoCredits } from './lib/photo-credits';
import { applyRouteSeo } from './lib/seo';
import './styles.css';
import './pilot.css';
import './admin.css';
import './home-preview.css';
import './public-workflow.css';
import './home.css';
import './public-pages.css';
import './workflows.css';
import './ai-demo.css';
import './platform.css';
import './integrations.css';
import './public-information.css';
import './brand.css';
import './applicant.css';
import { paymentDemoPage } from './pages/payments';
import { takePaymentDemoToken, initializePaymentDemo } from './lib/payments';
import { takeApplicantInvitation, renderApplicantAuthentication, initializeApplicantAuthentication, loadApplicantWorkspace, applicantWorkspacePage, initializeApplicantWorkspace, applicantRouteError } from './lib/applicant';
import './public-refresh.css';
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-500.css';
import '@fontsource/inter/latin-600.css';
import '@fontsource/inter/latin-700.css';
import '../src/styles/tokens.css';
import '../src/styles/workspaces.css';
import '../src/styles/staff.css';
import {initializeShell,shellLoading} from './lib/app-shell';
import { bookingPage } from './pages/booking';
import { initializeBooking } from './lib/booking';
import { accountWorkspacePage } from './pages/account';
import { initializeAccountWorkspace } from './lib/account';
import type { AccountSnapshot } from '../shared/account-contracts';
import type { TaskRecord, TaskReminder } from '../shared/task-contracts';
import type { Paginated } from '../shared/property-contracts';
import {dashboardPlaceholder,initializeBentoDashboard} from './lib/bento-dashboard';
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

const app = document.querySelector<HTMLDivElement>('#app')!;
const publicRoutes = new Set(['/', '/platform', '/ai-workflows', '/workflows/leasing', '/workflows/resident-support', '/integrations', '/contact', '/privacy']);
const applicantRoutes = new Set(['/applicant', '/applicant/login', '/applicant/invite']);
const operationsRoutes=new Set(['/admin/vendor-work','/admin/inspections','/admin/notifications','/admin/resident-documents','/admin/property-insights','/admin/maintenance','/admin/renewals','/admin/vacancies','/admin/duplicates','/admin/response-targets','/admin/attention','/admin/intake','/admin/inbox','/admin/automations','/admin/residents','/admin/workspace','/admin/knowledge','/admin/reports']);
const adminRoutes = new Set([...operationsRoutes,'/admin/team', '/admin/onboarding','/admin', '/admin/contacts', '/admin/leads', '/admin/properties', '/admin/applications', '/admin/calendar', '/admin/tasks', '/admin/imports', '/admin/profile', '/admin/settings', '/admin/analytics', '/admin/ai', '/admin/integrations']);
const titles: Record<string, string> = {
  '/admin/vendor-work':'Vendor collaboration — Ootla','/admin/inspections':'Property inspections — Ootla','/admin/notifications':'Notification centre — Ootla','/admin/resident-documents':'Resident documents — Ootla','/admin/property-insights':'Property operations dashboard — Ootla',
  '/admin/maintenance':'Maintenance dispatch — Ootla','/admin/renewals':'Renewals and move-outs — Ootla','/admin/vacancies':'Vacancies and waitlists — Ootla','/admin/duplicates':'Duplicate resolution — Ootla','/admin/response-targets':'Response targets — Ootla',
  '/admin/attention':'Needs attention — Ootla','/admin/intake':'Inquiry forms — Ootla','/admin/inbox':'Shared inbox — Ootla','/admin/automations':'Follow-up rules — Ootla','/admin/residents':'Resident requests — Ootla','/admin/workspace':'Search & saved work — Ootla','/admin/knowledge':'Property knowledge — Ootla','/admin/reports':'Operations reports — Ootla',
  '/admin/team':'Team & access — Ootla', '/admin/onboarding':'Getting started — Ootla', '/staff/access':'Staff access — Ootla',
  '/': 'OotlaAI — Keep leads moving. Keep people informed.', '/platform': 'The platform — OotlaAI', '/ai-workflows': 'AI workflows — OotlaAI', '/integrations': 'Integrations — OotlaAI', '/workflows/leasing': 'Leasing workflow — OotlaAI', '/workflows/resident-support': 'Resident support workflow — OotlaAI', '/admin/login': 'Staff sign in — Ootla',
  '/contact': 'Contact — OotlaAI', '/privacy': 'Privacy — OotlaAI',
  '/admin/profile': 'My profile \u2014 Ootla',
  '/admin/settings': 'Settings \u2014 Ootla',
  '/admin/imports': 'Customer-data import \u2014 Ootla',
  '/admin/contacts': 'Contacts & households \u2014 Ootla',
  '/admin': 'Overview — Ootla', '/admin/leads': 'Leads — Ootla', '/admin/properties': 'Properties — Ootla', '/admin/applications': 'Applications — Ootla', '/admin/calendar': 'Calendar — Ootla', '/admin/tasks': 'Tasks — Ootla', '/admin/analytics': 'Analytics — Ootla', '/admin/ai': 'AI assistant — Ootla', '/admin/integrations': 'Integrations — Ootla'
};
let currentController = new AbortController();
let routeGeneration = 0;
let workspaceMenuOpen = false;
export function navigate(path: string, replace = false, focusSelector?: string): void {
  const url = new URL(path, location.origin);
  if (!focusSelector) workspaceMenuOpen = false;
  if (url.origin !== location.origin) return;
  if (replace) history.replaceState({}, '', url.pathname + url.search + url.hash);
  else history.pushState({}, '', url.pathname + url.search + url.hash);
  void render(true, focusSelector);
}
async function render(moveFocus = false, focusSelector?: string): Promise<void> {
  currentController.abort();
  currentController = new AbortController();
  const { signal } = currentController;
  const generation = ++routeGeneration;
  const path = location.pathname.replace(/\/$/, '') || '/';
  const query = new URLSearchParams(location.search);
  if(path==='/vendor'){const module=await import('./lib/property-collaboration');const token=new URLSearchParams(location.hash.slice(1)).get('token');history.replaceState({},'', '/vendor');document.title='Vendor job — Ootla';document.body.className='applicant-body';applyRouteSeo(path);try{const page=await module.vendorPage(token,signal);if(signal.aborted||generation!==routeGeneration)return;app.innerHTML='<main class="ops-public">'+page+'</main>';module.initializeCollaboration(signal,navigate);}catch{if(!signal.aborted)app.innerHTML='<main class="ops-public"><h1>Vendor access unavailable</h1><p>Ask the property team for a current job link.</p></main>';}return;}
  if (path === '/staff/access') {
    const {staffAccessPage,initializeStaffAccess}=await import('./lib/pilot');
    document.title = 'Staff access — Ootla';
    const value = new URLSearchParams(location.hash.slice(1)).get('token');
    history.replaceState({}, '', '/staff/access');
    const token = value && /^[a-f0-9]{64}$/.test(value) ? value : null;
    document.body.className = 'staff-access-body';
    applyRouteSeo(path);
    app.innerHTML = staffAccessPage(token);
    initializeStaffAccess(token, signal);
    return;
  }
  const applicantInvitation = path === '/applicant/invite' ? takeApplicantInvitation() : null;
  const paymentDemoToken = path === '/payment-demo' ? takePaymentDemoToken() : null;
  delete document.body.dataset.accountMotion;
  document.title = titles[path] ?? 'Page not found — Ootla';
  applyRouteSeo(path);
  document.body.className = applicantRoutes.has(path) ? 'applicant-body' : adminRoutes.has(path) ? 'admin-body' : path === '/admin/login' ? 'login-body' : 'public-body';
  if (path === '/inquire' || path === '/resident') {
    document.title=path==='/inquire'?'Property inquiry — Ootla':'My resident workspace — Ootla';document.body.className='applicant-body';
    app.innerHTML=loading('Opening your workspace');
    const module=await import('./lib/operations');
    try{const page=await module.loadPublicOperations(path,query,signal);if(signal.aborted||generation!==routeGeneration)return;app.innerHTML='<main id="main-content" class="ops-public">'+page.replace('<h2>','<h1>').replace('</h2>','</h1>')+'</main>';module.initializeOperations(signal,navigate);}
    catch(error){if(!signal.aborted)app.innerHTML='<main class="ops-public">'+module.operationsError(error)+'</main>';}
  } else if (path === '/payment-demo') {
    document.body.className = 'applicant-body';
    document.title = 'Simulated payment provider — Ootla';
    app.innerHTML = paymentDemoPage();
    void initializePaymentDemo(signal, paymentDemoToken);
  } else if (applicantRoutes.has(path)) {
    document.title = path === '/applicant/login' ? 'Applicant sign in — Ootla' : path === '/applicant/invite' ? 'Your application invitation — Ootla' : 'My applications — Ootla';
    if (path !== '/applicant') {
      app.innerHTML = renderApplicantAuthentication(path, applicantInvitation);
      void initializeApplicantAuthentication(signal, navigate, applicantInvitation);
    } else {
      app.innerHTML = loading('Loading your private applications');
      try {
        const applicant = await loadApplicantWorkspace(query, signal);
        if (signal.aborted || generation !== routeGeneration) return;
        app.innerHTML = applicantWorkspacePage(applicant);
        initializeApplicantWorkspace(signal, navigate);
      } catch (issue) {
        if (signal.aborted || generation !== routeGeneration) return;
        const errorPage = applicantRouteError(issue, navigate);
        if (errorPage === null) return;
        app.innerHTML = errorPage;
      }
    }
  } else if (path === '/book') {
    document.title='Book a viewing — Ootla';
    app.innerHTML=bookingPage();
    initializeBooking(signal);
  } else if (publicRoutes.has(path)) {
    app.innerHTML = publicPage(path);
    initializePhotoCredits(signal);
    if (path === '/') initializePublicWorkflow(signal);
    if (path === '/ai-workflows') initializeAiDemonstrations(signal);
    if (path === '/integrations') initializeOnboardingDemo(signal);
  }
  else if (path === '/admin/login') {
    app.innerHTML = loginPage();
    void initializeLogin(signal, navigate);
  } else if (adminRoutes.has(path)) {
    app.innerHTML = shellLoading();
    try {
      const { user } = await api<{ user: AuthUser }>('/api/auth/me', { signal });
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
      const { loadPilotPage, initializePilot, staffAccessPage, initializeStaffAccess } = ["/admin/ai","/admin/analytics","/admin/team","/admin/onboarding"].includes(path) ? await import('./lib/pilot') : {};
      const { loadApplicationsWorkspace, initializeApplicationsWorkspace } = ["/admin/applications"].includes(path) ? await import('./lib/applications') : {};
      const { loadCalendarWorkspace,initializeCalendarWorkspace } = ["/admin/calendar"].includes(path) ? await import('./lib/calendar') : {};
      const { loadConnectorWorkspace, initializeConnectorWorkspace } = ["/admin/integrations"].includes(path) ? await import('./lib/connectors') : {};
      const { loadImportsWorkspace, initializeImportsWorkspace } = ["/admin/imports"].includes(path) ? await import('./lib/imports') : {};
      const { loadTasksWorkspace, initializeTasksWorkspace } = ["/admin/tasks"].includes(path) ? await import('./lib/tasks') : {};
      const { loadPropertyWorkspace, initializePropertyWorkspace } = ["/admin/properties","/admin/contacts"].includes(path) ? await import('./lib/property-foundation') : {};
      const { loadLeadWorkspace, initializeLeadWorkspace } = ["/admin/leads"].includes(path) ? await import('./lib/leads') : {};
      const { initializeLeadWorkspace08 } = ["/admin/leads"].includes(path) ? await import('./lib/lead-workspace') : {};
      const { applicationsWorkspacePage } = ["/admin/applications"].includes(path) ? await import('./pages/applications') : {};
      const { calendarWorkspacePage } = ["/admin/calendar"].includes(path) ? await import('./pages/calendar') : {};
      const { connectorWorkspacePage } = ["/admin/integrations"].includes(path) ? await import('./pages/connectors') : {};
      const { importWorkspacePage } = ["/admin/imports"].includes(path) ? await import('./pages/imports') : {};
      const { taskWorkspacePage } = ["/admin/tasks"].includes(path) ? await import('./pages/tasks') : {};
      const { propertyWorkspacePage } = ["/admin/properties","/admin/contacts"].includes(path) ? await import('./pages/properties') : {};
      const { leadWorkspacePage } = ["/admin/leads"].includes(path) ? await import('./pages/leads') : {};
      const operationsModule=operationsRoutes.has(path)?await import('./lib/operations'):undefined;
      const operations=await operationsModule?.loadOperationsPage(path,query,user,signal);
      const pilot = await loadPilotPage?.(path, query, user, signal);
      const applications = path === '/admin/applications' ? await loadApplicationsWorkspace!(query, signal) : undefined;
      const foundation = path === '/admin/properties' || path === '/admin/contacts'
        ? await loadPropertyWorkspace!(path, query, signal) : undefined;
      const directoryQuery=new URLSearchParams(query);if(directoryQuery.get('view')!=='record')directoryQuery.delete('lead');
      const leads = path === '/admin/leads' ? await loadLeadWorkspace!(directoryQuery, signal) : undefined;
      const calendar = path === '/admin/calendar' ? await loadCalendarWorkspace!(query,signal) : undefined;
      const imports = path === '/admin/imports' ? await loadImportsWorkspace!(query, signal) : undefined;
      const connectors = path === '/admin/integrations' ? await loadConnectorWorkspace!(query, signal) : undefined;
      const canManageTasks = user.permissions.includes('leasing.manage');
      const tasks = path === '/admin/tasks' && canManageTasks ? await loadTasksWorkspace!(query, signal) : undefined;
      const notifications=canManageTasks?await api<import('./pages/admin').HeaderNotifications>('/api/property-collaboration/notifications?view=unread',{signal}):undefined;
      const reminders = canManageTasks ? await api<Paginated<TaskReminder>>('/api/tasks/reminders?pageSize=5', { signal }) : undefined;
      const followupQuery = new URLSearchParams();
      for (const key of ['q', 'stages']) if (query.has(key)) followupQuery.set(key, query.get(key)!);
      const followups = path === '/admin';
      const demo = !operations && !pilot && !applications && !calendar && !accountPage && !connectors && path !== '/admin/imports' && path !== '/admin/tasks' && !foundation && !leads && !followups && overview.demoEnabled && user.organization.role === 'organization_admin'
        ? await api<DemoData>('/api/demo/data', { signal })
        : undefined;
      if (signal.aborted || generation !== routeGeneration) return;
      app.innerHTML = adminShell(path, user, overview, false, demo, query, operations ?? pilot ?? (applications ? applicationsWorkspacePage!(applications, user, query) : calendar ? calendarWorkspacePage!(calendar,user,query) : accountPage ? accountWorkspacePage(accountPage, user, query) : connectors ? connectorWorkspacePage!(connectors, user, query) : imports ? importWorkspacePage!(imports, user, query) : foundation ? propertyWorkspacePage!(foundation, user, query) : leads ? leadWorkspacePage!(leads, user, query) : tasks ? taskWorkspacePage!(tasks, user, query) : path === '/admin/tasks' ? '<section class="card module-empty"><h2>Tasks are restricted to authorized staff</h2><p>Your current role does not grant access to private task details. Ask an organization administrator to review your permissions.</p></section>' : path === '/admin' ? dashboardPlaceholder() : undefined), reminders, pageSummary, headerCollapsed, notifications);
      initializeShell(signal,navigate);
      initializeStaffPages(signal,navigate);
      initializeStaffAssistant(signal,user,navigate);
      if(path==='/admin')initializeBentoDashboard(signal,user,overview);
      if (operations) operationsModule!.initializeOperations(signal,navigate);
      if (pilot) initializePilot!(signal, navigate, user);
      if (applications) initializeApplicationsWorkspace!(signal,navigate,user);
      if (calendar) initializeCalendarWorkspace!(signal,navigate);
      if (accountPage) initializeAccountWorkspace(signal, navigate);
      if (connectors) initializeConnectorWorkspace!(signal, navigate);
      if (imports) initializeImportsWorkspace!(signal, navigate);
      if (tasks) initializeTasksWorkspace!(signal, navigate);
      if (foundation) initializePropertyWorkspace!(signal, navigate);
      if (leads) { initializeLeadWorkspace!(signal, navigate); if (leads.kind === 'detail') initializeLeadWorkspace08!(signal, navigate); }
      document.querySelector('#admin-sidebar-nav')?.classList.toggle('is-open', workspaceMenuOpen);
      document.querySelector('[data-action="admin-menu"]')?.setAttribute('aria-expanded', String(workspaceMenuOpen));
    } catch (error) {
      if (signal.aborted || generation !== routeGeneration) return;
      if (error instanceof ApiError && error.status === 401) {
        const returnTo = path + location.search;
        navigate(`/admin/login?returnTo=${encodeURIComponent(returnTo)}`, true);
        return;
      }
      app.innerHTML = adminError(errorMessage(error));
    }
  } else app.innerHTML = notFoundPage();
  if (moveFocus && generation === routeGeneration) {
    const requestedFocus = focusSelector ? document.querySelector<HTMLElement>(focusSelector) : null;
    if (requestedFocus) {
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
  if (action === 'public-menu' || action === 'admin-menu') {
    const expanded = button.getAttribute('aria-expanded') === 'true';
    button.setAttribute('aria-expanded', String(!expanded));
    if (action === 'admin-menu') workspaceMenuOpen = !expanded;
    document.getElementById(button.getAttribute('aria-controls') ?? '')?.classList.toggle('is-open', !expanded);
    if (action === 'public-menu') button.setAttribute('aria-label', expanded ? 'Open navigation' : 'Close navigation');
  }
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
    navigate('/admin/login', true);
  } catch (error) {
    button.disabled = false;
    const errorElement = document.querySelector('#logout-error');
    if (errorElement) errorElement.textContent = errorMessage(error);
  }
}
window.addEventListener('popstate', () => { void render(true); });
void render();
