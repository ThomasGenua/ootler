import {createProductivityRouter,createShortlistRouter} from './routes/productivity.js';
import {createPropertyCollaborationRouter,createVendorWorkspaceRouter,createResidentDocumentsRouter} from './routes/property-collaboration.js';
import {createPropertyOperationsRouter,createResidentWorkflowsRouter} from './routes/property-operations.js';
import { createOperationsRouter, createIntakeRouter, createResidentRouter } from './routes/operations.js';
import { createCommunicationWebhooks } from './routes/communication-webhooks.js';
import { IntakeService } from './services/intake.js';
import { existsSync } from 'node:fs';
import { createApplicantPortalRouter, createApplicationStaffRouter } from './routes/applicant-portal.js';
import { createPilotRouter } from './routes/pilot.js';
import { requestDiagnostics } from './middleware/observability.js';
import { releaseReady } from './services/readiness.js';
import { ApplicantPortal } from './services/applicant-portal.js';
import { createLeaseWorkflowRouter } from './routes/lease-workflow.js';
import { createStaffPaymentsRouter, createApplicantPaymentsRouter, createPaymentDemoRouter } from './routes/payments.js';
import { createScreeningRouter, createApplicantScreeningRouter, createScreeningDemoCallbackRouter } from './routes/screening.js';
import path from 'node:path';
import { installPublicSiteHttp } from './http/public-site.js';
import { isPublicPage } from '../shared/public-site.js';
import express, { type ErrorRequestHandler, type NextFunction, type Request, type Response } from 'express';
import { dashboardPeriodSchema, loginSchema, type DashboardPeriod, type AdminOverview, type AuthUser, type HealthResponse, type PublicConfig } from '../shared/contracts.js';
import type { ServerConfig } from './config/env.js';
import type { Database } from './db/pool.js';
import { ApiError } from './http/errors.js';
import { loginRateLimit, protectOrigin } from './middleware/security.js';
import { SessionService } from './services/sessions.js';
import { createGoogleCalendarRouter } from './routes/google-calendar.js';
import { createCalendarRouter,createPublicBookingRouter } from './routes/calendar.js';
import { createStaffRouter } from './routes/staff.js';
import { createLeadRouter } from './routes/leads.js';
import { createLeadWorkspaceRouter } from './routes/lead-workspace.js';
import { createTaskRouter } from './routes/tasks.js';
import { createImportRouter } from './routes/imports.js';
import { createAccountRouter } from './routes/account.js';
import { createConnectorRouter } from './routes/connectors.js';
import { createPropertyFoundationRouter } from './routes/property-foundation.js';
import { preparedDemoAccount } from './services/demo-environment.js';
import { preparedStandaloneDemo, standaloneDemoEmail } from './services/standalone-demo.js';
import { loadDemoData } from './services/demo-data.js';
import { loadDashboard } from './services/dashboard.js';
import { adminSummaryQuerySchema } from '../shared/admin-summary-contracts.js';
import { loadAdminPageSummary } from './services/admin-summary.js';

const frontendRoutes = new Set([
  '/shortlist','/admin/tour-followup','/admin/shortlists','/admin/playbooks','/admin/sequences','/admin/workload','/admin/conversion',
  '/vendor','/admin/vendor-work','/admin/inspections','/admin/notifications','/admin/resident-documents','/admin/property-insights','/inquire', '/resident', '/admin/maintenance','/admin/renewals','/admin/vacancies','/admin/duplicates','/admin/response-targets','/admin/attention', '/admin/intake', '/admin/inbox', '/admin/automations', '/admin/residents', '/admin/workspace', '/admin/knowledge', '/admin/reports',
  '/staff/access', '/admin/team', '/admin/onboarding',
  '/applicant', '/applicant/login', '/applicant/invite', '/payment-demo', '/book', '/', '/platform', '/ai-workflows', '/workflows/leasing', '/workflows/resident-support', '/integrations', '/contact', '/privacy', '/admin/login', '/admin',
  '/admin/leads', '/admin/contacts', '/admin/properties', '/admin/applications', '/admin/calendar',
  '/admin/tasks', '/admin/imports', '/admin/profile', '/admin/settings', '/admin/analytics', '/admin/ai', '/admin/integrations',
]);

