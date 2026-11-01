import {appShell} from '../lib/app-shell';
import type { AdminPageSummary, AdminSummaryMetric } from '../../shared/admin-summary-contracts';
import type { TaskReminder } from '../../shared/task-contracts';
import type { Paginated } from '../../shared/property-contracts';
import type { AuthUser, Overview, DemoData } from '../lib/api';
import { demoView } from './demo';
import { dashboardOverview, leadStages } from './dashboard';
import { escapeHtml, icon, link, wordmark, type IconName } from '../lib/ui';

const primaryNavigation = [
  { path: '/admin', name: 'Overview' }, { path: '/admin/leads', name: 'Leads' },
  { path: '/admin/properties', name: 'Properties' }, { path: '/admin/applications', name: 'Applications' },
  { path: '/admin/calendar', name: 'Calendar' },
];
const workspaceNavigation: { path: string; name: string; icon: IconName }[] = [
  { path: '/admin/leads', name: 'My leads', icon: 'person' },
  { path: '/admin/attention', name: 'Needs attention', icon: 'clock' },
  { path: '/admin/inbox', name: 'Shared inbox', icon: 'leads' },
  { path: '/admin/vendor-work', name: 'Vendor collaboration', icon: 'building' },
  { path: '/admin/inspections', name: 'Property inspections', icon: 'tasks' },
  { path: '/admin/notifications', name: 'Notification centre', icon: 'clock' },
  { path: '/admin/resident-documents', name: 'Resident documents', icon: 'file' },
  { path: '/admin/property-insights', name: 'Property operations dashboard', icon: 'chart' },
  { path: '/admin/maintenance', name: 'Maintenance dispatch', icon: 'building' },
  { path: '/admin/renewals', name: 'Renewals & move-outs', icon: 'calendar' },
  { path: '/admin/vacancies', name: 'Vacancies & waitlists', icon: 'building' },
  { path: '/admin/duplicates', name: 'Duplicate resolution', icon: 'person' },
  { path: '/admin/response-targets', name: 'Response targets', icon: 'clock' },
  { path: '/admin/residents', name: 'Resident requests', icon: 'building' },
  { path: '/admin/workspace', name: 'Search & saved work', icon: 'grid' },
  { path: '/admin/intake', name: 'Inquiry forms', icon: 'file' },
  { path: '/admin/automations', name: 'Follow-up rules', icon: 'clock' },
  { path: '/admin/knowledge', name: 'Property knowledge', icon: 'file' },
  { path: '/admin/reports', name: 'Operations reports', icon: 'chart' },
  { path: '/admin/tasks', name: 'Tasks', icon: 'tasks' },
  { path: '/admin/analytics', name: 'Analytics', icon: 'chart' },
  { path: '/admin/ai', name: 'AI assistant', icon: 'sparkles' },
  { path: '/admin/integrations', name: 'Integrations', icon: 'link' },
  { path: '/admin/team', name: 'Team & access', icon: 'person' },
  { path: '/admin/onboarding', name: 'Getting started', icon: 'check' },
];

