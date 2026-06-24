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
import { PersonProfileRow } from './transform/schema';

class FakeSource implements Source<PersonProfileRow> {
  constructor(
    public readonly description: string,
    private readonly rows: PersonProfileRow[],
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

const rows: PersonProfileRow[] = [
  {
    user_id: 'ad|Mozilla-LDAP|alice',
    primary_email: 'alice@mozilla.com',
    primary_username: 'alice',
  },
  {
    user_id: 'ad|Mozilla-LDAP|bob',
    primary_email: 'bob@mozilla.com',
    primary_username: 'bob',
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
      new FakeSource('person-api:test', rows),
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
});
