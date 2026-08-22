/**
 * The kcp objects this plugin reads: the workspaces under the one being
 * viewed, and the `APIBinding`s that decide what it serves.
 *
 * Every group version here comes from discovery rather than from a constant.
 * kcp moves its own APIs between versions like anything else does, and a
 * plugin pinned to `v1alpha1` stops working on the release that promotes
 * them - silently, because a 404 on a list looks exactly like an empty
 * workspace.
 */
import { ApiProxy } from '@kinvolk/headlamp-plugin/lib';
import { ServedApis } from './discovery';

export const TENANCY_GROUP = 'tenancy.kcp.io';
export const APIS_GROUP = 'apis.kcp.io';

/** One workspace directly inside the one being viewed. */
export interface WorkspaceEntry {
  name: string;
  /** The `WorkspaceType` it was created with, e.g. `cluster-api`. */
  type?: string;
  /** `Ready`, `Initializing`, `Scheduling`, ... */
  phase?: string;
}

/** One `APIBinding` in the workspace being viewed. */
export interface ApiBindingEntry {
  name: string;
  /** The `APIExport` it binds, as `path:name` when the path is known. */
  exportRef: string;
  phase?: string;
  /** The API groups this binding makes the workspace serve. */
  groups: string[];
}

function versionOf(apis: ServedApis | undefined, group: string): string | undefined {
  return apis?.groups.get(group);
}

/**
 * The workspaces directly inside this one.
 *
 * A workspace list is not recursive and is not filtered by what the caller
 * can enter, so this is what the workspace itself says is under it - not
 * what the viewer can open. The navigator says which is which rather than
 * hiding the difference.
 */
export async function listWorkspaces(
  cluster: string,
  apis: ServedApis | undefined
): Promise<WorkspaceEntry[]> {
  const version = versionOf(apis, TENANCY_GROUP);
  if (!version) {
    return [];
  }
  const list = await ApiProxy.clusterRequest(
    `/apis/${TENANCY_GROUP}/${version}/workspaces`,
    { cluster },
    { limit: 500 } as any
  );
  return (list?.items ?? []).map((item: any) => ({
    name: item.metadata?.name,
    type: item.spec?.type?.name,
    phase: item.status?.phase,
  }));
}

/**
 * The `APIBinding`s in this workspace, with the API groups each one serves.
 *
 * `status.boundResources` is the load-bearing part: it is kcp's own answer to
 * "what did binding this export actually add here", which is what turns a
 * list of bindings into a list of APIs, and a list of APIs into the set of
 * plugins that have anything to show.
 */
export async function listApiBindings(
  cluster: string,
  apis: ServedApis | undefined
): Promise<ApiBindingEntry[]> {
  const version = versionOf(apis, APIS_GROUP);
  if (!version) {
    return [];
  }
  const list = await ApiProxy.clusterRequest(`/apis/${APIS_GROUP}/${version}/apibindings`, {
    cluster,
  });
  return (list?.items ?? []).map((item: any) => {
    const exportRef = item.spec?.reference?.export ?? {};
    const groups = new Set<string>();
    for (const bound of item.status?.boundResources ?? []) {
      if (bound.group) {
        groups.add(bound.group);
      }
    }
    return {
      name: item.metadata?.name,
      exportRef: [exportRef.path, exportRef.name].filter(Boolean).join(':'),
      phase: item.status?.phase,
      groups: [...groups].sort(),
    };
  });
}
