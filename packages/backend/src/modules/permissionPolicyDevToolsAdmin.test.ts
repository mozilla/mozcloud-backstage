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
  devToolsInfoReadPermission,
  devToolsPermissions,
} from '@backstage/plugin-devtools-common';
import {
  devToolsTaskSchedulerCreatePermission,
  devToolsTaskSchedulerReadPermission,
} from '@backstage/plugin-devtools-common/alpha';
import {
  DEVTOOLS_ADMIN_GROUP,
  DevToolsAdminPermissionPolicy,
} from './permissionPolicyDevToolsAdmin';

const nonDevToolsPermission = createPermission({
  name: 'catalog.entity.read',
  attributes: { action: 'read' },
});

// The full set the policy must gate: the stable DevTools permissions plus the
// alpha Scheduled Tasks permissions (read + trigger/cancel), which are not part
// of the stable `devToolsPermissions` aggregate.
const gatedDevToolsPermissions = [
  ...devToolsPermissions,
  devToolsTaskSchedulerReadPermission,
  devToolsTaskSchedulerCreatePermission,
];

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

  it.each(gatedDevToolsPermissions)(
    'ALLOWs %s for members of the admin group',
    async permission => {
      const decision: PolicyDecision = await policy.handle(
        query(permission),
        userWithRefs(['user:people/test', DEVTOOLS_ADMIN_GROUP]),
      );
      expect(decision.result).toBe(AuthorizeResult.ALLOW);
    },
  );

  it.each(gatedDevToolsPermissions)(
    'DENYs %s for non-members',
    async permission => {
      const decision = await policy.handle(
        query(permission),
        userWithRefs(['user:people/test', 'group:workgroups/other-team']),
      );
      expect(decision.result).toBe(AuthorizeResult.DENY);
    },
  );

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
