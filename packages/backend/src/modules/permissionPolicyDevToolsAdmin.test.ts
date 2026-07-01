import {
  AuthorizeResult,
  createPermission,
  type PolicyDecision,
} from '@backstage/plugin-permission-common';
import type {
  PolicyQuery,
  PolicyQueryUser,
} from '@backstage/plugin-permission-node';
import {
  devToolsAdministerPermission,
  devToolsConfigReadPermission,
  devToolsExternalDependenciesReadPermission,
  devToolsInfoReadPermission,
} from '@backstage/plugin-devtools-common';
import {
  DEVTOOLS_ADMIN_GROUP,
  DevToolsAdminPermissionPolicy,
} from './permissionPolicyDevToolsAdmin';

const nonDevToolsPermission = createPermission({
  name: 'catalog.entity.read',
  attributes: { action: 'read' },
});

const userWithRefs = (ownershipEntityRefs: string[]): PolicyQueryUser =>
  ({
    credentials: {} as any,
    info: { userEntityRef: 'user:people/test', ownershipEntityRefs },
  } as PolicyQueryUser);

const query = (permission: PolicyQuery['permission']): PolicyQuery => ({
  permission,
});

describe('DevToolsAdminPermissionPolicy', () => {
  const policy = new DevToolsAdminPermissionPolicy();

  const devToolsPermissions = [
    devToolsAdministerPermission,
    devToolsInfoReadPermission,
    devToolsConfigReadPermission,
    devToolsExternalDependenciesReadPermission,
  ];

  it.each(devToolsPermissions)(
    'ALLOWs %s for members of the admin group',
    async permission => {
      const decision: PolicyDecision = await policy.handle(
        query(permission),
        userWithRefs(['user:people/test', DEVTOOLS_ADMIN_GROUP]),
      );
      expect(decision.result).toBe(AuthorizeResult.ALLOW);
    },
  );

  it.each(devToolsPermissions)('DENYs %s for non-members', async permission => {
    const decision = await policy.handle(
      query(permission),
      userWithRefs(['user:people/test', 'group:workgroups/other-team']),
    );
    expect(decision.result).toBe(AuthorizeResult.DENY);
  });

  it('DENYs DevTools permissions when there is no user', async () => {
    const decision = await policy.handle(
      query(devToolsInfoReadPermission),
      undefined,
    );
    expect(decision.result).toBe(AuthorizeResult.DENY);
  });

  it('ALLOWs non-DevTools permissions regardless of membership', async () => {
    const decision = await policy.handle(
      query(nonDevToolsPermission),
      userWithRefs(['user:people/test']),
    );
    expect(decision.result).toBe(AuthorizeResult.ALLOW);
  });
});
