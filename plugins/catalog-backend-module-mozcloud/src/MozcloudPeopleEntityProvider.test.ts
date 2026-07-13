import { mockServices } from '@backstage/backend-test-utils';
import {
  EntityProviderConnection,
  EntityProviderMutation,
} from '@backstage/plugin-catalog-node';
import {
  SchedulerServiceTaskInvocationDefinition,
  SchedulerServiceTaskRunner,
} from '@backstage/backend-plugin-api';
import { MozcloudPeopleEntityProvider } from './MozcloudPeopleEntityProvider';
import { Source } from './sources/Source';
import { UserRow } from './transform/schema';

class FakeUsersSource implements Source<UserRow> {
  constructor(
    public readonly description: string,
    private readonly rows: UserRow[],
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

const userRows: UserRow[] = [
  {
    email: 'alice@mozilla.com',
    name: 'Alice Anderson',
    github_login: 'alicegh',
    github_node_id: 'U_alice',
    github_orgs: ['mozilla'],
    memberships: [],
  },
  {
    email: 'bob@mozilla.com',
    name: null,
    github_login: null,
    github_node_id: null,
    github_orgs: [],
    memberships: [],
  },
];

describe('MozcloudPeopleEntityProvider', () => {
  it('applies a single full mutation of people-namespace users', async () => {
    const captured: EntityProviderMutation[] = [];
    const connection: EntityProviderConnection = {
      applyMutation: async m => {
        captured.push(m);
      },
      refresh: async () => {},
    };

    const provider = new MozcloudPeopleEntityProvider(
      new FakeUsersSource('bq:test', userRows),
      mockServices.logger.mock(),
      new ImmediateTaskRunner(),
    );
    await provider.connect(connection);

    expect(captured).toHaveLength(1);
    if (captured[0].type !== 'full') throw new Error('unreachable');

    const entities = captured[0].entities.map(e => e.entity);
    const refs = entities.map(
      e => `${e.kind.toLowerCase()}:${e.metadata.namespace}/${e.metadata.name}`,
    );
    expect(refs).toEqual([
      'user:people/alice',
      'user:people/bob',
      'group:people/all-staff',
    ]);

    // every people user belongs to the default all-staff group
    for (const u of entities.filter(e => e.kind === 'User')) {
      expect((u.spec as any).memberOf).toEqual(['group:people/all-staff']);
    }

    for (const e of captured[0].entities) {
      expect(e.locationKey).toBe('MozcloudPeopleEntityProvider');
    }
  });

  it('deduplicates rows with the same email', async () => {
    const captured: EntityProviderMutation[] = [];
    const connection: EntityProviderConnection = {
      applyMutation: async m => {
        captured.push(m);
      },
      refresh: async () => {},
    };

    const dupRows: UserRow[] = [
      {
        email: 'dup@mozilla.com',
        github_orgs: [],
        memberships: [],
      },
      {
        email: 'dup@mozilla.com', // duplicate
        github_orgs: [],
        memberships: [],
      },
    ];

    const provider = new MozcloudPeopleEntityProvider(
      new FakeUsersSource('bq:test', dupRows),
      mockServices.logger.mock(),
      new ImmediateTaskRunner(),
    );
    await provider.connect(connection);

    if (captured[0].type !== 'full') throw new Error('unreachable');
    const entities = captured[0].entities.map(e => e.entity);
    // one deduped user + the all-staff group
    expect(entities.filter(e => e.kind === 'User')).toHaveLength(1);
    expect(
      entities.filter(
        e => e.kind === 'Group' && e.metadata.name === 'all-staff',
      ),
    ).toHaveLength(1);
  });
});
