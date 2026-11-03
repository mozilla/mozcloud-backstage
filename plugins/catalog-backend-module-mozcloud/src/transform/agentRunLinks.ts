import { LoggerService } from '@backstage/backend-plugin-api';
import {
  Entity,
  EntityLink,
  stringifyEntityRef,
} from '@backstage/catalog-model';

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

/**
 * Parse the annotation into distinct engines. Entries that aren't engine
 * resource names come back in `invalid`, so the caller can log them.
 */
export function parseEngines(value: string | undefined): {
  engines: AgentEngine[];
  invalid: string[];
} {
  const engines = new Map<string, AgentEngine>();
  const invalid: string[] = [];
  for (const name of (value ?? '').split(',').map(s => s.trim())) {
    if (!name) continue;
    const m = ENGINE_NAME.exec(name);
    if (m) engines.set(name, { project: m[1], location: m[2], id: m[3] });
    else invalid.push(name);
  }
  return { engines: [...engines.values()], invalid };
}

/** Time range every link opens with. Agents can go days between runs. */
const RANGE = 'P7D';

function logsUrl(engine: AgentEngine, extra?: string): string {
  const filter = [
    'resource.type="aiplatform.googleapis.com/ReasoningEngine"',
    `resource.labels.location="${engine.location}"`,
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
 * Title suffixes. One engine needs none: its project shows once, in the
 * "Depends on resources" card. Several engines all get `(project, region)`,
 * so their titles read the same. If two share a project and region, as
 * during a redeploy that makes a new engine, they all add the engine id.
 */
function engineSuffixes(engines: AgentEngine[]): string[] {
  if (engines.length === 1) return [''];
  const places = engines.map(e => `${e.project}, ${e.location}`);
  const withId = new Set(places).size < places.length;
  return engines.map((e, i) => ` (${places[i]}${withId ? `, ${e.id}` : ''})`);
}

/**
 * Add run links to every entity that declares Agent Platform engines in
 * `mozilla.org/agent-platform-engines`. The console checks the visitor's own
 * GCP access when they follow a link, so the catalog holds no credentials and
 * shows only names and ids. Links the owner already declared win. Entries
 * that aren't engine resource names are logged and skipped.
 *
 * Each engine's project also joins `spec.dependsOn`, as the `gcp-project`
 * Resource the tenant provider emits, so the entity page names it once.
 */
export function withAgentRunLinks(
  entities: Entity[],
  logger: LoggerService,
): Entity[] {
  return entities.map(entity => {
    const { engines, invalid } = parseEngines(
      entity.metadata.annotations?.[AGENT_ENGINES_ANNOTATION],
    );
    for (const name of invalid) {
      logger.warn(
        `${stringifyEntityRef(entity)}: skipping ${AGENT_ENGINES_ANNOTATION} ` +
          `entry "${name}"; expected ` +
          'projects/<project id>/locations/<region>/reasoningEngines/<engine id>',
      );
    }
    if (engines.length === 0) return entity;

    const links = entity.metadata.links ?? [];
    const known = new Set(links.map(l => l.url));
    const suffixes = engineSuffixes(engines);
    const added = engines
      .flatMap((e, i) => engineLinks(e, suffixes[i]))
      .filter(l => !known.has(l.url));

    const spec = (entity.spec ?? {}) as Record<string, unknown>;
    const dependsOn = Array.isArray(spec.dependsOn)
      ? (spec.dependsOn as string[])
      : [];
    const projects = engines.map(e => `resource:default/${e.project}`);
    return {
      ...entity,
      metadata: { ...entity.metadata, links: [...links, ...added] },
      spec: { ...spec, dependsOn: [...new Set([...dependsOn, ...projects])] },
    };
  });
}
