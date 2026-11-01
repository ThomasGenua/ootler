import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from 'pg';
import type { DatabaseState } from '../../shared/contracts.js';
import type { ServerConfig } from '../config/env.js';
import { ApiError, DatabaseUnavailableError } from '../http/errors.js';

export class Database {
  readonly pool: Pool | null;

  constructor(readonly config: ServerConfig) {
    this.pool = config.databaseUrl ? new Pool({
      connectionString: config.databaseUrl,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 2_500,
      statement_timeout: 5_000,
      application_name: 'ootla',
    }) : null;
    this.pool?.on('error', () => console.error('Database idle connection failed. Check database availability.'));
  }

  async query<T extends QueryResultRow = QueryResultRow>(sql: string, values: unknown[] = []): Promise<QueryResult<T>> {
    if (!this.pool) throw new DatabaseUnavailableError('PostgreSQL is not configured. Set DATABASE_URL, then run npm run db:migrate and npm run db:seed.');
    try {
      return await this.pool.query<T>(sql, values);
    } catch {
      throw new DatabaseUnavailableError();
    }
  }

  async transaction<T>(operation: (client: PoolClient) => Promise<T>): Promise<T> {
    if (!this.pool) throw new DatabaseUnavailableError('PostgreSQL is not configured. Set DATABASE_URL, then run npm run db:migrate and npm run db:seed.');
    let client: PoolClient | undefined;
    try {
      client = await this.pool.connect();
      await client.query('BEGIN');
      const result = await operation(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      if (client) await client.query('ROLLBACK').catch(() => undefined);
      if (error instanceof ApiError) throw error;
      throw new DatabaseUnavailableError();
    } finally {
      client?.release();
    }
  }

  async state(): Promise<DatabaseState> {
    if (!this.pool) return 'unconfigured';
    try {
      const result = await this.query<{ ready: boolean }>(`
        SELECT to_regclass('public.organizations') IS NOT NULL
          AND to_regclass('public.users') IS NOT NULL
          AND to_regclass('public.organization_memberships') IS NOT NULL
          AND to_regclass('public.sessions') IS NOT NULL
          AND to_regclass('public.audit_events') IS NOT NULL
          AND to_regclass('public.roles') IS NOT NULL
          AND to_regclass('public.role_permissions') IS NOT NULL
          AND to_regclass('public.properties') IS NOT NULL
          AND to_regclass('public.property_access_assignments') IS NOT NULL
          AND to_regclass('public.units') IS NOT NULL
          AND to_regclass('public.leads') IS NOT NULL
          AND to_regclass('public.tasks') IS NOT NULL
          AND to_regclass('public.viewings') IS NOT NULL
          AND to_regclass('public.lead_activities') IS NOT NULL
          AND to_regclass('public.demo_seed_records') IS NOT NULL
          AND to_regclass('public.property_groups') IS NOT NULL
          AND to_regclass('public.contacts') IS NOT NULL
          AND to_regclass('public.households') IS NOT NULL
          AND to_regclass('public.applications') IS NOT NULL
          AND to_regclass('public.leases') IS NOT NULL
          AND to_regclass('public.external_record_mappings') IS NOT NULL
          AND to_regclass('public.lead_events') IS NOT NULL
          AND to_regclass('public.lead_property_interests') IS NOT NULL
          AND to_regclass('public.lead_workspace_events') IS NOT NULL
          AND to_regclass('public.lead_documents') IS NOT NULL
          AND to_regclass('public.provider_verified_updates') IS NOT NULL
          AND to_regclass('public.task_teams') IS NOT NULL
          AND to_regclass('public.task_team_members') IS NOT NULL
          AND to_regclass('public.task_routing_rules') IS NOT NULL
          AND to_regclass('public.task_events') IS NOT NULL
          AND to_regclass('public.task_reminders') IS NOT NULL
          AND to_regclass('public.task_notifications') IS NOT NULL
          AND to_regclass('public.import_batches') IS NOT NULL
          AND to_regclass('public.import_rows') IS NOT NULL
          AND to_regclass('public.staff_user_preferences') IS NOT NULL
          AND to_regclass('public.staff_password_attempt_limits') IS NOT NULL
          AND to_regclass('public.property_viewing_settings') IS NOT NULL
          AND to_regclass('public.viewing_staff_availability') IS NOT NULL
          AND to_regclass('public.viewing_lead_summaries') IS NOT NULL
          AND to_regclass('public.viewing_invitations') IS NOT NULL
          AND to_regclass('public.viewing_events') IS NOT NULL
          AND to_regclass('public.viewing_notification_receipts') IS NOT NULL
          AND to_regclass('public.viewing_action_receipts') IS NOT NULL
          AND to_regclass('public.application_participants') IS NOT NULL
          AND to_regclass('public.application_checklist_items') IS NOT NULL
          AND to_regclass('public.application_invitations') IS NOT NULL
          AND to_regclass('public.applicant_sessions') IS NOT NULL
          AND to_regclass('public.application_documents') IS NOT NULL
          AND to_regclass('public.application_consents') IS NOT NULL
          AND to_regclass('public.application_portal_events') IS NOT NULL
          AND to_regclass('public.google_calendar_connections') IS NOT NULL
          AND to_regclass('public.google_calendar_oauth_states') IS NOT NULL
          AND to_regclass('public.google_calendar_selections') IS NOT NULL
          AND to_regclass('public.google_calendar_event_cache') IS NOT NULL
          AND to_regclass('public.google_calendar_sync_stage') IS NOT NULL
          AND to_regclass('public.google_calendar_event_mappings') IS NOT NULL
          AND to_regclass('public.google_calendar_jobs') IS NOT NULL
          AND to_regclass('public.connector_connections') IS NOT NULL
          AND to_regclass('public.connector_jobs') IS NOT NULL
          AND to_regclass('public.connector_demo_state') IS NOT NULL
          AND to_regclass('public.connector_demo_records') IS NOT NULL
          AND to_regclass('public.connector_demo_events') IS NOT NULL
          AND to_regclass('public.connector_event_receipts') IS NOT NULL
          AND to_regclass('public.connector_event_logs') IS NOT NULL
          AND to_regclass('public.connector_conflicts') IS NOT NULL
          AND to_regclass('public.connector_action_receipts') IS NOT NULL
          AND EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='external_record_mappings' AND column_name='connection_id')
          AND EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='users' AND column_name='profile_version')
          AND EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='users' AND column_name='is_demo') AS ready
      `);
      return result.rows[0]?.ready ? 'ready' : 'migration-required';
    } catch {
      return 'unavailable';
    }
  }

  async requireReady(): Promise<void> {
    const state = await this.state();
    if (state === 'ready') return;
    if (state === 'migration-required') throw new ApiError(503, 'MIGRATION_REQUIRED', 'Run npm run db:migrate to prepare Ootla authentication and the property/contact/lead/task/import/account/connector/calendar workspace foundation. Existing data will be preserved.');
    throw new DatabaseUnavailableError(state === 'unconfigured' ? 'PostgreSQL is not configured. Set DATABASE_URL and run npm run db:migrate.' : undefined);
  }

  async close(): Promise<void> {
    await this.pool?.end();
  }
}

