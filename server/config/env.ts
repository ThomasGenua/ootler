import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  CLAMAV_HOST:z.string().max(253).regex(/^[a-zA-Z0-9.-]*$/).default(''),
  CLAMAV_PORT:z.coerce.number().int().min(1).max(65535).default(3310),
  COMMUNICATIONS_ENABLED:z.enum(['true','false']).default('false').transform(v=>v==='true'),
  COMMUNICATIONS_ORGANIZATION_ID:z.union([z.uuid(),z.literal('')]).default(''),
  RESEND_API_KEY:z.string().max(1000).default(''),
  RESEND_FROM_EMAIL:z.union([z.email(),z.literal('')]).default(''),
  RESEND_REPLY_DOMAIN:z.string().regex(/^$|^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/).default(''),
  RESEND_WEBHOOK_SECRET:z.string().max(500).default(''),
  TWILIO_ACCOUNT_SID:z.string().regex(/^$|^AC[a-fA-F0-9]{32}$/).default(''),
  TWILIO_AUTH_TOKEN:z.string().max(500).default(''),
  TWILIO_FROM_NUMBER:z.string().regex(/^$|^\+[1-9]\d{7,14}$/).default(''),
  AI_ENABLED: z.enum(['true','false']).default('false').transform(value => value === 'true'),
  OPENAI_API_KEY: z.string().max(1000).default(''),
  OPENAI_MODEL: z.string().trim().max(100).default(''),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().trim().default(''),
  PORT: z.coerce.number().int().min(1).max(65535).default(3100),
  APP_URL: z.string().trim().url(),
  SESSION_SECRET: z.string().min(32),
  CONNECTOR_CREDENTIAL_KEY: z.string().default('').refine(value => value === '' || (/^[A-Za-z0-9+/]{43}=$/.test(value) && Buffer.from(value, 'base64').length === 32 && Buffer.from(value, 'base64').toString('base64') === value), 'Use a base64-encoded 32-byte server-only key.'),
  GOOGLE_CALENDAR_ENABLED: z.enum(['true','false']).default('false').transform(value => value === 'true'),
  GOOGLE_CALENDAR_CLIENT_ID: z.string().trim().max(500).default(''),
  GOOGLE_CALENDAR_CLIENT_SECRET: z.string().max(1000).default(''),
  GOOGLE_CALENDAR_REDIRECT_URI: z.string().trim().max(1000).default(''),
  GOOGLE_CALENDAR_TOKEN_KEY: z.string().default('').refine(value => value === '' || (/^[A-Za-z0-9+/]{43}=$/.test(value) && Buffer.from(value,'base64').length === 32 && Buffer.from(value,'base64').toString('base64') === value), 'Use a base64-encoded 32-byte server-only key.'),
  DEMO_MODE: z.enum(['true', 'false']).default('false').transform((value) => value === 'true'),
  DEMO_ADMIN_EMAIL: z.string().trim().toLowerCase().email().max(254).default('admin@demo.ootla.test'),
  INTEGRATIONS_MODE: z.literal('simulation').default('simulation'),
  OUTBOUND_MODE: z.literal('simulation').default('simulation'),
  DEMO_ADMIN_PASSWORD: z.string().min(12).max(128).default('OotlaDemo!2026'),
});

export class ConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigurationError';
  }
}

export function databaseNameFromUrl(databaseUrl: string): string {
  try {
    const parsed = new URL(databaseUrl);
    if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) throw new Error('protocol');
    const database = decodeURIComponent(parsed.pathname.slice(1));
    if (!parsed.hostname || !database || database.includes('/')) throw new Error('database');
    return database;
  } catch {
    throw new ConfigurationError('DATABASE_URL must be a valid PostgreSQL URL with a database name.');
  }
}

