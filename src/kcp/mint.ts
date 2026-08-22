/**
 * Reaching a workspace nobody configured a context for.
 *
 * Every workspace on a shard is the same server and the same credential with a
 * different path, so a context for one is a context for all of them: copy the
 * one being used, rewrite its server, and Headlamp has a cluster for a
 * workspace that did not exist when it started. That is what makes the
 * navigator a tree rather than a list of whatever the demo happened to write
 * out.
 *
 * It only works for a cluster Headlamp holds the kubeconfig for - one added in
 * the browser, which Headlamp calls stateless. A cluster configured on the
 * backend keeps its credentials there, out of reach of any plugin, so
 * workspaces without a context of their own stay unreachable and the navigator
 * says so instead of failing at the click.
 */
import { dump, load } from 'js-yaml';
import { serverForWorkspace } from './clusters';

/**
 * Headlamp's own stateless-cluster module, reached through the runtime rather
 * than imported.
 *
 * `@kinvolk/headlamp-plugin` resolves a fixed list of module names to the
 * copies the app is already running; `lib/stateless` is not on that list, so
 * importing it would bundle a second copy of it - and of the redux store it
 * closes over - into this plugin. The one on `window.pluginLib` is the one
 * whose IndexedDB and whose store the app is actually using.
 */
interface StatelessApi {
  storeStatelessClusterKubeconfig(kubeconfig: string): Promise<void>;
  getStatelessClusterKubeConfigs(): Promise<string[]>;
  fetchStatelessClusterKubeConfigs(dispatch: any): Promise<void>;
}

function statelessApi(): StatelessApi | undefined {
  return (window as any)?.pluginLib?.stateless;
}

/** Whether this Headlamp can be given a cluster at runtime at all. */
export function canMint(): boolean {
  return statelessApi() !== undefined;
}

interface Kubeconfig {
  clusters?: { name: string; cluster: { server?: string; [key: string]: any } }[];
  contexts?: { name: string; context: { cluster: string; user: string; [key: string]: any } }[];
  users?: { name: string; user: any }[];
  [key: string]: any;
}

function decode(base64: string): Kubeconfig | undefined {
  try {
    return load(atob(base64)) as Kubeconfig;
  } catch {
    return undefined;
  }
}

/** The stateless kubeconfig holding a context of this name, if there is one. */
async function kubeconfigFor(cluster: string): Promise<Kubeconfig | undefined> {
  const api = statelessApi();
  if (!api) {
    return undefined;
  }
  for (const encoded of await api.getStatelessClusterKubeConfigs()) {
    const parsed = decode(encoded);
    if (parsed?.contexts?.some(context => context.name === cluster)) {
      return parsed;
    }
  }
  return undefined;
}

/** Whether a cluster can be copied to reach another workspace. */
export async function canMintFrom(cluster: string): Promise<boolean> {
  return (await kubeconfigFor(cluster)) !== undefined;
}

/**
 * Add a cluster addressing `workspace`, copied from the one `fromCluster` uses.
 *
 * Returns the name of the cluster to navigate to. The name is the workspace
 * path, which is what Headlamp shows in its chooser and what
 * {@link clusterForWorkspace} looks for.
 */
export async function mintWorkspaceCluster(
  fromCluster: string,
  workspace: string,
  dispatch?: any
): Promise<string> {
  const api = statelessApi();
  const source = await kubeconfigFor(fromCluster);
  if (!api || !source) {
    throw new Error(
      `Headlamp does not hold a kubeconfig for ${fromCluster}, so it cannot build one for ${workspace}`
    );
  }

  const sourceContext = source.contexts?.find(context => context.name === fromCluster);
  const cluster = source.clusters?.find(entry => entry.name === sourceContext?.context.cluster);
  const user = source.users?.find(entry => entry.name === sourceContext?.context.user);
  if (!sourceContext || !cluster || !user) {
    throw new Error(`The kubeconfig for ${fromCluster} is missing its cluster or its user`);
  }

  const minted: Kubeconfig = {
    apiVersion: 'v1',
    kind: 'Config',
    clusters: [
      {
        name: workspace,
        cluster: { ...cluster.cluster, server: serverForWorkspace(cluster.cluster.server ?? '', workspace) },
      },
    ],
    users: [{ name: workspace, user: user.user }],
    contexts: [{ name: workspace, context: { ...sourceContext.context, cluster: workspace, user: workspace } }],
    'current-context': workspace,
  };

  await api.storeStatelessClusterKubeconfig(btoa(dump(minted)));
  if (dispatch) {
    // Best effort: the cluster is in IndexedDB either way, and a reader that
    // does not see it in the store yet will see it after a reload.
    await api.fetchStatelessClusterKubeConfigs(dispatch).catch(() => undefined);
  }
  return workspace;
}
