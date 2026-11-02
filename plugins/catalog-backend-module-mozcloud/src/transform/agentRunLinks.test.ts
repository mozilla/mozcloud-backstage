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

    const [out] = withAgentRunLinks([
      agent(`${nonprod}, not-an-engine, ${prod}`, [owned]),
    ]);
    const links = out.metadata.links!;

    expect(links[0]).toEqual(owned);
    const titles = ['Dashboard', 'Runs', 'Sessions', 'Logs', 'Error logs'];
    expect(links.map(l => l.title)).toEqual([
      'Runbook',
      ...titles.map(t => `${t} (moz-fx-cloudeng-agents-nonprod)`),
      ...titles.map(t => `${t} (moz-fx-cloudeng-agents-prod)`),
    ]);

    const errorLogs = new URL(links[5].url);
    expect(errorLogs.searchParams.get('project')).toBe(
      'moz-fx-cloudeng-agents-nonprod',
    );
    expect(decodeURIComponent(errorLogs.pathname)).toBe(
      '/logs/query;query=' +
        'resource.type="aiplatform.googleapis.com/ReasoningEngine" AND ' +
        'resource.labels.reasoning_engine_id="4561082370148532224" AND ' +
        'severity>=ERROR;duration=P7D',
    );
    expect(links[1].url).toContain(
      '/agent-platform/runtimes/locations/us-central1/agent-engines/4561082370148532224/dashboard?project=moz-fx-cloudeng-agents-nonprod',
    );
  });

  it('leaves entities without the annotation alone', () => {
    const plain = agent();
    expect(withAgentRunLinks([plain])[0]).toBe(plain);
  });
});
