import { mockServices } from '@backstage/backend-test-utils';
import {
  EntityProviderConnection,
  EntityProviderMutation,
} from '@backstage/plugin-catalog-node';
import {
  SchedulerServiceTaskInvocationDefinition,
  SchedulerServiceTaskRunner,
} from '@backstage/backend-plugin-api';
import {
  MozcloudWorkgroupEntityProvider,
  buildGroupMembers,
} from './MozcloudWorkgroupEntityProvider';
import { Source } from './sources/Source';
import { UserRow, WorkgroupRow } from './transform/schema';

class FakeSource<T> implements Source<T> {
  constructor(
    public readonly description: string,
    private readonly rows: T[],
  ) {}
  async fetchAll() {
    return this.rows;
  }
}
class ImmediateTaskRunner implements SchedulerServiceTaskRunner {
  async run(task: SchedulerServiceTaskInvocationDefinition) {
    await task.fn(new AbortController().signal);
  }
}

const WG: WorkgroupRow = {
  workgroup: 'backstage',
  sponsor: 'boss@mozilla.com',
  managers: [],
  tickets: [],
  subgroups: [
    {
      parent: 'backstage',
      name: 'admins',
      members: [],
      managers: [],
      google_groups: [],
      workgroups: [],
      service_accounts: [],
    },
  ],
};
const USERS: UserRow[] = [
  {
    email: 'alice@mozilla.com',
    name: 'Alice',
    github_orgs: [],
    memberships: [{ workgroup: 'backstage', subgroup: 'admins' }],
  },
  {
    email: 'bob@mozilla.com',
    name: 'Bob',
    github_orgs: [],
    memberships: [{ workgroup: 'backstage', subgroup: 'admins' }],
  },
];

describe('buildGroupMembers', () => {
  it('maps subgroup membership to sorted people-namespace refs', () => {
    const map = buildGroupMembers(USERS);
    expect(map.get('group:workgroups/backstage-admins')).toEqual([
      'user:people/alice',
      'user:people/bob',
    ]);
  });
});

describe('MozcloudWorkgroupEntityProvider', () => {
  it('emits no User entities and sets Group members to people refs', async () => {
    const captured: EntityProviderMutation[] = [];
    const connection: EntityProviderConnection = {
      applyMutation: async m => {
        captured.push(m);
      },
      refresh: async () => {},
    };
    const provider = new MozcloudWorkgroupEntityProvider(
      new FakeSource<WorkgroupRow>('wg:test', [WG]),
      new FakeSource<UserRow>('users:test', USERS),
      mockServices.logger.mock(),
      new ImmediateTaskRunner(),
    );
    await provider.connect(connection);

    if (captured[0].type !== 'full') throw new Error('unreachable');
    const entities = captured[0].entities.map(e => e.entity);
    expect(entities.some(e => e.kind === 'User')).toBe(false);
    const admins = entities.find(
      e => e.kind === 'Group' && e.metadata.name === 'backstage-admins',
    )!;
    expect((admins.spec as { members?: string[] }).members).toEqual([
      'user:people/alice',
      'user:people/bob',
    ]);
  });

  it('merges gcp members (from workgroupToEntities) with people members (from the users source) rather than overwriting', async () => {
    const wgWithGcpMember: WorkgroupRow = {
      workgroup: 'backstage',
      sponsor: 'boss@mozilla.com',
      managers: [],
      tickets: [],
      subgroups: [
        {
          parent: 'backstage',
          name: 'admins',
          members: ['carol@firefox.gcp.mozilla.com'],
          managers: [],
          google_groups: [],
          workgroups: [],
          service_accounts: [],
        },
      ],
    };
    const captured: EntityProviderMutation[] = [];
    const connection: EntityProviderConnection = {
      applyMutation: async m => {
        captured.push(m);
      },
      refresh: async () => {},
    };
    const provider = new MozcloudWorkgroupEntityProvider(
      new FakeSource<WorkgroupRow>('wg:test', [wgWithGcpMember]),
      new FakeSource<UserRow>('users:test', USERS),
      mockServices.logger.mock(),
      new ImmediateTaskRunner(),
    );
    await provider.connect(connection);

    if (captured[0].type !== 'full') throw new Error('unreachable');
    const entities = captured[0].entities.map(e => e.entity);
    const admins = entities.find(
      e => e.kind === 'Group' && e.metadata.name === 'backstage-admins',
    )!;
    expect((admins.spec as { members?: string[] }).members).toEqual([
      'user:gcp/carol',
      'user:people/alice',
      'user:people/bob',
    ]);
  });
});
