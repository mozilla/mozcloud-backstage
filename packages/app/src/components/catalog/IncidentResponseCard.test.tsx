import { screen } from '@testing-library/react';
import { renderInTestApp, TestApiProvider } from '@backstage/test-utils';
import {
  catalogApiRef,
  entityRouteRef,
  EntityProvider,
} from '@backstage/plugin-catalog-react';
import { Entity } from '@backstage/catalog-model';
import { IncidentResponseCard } from './IncidentResponseCard';

const system = (annotations?: Record<string, string>): Entity => ({
  apiVersion: 'backstage.io/v1alpha1',
  kind: 'System',
  metadata: { name: 'testapp', annotations },
  spec: { owner: 'group:workgroups/testapp' },
});

const group = (annotations?: Record<string, string>): Entity => ({
  apiVersion: 'backstage.io/v1alpha1',
  kind: 'Group',
  metadata: { name: 'testapp', namespace: 'workgroups', annotations },
  spec: { type: 'workgroup' },
});

const allSystemFields = {
  'mozilla.org/escalation-slack-channel-id': 'C0123456789',
  'pagerduty.com/service-id': 'PABC123',
};

const allGroupFields = {
  'mozilla.org/sponsor': 'sponsor@mozilla.com',
  'mozilla.org/managers': 'a@mozilla.com,b@mozilla.com',
};

const renderCard = (entity: Entity, getEntityByRef: () => Promise<any>) =>
  renderInTestApp(
    <TestApiProvider apis={[[catalogApiRef, { getEntityByRef } as any]]}>
      <EntityProvider entity={entity}>
        <IncidentResponseCard />
      </EntityProvider>
    </TestApiProvider>,
    { mountedRoutes: { '/catalog/:namespace/:kind/:name': entityRouteRef } },
  );

const href = (text: string) =>
  screen.getByText(text).closest('a')?.getAttribute('href');

it('renders every field when the System and its owner set them', async () => {
  await renderCard(system(allSystemFields), async () => group(allGroupFields));

  expect(await screen.findByText('testapp')).toBeInTheDocument();
  expect(href('testapp')).toBe('/catalog/workgroups/group/testapp');
  expect(href('sponsor@mozilla.com')).toBe('mailto:sponsor@mozilla.com');
  expect(href('a@mozilla.com')).toBe('mailto:a@mozilla.com');
  expect(href('b@mozilla.com')).toBe('mailto:b@mozilla.com');
  expect(href('Open in Slack')).toBe(
    'https://mozilla.slack.com/archives/C0123456789',
  );
  expect(href('Open in PagerDuty')).toBe(
    'https://mozilla.pagerduty.com/service-directory/PABC123',
  );
  expect(screen.queryByText('N/A')).not.toBeInTheDocument();
});

it('shows N/A only for the missing Slack channel when only PagerDuty is set', async () => {
  await renderCard(
    system({ 'pagerduty.com/service-id': 'PABC123' }),
    async () => group(allGroupFields),
  );

  expect(await screen.findByText('Open in PagerDuty')).toBeInTheDocument();
  expect(screen.getAllByText('N/A')).toHaveLength(1);
  expect(screen.queryByText('Open in Slack')).not.toBeInTheDocument();
});

it('shows N/A for every field when nothing is set and the owner is missing', async () => {
  await renderCard(system(), async () => undefined);

  expect(await screen.findAllByText('N/A')).toHaveLength(5);
});

it('shows N/A for managers when the owner has none', async () => {
  await renderCard(system(allSystemFields), async () =>
    group({ 'mozilla.org/sponsor': 'sponsor@mozilla.com' }),
  );

  expect(await screen.findByText('sponsor@mozilla.com')).toBeInTheDocument();
  expect(screen.getAllByText('N/A')).toHaveLength(1);
});

it('keeps the System fields and shows N/A for the owner rows when the lookup fails', async () => {
  await renderCard(system(allSystemFields), async () => {
    throw new Error('catalog unavailable');
  });

  expect(await screen.findAllByText('N/A')).toHaveLength(3);
  expect(screen.getByText('Open in Slack')).toBeInTheDocument();
  expect(screen.getByText('Open in PagerDuty')).toBeInTheDocument();
});