export function createApp(config: ServerConfig, database: Database, options: { communicationFetch?: typeof fetch } = {}) {
  const app = express();
  const sessions = new SessionService(database, config);
  const applicantSessions = new ApplicantPortal(database, config);
  app.disable('x-powered-by');
  app.set('trust proxy', false);
  app.use(requestDiagnostics);
  app.use((_request, response, next) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    response.setHeader('X-Frame-Options', 'DENY');
    response.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    if (config.production) {
      response.setHeader('Strict-Transport-Security', 'max-age=31536000');
      response.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
    }
    next();
  });
  app.use('/inquire', async(request,response,next)=>{
    response.setHeader('Cache-Control','no-store');response.setHeader('Referrer-Policy','no-referrer');response.setHeader('X-Robots-Tag','noindex, nofollow');
    const id=request.query.form;
    if(typeof id==='string'&&/^[a-f0-9-]{36}$/i.test(id)){
      const form=await new IntakeService(database,config).form(id);
      response.removeHeader('X-Frame-Options');
      response.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'self' "+form.embed_origins.join(' ')+"; base-uri 'self'; form-action 'self'");
    }next();
  });
  app.use('/resident',(_request,response,next)=>{response.setHeader('Cache-Control','no-store, private');response.setHeader('Referrer-Policy','no-referrer');response.setHeader('X-Robots-Tag','noindex, nofollow');next();});
  const clientDirectory = path.resolve(process.cwd(), 'dist/client');
  installPublicSiteHttp(app, config, clientDirectory);
  app.use('/api', (_request, response, next) => {
    response.setHeader('Cache-Control', 'no-store');
    next();
  });
  // The larger upload envelope is scoped to authenticated standalone import uploads.
  app.post('/api/imports/upload', protectOrigin(config), async (request,response,next)=>{
    const user=await sessions.currentUser(request);
    if(!user)throw new ApiError(401,'AUTH_REQUIRED','Sign in to upload an import.');
    if(user.organization.role!=='organization_admin')throw new ApiError(403,'ADMIN_REQUIRED','An organization administrator must review imports.');
    next();
  }, express.json({limit:'12mb',strict:true}));
  // Demo callbacks verify their own exact raw bytes before the general JSON parser.
  app.use('/api/screening', createScreeningDemoCallbackRouter(config, database));
  app.use('/api/communications',createCommunicationWebhooks(config,database,options.communicationFetch));
  app.use(['/api/operations','/api/public/intake','/api/resident'],express.json({ limit: '64kb', strict: true }));
  app.use(express.json({ limit: '16kb', strict: true }));

  app.get('/api/live', (_request, response) => response.json({ status: 'ok' }));
  app.get('/api/ready', async (_request, response) => {
    const ready = await releaseReady(database);
    response.status(ready ? 200 : 503).json({ status: ready ? 'ready' : 'not-ready' });
  });
  app.get('/api/health', async (_request, response) => {
    const state = await database.state();
    const result: HealthResponse = {
      status: state === 'ready' ? 'ok' : state === 'unconfigured' ? 'setup' : 'degraded',
      database: state,
    };
    response.status(state === 'unavailable' || state === 'migration-required' ? 503 : 200).json(result);
  });

  app.get('/api/config', async (_request, response) => {
    const state = await database.state();
    const result: PublicConfig = { appUrl: config.appUrl, databaseReady: state === 'ready', demoEnabled: false, integrationsMode: config.integrationsMode, outboundMode: config.outboundMode };
    if (state === 'unconfigured') result.setupMessage = 'PostgreSQL is not configured. Set DATABASE_URL, then run npm run db:migrate and npm run db:seed.';
    if (state === 'unavailable') result.setupMessage = 'PostgreSQL cannot be reached. Check that it is running and DATABASE_URL is correct.';
    if (state === 'migration-required') result.setupMessage = 'PostgreSQL is connected. Run npm run db:migrate, then npm run db:seed to prepare the isolated demo.';
    if (state === 'ready' && config.demoMode) {
      if (await preparedDemoAccount(config, database)) {
        result.demoEnabled = true;
        result.demoCredentials = { email: config.demoAdminEmail, password: config.demoAdminPassword };
      } else {
        result.setupMessage = 'Demo access is unavailable. Verify the isolated demo configuration and run npm run db:seed. Existing passwords and data are preserved.';
      }
    }
    if (state === 'ready' && config.demoMode && await preparedStandaloneDemo(config, database)) result.standaloneDemoCredentials = { email: standaloneDemoEmail, password: config.demoAdminPassword };
    response.json(result);
  });

  app.post('/api/auth/login', protectOrigin(config), loginRateLimit(), async (request, response) => {
    if (!request.is('application/json')) throw new ApiError(415, 'JSON_REQUIRED', 'Send sign-in details as application/json.');
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) throw new ApiError(400, 'INVALID_LOGIN', 'Enter a valid email address and password.');
    const user = await sessions.login(request, response, parsed.data.email, parsed.data.password);
    response.json({ user });
  });

  const requireUser = async (request: Request, response: Response, next: NextFunction) => {
    const user = await sessions.currentUser(request);
    if (!user) throw new ApiError(401, 'AUTH_REQUIRED', 'Sign in to open the Ootla workspace.');
    response.locals.user = user;
    next();
  };

  app.get('/api/auth/me', requireUser, (_request, response) => {
    response.json({ user: response.locals.user as AuthUser });
  });

  app.post('/api/auth/logout', protectOrigin(config), async (request, response) => {
    await sessions.logout(request, response);
    response.status(204).end();
  });

  const overview = async (user: AuthUser, period: DashboardPeriod): Promise<AdminOverview> => {
    const scope = user.organization.role === 'organization_admin';
    const parameters = [user.organization.id,scope,user.membershipId];
    const result = await database.query<{properties:number;leads:number;tasks:number;applications:number}>(`
      SELECT
        (SELECT count(*)::integer FROM properties p WHERE p.organization_id=$1 AND ($2 OR EXISTS(SELECT 1 FROM property_access_assignments a WHERE a.organization_id=p.organization_id AND a.property_id=p.id AND a.membership_id=$3))) AS properties,
        (SELECT count(*)::integer FROM leads l WHERE l.organization_id=$1 AND ($2 OR EXISTS(SELECT 1 FROM property_access_assignments a WHERE a.organization_id=l.organization_id AND a.property_id=l.property_id AND a.membership_id=$3))) AS leads,
        (SELECT count(*)::integer FROM tasks t WHERE t.organization_id=$1 AND ($2 OR EXISTS(SELECT 1 FROM property_access_assignments a WHERE a.organization_id=t.organization_id AND a.property_id=t.property_id AND a.membership_id=$3))) AS tasks,
        (SELECT count(*)::integer FROM applications application
          WHERE application.organization_id=$1
            AND ($2 OR EXISTS(SELECT 1 FROM property_access_assignments pa
              WHERE pa.organization_id=application.organization_id AND pa.property_id=application.property_id AND pa.membership_id=$3))
            AND ($2 OR NOT EXISTS(SELECT 1 FROM lead_property_interests li
              WHERE li.organization_id=application.organization_id AND li.lead_id=application.lead_id
                AND NOT EXISTS(SELECT 1 FROM property_access_assignments pa
                  WHERE pa.organization_id=li.organization_id AND pa.property_id=li.property_id AND pa.membership_id=$3)))
        ) AS applications
    `,parameters);
    const demoOrganization = scope && (await database.query("SELECT id FROM organizations WHERE id=$1 AND environment='demo' AND slug='ootla-demo'",[user.organization.id])).rowCount;
    return {
      organization:user.organization,
      dashboard:await loadDashboard(database,user,period),
      counts:{properties:result.rows[0]?.properties??0,leads:result.rows[0]?.leads??0,tasks:result.rows[0]?.tasks??0,applications:result.rows[0]?.applications??0},
      modulesReady:false,
      demoEnabled:Boolean(demoOrganization && await preparedDemoAccount(config,database)),
      integrationsMode:config.integrationsMode,
      outboundMode:config.outboundMode,
    };
  };
  const overviewPeriod = (request: Request): DashboardPeriod => {
    const parsed = dashboardPeriodSchema.safeParse(request.query.period ?? 'month');
    if (!parsed.success) throw new ApiError(400, 'INVALID_PERIOD', 'Choose month, week or all for the dashboard period.');
    return parsed.data;
  };
  app.get('/api/admin/summary', requireUser, async (request, response) => {
    const parsed = adminSummaryQuerySchema.safeParse(request.query);
    if (!parsed.success) throw new ApiError(400, 'INVALID_SUMMARY_QUERY', 'Choose a supported admin page and month, week or all.');
    response.json(await loadAdminPageSummary(database,response.locals.user as AuthUser,parsed.data.page,parsed.data.period));
  });
  app.get('/api/admin/overview', requireUser, async (request, response) => {
    response.json(await overview(response.locals.user as AuthUser, overviewPeriod(request)));
  });
  app.get('/api/organizations/:organizationId/overview', requireUser, async (request, response) => {
    const user = response.locals.user as AuthUser;
    if (request.params.organizationId !== user.organization.id) {
      throw new ApiError(403, 'ORGANIZATION_DENIED', 'You do not have access to this organization.');
    }
    response.json(await overview(user, overviewPeriod(request)));
  });
  app.get('/api/demo/data', requireUser, async (_request,response)=> {
    response.json(await loadDemoData(config,database,response.locals.user as AuthUser));
  });
  app.use('/api/google-calendar', createGoogleCalendarRouter(config,database,requireUser));
  app.use('/api/calendar', createCalendarRouter(config,database,requireUser));
  app.use('/api/public/calendar', createPublicBookingRouter(config,database));
  app.use('/book',(_req,res,next)=>{res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Robots-Tag','noindex, nofollow');next();});
  app.use('/api/account', createAccountRouter(config, database, requireUser));
  app.use('/api/connectors', createConnectorRouter(config, database, requireUser));
  app.use('/api/imports', createImportRouter(config, database, requireUser));
  app.use('/api/public/intake',createIntakeRouter(config,database));
  app.use('/api/productivity',express.json({limit:'64kb',strict:true}),createProductivityRouter(config,database,requireUser));
  app.use('/api/public/shortlist',express.json({limit:'8kb',strict:true}),createShortlistRouter(config,database));
  app.use('/api/property-collaboration',createPropertyCollaborationRouter(config,database,requireUser));
  app.use('/api/vendor-workspace',createVendorWorkspaceRouter(config,database));
  app.use('/api/resident-documents',createResidentDocumentsRouter(config,database));
  app.use('/api/property-operations',createPropertyOperationsRouter(config,database,requireUser));
  app.use('/api/resident-workflows',createResidentWorkflowsRouter(config,database));
  app.use('/api/operations',createOperationsRouter(config,database,requireUser,options.communicationFetch));
  app.use('/api/resident',createResidentRouter(config,database));
  app.use('/api/pilot', createPilotRouter(config, database, requireUser));
  app.use('/staff/access', (_request,response,next)=>{response.setHeader('Cache-Control','no-store, private');response.setHeader('Referrer-Policy','no-referrer');response.setHeader('X-Robots-Tag','noindex, nofollow');next();});
  app.use('/api/application-leases', createLeaseWorkflowRouter(config, database, requireUser));
  app.use('/api/application-payments', createStaffPaymentsRouter(config, database, requireUser));
  app.use('/api/applicant/application-payments', createApplicantPaymentsRouter(config, database));
  app.use('/api/payment-demo', createPaymentDemoRouter(config, database));
  app.use('/payment-demo', (_request,response,next)=>{response.setHeader('Cache-Control','no-store, private');response.setHeader('Referrer-Policy','no-referrer');response.setHeader('X-Robots-Tag','noindex, nofollow');next();});
  app.use('/api/application-journey', createScreeningRouter(config, database, requireUser));
  app.use('/api/applicant/application-journey', createApplicantScreeningRouter(config, database));
  app.use('/api/applicant', createApplicantPortalRouter(config, database));
  app.use('/api/applications', createApplicationStaffRouter(config, database, requireUser));
  app.use('/api/tasks', createTaskRouter(config, database, requireUser));
  app.use('/api/lead-workspaces', createLeadWorkspaceRouter(config, database, requireUser));
  app.use('/api/leads', createLeadRouter(config, database, requireUser));
  app.use('/api/property-foundation', createPropertyFoundationRouter(config, database, requireUser));
  app.use('/api', createStaffRouter(config, database, requireUser));

  // An API miss always stays JSON, including when HTML was requested.
  app.use('/api', (_request, _response) => {
    throw new ApiError(404, 'API_NOT_FOUND', 'This API route does not exist.');
  });

  if (config.production) {
    const indexFile = path.join(clientDirectory, 'index.html');
    // Gate page navigation before static serving, so /admin and /admin/... cannot leak a protected view.
    app.use(async (request, response, next) => {
      const route = request.path.replace(/\/$/, '') || '/';
      if ((request.method === 'GET' || request.method === 'HEAD') && frontendRoutes.has(route) && route.startsWith('/admin') && route !== '/admin/login') {
        const user = await sessions.currentUser(request);
        if (!user) {
          response.redirect(302, '/admin/login');
          return;
        }
        response.setHeader('Cache-Control', 'no-store');
      }
      if ((request.method === 'GET' || request.method === 'HEAD') && (route.startsWith('/applicant') || route==='/resident') && frontendRoutes.has(route)) {
        response.setHeader('Cache-Control', 'no-store, private');
        response.setHeader('Referrer-Policy', 'no-referrer');
        if ((route === '/applicant' || route === '/resident') && !await applicantSessions.currentUser(request)) {
          response.redirect(302, '/applicant/login');
          return;
        }
      }
      next();
    });
    app.use(express.static(clientDirectory, { index: false, dotfiles: 'deny', fallthrough: true, redirect: false }));
    app.use((request, response, next) => {
      const route = request.path.replace(/\/$/, '') || '/';
      if ((request.method === 'GET' || request.method === 'HEAD') && frontendRoutes.has(route) && existsSync(indexFile)) {
        response.setHeader('Cache-Control', route.startsWith('/applicant') || route === '/inquire' || route === '/resident' || route === '/payment-demo' || route === '/staff/access' || route === '/book' || (route.startsWith('/admin') && route !== '/admin/login') ? 'no-store' : 'no-cache');
        const publicFile = route === '/' ? indexFile : path.join(clientDirectory, route.slice(1), 'index.html');
        const documentFile = isPublicPage(route) && existsSync(publicFile) ? publicFile : path.join(clientDirectory, 'app-shell.html');
        response.sendFile(documentFile);
        return;
      }
      next();
    });
  }

  app.use((_request, response) => {
    response.status(404).type('text/plain').send('Page or asset not found.');
  });
  const errorHandler: ErrorRequestHandler = (error: unknown, _request, response, _next) => {
    if (response.headersSent) return;
    if (error instanceof ApiError) {
      response.status(error.status).json({ error: error.message, code: error.code, requestId: response.locals.requestId });
      return;
    }
    const parserError = error as { type?: string; status?: number };
    if (parserError?.type === 'entity.parse.failed') {
      response.status(400).json({ error: 'The request body is not valid JSON.', code: 'INVALID_JSON' });
      return;
    }
    if (parserError?.type === 'entity.too.large') {
      response.status(413).json({ error: 'The request body is too large.', code: 'BODY_TOO_LARGE' });
      return;
    }
    response.status(500).json({ error: 'This request could not be completed. Please try again.', code: 'INTERNAL_ERROR', requestId: response.locals.requestId });
  };
  app.use(errorHandler);
  return app;
}


