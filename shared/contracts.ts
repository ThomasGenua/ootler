import { z } from 'zod';

export const organizationRoleSchema = z.enum(['organization_admin', 'leasing_agent', 'property_manager', 'read_only_analyst', 'staff', 'read_only']);
export type OrganizationRole = z.infer<typeof organizationRoleSchema>;
export const staffRoleSchema = z.enum(['organization_admin', 'leasing_agent', 'property_manager', 'read_only_analyst']);
export const permissionSchema = z.enum(['organization.read', 'memberships.read', 'memberships.manage', 'property_access.manage', 'audit.read', 'properties.read', 'properties.manage', 'leasing.manage', 'analytics.read']);
export type Permission = z.infer<typeof permissionSchema>;
export interface RoleDefinition { key: OrganizationRole; name: string; legacy: boolean; permissions: Permission[] }
export interface PropertyAccess { organizationId: string; membershipId: string; propertyId: string; assignedAt: string }
export interface PropertyRecord { id: string; organizationId: string; name: string; createdAt: string; updatedAt: string }
export interface StaffMembership { id: string; userId: string; organizationId: string; name: string; email: string; role: OrganizationRole; active: boolean; userActive: boolean }
export const membershipUpdateSchema = z.object({ role: staffRoleSchema.optional(), active: z.boolean().optional() }).strict().refine((value) => value.role !== undefined || value.active !== undefined);
export const propertyInputSchema = z.object({ name: z.string().trim().min(1).max(200).refine((value) => !/[\u0000-\u001f\u007f]/.test(value)) }).strict();
export const paginationSchema = z.object({ limit: z.coerce.number().int().min(1).max(200).default(100), offset: z.coerce.number().int().min(0).max(1_000_000).default(0) }).strict();

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(1).max(1024),
}).strict();
export type LoginInput = z.infer<typeof loginSchema>;

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  membershipId: string;
  sessionExpiresAt: string;
  permissions: Permission[];
  organization: { id: string; name: string; role: OrganizationRole };
}
export interface PublicConfig {
  appUrl: string;
  demoEnabled: boolean;
  integrationsMode?: 'simulation';
  outboundMode?: 'simulation';
  demoCredentials?: { email: string; password: string };
  standaloneDemoCredentials?: { email: string; password: string };
  databaseReady: boolean;
  setupMessage?: string;
}
export const dashboardPeriodSchema = z.enum(['month', 'week', 'all']);
export type DashboardPeriod = z.infer<typeof dashboardPeriodSchema>;
export interface DashboardSummary {
  period: DashboardPeriod;
  timeZone: 'Africa/Lagos';
  metrics: { newLeads: number; toursBooked: number; applications: number | null; leasesSigned: number | null };
}
export interface AdminOverview {
  dashboard: DashboardSummary;
  organization: AuthUser['organization'];
  counts: { leads: number; properties: number; applications: number; tasks: number };
  modulesReady: false;
  demoEnabled?: boolean;
  integrationsMode?: 'simulation';
  outboundMode?: 'simulation';
}
export interface ApiErrorBody { error: string; code: string }
export type DatabaseState = 'ready' | 'unconfigured' | 'unavailable' | 'migration-required';
export interface HealthResponse { status: 'ok' | 'setup' | 'degraded'; database: DatabaseState }


// Stage 03 uses persisted synthetic records; full CRM workflows remain future work.
export interface DemoProperty { id: string; name: string; address: string; city: string; type: string }
export interface DemoUnit { id: string; propertyId: string; label: string; bedrooms: number; status: string; monthlyRent: number }
export interface DemoLead { id: string; name: string; email: string; status: string; intent: string; propertyId: string; unitId: string | null; notes: string }
export interface DemoTask { id: string; leadId: string; propertyId: string; title: string; dueAt: string; status: string }
export interface DemoViewing { id: string; leadId: string; propertyId: string; unitId: string | null; startsAt: string; status: string }
export interface DemoActivity { id: string; leadId: string; propertyId: string; kind: string; summary: string; occurredAt: string; simulated: true }
export interface DemoData {
  demo: true;
  integrationsMode: 'simulation';
  outboundMode: 'simulation';
  properties: DemoProperty[];
  units: DemoUnit[];
  leads: DemoLead[];
  tasks: DemoTask[];
  viewings: DemoViewing[];
  activities: DemoActivity[];
}

