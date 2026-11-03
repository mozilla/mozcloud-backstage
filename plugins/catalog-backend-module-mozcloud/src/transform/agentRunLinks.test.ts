import { mockServices } from '@backstage/backend-test-utils';
import { Entity } from '@backstage/catalog-model';
import { AGENT_ENGINES_ANNOTATION, withAgentRunLinks } from './agentRunLinks';

const agent = (engines?: string, links: Entity['metadata']['links'] = []) =>
  ({
    apiVersion: 'backstage.io/v1alpha1',
    kind: 'Component',
    metadata: {
      name: 'skill-eval',
      annotations: engines ? { [AGENT_ENGINES_ANNOTATION]: engines } : {},
      links,
    },
    spec: { type: 'ai-agent', owner: 'group:workgroups/cloud-engineering' },
  } as Entity);

describe('withAgentRunLinks', () => {
  it('adds run, log and engine links for each declared engine', () => {
    const nonprod =
      'projects/moz-fx-cloudeng-agents-nonprod/locations/us-central1/reasoningEngines/4561082370148532224';
    const prod =
      'projects/moz-fx-cloudeng-agents-prod/locations/us-central1/reasoningEngines/123';
    const owned = { url: 'https://example.com/runbook', title: 'Runbook' };

    const logger = mockServices.logger.mock();
    const [out] = withAgentRunLinks(
      [agent(`${nonprod}, not-an-engine, ${prod}, ${nonprod}`, [owned])],
      logger,
    );
    const links = out.metadata.links!;

    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('component:default/skill-eval: skipping'),
    );
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('"not-an-engine"'),
    );

    expect(links[0]).toEqual(owned);
    const titles = ['Dashboard', 'Runs', 'Sessions', 'Logs', 'Error logs'];
    expect(links.map(l => l.title)).toEqual([
      'Runbook',
      ...titles.map(t => `${t} (moz-fx-cloudeng-agents-nonprod, us-central1)`),
      ...titles.map(t => `${t} (moz-fx-cloudeng-agents-prod, us-central1)`),
    ]);

    const errorLogs = new URL(links[5].url);
    expect(errorLogs.searchParams.get('project')).toBe(
      'moz-fx-cloudeng-agents-nonprod',
    );
    expect(decodeURIComponent(errorLogs.pathname)).toBe(
      '/logs/query;query=' +
        'resource.type="aiplatform.googleapis.com/ReasoningEngine" AND ' +
        'resource.labels.location="us-central1" AND ' +
        'resource.labels.reasoning_engine_id="4561082370148532224" AND ' +
        'severity>=ERROR;duration=P7D',
    );
    expect(links[1].url).toContain(
      '/agent-platform/runtimes/locations/us-central1/agent-engines/4561082370148532224/dashboard?project=moz-fx-cloudeng-agents-nonprod',
    );
    expect(out.spec?.dependsOn).toEqual([
      'resource:default/moz-fx-cloudeng-agents-nonprod',
      'resource:default/moz-fx-cloudeng-agents-prod',
    ]);
  });

  it('adds title suffixes only to tell several engines apart', () => {
    const engine = (id: string) =>
      `projects/moz-fx-cloudeng-agents-nonprod/locations/us-central1/reasoningEngines/${id}`;
    const dashboards = (engines: string) =>
      withAgentRunLinks([agent(engines)], mockServices.logger.mock())[0]
        .metadata.links!.filter(l => l.icon === 'dashboard')
        .map(l => l.title);

    // One engine, as each agent in aiservices-infra's cloudeng-agents has.
    expect(dashboards(engine('1'))).toEqual(['Dashboard']);
    // An old and a new engine in one project and region, as during a redeploy.
    expect(dashboards(`${engine('1')}, ${engine('2')}`)).toEqual([
      'Dashboard (moz-fx-cloudeng-agents-nonprod, us-central1, 1)',
      'Dashboard (moz-fx-cloudeng-agents-nonprod, us-central1, 2)',
    ]);
  });

  it('leaves entities without the annotation alone', () => {
    const plain = agent();
    expect(withAgentRunLinks([plain], mockServices.logger.mock())[0]).toBe(
      plain,
    );
  });
});
