import { api, ApiError, errorMessage } from './api';
import type { LeadWorkspace, PropertySuggestions } from '../../shared/lead-workspace-contracts';
import { allowedDocumentTypes, maximumDocumentBytes } from '../../shared/lead-workspace-contracts';

const endpoint = (leadId: string): string => '/api/lead-workspaces/' + encodeURIComponent(leadId);
export async function loadLeadWorkspace08(leadId: string, query: URLSearchParams, signal: AbortSignal): Promise<LeadWorkspace | null> {
  const search = new URLSearchParams();
  for (const name of ['timelinePage', 'tasksPage', 'documentsPage']) if (query.has(name)) search.set(name, query.get(name)!);
  search.set('pageSize', query.get('workspacePageSize') ?? '10');
  try {
    const result = await api<LeadWorkspace>(endpoint(leadId) + '?' + search, { signal });
    if (query.has('suggestionsPage')) {
      const suggestions = new URLSearchParams({ page: query.get('suggestionsPage')!, pageSize: query.get('workspacePageSize') ?? '10' });
      result.suggestions = await api<PropertySuggestions>(endpoint(leadId) + '/suggestions?' + suggestions, { signal });
    }
    return result;
  } catch (error) {
    if (error instanceof ApiError && error.status === 403) return null;
    throw error;
  }
}
const value = (data: FormData, key: string): string => String(data.get(key) ?? '').trim();
function taskBody(data: FormData): Record<string, unknown> {
  return { title: value(data, 'title'), details: value(data, 'details'), dueAt: new Date(value(data, 'dueAt')).toISOString(), ownerMembershipId: value(data, 'ownerMembershipId') || null };
}
async function upload(leadId: string, data: FormData, signal: AbortSignal): Promise<void> {
  const file = data.get('document');
  if (!(file instanceof File) || !file.size) throw new Error('Choose a non-empty document file first.');
  if (file.size > maximumDocumentBytes) throw new Error('Choose a document no larger than 20 MiB.');
  const inferred = /\.txt$/i.test(file.name) ? 'text/plain' : /\.pdf$/i.test(file.name) ? 'application/pdf' : /\.png$/i.test(file.name) ? 'image/png' : /\.jpe?g$/i.test(file.name) ? 'image/jpeg' : '';
  const mediaType = file.type || inferred;
  if (!(allowedDocumentTypes as readonly string[]).includes(mediaType)) throw new Error('Choose a PDF, PNG, JPEG or plain text document.');
  const response = await fetch(endpoint(leadId) + '/documents?' + new URLSearchParams({ name: file.name }), { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': mediaType }, body: file, signal });
  const body: unknown = await response.json();
  if (!response.ok) {
    const result = body as { error?: string | { message?: string }; message?: string };
    throw new ApiError(response.status, typeof result.error === 'string' ? result.error : result.error?.message ?? result.message ?? 'The document could not be uploaded.');
  }
}
export function initializeLeadWorkspace08(signal: AbortSignal, navigate: (path: string, replace?: boolean, focusSelector?: string) => void): void {
  const workspace = document.querySelector<HTMLElement>('[data-lead-workspace08]');
  const leadId = workspace?.dataset.workspaceLead;
  if (!workspace || !leadId) return;
  workspace.addEventListener('submit', async event => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement) || !form.hasAttribute('data-workspace-form')) return;
    event.preventDefault();
    const submit = form.querySelector<HTMLButtonElement>('button[type="submit"]');
    if (submit?.disabled) return;
    const error = form.querySelector<HTMLElement>('[data-workspace-error]');
    if (error) error.textContent = '';
    if (submit) { submit.disabled = true; submit.setAttribute('aria-busy', 'true'); }
    const action = form.dataset.workspaceForm!;
    const data = new FormData(form);
    try {
      let path = endpoint(leadId), method = 'POST', body: Record<string, unknown>;
      if (action === 'document') await upload(leadId, data, signal);
      else {
        switch (action) {
          case 'note': path += '/notes'; body = { body: value(data, 'body') }; break;
          case 'call': path += '/calls'; body = { summary: value(data, 'summary'), outcome: value(data, 'outcome'), direction: value(data, 'direction'), durationMinutes: value(data, 'durationMinutes') ? Number(value(data, 'durationMinutes')) : null }; break;
          case 'decision': path += '/decisions'; body = { summary: value(data, 'summary'), context: 'follow_up', applicationId: null }; break;
          case 'task-create': path += '/tasks'; body = taskBody(data); break;
          case 'task-edit': path += '/tasks/' + encodeURIComponent(form.dataset.taskId!); method = 'PATCH'; body = { version: Number(form.dataset.version), ...taskBody(data) }; break;
          case 'task-status': path += '/tasks/' + encodeURIComponent(form.dataset.taskId!); method = 'PATCH'; body = { version: Number(form.dataset.version), status: form.dataset.taskStatus }; break;
          default: throw new Error('This staff action is not available.');
        }
        await api(path, { method, body: JSON.stringify(body), signal });
      }
      if (signal.aborted) return;
      const next = new URLSearchParams(location.search);
      next.delete('saved'); next.delete('timelinePage'); next.set('saved08', action);
      const section = action.startsWith('task-') ? 'lead08-tasks' : action === 'document' ? 'lead08-documents' : 'lead08-timeline';
      if (action.startsWith('task-')) next.delete('tasksPage');
      if (action === 'document') next.delete('documentsPage');
      navigate('/admin/leads?' + next + '#' + section, true, '#' + section);
    } catch (issue) {
      if (signal.aborted) return;
      if (error) { error.textContent = errorMessage(issue); error.tabIndex = -1; error.focus(); }
    } finally {
      if (!signal.aborted && submit) { submit.disabled = false; submit.removeAttribute('aria-busy'); }
    }
  }, { signal });
}