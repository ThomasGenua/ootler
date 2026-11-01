import type { DemoData } from '../lib/api';
import { escapeHtml, icon, link } from '../lib/ui';

export const leadStages = [
  { value: 'new', label: 'New inquiry' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'viewing_scheduled', label: 'Tour booked' },
  { value: 'qualified', label: 'Qualified' },
] as const;

export type LeadRecord = DemoData['leads'][number];

export function leadStageLabel(value: string): string {
  return leadStages.find(stage => stage.value === value)?.label ?? value.replace(/[_-]/g, ' ').replace(/^./, letter => letter.toUpperCase());
}

export function leadPropertyName(data: DemoData, lead: LeadRecord): string {
  return data.properties.find(property => property.id === lead.propertyId)?.name ?? 'Property not available';
}

export function leadUnitLabel(data: DemoData, lead: LeadRecord): string {
  const unit = data.units.find(record => record.id === lead.unitId && record.propertyId === lead.propertyId);
  const property = data.properties.find(record => record.id === lead.propertyId);
  if (!unit) return 'No unit selected';
  const propertyType = ({ apartments: 'apartment', townhomes: 'townhome', condominiums: 'condominium' } as Record<string, string>)[property?.type ?? ''] ?? 'home';
  return `${unit.bedrooms === 0 ? 'Studio' : `${unit.bedrooms}-bedroom`} ${propertyType}`;
}

export function filteredLeads(data: DemoData, query = new URLSearchParams()): LeadRecord[] {
  const stages = (query.get('stages') ?? '').split(',').filter(value => leadStages.some(stage => stage.value === value));
  const search = (query.get('q') ?? '').trim().toLocaleLowerCase();
  const familiarNames = ['Maya Chen', 'Jordan Ellis', 'Priya Shah'];
  const nameOrder = (name: string): number => {
    const index = familiarNames.indexOf(name);
    return index < 0 ? familiarNames.length : index;
  };
  return data.leads.filter(lead => (!stages.length || stages.includes(lead.status)) && (!search || [lead.name, lead.email, leadPropertyName(data, lead)].some(value => value.toLocaleLowerCase().includes(search)))).sort((left, right) => nameOrder(left.name) - nameOrder(right.name) || left.name.localeCompare(right.name) || left.id.localeCompare(right.id));
}

export function followupCards(data: DemoData, leads: LeadRecord[]): string {
  if (!leads.length) return '<div class="followup-empty" role="status"><h3>No leads match this view.</h3><p>Try another stage or clear your search to see the saved leads.</p></div>';
  return `<div class="followup-grid">${leads.map((lead) => {
    const initials = lead.name.split(' ').filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase();
    const task = data.tasks.filter(record => record.leadId === lead.id && record.propertyId === lead.propertyId && record.status === 'open').sort((left, right) => left.dueAt.localeCompare(right.dueAt) || left.id.localeCompare(right.id))[0];
    const statusClass = leadStages.some(stage => stage.value === lead.status) ? lead.status : 'other';
    const nameIndex = ['Maya Chen', 'Jordan Ellis', 'Priya Shah'].indexOf(lead.name);
    const avatarColor = nameIndex >= 0 ? nameIndex : 0;
    return `<article class="followup-card" data-demo-lead><div class="followup-card-top"><span class="lead-initials lead-initials-${avatarColor}" aria-hidden="true">${escapeHtml(initials)}</span><h3 class="followup-lead-name">${escapeHtml(lead.name)}</h3><span class="lead-stage lead-stage-${statusClass}">${escapeHtml(leadStageLabel(lead.status))}</span></div><div class="followup-property"><h4>${escapeHtml(leadPropertyName(data, lead))}</h4><p>${escapeHtml(leadUnitLabel(data, lead))}</p></div><div class="followup-next-step"><span>Next step</span><p>${escapeHtml(task?.title ?? 'No open follow-up task')}</p></div>${link(`/admin/leads?lead=${encodeURIComponent(lead.id)}`, `View lead ${icon('arrow')}`, 'followup-view')}</article>`;
  }).join('')}</div>`;
}

export function dashboardOverview(data?: DemoData, query = new URLSearchParams()): string {
  const content = data ? followupCards(data, filteredLeads(data, query).slice(0, 3)) : '<div class="followup-empty"><h3>Your next relationship starts here.</h3><p>Leads and their next steps will appear here when records are available. Lead creation is pending.</p></div>';
  return `<div class="followup-heading"><div><h2>Leads to follow up</h2><p>A clear next step for every prospect.</p></div>${link('/admin/leads?view=new', `${icon('plus')} Add lead`, 'button button-primary')}</div>${content}<div class="followup-bottom">${link('/admin/leads', `View all leads ${icon('arrow')}`, 'text-link')}</div><p class="workspace-footnote">${data ? 'Ootla · Demo workspace · Synthetic data' : 'Ootla · Workspace preview · No customer records'}</p>`;
}