const moduleContent: Record<string, { title: string; icon: IconName; eyebrow: string; description: string; emptyTitle: string; empty: string; items: [string, string][]; note: string }> = {
  '/admin/leads': {
    title: 'Leads', icon: 'leads', eyebrow: 'Every relationship starts somewhere',
    description: 'A dedicated place for your sales and leasing opportunities.', emptyTitle: 'Your next lead belongs here',
    empty: 'Lead capture, customer records and pipeline tools will be added in a later stage. No leads have been created.',
    items: [['One customer record', 'Keep conversations connected to the people and properties they concern.'], ['A clear next step', 'Make ownership, follow-ups and the path to a sale or lease easy to see.']],
    note: 'Foundation only. Creating, importing, editing and contacting leads are not available yet.'
  },
  '/admin/properties': {
    title: 'Properties', icon: 'building', eyebrow: 'Your portfolio, connected',
    description: 'Built to keep property records and individual units distinct.', emptyTitle: 'A home for your portfolio',
    empty: 'Property browsing, units and data imports will be introduced in a later stage. No property records have been imported.',
    items: [['Properties and units', 'A property and the units within it will have separate records.'], ['Your source of truth', 'Yardi remains authoritative for the records configured to sync from it.']],
    note: 'Foundation only. There is no live Yardi connection or customer-data import in this stage.'
  },
  '/admin/applications': {
    title: 'Applications', icon: 'file', eyebrow: 'Thoughtful review, clear decisions',
    description: 'A future workspace for applicant documents and staff review.', emptyTitle: 'Ready for a more organized review',
    empty: 'Application intake, document uploads and review tools will be added in a later stage. No applications are stored here.',
    items: [['People make decisions', 'Staff review and consent will remain part of the application process.'], ['Approved screening only', 'Screening requires an approved provider. AI will never approve or reject applicants.']],
    note: 'Foundation only. No documents, screening requests or applicant decisions can be submitted.'
  },
  '/admin/calendar': {
    title: 'Calendar', icon: 'calendar', eyebrow: 'Make time for the next conversation',
    description: 'A dedicated place for future viewing and scheduling tools.', emptyTitle: 'Your schedule will take shape here',
    empty: 'Viewings and calendar connections will be introduced in a later stage. There are no events or invitations.',
    items: [['Property viewings', 'Future scheduling will connect a viewing to its lead and property.'], ['Google Calendar', 'A provider connection and explicit authorization will be needed before any calendar sync.']],
    note: 'Foundation only. No events are created and no invitations are sent.'
  },
  '/admin/tasks': {
    title: 'Tasks', icon: 'tasks', eyebrow: 'Less to remember. More to move forward.',
    description: 'A future home for the follow-ups that keep your team moving.', emptyTitle: 'A clear start for your team',
    empty: 'Task creation, assignments and reminders will be added in a later stage. No tasks have been created.',
    items: [['Keep the context', 'Future tasks will link back to the relevant customer or property.'], ['A helpful nudge', 'Ootla-owned AI can help surface pending work when the workflow is implemented.']],
    note: 'Foundation only. No reminders or external messages are sent.'
  },
  '/admin/analytics': {
    title: 'Analytics', icon: 'chart', eyebrow: 'Understand the work behind the numbers',
    description: 'A dedicated space for future sales and leasing insights.', emptyTitle: 'Real insights need real records',
    empty: 'Reporting will be introduced after the underlying CRM workflows. No sample performance figures are presented as real.',
    items: [['Sales and leasing', 'Future reports will use your organization’s actual records.'], ['Google Analytics', 'Public-site analytics requires a configured integration and an approved measurement approach.']],
    note: 'Foundation only. Analytics tracking and external reporting are not configured.'
  },
  '/admin/ai': {
    title: 'AI assistant', icon: 'sparkles', eyebrow: 'More support. Your team in control.',
    description: 'A future home for Ootla-owned assistance inside your CRM.', emptyTitle: 'Helpful intelligence starts with context',
    empty: 'AI workflows will be added in a later stage. There is no connected AI provider, live assistant or chat session here yet.',
    items: [['Support the next step', 'Planned assistance includes resident-request drafts and pending-task reminders.'], ['Keep people in charge', 'Staff review sensitive actions. AI does not make applicant screening decisions.']],
    note: 'Foundation only. No AI requests, automated decisions or external communications occur.'
  },
  '/admin/integrations': {
    title: 'Connections', icon: 'plug', eyebrow: 'Meet your business where it is',
    description: 'Future connections for Yardi organizations and independent teams.', emptyTitle: 'Your connections start here',
    empty: 'Provider adapters and standalone imports will be implemented in later stages. No external service is connected.',
    items: [['Yardi-ready architecture', 'The exact Yardi interfaces must be confirmed before a live adapter can be configured.'], ['A standalone path', 'Organizations without Yardi will be able to import their existing customer data.']],
    note: 'Foundation only. No simulator or live connection is active. Payment actions remain with an existing approved provider; Ootla will not authorize, charge or refund.'
  }
};

