import {presentRecordName,presentRecordText,presentMetricValue} from '../lib/presentation';
import {productNotice} from '../lib/product-copy';
import type { AdminPageSummary, AdminSummaryMetric } from '../../shared/admin-summary-contracts';
import type { TaskReminder } from '../../shared/task-contracts';
import type { Paginated } from '../../shared/property-contracts';
import type { AuthUser, Overview, DemoData } from '../lib/api';
import { demoView } from './demo';
import { dashboardOverview, leadStages } from './dashboard';
import { escapeHtml, icon, link, wordmark, type IconName } from '../lib/ui';
import {dsFilter} from '../lib/design-system';

const primaryNavigation = [
  { path: '/admin', name: 'Overview' }, { path: '/admin/leads', name: 'Leads' },
  { path: '/admin/properties', name: 'Properties' }, { path: '/admin/applications', name: 'Applications' },
  { path: '/admin/calendar', name: 'Calendar' },
];
type WorkspaceNavigationItem = { path: string; name: string; icon: IconName };
const workspaceNavigation: WorkspaceNavigationItem[] = [
  { path: '/admin/tasks', name: 'Tasks', icon: 'tasks' },
  { path: '/admin/maintenance', name: 'Maintenance', icon: 'building' },
  { path: '/admin/ai', name: 'AI assistant', icon: 'sparkles' },
  { path: '/admin/conversations', name: 'Conversations', icon: 'message' },
  { path: '/admin/reports', name: 'Reports', icon: 'file' },
  { path: '/admin/settings', name: 'Settings', icon: 'grid' },
];
// Keep the approved public dashboard illustration separate from staff navigation.
const previewWorkspaceNavigation: WorkspaceNavigationItem[] = [
  { path: '/admin/leads', name: 'My leads', icon: 'person' },
  { path: '/admin/tasks', name: 'Tasks', icon: 'tasks' },
  { path: '/admin/analytics', name: 'Analytics', icon: 'chart' },
  { path: '/admin/ai', name: 'AI assistant', icon: 'sparkles' },
  { path: '/admin/integrations', name: 'Integrations', icon: 'link' },
];
const settingsPaths = new Set(['/admin/resident-access', '/admin/settings', '/admin/profile', '/admin/organization', '/admin/integrations', '/admin/imports', '/admin/automations', '/admin/integration-health', '/admin/audit']);
const pageTitles: Record<string, string> = {
  '/admin/renewals': 'Property renewals', '/admin/resident-access': 'Resident access',
  '/admin/integration-health': 'Integration health', '/admin/audit': 'Audit history',
  '/admin/profile': 'My profile', '/admin/settings': 'Settings',
  '/admin/imports': 'Customer-data import', '/admin/contacts': 'Contacts',
  '/admin/automations': 'Automations', '/admin/analytics': 'Analytics', '/admin/voice': 'Voice',
  '/admin/integrations': 'Integrations', '/admin/organization': 'Organization',
};

function moduleView(_path:string):string{
 return '<section class="module-empty card"><div class="empty-icon">'+icon('info')+'</div><h2>This workspace could not be opened</h2><p>Refresh this page or return to Overview to continue.</p>'+link('/admin','Open Overview','button button-primary')+'</section>';
}

