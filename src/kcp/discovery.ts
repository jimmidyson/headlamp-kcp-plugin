/**
 * What a workspace serves, asked of the workspace itself.
 *
 * A kcp workspace serves the APIs its `APIBinding`s bind and nothing else, so
 * "is this resource here?" has a different answer in every workspace and no
 * answer that holds for the server as a whole. Discovery is the only thing
 * that knows, which is why nothing in this plugin asks about
 * `CustomResourceDefinition`s: a bound API has no CRD in the workspace it is
 * served in, so a CRD list reports a workspace full of Cluster API objects as
 * having no Cluster API at all.
 */
import { ApiProxy } from '@kinvolk/headlamp-plugin/lib';

/** The APIs one workspace serves. */
export interface ServedApis {
  /** Core (`/api/v1`) resource names, e.g. `namespaces`, `secrets`. */
  coreResources: Set<string>;
  /** API group name to its preferred version, e.g. `cluster.x-k8s.io` -> `v1beta2`. */
  groups: Map<string, string>;
  /**
   * Set when discovery itself failed. Everything stays visible in that case:
   * a UI that hides half of itself because one request timed out is worse
   * than one that offers a page which turns out to be empty.
   */
  error?: Error;
}

type Listener = () => void;

const cache = new Map<string, ServedApis>();
const inFlight = new Set<string>();
const listeners = new Set<Listener>();

/** What is known about a cluster right now, without asking for it. */
export function servedApis(cluster: string): ServedApis | undefined {
  return cache.get(cluster);
}

/** Called whenever a cluster's discovery result lands. */
export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Forget what a cluster served, so the next ask goes back to the server. */
export function invalidate(cluster?: string) {
  if (cluster === undefined) {
    cache.clear();
  } else {
    cache.delete(cluster);
  }
}

function publish(cluster: string, apis: ServedApis) {
  cache.set(cluster, apis);
  inFlight.delete(cluster);
  listeners.forEach(listener => listener());
}

/**
 * Ask a cluster what it serves, once.
 *
 * Safe to call from a render or a filter: a cluster already known or already
 * being asked about costs nothing.
 */
export function ensureDiscovery(cluster: string) {
  if (!cluster || cache.has(cluster) || inFlight.has(cluster)) {
    return;
  }
  inFlight.add(cluster);

  Promise.all([
    ApiProxy.clusterRequest('/api/v1', { cluster }).catch(() => ({ resources: [] })),
    ApiProxy.clusterRequest('/apis', { cluster }),
  ])
    .then(([core, apis]) => {
      const coreResources = new Set<string>(
        (core?.resources ?? [])
          .map((resource: any) => String(resource.name).split('/')[0])
          .filter(Boolean)
      );
      const groups = new Map<string, string>();
      for (const group of apis?.groups ?? []) {
        const version = group.preferredVersion?.version ?? group.versions?.[0]?.version;
        if (group.name && version) {
          groups.set(group.name, version);
        }
      }
      publish(cluster, { coreResources, groups });
    })
    .catch((error: Error) => {
      publish(cluster, { coreResources: new Set(), groups: new Map(), error });
    });
}

/** Whether a workspace serves an API group. */
export function servesGroup(apis: ServedApis | undefined, group: string): boolean {
  if (!apis || apis.error) {
    return true;
  }
  return apis.groups.has(group);
}

/** Whether a workspace serves a core resource, e.g. `pods`. */
export function servesCoreResource(apis: ServedApis | undefined, resource: string): boolean {
  if (!apis || apis.error) {
    return true;
  }
  return apis.coreResources.has(resource);
}
