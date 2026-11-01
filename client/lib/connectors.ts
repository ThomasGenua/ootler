import { api, ApiError, errorMessage } from './api';
import type { ConnectorOverview, ConnectorJobs, ConnectorMappings, ConnectorEvents, ConnectorConflicts } from '../../shared/connector-contracts';
import type { YardiReadiness, YardiConfigValidation } from '../../shared/yardi-contracts';
export type ConnectorView = 'connection' | 'jobs' | 'mappings' | 'events' | 'conflicts' | 'yardi';
export type ConnectorWorkspacePayload = { kind: 'restricted'; message: string } | { kind: 'workspace'; overview: ConnectorOverview; view: ConnectorView; jobs?: ConnectorJobs; mappings?: ConnectorMappings; events?: ConnectorEvents; conflicts?: ConnectorConflicts; readiness?: YardiReadiness };
const views: ConnectorView[] = ['connection', 'jobs', 'mappings', 'events', 'conflicts', 'yardi'];
export async function loadConnectorWorkspace(query: URLSearchParams, signal: AbortSignal): Promise<ConnectorWorkspacePayload> {
 let overview: ConnectorOverview;
 try { overview = await api<ConnectorOverview>('/api/connectors', { signal }); }
 catch (error) { if (error instanceof ApiError && error.status === 403) return { kind: 'restricted', message: 'Connection settings and sync diagnostics are available to this organization’s administrators.' }; throw error; }
 if (!overview.access.canManage) return { kind: 'restricted', message: 'Ask an organization administrator to manage connections and review sync diagnostics.' };
 const requested = query.get('view') as ConnectorView;
 const view = views.includes(requested) ? requested : 'connection';
 const result: Extract<ConnectorWorkspacePayload, { kind: 'workspace' }> = { kind: 'workspace', overview, view };
 if (view === 'yardi') { result.readiness = await api<YardiReadiness>('/api/connectors/yardi/readiness', { signal }); return result; }
 if (overview.connection && view !== 'connection') {
  const page = new URLSearchParams({ page: query.get('page') ?? '1', pageSize: query.get('pageSize') ?? '25' });
  const endpoint = '/api/connectors/' + encodeURIComponent(overview.connection.id) + '/' + view + '?' + page;
  if (view === 'jobs') result.jobs = await api<ConnectorJobs>(endpoint, { signal });
  else if (view === 'mappings') result.mappings = await api<ConnectorMappings>(endpoint, { signal });
  else if (view === 'events') result.events = await api<ConnectorEvents>(endpoint, { signal });
  else if (view === 'conflicts') result.conflicts = await api<ConnectorConflicts>(endpoint, { signal });
 }
 return result;
}
export function initializeConnectorWorkspace(signal: AbortSignal, navigate: (path: string, replace?: boolean, focusSelector?: string) => void): void {
 const workspace = document.querySelector<HTMLElement>('[data-connector-workspace]');
 if (!workspace) return;
 initializeYardiDraft(workspace, signal);
 const updateScenario = (): void => { const field = workspace.querySelector<HTMLElement>('[data-connector-availability]'); const control = workspace.querySelector<HTMLSelectElement>('[name="action"]'); if (field) field.hidden = control?.value !== 'availability_update'; };
 updateScenario();
 workspace.addEventListener('change', event => { if (event.target instanceof HTMLSelectElement && event.target.name === 'action') updateScenario(); }, { signal });
 workspace.addEventListener('click', event => { if (event.target instanceof Element && event.target.closest('[data-connector-refresh]')) navigate(location.pathname + location.search, true, '[data-connector-results]'); }, { signal });
 workspace.addEventListener('submit', async event => {
  const form = event.target;
  if (!(form instanceof HTMLFormElement) || (!form.hasAttribute('data-connector-form') && !form.hasAttribute('data-connector-filter'))) return;
  event.preventDefault(); const data = new FormData(form);
  if (form.hasAttribute('data-connector-filter')) { const query = new URLSearchParams({ view: String(data.get('view') ?? 'connection'), pageSize: String(data.get('pageSize') ?? '25') }); navigate('/admin/integrations?' + query, false, '[data-connector-results]'); return; }
  const submit = form.querySelector<HTMLButtonElement>('button[type="submit"]'); if (submit?.disabled) return;
  const error = form.querySelector<HTMLElement>('[data-connector-error]'); if (error) error.textContent = '';
  if (submit) { submit.disabled = true; submit.setAttribute('aria-busy', 'true'); }
  // Preserve the receipt key if a failed response is retried from this same form.
  const requestKey = form.dataset.requestKey ||= crypto.randomUUID();
  const connectionId = workspace.dataset.connectionId; const action = form.dataset.connectorForm;
  let endpoint = '/api/connectors'; const body: Record<string, unknown> = { requestKey }; let saved = action ?? 'sync', destination = 'connection';
  try {
   if (action === 'connect') endpoint += '/demo';
   else {
    if (!connectionId) throw new Error('Refresh the connection before continuing.');
    endpoint += '/' + encodeURIComponent(connectionId);
    if (action === 'sync' || action === 'replay') { endpoint += '/sync'; body.mode = action === 'replay' ? 'replay' : 'incremental'; destination = 'jobs'; }
    else if (action === 'disconnect') endpoint += '/disconnect';
    else if (action === 'reconnect') endpoint += '/reconnect';
    else if (action === 'scenario') { endpoint += '/demo-actions'; body.action = String(data.get('action') ?? ''); if (body.action === 'availability_update') body.status = String(data.get('status') ?? 'available'); saved = String(body.action); }
    else if (action === 'resolve') { endpoint += '/conflicts/' + encodeURIComponent(form.dataset.conflictId!) + '/resolve'; body.resolution = String(data.get('resolution') ?? ''); destination = 'conflicts'; }
    else throw new Error('This connection action is not ready.');
   }
   const inputKey = JSON.stringify({ endpoint, ...body, requestKey: undefined });
   if (form.dataset.requestInput && form.dataset.requestInput !== inputKey) body.requestKey = form.dataset.requestKey = crypto.randomUUID();
   form.dataset.requestInput = inputKey;
   await api(endpoint, { method: 'POST', body: JSON.stringify(body), signal });
   if (!signal.aborted) navigate('/admin/integrations?' + new URLSearchParams({ view: destination, saved }), true, '[data-connector-results]');
  } catch (issue) { if (!signal.aborted && error) { error.textContent = errorMessage(issue); error.tabIndex = -1; error.focus(); } }
  finally { if (!signal.aborted && submit) { submit.disabled = false; submit.removeAttribute('aria-busy'); } }
 }, { signal });
}
function initializeYardiDraft(workspace: HTMLElement, signal: AbortSignal): void {
 const form = workspace.querySelector<HTMLFormElement>('[data-yardi-draft]');
 if (!form) return;
 form.addEventListener('submit', async event => {
  event.preventDefault();
  const submit = form.querySelector<HTMLButtonElement>('button[type="submit"]');
  if (submit?.disabled) return;
  const error = form.querySelector<HTMLElement>('[data-yardi-error]');
  const result = workspace.querySelector<HTMLElement>('[data-yardi-validation-result]');
  if (error) error.textContent = '';
  if (result) result.hidden = true;
  const data = new FormData(form), body: Record<string, unknown> = {};
  for (const key of ['documentationReference', 'interfaceId', 'clientEnvironment']) { const value = String(data.get(key) ?? '').trim(); if (value) body[key] = value; }
  const properties = String(data.get('propertyExternalIds') ?? '').split(/\r?\n/).map(value => value.trim()).filter(Boolean);
  if (properties.length) body.propertyExternalIds = properties;
  const capabilities = data.getAll('requestedCapabilities').map(String);
  if (capabilities.length) body.requestedCapabilities = capabilities;
  if (submit) { submit.disabled = true; submit.setAttribute('aria-busy', 'true'); }
  try {
   if (properties.length > 500) throw new Error('Check at most 500 property identifiers in one draft.');
   if (new Set(properties).size !== properties.length) throw new Error('Use each property identifier once. Remove repeated lines before checking this draft.');
   const checked = await api<YardiConfigValidation>('/api/connectors/yardi/validate-config', { method: 'POST', body: JSON.stringify(body), signal });
   if (signal.aborted || !result) return;
   result.dataset.readyForLive = String(checked.readyForLive);
   result.dataset.validationStatus = checked.status;
   const heading = result.querySelector<HTMLElement>('[data-yardi-validation-title]');
   if (heading) heading.textContent = checked.status === 'unsupported' ? 'Draft checked: unsupported capability requested' : 'Draft checked: live setup remains incomplete';
   const message = result.querySelector<HTMLElement>('[data-yardi-validation-message]');
   if (message) message.textContent = checked.message;
   const summary = result.querySelector<HTMLElement>('[data-yardi-validation-summary]');
   if (summary) summary.textContent = checked.summary.propertyCount + ' property identifiers and ' + checked.summary.requestedCapabilities.length + ' requested capabilities checked. This draft is not saved. No live connection was activated.';
   const list = result.querySelector<HTMLUListElement>('[data-yardi-validation-issues]');
   if (list) list.replaceChildren(...checked.issues.map(issue => { const item = document.createElement('li'); item.textContent = issue.message; return item; }));
   result.hidden = false; result.focus();
  } catch (issue) { if (!signal.aborted && error) { error.textContent = errorMessage(issue); error.tabIndex = -1; error.focus(); } }
  finally { if (!signal.aborted && submit) { submit.disabled = false; submit.removeAttribute('aria-busy'); } }
 }, { signal });
}