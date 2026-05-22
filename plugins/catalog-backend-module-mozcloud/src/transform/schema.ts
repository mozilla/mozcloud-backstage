import { z } from 'zod';

const ImageSchema = z
  .object({
    image_repository: z.string().optional(),
    image_name: z.string().optional(),
    image_tag: z.string().optional(),
    image_regex: z.string().optional(),
    update_strategy: z.string().optional(),
    auto_update: z.boolean().optional(),
  })
  .passthrough();

const ChartSchema = z
  .object({
    application_repository: z.string().optional(),
    target_revision: z.string().optional(),
    release_name: z.string().optional(),
    images: z.record(z.string(), ImageSchema).optional(),
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
    additional_regions: z.array(z.string()).optional(),
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

/**
 * Row shape returned by `chartsDeploymentsQuery`. One row per
 * `(tenant, chart_name)` combining the chart's declared image refs from
 * `tenants.globals.deployment.charts[]` with the flat deployment facts
 * from `tenants_deployed_charts` (one entry per realm/environment/region
 * the chart is deployed to).
 */
const ChartImageSchema = z
  .object({
    auto_update: z.boolean().optional(),
    image_name: z.string().optional(),
    image_regex: z.string().optional(),
    image_repository: z.string().optional(),
    image_tag: z.string().optional(),
    name: z.string().optional(),
  })
  .passthrough();

const ChartDeploymentSchema = z
  .object({
    realm: z.string().optional(),
    environment: z.string().optional(),
    region: z.string().optional(),
    chart_name: z.string().optional(),
  })
  .passthrough();

export const ChartDeploymentsRowSchema = z
  .object({
    tenant: z.string(),
    chart_name: z.string(),
    chart_count: z.number().int().nonnegative(),
    function: z.string(),
    workgroups: z.array(z.string()).default([]),
    deployment_type: z.enum(['argocd', 'gha']).nullable().optional(),
    application_repository: z.string().nullable().optional(),
    release_name: z.string().nullable().optional(),
    images: z.array(ChartImageSchema).default([]),
    deployments: z.array(ChartDeploymentSchema).default([]),
  })
  .passthrough();

export type ChartDeploymentsRow = z.infer<typeof ChartDeploymentsRowSchema>;
export type ChartImage = z.infer<typeof ChartImageSchema>;
export type ChartDeployment = z.infer<typeof ChartDeploymentSchema>;
