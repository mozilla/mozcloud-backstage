import { Entity, EntityLink } from '@backstage/catalog-model';

/**
 * Annotation listing the Agent Platform engines an agent runs as.
 * Comma-separated engine resource names, as the Agent Platform API returns
 * them, with the project id (not number):
 * `projects/<project id>/locations/<region>/reasoningEngines/<engine id>`.
 * Owners set it in their tenant's `catalog-info.yaml` overlay.
 */
export const AGENT_ENGINES_ANNOTATION = 'mozilla.org/agent-platform-engines';

export interface AgentEngine {
  project: string;
  location: string;
  id: string;
}

const ENGINE_NAME =
  /^projects\/([^/]+)\/locations\/([^/]+)\/reasoningEngines\/(\d+)$/;

/** Parse the annotation, skipping entries that aren't engine resource names. */
export function parseEngines(value: string | undefined): AgentEngine[] {
  return (value ?? '')
    .split(',')
    .map(s => s.trim())
    .flatMap(name => {
      const m = ENGINE_NAME.exec(name);
      return m ? [{ project: m[1], location: m[2], id: m[3] }] : [];
    });
}

/** Time range every link opens with. Agents can go days between runs. */
const RANGE = 'P7D';

function logsUrl(engine: AgentEngine, extra?: string): string {
  const filter = [
    'resource.type="aiplatform.googleapis.com/ReasoningEngine"',
    `resource.labels.reasoning_engine_id="${engine.id}"`,
    ...(extra ? [extra] : []),
  ].join(' AND ');
  return `https://console.cloud.google.com/logs/query;query=${encodeURIComponent(
    filter,
  )};duration=${RANGE}?project=${engine.project}`;
}

/** A tab of the engine's page in the Agent Platform console. */
function engineUrl(
  engine: AgentEngine,
  tab: 'dashboard' | 'traces' | 'sessions',
): string {
  return `https://console.cloud.google.com/agent-platform/runtimes/locations/${engine.location}/agent-engines/${engine.id}/${tab}?project=${engine.project}&pageState=(%22timeRange%22:(%22duration%22:%22${RANGE}%22))`;
}

/**
 * Console links for one engine, dashboard first: Runs and Sessions are tabs
 * on the dashboard's page. `suffix` tells engines apart when there are
 * several. Icons are app system icon keys; the Links card shows a globe
 * for links without one.
 */
export function engineLinks(engine: AgentEngine, suffix = ''): EntityLink[] {
  return [
    {
      url: engineUrl(engine, 'dashboard'),
      title: `Dashboard${suffix}`,
      icon: 'dashboard',
    },
    { url: engineUrl(engine, 'traces'), title: `Runs${suffix}` },
    { url: engineUrl(engine, 'sessions'), title: `Sessions${suffix}` },
    { url: logsUrl(engine), title: `Logs${suffix}` },
    {
      url: logsUrl(engine, 'severity>=ERROR'),
      title: `Error logs${suffix}`,
      icon: 'warning',
    },
  ];
}

/**
 * Add run links to every entity that declares Agent Platform engines in
 * `mozilla.org/agent-platform-engines`. The console checks the visitor's own
 * GCP access when they follow a link, so the catalog holds no credentials and
 * shows only names and ids. Links the owner already declared win.
 */
export function withAgentRunLinks(entities: Entity[]): Entity[] {
  return entities.map(entity => {
    const engines = parseEngines(
      entity.metadata.annotations?.[AGENT_ENGINES_ANNOTATION],
    );
    if (engines.length === 0) return entity;

    const links = entity.metadata.links ?? [];
    const known = new Set(links.map(l => l.url));
    const added = engines
      .flatMap(e => engineLinks(e, engines.length > 1 ? ` (${e.project})` : ''))
      .filter(l => !known.has(l.url));
    return {
      ...entity,
      metadata: { ...entity.metadata, links: [...links, ...added] },
    };
  });
}
