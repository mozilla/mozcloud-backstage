import { createBackendModule } from '@backstage/backend-plugin-api';
import { policyExtensionPoint } from '@backstage/plugin-permission-node/alpha';
import {
  AuthorizeResult,
  isPermission,
  type PolicyDecision,
} from '@backstage/plugin-permission-common';
import type {
  PermissionPolicy,
  PolicyQuery,
  PolicyQueryUser,
} from '@backstage/plugin-permission-node';
import { devToolsPermissions } from '@backstage/plugin-devtools-common';
import {
  devToolsTaskSchedulerCreatePermission,
  devToolsTaskSchedulerReadPermission,
} from '@backstage/plugin-devtools-common/alpha';

/**
 * Members of this workgroup subgroup (owner term: the `cloud-engineering/admin`
 * team) are the only principals allowed to use the DevTools plugin.
 */
export const DEVTOOLS_ADMIN_GROUP = 'group:workgroups/cloud-engineering-admins';

/**
 * The DevTools permissions gated to admins: the stable set
 * (`devToolsPermissions` — info/config/external-dependencies/administer) plus
 * the alpha Scheduled Tasks permissions (read + trigger/cancel). The scheduler
 * permissions are not part of the stable aggregate, so they are added
 * explicitly; otherwise they would fall through to the allow-all branch and be
 * granted to every authenticated user. This gates the frontend
 * `RequirePermission` checks around the Scheduled Tasks page — note the core
 * `.backstage/scheduler/v1/tasks` endpoints are not permission-integrated in
 * the pinned versions, so this is frontend/defense-in-depth, not a hard lock
 * on those endpoints.
 */
const GATED_DEVTOOLS_PERMISSIONS = [
  ...devToolsPermissions,
  devToolsTaskSchedulerReadPermission,
  devToolsTaskSchedulerCreatePermission,
];

/**
 * Allows every permission (preserving the previous allow-all behavior) except
 * the DevTools permissions in {@link GATED_DEVTOOLS_PERMISSIONS}, which require
 * membership of {@link DEVTOOLS_ADMIN_GROUP}.
 */
export class DevToolsAdminPermissionPolicy implements PermissionPolicy {
  async handle(
    request: PolicyQuery,
    user?: PolicyQueryUser,
  ): Promise<PolicyDecision> {
    const isDevToolsRequest = GATED_DEVTOOLS_PERMISSIONS.some(permission =>
      isPermission(request.permission, permission),
    );

    if (isDevToolsRequest) {
      // `info.ownershipEntityRefs` is the ownership source on PolicyQueryUser
      // in this Backstage version. It is populated by the sign-in resolver
      // from the user's catalog group memberships (workgroup subgroups).
      const ownershipRefs = user?.info.ownershipEntityRefs ?? [];
      const allowed = ownershipRefs.includes(DEVTOOLS_ADMIN_GROUP);
      return {
        result: allowed ? AuthorizeResult.ALLOW : AuthorizeResult.DENY,
      };
    }

    return { result: AuthorizeResult.ALLOW };
  }
}

export const permissionPolicyDevToolsAdmin = createBackendModule({
  pluginId: 'permission',
  moduleId: 'devtools-admin-policy',
  register(reg) {
    reg.registerInit({
      deps: { policy: policyExtensionPoint },
      async init({ policy }) {
        policy.setPolicy(new DevToolsAdminPermissionPolicy());
      },
    });
  },
});

export default permissionPolicyDevToolsAdmin;
