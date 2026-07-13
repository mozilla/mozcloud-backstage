import {
  InfoCard,
  Progress,
  ResponseErrorPanel,
  Table,
  TableColumn,
  Link,
} from '@backstage/core-components';
import { useApi, useRouteRef } from '@backstage/core-plugin-api';
import {
  catalogApiRef,
  entityRouteRef,
  useEntity,
} from '@backstage/plugin-catalog-react';
import { Entity, stringifyEntityRef } from '@backstage/catalog-model';
import useAsync from 'react-use/lib/useAsync';
import { aggregateMembers } from './workgroupMembers';

type Row = { key: string; name: string; email?: string; ref: Entity };

/**
 * Members card for workgroup Groups. Aggregated mode unions descendant-group
 * members but prunes the org-wide admin groups (see {@link aggregateMembers}),
 * so `sre-admins` / `cloud-engineering-admins` users don't flood every group.
 */
export function WorkgroupMembersListCard({
  aggregated,
}: {
  aggregated: boolean;
}) {
  const { entity } = useEntity();
  const catalogApi = useApi(catalogApiRef);
  const entityRoute = useRouteRef(entityRouteRef);

  const { value, loading, error } = useAsync(
    () => aggregateMembers(entity, catalogApi, aggregated),
    [catalogApi, entity, aggregated],
  );

  if (loading) return <Progress />;
  if (error) return <ResponseErrorPanel error={error} />;

  const rows: Row[] = (value ?? []).map(m => {
    const profile = m.spec?.profile as
      | { displayName?: string; email?: string }
      | undefined;
    return {
      key: stringifyEntityRef(m),
      name: profile?.displayName ?? m.metadata.title ?? m.metadata.name,
      email: profile?.email,
      ref: m,
    };
  });

  const columns: TableColumn<Row>[] = [
    {
      title: 'Member',
      field: 'name',
      render: r => (
        <Link
          to={entityRoute({
            // kind/namespace lowercased to match catalog ref canonicalization
            // (as @backstage/plugin-catalog-react's entityRouteParams does).
            kind: r.ref.kind.toLocaleLowerCase('en-US'),
            namespace: (
              r.ref.metadata.namespace ?? 'default'
            ).toLocaleLowerCase('en-US'),
            name: r.ref.metadata.name,
          })}
        >
          {r.name}
        </Link>
      ),
    },
    { title: 'Email', field: 'email' },
  ];

  return (
    <InfoCard noPadding>
      <Table<Row>
        title={`Members (${rows.length})`}
        options={{
          search: true,
          paging: rows.length > 10,
          pageSize: 10,
          padding: 'dense',
        }}
        columns={columns}
        data={rows}
      />
    </InfoCard>
  );
}