function adminWordmark(): string {
  return wordmark(true, true);
}
const summaryIcons: Record<AdminSummaryMetric['icon'], IconName> = {
  users: 'leads', home: 'building', calendar: 'calendar', document: 'file', key: 'key',
  check: 'check', clock: 'clock', link: 'link', sparkles: 'sparkles', settings: 'grid',
};
function summaryMetric(metric: { key: string; label: string; value: number | null; icon: IconName; note?: string }, showNotes = true): string {
  const unavailable = typeof metric.value !== 'number' || !Number.isFinite(metric.value) || metric.value < 0;
  const numericValue = presentMetricValue(metric.value);
  const value = numericValue.toLocaleString();
  const note = showNotes ? (metric.note ? productNotice(metric.note,'Unavailable') : (unavailable ? 'Unavailable' : undefined)) : undefined;
  const longNumber = value.length > 4;
  return `<div class="summary-metric  ${longNumber ? 'metric-long-number' : ''}" data-metric-key="${escapeHtml(metric.key)}"><span class="metric-label">${escapeHtml(metric.label)}</span><strong aria-label="${escapeHtml(metric.label + ': ' + value)}">${value}</strong><span class="metric-icon">${icon(metric.icon)}</span>${note ? note.length > 32 ? `<details class="metric-note"><summary>About this figure</summary><span>${escapeHtml(note)}</span></details>` : `<span class="metric-note">${escapeHtml(note)}</span>` : ''}</div>`;
}
/** The staff shell owns navigation and page chrome; domain controllers retain their forms. */
const railNavigation: WorkspaceNavigationItem[] = [
  { path: '/admin', name: 'Overview', icon: 'home' },
  { path: '/admin/leads', name: 'Leads', icon: 'person' },
  { path: '/admin/properties', name: 'Properties', icon: 'building' },
  { path: '/admin/applications', name: 'Applications', icon: 'file' },
  { path: '/admin/calendar', name: 'Calendar', icon: 'calendar' },
  { path: '/admin/tasks', name: 'Tasks', icon: 'tasks' },
  { path: '/admin/maintenance', name: 'Maintenance', icon: 'building' },
  { path: '/admin/conversations', name: 'Conversations', icon: 'message' },
  { path: '/admin/ai', name: 'AI assistant', icon: 'sparkles' },
  { path: '/admin/reports', name: 'Reports', icon: 'chart' },
  { path: '/admin/settings', name: 'Settings', icon: 'grid' },
];
function railActivePath(path: string): string {
  if (path === '/admin/contacts' || path === '/admin/renewals') return '/admin/properties';
  if (path === '/admin/analytics') return '/admin/reports';
  if (settingsPaths.has(path) || path === '/admin/voice') return '/admin/settings';
  return path;
}
function railIcon(item: WorkspaceNavigationItem): string {
  if (item.path === '/admin/maintenance') return '<svg class="icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m14.5 6.5 3 3 4-4a6 6 0 0 1-7.8 7.8L6.5 20.5a2.1 2.1 0 0 1-3-3l7.2-7.2A6 6 0 0 1 18.5 2.5z"/></svg>';
  if (item.path === '/admin/settings') return '<svg class="icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m10 2-1 3-3 1-3-1-2 4 2 2v3l-2 2 2 4 3-1 3 1 1 3h4l1-3 3-1 3 1 2-4-2-2v-3l2-2-2-4-3 1-3-1-1-3z" transform="translate(0 0) scale(.95)"/><circle cx="11.4" cy="11.9" r="3"/></svg>';
  return icon(item.icon);
}
type StaffShellOptions = {
  path: string; title: string; name: string; org: string; initials: string; user?: AuthUser;
  query: URLSearchParams; content: string; reminders?: Paginated<TaskReminder>;
  period: AdminPageSummary['period']; metrics: Parameters<typeof summaryMetric>[0][];
  collapsed: boolean; scopeLabel?: string;
};
function staffAdminShell({ path, title, name, org, initials, user, query, content, reminders, period, metrics, collapsed, scopeLabel }: StaffShellOptions): string {
  const activePath = railActivePath(path);
  const selectedStages = new Set((query.get('stages') ?? '').split(','));
  const overviewFilters = path === '/admin' ? dsFilter('overview-stage-filter','<fieldset class="admin-stage-filters"><legend>Lead stage</legend>'+leadStages.map(stage=>'<label><input type="checkbox" name="stage" value="'+escapeHtml(stage.value)+'" '+(selectedStages.has(stage.value)?'checked':'')+'/><span>'+escapeHtml(stage.label)+'</span></label>').join('')+'</fieldset>',[...selectedStages].filter(Boolean).length) : '';

  const navigation = railNavigation.map(item => {
    const selected = item.path === activePath;
    return `<a href="${item.path}" data-link class="admin-nav-item ${selected ? 'active' : ''}" ${selected ? 'aria-current="page"' : ''} title="${escapeHtml(item.name)}">${railIcon(item)}<span class="admin-nav-label">${escapeHtml(item.name)}</span></a>`;
  }).join('');
  const breadcrumb = path === '/admin'
    ? `<span data-shell-breadcrumb-category aria-current="page">Overview</span>`
    : `${link('/admin', 'Overview')}<span aria-hidden="true">/</span><span data-shell-breadcrumb-category aria-current="page">${escapeHtml(title)}</span>`;
  return `<div class="admin-app admin-shell-v2">
    <aside class="admin-rail" id="admin-sidebar-nav" aria-label="Application navigation" tabindex="-1">
      <div class="admin-rail-brand">${link('/admin', wordmark(true, true), 'brand-link admin-rail-logo')}<button type="button" class="admin-rail-close" data-action="rail-close" aria-label="Close navigation">${icon('close')}</button></div>
      <nav class="admin-nav admin-rail-nav" aria-label="Admin pages">${navigation}</nav>
      <div class="admin-rail-footer"><span class="admin-rail-organization" title="${escapeHtml(org)}">${icon('building')}<span>${escapeHtml(org)}</span></span><button type="button" class="admin-rail-collapse" data-action="rail-collapse" aria-label="Collapse navigation" aria-expanded="true" aria-controls="admin-sidebar-nav">${icon('arrow-left')}<span>Collapse</span></button></div>
    </aside>
    <button type="button" class="admin-rail-scrim" data-action="rail-close" aria-label="Close navigation" tabindex="-1" hidden></button>
    <div class="admin-shell-body">
      <header class="admin-header ${collapsed ? 'is-collapsed' : ''}">
        <div class="admin-utility-header">
          <button type="button" class="header-icon-button admin-mobile-menu" data-action="admin-menu" aria-label="Open navigation" aria-expanded="false" aria-controls="admin-sidebar-nav">${icon('menu')}</button>
          ${link('/admin', wordmark(false, true), 'brand-link admin-utility-brand')}
          <div class="admin-header-actions">
            <button type="button" class="admin-utility-search" data-action="lead-search" aria-label="Search leads" aria-expanded="false" aria-controls="lead-search-panel">${icon('search')}<span>Search leads</span></button>
            <button type="button" class="header-icon-button" data-action="notifications" aria-label="Notifications" aria-expanded="false" aria-controls="notifications-panel">${icon('bell')}${reminders?.items.length ? '<span class="admin-notification-dot" aria-hidden="true"></span>' : ''}</button>
            <button type="button" class="header-icon-button header-summary-toggle" data-action="header-summary" aria-label="${collapsed ? 'Expand page summary' : 'Collapse page summary'}" aria-expanded="${!collapsed}" aria-controls="admin-header-summary" title="${collapsed ? 'Expand page summary' : 'Collapse page summary'}">${icon('chevron-down')}</button>
            <button type="button" class="account-toggle" data-action="account-menu" aria-label="Account menu" aria-expanded="false" aria-controls="account-menu"><span class="profile-avatar">${escapeHtml(initials)}</span>${icon('chevron-down')}</button>
            <section id="lead-search-panel" class="header-popover search-popover" hidden><form id="lead-search-form"><label for="lead-search-input">Search leads</label><div><input id="lead-search-input" name="q" type="search" value="${escapeHtml(query.get('q') ?? '')}" placeholder="Name, email or property" maxlength="200" /><button type="submit" class="button button-primary">Search</button></div></form></section>
            <section id="notifications-panel" class="header-popover" hidden><h2>Notifications</h2>${reminders?.items.length ? `<ul class="header-reminders">${reminders.items.slice(0, 5).map(reminder => `<li>${link('/admin/tasks?task=' + encodeURIComponent(reminder.taskId), escapeHtml(reminder.title))}<p>${escapeHtml(presentRecordName(reminder.propertyName))}${reminder.status === 'snoozed' ? ' &middot; Snoozed' : ''}</p></li>`).join('')}</ul>` : '<p>No current reminders.</p>'}${user?.permissions.includes('leasing.manage') ? link('/admin/tasks?view=reminders', 'View reminders', 'text-link') : ''}</section>
            <section id="account-menu" class="header-popover account-popover" hidden><strong>${escapeHtml(name)}</strong><nav class="account-menu-links" aria-label="Your account">${link('/admin/profile', 'View profile', 'admin-nav-item')}${link('/admin/profile?edit=1', 'Edit profile', 'admin-nav-item')}${link('/admin/settings', 'Settings', 'admin-nav-item')}</nav><button type="button" class="admin-nav-item logout-button" data-action="logout">${icon('logout')}<span>Sign out</span></button><p id="logout-error" class="field-error" role="alert"></p></section>
          </div>
        </div>
        <div class="admin-page-heading"><div class="admin-page-heading-copy"><nav class="admin-breadcrumbs" aria-label="Breadcrumb">${breadcrumb}</nav><h1 id="workspace-title">${escapeHtml(title)}</h1></div><div class="admin-page-actions" data-shell-actions>${overviewFilters}</div></div>
        <div class="admin-header-summary" id="admin-header-summary" ${collapsed ? 'hidden' : ''}>
          <div class="admin-summary-toolbar">${period !== null ? `<div class="period-control"><label class="sr-only" for="dashboard-period">Metric period</label><select id="dashboard-period"><option value="month" ${period === 'month' ? 'selected' : ''}>This month</option><option value="week" ${period === 'week' ? 'selected' : ''}>This week</option><option value="all" ${period === 'all' ? 'selected' : ''}>All time</option></select>${icon('chevron-down')}</div>` : ''}<span class="header-summary-context sr-only">${escapeHtml(scopeLabel ?? '')}</span></div>
          <div class="summary-metrics" aria-label="${escapeHtml(title + ' summary')}">${metrics.map(metric => summaryMetric(metric, false)).join('')}</div>
        </div>
      </header>
      <main id="main-content" aria-labelledby="workspace-title" class="workspace-content">${content.replace(/<h1(?=[\s>])/g, '<h2').replaceAll('</h1>', '</h2>')}</main>
    </div>
  </div>`;
}
export function adminShell(path: string, user?: AuthUser, overview?: Overview, preview = false, demo?: DemoData, query = new URLSearchParams(), contentOverride?: string, reminders?: Paginated<TaskReminder>, pageSummary?: AdminPageSummary, headerCollapsed = false): string {
  const org = presentRecordName(user?.organization.name ?? 'Your organization');
  const name = presentRecordName(user?.name ?? 'Your workspace');
  const initials = name.split(' ').filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase();
  const title = pageTitles[path] ?? primaryNavigation.find(item => item.path === path)?.name ?? workspaceNavigation.find(item => item.path === path)?.name ?? 'Overview';
  const period = pageSummary ? pageSummary.period : overview?.dashboard.period ?? 'month';
  const dashboardMetrics = overview?.dashboard.metrics;
  const sourceMetrics = pageSummary ? pageSummary.metrics.map(metric => ({ ...metric, icon: summaryIcons[metric.icon] })) : ([
    ['newLeads', 'New leads', 'leads'], ['toursBooked', 'Tours booked', 'calendar'],
    ['applications', 'Applications', 'file'], ['leasesSigned', 'Leases signed', 'key'],
  ] as const).map(([key, label, iconName]) => ({ key, label, icon: iconName, value: dashboardMetrics?.[key] ?? null }));
  const collapsed = !preview && headerCollapsed;
  const metrics = sourceMetrics.map(metric => overview?.previewSummaryZeros === true && !preview ? {...metric,value:0,note:undefined} : metric);
  const selectedStages = new Set((query.get('stages') ?? '').split(','));
  const demoContent = !preview && demo?.demo ? demoView(path, demo, query) : undefined;
  const content = contentOverride ?? (path === '/admin' ? dashboardOverview(demo, query) : demoContent ?? (path === '/admin/leads' && query.get('view') === 'new' ? `<div class="workspace-heading"><div><h2>Add lead</h2><p>Lead creation is pending a later stage.</p></div></div><section class="card module-empty"><h2>Lead capture is not available yet</h2><p>No record has been created. Your existing leads and demo data are preserved.</p>${link('/admin/leads','Back to leads','button button-secondary')}</section>` : moduleView(path)));
  if (!preview) return staffAdminShell({ path, title, name, org, initials, user, query, content, reminders, period, metrics, collapsed, scopeLabel: pageSummary?.scopeLabel });
  const activeTopPath=path==='/admin/renewals'?'/admin/properties':path;
  const topLink = (href: string, label: string): string => preview ? `<span class="${path === href ? 'active' : ''}">${label}</span>` : `<a href="${href}" data-link class="${activeTopPath === href ? 'active' : ''}" ${activeTopPath === href ? 'aria-current="page"' : ''}>${label}</a>`;
  const navigation = preview ? previewWorkspaceNavigation : workspaceNavigation;
  const workspaceLink = (item: WorkspaceNavigationItem): string => {
    const selected = preview
      ? path === item.path || (path === '/admin' && item.path === '/admin/leads')
      : item.path === '/admin/settings' ? settingsPaths.has(path)
      : item.path === '/admin/reports' ? path === '/admin/reports' || path === '/admin/analytics'
      : path === item.path;
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
          <section id="lead-search-panel" class="header-popover search-popover" hidden><form id="lead-search-form"><label for="lead-search-input">Search leads</label><div><input id="lead-search-input" name="q" type="search" value="${escapeHtml(query.get('q') ?? '')}" placeholder="Name, email or property" maxlength="200" /><button type="submit" class="button button-primary">Search</button></div></form></section>
          <section id="notifications-panel" class="header-popover" hidden><h2>In-app reminders</h2>${reminders?.items.length ? `<ul class="header-reminders">${reminders.items.slice(0,5).map(reminder => `<li>${link('/admin/tasks?task='+encodeURIComponent(reminder.taskId),escapeHtml(reminder.title))}<p>${escapeHtml(presentRecordName(reminder.propertyName))}${reminder.status === 'snoozed' ? ' &middot; Snoozed' : ''}</p></li>`).join('')}</ul>` : '<p>No current task reminders.</p>'}${user?.permissions.includes('leasing.manage') ? link('/admin/tasks?view=reminders','View reminders','text-link') : ''}</section>
          <section id="account-menu" class="header-popover account-popover" hidden><strong>${escapeHtml(name)}</strong><nav class="account-menu-links" aria-label="Your account">${link('/admin/profile','View profile','admin-nav-item')}${link('/admin/profile?edit=1','Edit profile','admin-nav-item')}${link('/admin/settings','Settings','admin-nav-item')}</nav><button type="button" class="admin-nav-item logout-button" data-action="logout">${icon('logout')}<span>Sign out</span></button><p id="logout-error" class="field-error" role="alert"></p></section>`}
        </div>
      </div>
      ${preview ? '' : `<h1 id="workspace-title" class="sr-only">${escapeHtml(title)}</h1>`}
      <div class="admin-header-summary" ${preview ? '' : `id="admin-header-summary" ${collapsed ? 'hidden' : ''}`}>
        <div class="admin-header-body">${preview ? `<h1>${escapeHtml(title)}</h1>` : `<div class="admin-page-title" aria-hidden="true">${escapeHtml(title)}</div>`}${period !== null ? `<div class="period-control">${preview ? '<span class="period-preview">This month</span>' : `<label class="sr-only" for="dashboard-period">Metric period</label><select id="dashboard-period"><option value="month" ${period === 'month' ? 'selected' : ''}>This month</option><option value="week" ${period === 'week' ? 'selected' : ''}>This week</option><option value="all" ${period === 'all' ? 'selected' : ''}>All time</option></select>`}${icon('chevron-down')}</div>` : `<p class="header-summary-context">${escapeHtml(pageSummary?.scopeLabel ?? '')}</p>`}</div>
        <div class="summary-metrics" aria-label="${escapeHtml(preview ? 'Dashboard preview' : title + ' summary')}">${metrics.map(metric => summaryMetric(metric)).join('')}</div>
        ${pageSummary?.period !== null && pageSummary?.scopeLabel ? `<p class="header-summary-period-note">${escapeHtml(pageSummary.scopeLabel)}</p>` : ''}
      </div>
    </header>
    <div class="admin-workspace"><aside class="admin-sidebar" aria-label="Workspace tools">${preview ? '' : `<button class="sidebar-toggle" type="button" data-action="admin-menu" aria-expanded="false" aria-controls="admin-sidebar-nav">${icon('menu')} Workspace menu ${icon('chevron-down')}</button>`}
      <div class="sidebar-inner" id="${preview ? 'preview-sidebar-nav' : 'admin-sidebar-nav'}"><h2 class="sidebar-label">Workspace</h2><nav class="admin-nav" aria-label="Admin pages">${navigation.map(workspaceLink).join('')}</nav>
        ${path === '/admin/renewals' || path === '/admin/resident-access' || path === '/admin/organization' || path === '/admin/integration-health' || path === '/admin/audit' || path === '/admin/voice' || path === '/admin/maintenance' || path === '/admin/reports' || path === '/admin/analytics' || path === '/admin/automations' || path === '/admin/conversations' || path === '/admin/applications' || path === '/admin/calendar' || path === '/admin/leads' || path === '/admin/tasks' || path === '/admin/imports' || path === '/admin/profile' || path === '/admin/settings' || path === '/admin/integrations' ? '' : `<fieldset class="stage-filters"><legend>Filter by stage</legend>${leadStages.map(stage => `<label><input type="checkbox" name="stage" value="${stage.value}" ${selectedStages.has(stage.value) ? 'checked' : ''} ${preview ? 'disabled' : ''}/><span>${stage.label}</span></label>`).join('')}</fieldset>`}
        <div class="sidebar-bottom"><span class="sidebar-workspace">${icon('building')}<span>${preview ? 'Design preview' : escapeHtml(org)}</span></span></div>
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