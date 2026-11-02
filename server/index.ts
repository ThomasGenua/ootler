import {FollowupSequences} from './services/followup-sequences.js';
﻿import { FollowupAutomation,startFollowupAutomation } from './services/followup-automation.js';
import type { Server } from 'node:http';
import { createApp } from './app.js';
import { ConfigurationError, loadConfig } from './config/env.js';
import { Database } from './db/pool.js';
import { startTaskReminderWorker } from './services/tasks.js';
import { startImportWorker } from './services/imports.js';
import { startGoogleCalendarWorker } from './services/google-calendar-worker.js';
import { startConnectorWorker } from './services/connectors.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const database = new Database(config);
  const app = createApp(config, database);
  let server: Server;
  let stopSequences: (() => Promise<void>) | undefined;
  let stopFollowups: (() => Promise<void>) | undefined;
  let stopReminders: (() => Promise<void>) | undefined;
  let stopImports: (() => Promise<void>) | undefined;
  let stopGoogleCalendar: (() => Promise<void>) | undefined;
  let stopConnectors: (() => Promise<void>) | undefined;
  try {
    server = app.listen(config.port, config.production ? '0.0.0.0' : '127.0.0.1', () => {
      stopSequences = startFollowupAutomation(new FollowupSequences(database,config));
      stopFollowups = startFollowupAutomation(new FollowupAutomation(database,config));
      stopReminders = startTaskReminderWorker(database);
      stopImports = startImportWorker(database);
      stopConnectors = startConnectorWorker(database, config);
      stopGoogleCalendar = startGoogleCalendarWorker(database,config);
      console.info(`Ootla API listening on http://127.0.0.1:${config.port}`);
      if (!config.databaseUrl) console.info('PostgreSQL is not configured. Public pages remain available; staff login requires database setup.');
    });
  } catch {
    await database.close();
    throw new Error('SERVER_START_FAILED');
  }
  server.on('error', () => {
    console.error('Ootla could not listen on PORT. Check that the port is available.');
    void Promise.all([stopSequences?.(),stopFollowups?.(),stopReminders?.(),stopImports?.(),stopConnectors?.(),stopGoogleCalendar?.()]).finally(() => database.close()).finally(() => { process.exitCode = 1; });
  });
  let closing = false;
  const shutdown = () => {
    if (closing) return;
    closing = true;
    console.info('Stopping Ootla and closing database connections.');
    const deadline = setTimeout(() => {
      server.closeAllConnections();
      process.exit(1);
    }, 10_000);
    deadline.unref();
    server.close(() => {
      void Promise.all([stopSequences?.(),stopFollowups?.(),stopReminders?.(),stopImports?.(),stopConnectors?.(),stopGoogleCalendar?.()]).then(() => database.close()).then(() => {
        clearTimeout(deadline);
        process.exitCode = 0;
      }).catch(() => {
        clearTimeout(deadline);
        process.exitCode = 1;
      });
    });
    server.closeIdleConnections();
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

main().catch((error: unknown) => {
  console.error(error instanceof ConfigurationError ? error.message : 'Ootla could not start. Check server configuration and installed dependencies.');
  process.exitCode = 1;
});

