import type { Database } from '../db/pool.js';

// Keep release requirements separate from the legacy foundation health API.
export async function releaseReady(database: Database): Promise<boolean> {
  if (await database.state() !== 'ready') return false;
  try {
    const migrations = await database.query<{ name: string }>('SELECT name FROM schema_migrations ORDER BY name');
    return migrations.rows.length >= 23 && migrations.rows.some(row => row.name === '023_staff_assistant_chat.sql') && migrations.rows.some(row => row.name === '022_property_collaboration.sql') && migrations.rows.some(row => row.name === '021_property_operations.sql') && migrations.rows.some(row => row.name === '020_connected_leasing.sql') && migrations.rows.some(row => row.name === '019_followup_batch_progress.sql') && migrations.rows.some(row => row.name === '018_leasing_operations.sql') && migrations.rows.some(row => row.name === '017_pilot_features.sql')
      && (await database.query<{ ready: boolean }>(`SELECT
        to_regclass('public.conversation_messages') IS NOT NULL AND
        to_regclass('public.resident_requests') IS NOT NULL AND
        to_regclass('public.assistant_requests') IS NOT NULL AND
        to_regclass('public.staff_assistant_chats') IS NOT NULL AND
        to_regclass('public.staff_access_links') IS NOT NULL AND
        to_regclass('public.organization_pilot_settings') IS NOT NULL AND
        to_regclass('public.lease_workflows') IS NOT NULL AS ready`)).rows[0]?.ready === true;
  } catch { return false; }
}
