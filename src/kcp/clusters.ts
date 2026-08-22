/**
 * The join between Headlamp's clusters and kcp's workspaces.
 *
 * A kcp workspace is a URL prefix on one server - `/clusters/root:acme:prod` -
 * and nothing else about a request changes with it. That is the same
 * granularity Headlamp calls a cluster, so one Headlamp cluster per workspace
 * is not a workaround: the server URL a context carries *is* the workspace it
 * addresses, and reading the path back out of it is how this plugin knows
 * where it is without asking anybody.
 */
import { Cluster } from '@kinvolk/headlamp-plugin/lib/k8s/cluster';

export type ClustersConf = Record<string, Cluster> | null;

/** The workspace a Headlamp cluster addresses, or undefined if it is not a workspace. */
export function workspaceOf(cluster: string | null, clusters: ClustersConf): string | undefined {
  if (!cluster) {
    return undefined;
  }
  return workspaceOfServer(clusters?.[cluster]?.server);
}

/** The workspace a server URL addresses. */
export function workspaceOfServer(server?: string): string | undefined {
  if (!server) {
    return undefined;
  }
  const marker = '/clusters/';
  const index = server.indexOf(marker);
  if (index < 0) {
    return undefined;
  }
  const path = server
    .slice(index + marker.length)
    .split('/')[0]
    .trim();
  return path === '' ? undefined : path;
}

/** The server a workspace is reached at, given any server URL on the same shard. */
export function serverForWorkspace(server: string, workspace: string): string {
  const marker = '/clusters/';
  const index = server.indexOf(marker);
  const base = (index < 0 ? server : server.slice(0, index)).replace(/\/+$/, '');
  return `${base}${marker}${workspace}`;
}

/**
 * The Headlamp cluster addressing a workspace, if one is configured.
 *
 * Several contexts can address the same workspace - the demo writes one that
 * browses a workspace as its owner and one that browses somebody else's to be
 * refused - so the name matching the path exactly wins, and the rest are a
 * stable fallback rather than a coin toss.
 */
export function clusterForWorkspace(workspace: string, clusters: ClustersConf): string | undefined {
  const candidates = Object.keys(clusters ?? {})
    .filter(name => workspaceOf(name, clusters) === workspace)
    .sort();
  return candidates.find(name => name === workspace) ?? candidates[0];
}

/** The workspace one level up, or undefined at the top of the tree. */
export function parentWorkspace(workspace: string): string | undefined {
  const index = workspace.lastIndexOf(':');
  return index <= 0 ? undefined : workspace.slice(0, index);
}

/** The path of a workspace named `name` inside `workspace`. */
export function childWorkspace(workspace: string, name: string): string {
  return `${workspace}:${name}`;
}

/** The last segment of a workspace path, which is what its parent calls it. */
export function workspaceLeaf(workspace: string): string {
  const index = workspace.lastIndexOf(':');
  return index < 0 ? workspace : workspace.slice(index + 1);
}