function moduleView(path: string): string {
  const content = moduleContent[path]!;
  return `<div class="workspace-heading"><div><span class="eyebrow">${content.eyebrow.toUpperCase()}</span><h2>${content.title}</h2><p>${content.description}</p></div><span class="badge badge-neutral">Not configured</span></div>
    <section class="module-empty card"><div class="empty-icon">${icon(content.icon)}</div><h2>${content.emptyTitle}</h2><p>${content.empty}</p><span class="badge badge-neutral">Not configured yet</span></section>
    <div class="module-detail-grid">${content.items.map(([title, copy]) => `<article class="card module-detail"><span class="small-green-icon">${icon('check')}</span><h3>${title}</h3><p>${copy}</p></article>`).join('')}</div>
    <div class="foundation-note">${icon('info')}<p>${content.note}</p></div>`;
}
function adminWordmark(): string {
  return wordmark(true, true);
}
const summaryIcons: Record<AdminSummaryMetric['icon'], IconName> = {
  users: 'leads', home: 'building', calendar: 'calendar', document: 'file', key: 'key',
  check: 'check', clock: 'clock', link: 'link', sparkles: 'sparkles', settings: 'grid',
};
function summaryMetric(metric: { key: string; label: string; value: number | string | null; icon: IconName; note?: string }): string {
  const unavailable = metric.value == null;
  const value = unavailable ? '&mdash;' : typeof metric.value === 'number' ? metric.value.toLocaleString() : escapeHtml(metric.value);
  const note = metric.note ?? (unavailable ? 'Not configured' : undefined);
  const longNumber = typeof metric.value === 'number' && metric.value.toLocaleString().length > 4;
  return `<div class="summary-metric ${typeof metric.value === 'string' ? 'metric-text-value' : ''} ${longNumber ? 'metric-long-number' : ''}" data-metric-key="${escapeHtml(metric.key)}"><span class="metric-label">${escapeHtml(metric.label)}</span><strong aria-label="${escapeHtml(metric.label + ': ' + (unavailable ? note : metric.value))}">${value}</strong><span class="metric-icon">${icon(metric.icon)}</span>${note ? note.length > 32 ? `<details class="metric-note"><summary>About this figure</summary><span>${escapeHtml(note)}</span></details>` : `<span class="metric-note">${escapeHtml(note)}</span>` : ''}</div>`;
}
export interface HeaderNotifications {items:Array<{url:string;title:string;property_name:string|null}>;unread:number}
export function adminShell(path: string, user?: AuthUser, overview?: Overview, preview = false, demo?: DemoData, query = new URLSearchParams(), contentOverride?: string, reminders?: Paginated<TaskReminder>, pageSummary?: AdminPageSummary, headerCollapsed = false, notifications?:HeaderNotifications): string {
  const org = user?.organization.name ?? 'Your organization';
  const name = user?.name ?? 'Your workspace';
  const initials = name.split(' ').filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase();
  const title = path === '/admin/profile' ? 'My profile' : path === '/admin/settings' ? 'Settings' : path === '/admin/imports' ? 'Customer-data import' : path === '/admin/contacts' ? 'Contacts & households' : primaryNavigation.find(item => item.path === path)?.name ?? workspaceNavigation.find(item => item.path === path)?.name ?? 'Overview';
  const period = pageSummary ? pageSummary.period : overview?.dashboard.period ?? 'month';
  const dashboardMetrics = overview?.dashboard.metrics;
  const metrics = pageSummary ? pageSummary.metrics.map(metric => ({ ...metric, icon: summaryIcons[metric.icon] })) : ([
    ['newLeads', 'New leads', 'leads'], ['toursBooked', 'Tours booked', 'calendar'],
    ['applications', 'Applications', 'file'], ['leasesSigned', 'Leases signed', 'key'],
  ] as const).map(([key, label, iconName]) => ({ key, label, icon: iconName, value: dashboardMetrics?.[key] ?? null }));
  const collapsed = !preview && headerCollapsed;
  const selectedStages = new Set((query.get('stages') ?? '').split(','));
  const demoContent = !preview && demo?.demo ? demoView(path, demo, query) : undefined;
  const content = contentOverride ?? (path === '/admin' ? dashboardOverview(demo, query) : demoContent ?? (path === '/admin/leads' && query.get('view') === 'new' ? `<div class="workspace-heading"><div><h2>Add lead</h2><p>Lead creation is pending a later stage.</p></div></div><section class="card module-empty"><h2>Lead capture is not available yet</h2><p>No record has been created. Your existing leads and demo data are preserved.</p>${link('/admin/leads','Back to leads','button button-secondary')}</section>` : moduleView(path)));
  if(!preview&&user)return appShell(path,user,content,notifications);
  const topLink = (href: string, label: string): string => preview ? `<span class="${path === href ? 'active' : ''}">${label}</span>` : `<a href="${href}" data-link class="${path === href ? 'active' : ''}" ${path === href ? 'aria-current="page"' : ''}>${label}</a>`;
  const workspaceLink = (item: typeof workspaceNavigation[number]): string => {
    const selected = path === item.path || (path === '/admin' && item.path === '/admin/leads') || (path === '/admin/imports' && item.path === '/admin/integrations');
    const content = `${icon(item.icon)}<span>${item.name}</span>`;
    return preview ? `<span class="admin-nav-item ${selected ? 'active' : ''}">${content}</span>` : `<a href="${item.path}" data-link class="admin-nav-item ${selected ? 'active' : ''}" ${selected ? 'aria-current="page"' : ''}>${content}</a>`;
  };
  return `<div class="admin-app ${preview ? 'is-preview' : ''}">
    <header class="admin-header ${collapsed ? 'is-collapsed' : ''}">
      <div class="admin-topline">${preview ? adminWordmark() : link('/admin', adminWordmark(), 'brand-link')}
        <nav class="admin-top-nav" aria-label="Workspace navigation">${primaryNavigation.map(item => topLink(item.path,item.name)).join('')}</nav>
        <div class="admin-header-actions">
          ${preview ? `<span class="header-icon-button">${icon('search')}</span><span class="header-icon-button">${icon('bell')}</span><span class="profile-avatar">JD</span>` : `
          <button type="button" class="header-icon-button" data-action="lead-search" aria-label="Search leads" aria-expanded="false" aria-controls="lead-search-panel">${icon('search')}</button>
          <button type="button" class="header-icon-button" data-action="notifications" aria-label="Notifications" aria-expanded="false" aria-controls="notifications-panel">${icon('bell')}</button>
          <button type="button" class="header-icon-button header-summary-toggle" data-action="header-summary" aria-label="${collapsed ? 'Expand page summary' : 'Collapse page summary'}" aria-expanded="${!collapsed}" aria-controls="admin-header-summary" title="${collapsed ? 'Expand page summary' : 'Collapse page summary'}">${icon('chevron-down')}</button>
          <button type="button" class="account-toggle" data-action="account-menu" aria-label="Account menu" aria-expanded="false" aria-controls="account-menu"><span class="profile-avatar">${escapeHtml(initials)}</span>${icon('chevron-down')}</button>
          <section id="lead-search-panel" class="header-popover search-popover" hidden><form id="lead-search-form"><label for="lead-search-input">Search leads</label><div><input id="lead-search-input" name="q" type="search" value="${escapeHtml(query.get('q') ?? '')}" placeholder="Name, email or property" maxlength="200" /><button type="submit" class="button button-primary">Search</button></div></form>${user?.permissions.includes('leasing.manage') ? link('/admin/workspace','Search all workspace records','text-link') : ''}</section>
          <section id="notifications-panel" class="header-popover" hidden><h2>Notifications</h2>${notifications?.items.length ? `<ul class="header-reminders">${notifications.items.slice(0,5).map(n => `<li>${link(n.url,escapeHtml(n.title))}<p>${escapeHtml(n.property_name??'')}</p></li>`).join('')}</ul>` : '<p>No unread notifications.</p>'}${user?.permissions.includes('leasing.manage') ? link('/admin/notifications','View notification centre','text-link')+' '+link('/admin/tasks?view=reminders','Task reminders','text-link') : ''}</section>
          <section id="account-menu" class="header-popover account-popover" hidden><strong>${escapeHtml(name)}</strong><nav class="account-menu-links" aria-label="Your account">${link('/admin/profile','View profile','admin-nav-item')}${link('/admin/profile?edit=1','Edit profile','admin-nav-item')}${link('/admin/settings','Settings','admin-nav-item')}</nav><button type="button" class="admin-nav-item logout-button" data-action="logout">${icon('logout')}<span>Sign out</span></button><p id="logout-error" class="field-error" role="alert"></p></section>`}
        </div>
      </div>
      ${preview ? '' : `<h1 id="workspace-title" class="sr-only">${escapeHtml(title)}</h1>`}
      <div class="admin-header-summary" ${preview ? '' : `id="admin-header-summary" ${collapsed ? 'hidden' : ''}`}>
        <div class="admin-header-body">${preview ? `<h1>${escapeHtml(title)}</h1>` : `<div class="admin-page-title" aria-hidden="true">${escapeHtml(title)}</div>`}${period !== null ? `<div class="period-control">${preview ? '<span class="period-preview">This month</span>' : `<label class="sr-only" for="dashboard-period">Metric period</label><select id="dashboard-period"><option value="month" ${period === 'month' ? 'selected' : ''}>This month</option><option value="week" ${period === 'week' ? 'selected' : ''}>This week</option><option value="all" ${period === 'all' ? 'selected' : ''}>All time</option></select>`}${icon('chevron-down')}</div>` : `<p class="header-summary-context">${escapeHtml(pageSummary?.scopeLabel ?? '')}</p>`}</div>
        <div class="summary-metrics" aria-label="${escapeHtml(preview ? 'Dashboard preview' : title + ' summary')}">${metrics.map(summaryMetric).join('')}</div>
        ${pageSummary?.period !== null && pageSummary?.scopeLabel ? `<p class="header-summary-period-note">${escapeHtml(pageSummary.scopeLabel)}</p>` : ''}
      </div>
    </header>
    <div class="admin-workspace"><aside class="admin-sidebar" aria-label="Workspace tools">${preview ? '' : `<button class="sidebar-toggle" type="button" data-action="admin-menu" aria-expanded="false" aria-controls="admin-sidebar-nav">${icon('menu')} Workspace menu ${icon('chevron-down')}</button>`}
      <div class="sidebar-inner" id="${preview ? 'preview-sidebar-nav' : 'admin-sidebar-nav'}"><h2 class="sidebar-label">Workspace</h2><nav class="admin-nav" aria-label="Admin pages">${workspaceNavigation.filter(item => !['/admin/team','/admin/onboarding','/admin/intake','/admin/automations'].includes(item.path) || (!preview && user?.organization.role === 'organization_admin')).map(workspaceLink).join('')}</nav>
        ${['/admin/vendor-work','/admin/inspections','/admin/notifications','/admin/resident-documents','/admin/property-insights','/admin/maintenance','/admin/renewals','/admin/vacancies','/admin/duplicates','/admin/response-targets','/admin/attention','/admin/intake','/admin/inbox','/admin/automations','/admin/residents','/admin/workspace','/admin/knowledge','/admin/reports'].includes(path) || path === '/admin/team' || path === '/admin/onboarding' || path === '/admin/analytics' || path === '/admin/ai' || path === '/admin/applications' || path === '/admin/calendar' || path === '/admin/leads' || path === '/admin/tasks' || path === '/admin/imports' || path === '/admin/profile' || path === '/admin/settings' || path === '/admin/integrations' ? '' : `<fieldset class="stage-filters"><legend>Filter by stage</legend>${leadStages.map(stage => `<label><input type="checkbox" name="stage" value="${stage.value}" ${selectedStages.has(stage.value) ? 'checked' : ''} ${preview ? 'disabled' : ''}/><span>${stage.label}</span></label>`).join('')}</fieldset>`}
        <div class="sidebar-bottom"><span class="sidebar-workspace">${icon('building')}<span>${preview ? 'Design preview' : demo?.demo ? 'Demo workspace' : escapeHtml(org)}</span></span></div>
      </div>
    </aside><main ${preview ? '' : 'id="main-content" aria-labelledby="workspace-title"'} class="workspace-content">${content.replaceAll('<h1>','<h2>').replaceAll('</h1>','</h2>')}${path === '/admin/integrations' && !preview && !contentOverride ? `<section class="card module-detail"><h2>Bring your existing customer data</h2><p>Standalone organizations can review CSV properties, units, contacts and leads before importing them into this workspace.</p>${link('/admin/imports','Open customer-data import','button button-primary')}</section>` : ''}</main></div>
  </div>`;
}
export function dashboardPreview(): string {
  return `<div class="dashboard-preview" aria-hidden="true" inert><div class="preview-chrome"><span class="preview-chrome-dots"><i></i><i></i><i></i></span><span>${icon('lock')} Your Ootla workspace</span><span class="preview-chrome-tag">DESIGN PREVIEW</span></div>${adminShell('/admin', undefined, undefined, true)}</div>`;
}
export function adminError(message: string): string {
  return `<main id="main-content" class="standalone-state"><a href="/" data-link class="brand-link">${wordmark()}</a><div class="empty-icon">${icon('plug')}</div><h1>Your workspace needs a moment.</h1><p>${escapeHtml(message)}</p><div class="button-row"><button type="button" data-action="retry" class="button button-primary">Try again ${icon('arrow')}</button>${link('/admin/login', 'Back to sign in', 'button button-secondary')}</div></main>`;
}
