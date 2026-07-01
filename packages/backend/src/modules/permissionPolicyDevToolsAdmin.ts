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
import {
  devToolsAdministerPermission,
  devToolsConfigReadPermission,
  devToolsExternalDependenciesReadPermission,
  devToolsInfoReadPermission,
} from '@backstage/plugin-devtools-common';

/**
 * Members of this workgroup subgroup (owner term: the `cloud-engineering/admin`
 * team) are the only principals allowed to use the DevTools plugin.
 */
export const DEVTOOLS_ADMIN_GROUP = 'group:workgroups/cloud-engineering-admin';

const DEVTOOLS_PERMISSIONS = [
  devToolsAdministerPermission,
  devToolsInfoReadPermission,
  devToolsConfigReadPermission,
  devToolsExternalDependenciesReadPermission,
];

/**
 * Allows every permission (preserving the previous allow-all behavior) except
 * DevTools permissions, which require membership of {@link DEVTOOLS_ADMIN_GROUP}.
 */
export class DevToolsAdminPermissionPolicy implements PermissionPolicy {
  async handle(
    request: PolicyQuery,
    user?: PolicyQueryUser,
  ): Promise<PolicyDecision> {
    const isDevToolsRequest = DEVTOOLS_PERMISSIONS.some(permission =>
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
