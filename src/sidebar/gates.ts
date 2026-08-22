/**
 * Which parts of the UI a workspace has any use for.
 *
 * Two kinds of thing get hidden, for one reason. A kcp workspace serves the
 * APIs bound into it and nothing else, so most of Headlamp's built-in
 * navigation - Pods, Deployments, Nodes - points at resources that are not
 * there, and a plugin's whole section can be pointing at APIs that are not
 * there either. Both are answered by discovery, so both are answered the same
 * way here.
 *
 * The second half is the interesting one: bind a different `APIExport` into a
 * workspace and a different plugin lights up in it, with nothing about the
 * workspace named in this file. `Cluster API` is the gate that ships because
 * it is the one the demo shows; the rest are the point of `gates`.
 */
import { ServedApis, servesCoreResource, servesGroup } from '../kcp/discovery';

/**
 * As much of a sidebar entry as this file needs.
 *
 * Structural rather than Headlamp's own type: the filter is handed entries
 * with their children attached, which is the part that matters here and the
 * part the published type does not promise.
 */
export interface SidebarEntryLike {
  name: string;
  subList?: SidebarEntryLike[];
}

/** An API this workspace has to serve for some part of the UI to be worth showing. */
export interface ApiRequirement {
  /** API group, empty for core (`/api/v1`). */
  group: string;
  /** Plural resource name, checked only for core resources. */
  resource?: string;
}

/** A section of the UI that belongs to one set of APIs. */
export interface PluginGate {
  /** The name of the sidebar entry that roots the section. */
  sidebarEntry: string;
  /** The API groups that make it worth showing. Any one of them is enough. */
  apiGroups: string[];
  /** Routes that belong to it, so a link into a workspace without it does not render a broken page. */
  routePrefix?: string;
}

/**
 * The gates this plugin ships with.
 *
 * A gate is three strings, which is the whole point: a platform that binds
 * `pipelines.tekton.dev` into some workspaces and not others needs one more
 * entry here, not a plugin of its own.
 */
export const DEFAULT_GATES: PluginGate[] = [
  {
    sidebarEntry: 'Cluster-api',
    apiGroups: ['cluster.x-k8s.io'],
    routePrefix: '/cluster-api',
  },
];

/**
 * Sidebar entries that are not a resource list and survive on their own.
 *
 * `home` and `settings` are how somebody gets out of a workspace that turns
 * out to be empty, so hiding them would be the one mistake this file must not
 * make.
 */
const ALWAYS_VISIBLE = new Set([
  'home',
  'settings',
  'settingsGeneral',
  'settingsCluster',
  'plugins',
  'notifications',
  'cluster',
  'namespaces',
  'advancedSearch',
  'map',
  'crds',
  'crs',
]);

/** Requirements this plugin knows without asking Headlamp's resource classes. */
const EXTRA_REQUIREMENTS: Record<string, ApiRequirement> = {
  // Port forwarding is a Pod subresource wearing a sidebar entry.
  portforwards: { group: '', resource: 'pods' },
  gatewayapi: { group: 'gateway.networking.k8s.io' },
};

/**
 * Headlamp's own resource classes, read from the runtime.
 *
 * Reached through `pluginLib` rather than imported so that this module is the
 * plain function it looks like: the import is resolved to the running app's
 * copy at build time and to nothing at all under test, and the mapping below
 * is the part worth testing.
 */
function resourceClasses(): Record<string, any> {
  return (window as any)?.pluginLib?.K8s?.ResourceClasses ?? {};
}

let requirements: Map<string, ApiRequirement> | undefined;
let requirementsFor: unknown;

/**
 * What each built-in sidebar entry needs, derived from Headlamp's own
 * resource classes rather than written out here.
 *
 * Written out, this would be a hundred lines that go stale on the release
 * that adds a resource: every class already carries the group and the plural
 * name, and every built-in entry is named after one.
 */
function requirementIndex(): Map<string, ApiRequirement> {
  const classes = resourceClasses();
  if (requirements && requirementsFor === classes) {
    return requirements;
  }
  requirementsFor = classes;
  requirements = new Map(Object.entries(EXTRA_REQUIREMENTS));
  for (const resourceClass of Object.values(classes)) {
    const apiName: string | undefined = resourceClass?.apiName;
    if (!apiName) {
      continue;
    }
    const apiVersions: string[] = Array.isArray(resourceClass.apiVersion)
      ? resourceClass.apiVersion
      : [resourceClass.apiVersion].filter(Boolean);
    const [groupVersion] = apiVersions;
    const group = groupVersion?.includes('/') ? groupVersion.split('/')[0] : '';
    if (!requirements.has(apiName.toLowerCase())) {
      requirements.set(apiName.toLowerCase(), { group, resource: apiName });
    }
  }
  return requirements;
}

/** The API a sidebar entry needs, or undefined when it needs none. */
export function requirementFor(entryName: string, gates: PluginGate[]): ApiRequirement | undefined {
  const gate = gates.find(candidate => candidate.sidebarEntry === entryName);
  if (gate) {
    return { group: gate.apiGroups[0] };
  }
  if (ALWAYS_VISIBLE.has(entryName)) {
    return undefined;
  }
  return requirementIndex().get(entryName.toLowerCase());
}

function servesRequirement(apis: ServedApis | undefined, requirement: ApiRequirement): boolean {
  if (requirement.group === '') {
    return servesCoreResource(apis, requirement.resource ?? '');
  }
  return servesGroup(apis, requirement.group);
}

/** Whether a gated section has anything to show in this workspace. */
export function gateOpen(gate: PluginGate, apis: ServedApis | undefined): boolean {
  return gate.apiGroups.some(group => servesGroup(apis, group));
}

/**
 * Whether an entry survives in this workspace.
 *
 * An entry that needs no API of its own - a heading like `Workloads`, or a
 * plugin section with no gate - survives only if something under it does.
 * Headlamp hands the filter each entry with its children attached, so this
 * needs no table of what contains what.
 */
export function entryVisible(
  entry: SidebarEntryLike,
  apis: ServedApis | undefined,
  gates: PluginGate[]
): boolean {
  const requirement = requirementFor(entry.name, gates);
  if (requirement) {
    return servesRequirement(apis, requirement);
  }

  const children = entry.subList ?? [];
  if (children.length === 0) {
    return true;
  }
  return children.some(child => entryVisible(child, apis, gates));
}
