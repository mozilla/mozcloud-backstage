import { z } from 'zod';

const ChartSchema = z
  .object({
    application_repository: z.string().optional(),
    target_revision: z.string().optional(),
    release_name: z.string().optional(),
  })
  .passthrough();

const EnvironmentSchema = z
  .object({
    name: z.string(),
  })
  .passthrough();

const RealmSchema = z
  .object({
    project_id: z.string().optional(),
    environments: z.array(EnvironmentSchema).optional(),
    fastly: z.array(z.string()).optional(),
  })
  .passthrough();

const EntitlementSchema = z
  .object({
    name: z.string(),
    roles: z.array(z.string()).default([]),
    principals: z.array(z.string()).default([]),
  })
  .passthrough();

const DeploymentSchema = z
  .object({
    type: z.enum(['argocd', 'gha']).optional(),
    slack_channel: z.string().optional(),
    charts: z.record(z.string(), ChartSchema).optional(),
  })
  .passthrough();

const GlobalsSchema = z
  .object({
    app_code: z.string(),
    function: z.string(),
    risk_level: z.enum(['high', 'low']),
    risk_uuid: z.string().optional(),
    cluster_type: z.string().optional(),
    slack_channel: z.string().optional(),
    workgroups: z.array(z.string()).default([]),
    deployment: DeploymentSchema.optional(),
    entitlements: z
      .object({
        enabled: z.boolean().optional(),
        additional_entitlements: z.array(EntitlementSchema).optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

export const TenantRowSchema = z
  .object({
    globals: GlobalsSchema,
    realms: z.record(z.string(), RealmSchema).optional(),
  })
  .passthrough();

export type TenantRow = z.infer<typeof TenantRowSchema>;

const SubgroupSchema = z
  .object({
    name: z.string(),
    members: z.array(z.string()).default([]),
    managers: z.array(z.string()).default([]),
    google_groups: z.array(z.string()).default([]),
    workgroups: z.array(z.string()).default([]),
    service_accounts: z.array(z.string()).default([]),
  })
  .passthrough();

export const WorkgroupRowSchema = z
  .object({
    workgroup: z.string(),
    sponsor: z.string(),
    managers: z.array(z.string()).default([]),
    tickets: z.array(z.string()).default([]),
    subgroups: z.array(SubgroupSchema).default([]),
  })
  .passthrough();

export type WorkgroupRow = z.infer<typeof WorkgroupRowSchema>;
export type Subgroup = z.infer<typeof SubgroupSchema>;