export function loadConfig(environment: NodeJS.ProcessEnv = process.env) {
  const parsed = envSchema.safeParse(environment);
  if (!parsed.success) {
    const fields = [...new Set(parsed.error.issues.map((issue) => issue.path[0]))].join(', ');
    throw new ConfigurationError(`Invalid server configuration: ${fields}. Check .env.example; SESSION_SECRET needs at least 32 characters. Values are intentionally omitted.`);
  }
  const values = parsed.data;
  if(values.COMMUNICATIONS_ENABLED && (values.DEMO_MODE || !values.COMMUNICATIONS_ORGANIZATION_ID || !values.APP_URL.startsWith('https://')))throw new ConfigurationError('Live communications require a non-demo environment, HTTPS origin and an explicitly selected organization.');
  if (values.AI_ENABLED && (!values.OPENAI_API_KEY || !values.OPENAI_MODEL || values.DEMO_MODE)) throw new ConfigurationError('Live AI requires a server API key, explicit model and a non-demo environment.');
  const origin = new URL(values.APP_URL);
  if (!['http:', 'https:'].includes(origin.protocol) || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash) {
    throw new ConfigurationError('APP_URL must be an HTTP(S) origin without a path, credentials, query or fragment.');
  }
  if (values.NODE_ENV === 'production' && origin.protocol !== 'https:') {
    throw new ConfigurationError('APP_URL must use HTTPS in production.');
  }
  if (values.NODE_ENV === 'production' && values.DEMO_MODE) {
    throw new ConfigurationError('DEMO_MODE is forbidden in production. Use a separate development/demo environment.');
  }
  if (values.GOOGLE_CALENDAR_ENABLED) {
    if (values.DEMO_MODE) throw new ConfigurationError('Google Calendar live access is forbidden in DEMO_MODE. Use a separate non-demo deployment.');
    if (!values.GOOGLE_CALENDAR_CLIENT_ID || !values.GOOGLE_CALENDAR_CLIENT_SECRET || !values.GOOGLE_CALENDAR_TOKEN_KEY || values.GOOGLE_CALENDAR_REDIRECT_URI !== origin.origin + '/api/google-calendar/oauth/callback') throw new ConfigurationError('Google Calendar requires server client credentials, a token encryption key and the exact APP_URL/api/google-calendar/oauth/callback redirect URI. Values are omitted.');
    if (origin.protocol !== 'https:' && !['localhost','127.0.0.1','[::1]'].includes(origin.hostname)) throw new ConfigurationError('Google Calendar requires HTTPS except for a local loopback development origin.');
  }
  const databaseName = values.DATABASE_URL ? databaseNameFromUrl(values.DATABASE_URL) : null;
  if (values.DEMO_MODE && values.DATABASE_URL && (new URL(values.DATABASE_URL).search || new URL(values.DATABASE_URL).hash)) {
    throw new ConfigurationError('DEMO_MODE database URLs must not contain query parameters or fragments. Use one explicit isolated database connection.');
  }
  if (values.DEMO_MODE && databaseName && !/^ootla_demo(?:_[a-z0-9_]+)?$/.test(databaseName)) {
    throw new ConfigurationError('DEMO_MODE requires a dedicated database named ootla_demo or ootla_demo_*.');
  }
  if (/^(replace|change)(?:[-_ ]|$)/i.test(values.SESSION_SECRET)) {
    throw new ConfigurationError('SESSION_SECRET must be a newly generated secret, not an example placeholder.');
  }
  return Object.freeze({
    documentScanner:Object.freeze({host:values.CLAMAV_HOST,port:values.CLAMAV_PORT}),
    communications:Object.freeze({enabled:values.COMMUNICATIONS_ENABLED,organizationId:values.COMMUNICATIONS_ORGANIZATION_ID,resendKey:values.RESEND_API_KEY,resendFrom:values.RESEND_FROM_EMAIL,replyDomain:values.RESEND_REPLY_DOMAIN,resendWebhookSecret:values.RESEND_WEBHOOK_SECRET,twilioSid:values.TWILIO_ACCOUNT_SID,twilioToken:values.TWILIO_AUTH_TOKEN,twilioFrom:values.TWILIO_FROM_NUMBER}),
    ai: Object.freeze({ enabled: values.AI_ENABLED, apiKey: values.OPENAI_API_KEY, model: values.OPENAI_MODEL }),
    nodeEnv: values.NODE_ENV,
    databaseUrl: values.DATABASE_URL,
    databaseName,
    port: values.PORT,
    appUrl: origin.origin,
    sessionSecret: values.SESSION_SECRET,
    googleCalendar: Object.freeze({enabled:values.GOOGLE_CALENDAR_ENABLED,clientId:values.GOOGLE_CALENDAR_CLIENT_ID,clientSecret:values.GOOGLE_CALENDAR_CLIENT_SECRET,redirectUri:values.GOOGLE_CALENDAR_REDIRECT_URI,tokenEncryptionKey:values.GOOGLE_CALENDAR_TOKEN_KEY || null}),
    connectorCredentialKey: values.CONNECTOR_CREDENTIAL_KEY || null,
    demoMode: values.DEMO_MODE,
    demoAdminEmail: values.DEMO_ADMIN_EMAIL,
    demoAdminPassword: values.DEMO_ADMIN_PASSWORD,
    integrationsMode: values.INTEGRATIONS_MODE,
    outboundMode: values.OUTBOUND_MODE,
    production: values.NODE_ENV === 'production',
  });
}

export type ServerConfig = ReturnType<typeof loadConfig>;

/** Mutating utilities are deliberately restricted to Ootla databases. */
export function assertOotlaDatabase(config: ServerConfig): void {
  if (!config.databaseName || !/^ootla(?:_[a-z0-9_]+)?$/.test(config.databaseName)) {
    throw new ConfigurationError('Set DATABASE_URL to a dedicated Ootla database named ootla or ootla_*. No database was changed.');
  }
}

