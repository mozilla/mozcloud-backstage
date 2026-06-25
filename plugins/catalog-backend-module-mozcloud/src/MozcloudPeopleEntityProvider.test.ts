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
import { PersonRosterRow, UserRow } from './transform/schema';

class FakeRosterSource implements Source<PersonRosterRow> {
  constructor(
    public readonly description: string,
    private readonly rows: PersonRosterRow[],
  ) {}
  async fetchAll() {
    return this.rows;
  }
}

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

const rosterRows: PersonRosterRow[] = [
  {
    user_id: 'ad|Mozilla-LDAP|alice',
    primary_email: 'alice@mozilla.com',
  },
  {
    user_id: 'ad|Mozilla-LDAP|bob',
    primary_email: 'bob@mozilla.com',
  },
];

const userRows: UserRow[] = [
  {
    email: 'alice@mozilla.com',
    name: 'Alice Anderson',
    github_login: 'alicegh',
    github_node_id: 'U_alice',
    github_orgs: ['mozilla'],
    memberships: [],
  },
  // Bob has no BQ match (no UserRow)
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
      new FakeRosterSource('person-api:test', rosterRows),
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
      'user:people/alice-mozilla-com',
      'user:people/bob-mozilla-com',
    ]);

    for (const e of captured[0].entities) {
      expect(e.locationKey).toBe('MozcloudPeopleEntityProvider');
    }
  });

  it('enriches alice with displayName and github annotations from BQ', async () => {
    const captured: EntityProviderMutation[] = [];
    const connection: EntityProviderConnection = {
      applyMutation: async m => {
        captured.push(m);
      },
      refresh: async () => {},
    };

    const provider = new MozcloudPeopleEntityProvider(
      new FakeRosterSource('person-api:test', rosterRows),
      new FakeUsersSource('bq:test', userRows),
      mockServices.logger.mock(),
      new ImmediateTaskRunner(),
    );
    await provider.connect(connection);

    if (captured[0].type !== 'full') throw new Error('unreachable');
    const alice = captured[0].entities
      .map(e => e.entity)
      .find(e => e.metadata.name === 'alice-mozilla-com');

    expect(alice).toBeDefined();
    expect((alice!.spec as any).profile.displayName).toBe('Alice Anderson');
    const ann = alice!.metadata.annotations ?? {};
    expect(ann['github.com/user-login']).toBe('alicegh');
    expect(ann['github.com/user-id']).toBe('U_alice');
    expect(ann['mozilla.org/github-orgs']).toBe('mozilla');
  });

  it('falls back bob displayName to email local-part and omits github annotations', async () => {
    const captured: EntityProviderMutation[] = [];
    const connection: EntityProviderConnection = {
      applyMutation: async m => {
        captured.push(m);
      },
      refresh: async () => {},
    };

    const provider = new MozcloudPeopleEntityProvider(
      new FakeRosterSource('person-api:test', rosterRows),
      new FakeUsersSource('bq:test', userRows),
      mockServices.logger.mock(),
      new ImmediateTaskRunner(),
    );
    await provider.connect(connection);

    if (captured[0].type !== 'full') throw new Error('unreachable');
    const bob = captured[0].entities
      .map(e => e.entity)
      .find(e => e.metadata.name === 'bob-mozilla-com');

    expect(bob).toBeDefined();
    expect((bob!.spec as any).profile.displayName).toBe('bob');
    const ann = bob!.metadata.annotations ?? {};
    expect(ann).not.toHaveProperty('github.com/user-login');
    expect(ann).not.toHaveProperty('github.com/user-id');
  });

  it('deduplicates rows with the same email', async () => {
    const captured: EntityProviderMutation[] = [];
    const connection: EntityProviderConnection = {
      applyMutation: async m => {
        captured.push(m);
      },
      refresh: async () => {},
    };

    const dupRows: PersonRosterRow[] = [
      { user_id: 'u1', primary_email: 'dup@mozilla.com' },
      { user_id: 'u2', primary_email: 'dup@mozilla.com' }, // duplicate
    ];

    const provider = new MozcloudPeopleEntityProvider(
      new FakeRosterSource('person-api:test', dupRows),
      new FakeUsersSource('bq:test', []),
      mockServices.logger.mock(),
      new ImmediateTaskRunner(),
    );
    await provider.connect(connection);

    if (captured[0].type !== 'full') throw new Error('unreachable');
    expect(captured[0].entities).toHaveLength(1);
  });
});
