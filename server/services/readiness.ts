import type { Database } from '../db/pool.js';

// Keep release requirements separate from the legacy foundation health API.
export async function releaseReady(database: Database): Promise<boolean> {
  if (await database.state() !== 'ready') return false;
  try {
    const migrations = await database.query<{ name: string }>('SELECT name FROM schema_migrations ORDER BY name');
    return migrations.rows.length >= 27 && migrations.rows.some(row=>row.name==='027_ai_leasing_workflows.sql') && migrations.rows.some(row=>row.name==='026_connected_workflows.sql') && migrations.rows.some(row=>row.name==='024_leasing_productivity.sql') && migrations.rows.some(row=>row.name==='025_document_scanning.sql') && migrations.rows.some(row => row.name === '023_staff_assistant_chat.sql') && migrations.rows.some(row => row.name === '022_property_collaboration.sql') && migrations.rows.some(row => row.name === '021_property_operations.sql') && migrations.rows.some(row => row.name === '020_connected_leasing.sql') && migrations.rows.some(row => row.name === '019_followup_batch_progress.sql') && migrations.rows.some(row => row.name === '018_leasing_operations.sql') && migrations.rows.some(row => row.name === '017_pilot_features.sql')
      && (await database.query<{ ready: boolean }>(`SELECT
        to_regclass('public.conversation_messages') IS NOT NULL AND
        to_regclass('public.resident_requests') IS NOT NULL AND
        to_regclass('public.assistant_requests') IS NOT NULL AND
        to_regclass('public.staff_assistant_chats') IS NOT NULL AND
        to_regclass('public.lead_routing_policies') IS NOT NULL AND
        to_regclass('public.prospect_journeys') IS NOT NULL AND
        to_regclass('public.ai_document_reviews') IS NOT NULL AND
        to_regclass('public.ai_knowledge_imports') IS NOT NULL AND
        to_regclass('public.ai_workflow_runs') IS NOT NULL AND
        to_regclass('public.field_tour_notes') IS NOT NULL AND
        to_regclass('public.sequence_enrollments') IS NOT NULL AND
        to_regclass('public.unit_shortlists') IS NOT NULL AND
        EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='resident_document_versions' AND column_name='scan_status') AND
        to_regclass('public.staff_access_links') IS NOT NULL AND
        to_regclass('public.organization_pilot_settings') IS NOT NULL AND
        to_regclass('public.lease_workflows') IS NOT NULL AS ready`)).rows[0]?.ready === true;
  } catch { return false; }
}
