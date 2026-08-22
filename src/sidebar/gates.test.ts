import { beforeAll, describe, expect, it } from 'vitest';
import { ServedApis } from '../kcp/discovery';
import { entryVisible, gateOpen, PluginGate } from './gates';

/**
 * Enough of Headlamp's resource classes to test the mapping.
 *
 * Every class carries the plural name and the group version, which is all the
 * requirement index reads; the app supplies the full set at runtime, and the
 * shapes here are the real ones.
 */
beforeAll(() => {
  (window as any).pluginLib = {
    K8s: {
      ResourceClasses: {
        Pod: { apiName: 'pods', apiVersion: 'v1' },
        Node: { apiName: 'nodes', apiVersion: 'v1' },
        ConfigMap: { apiName: 'configmaps', apiVersion: 'v1' },
        Secret: { apiName: 'secrets', apiVersion: 'v1' },
        ServiceAccount: { apiName: 'serviceaccounts', apiVersion: 'v1' },
        Deployment: { apiName: 'deployments', apiVersion: 'apps/v1' },
        Job: { apiName: 'jobs', apiVersion: 'batch/v1' },
        Role: { apiName: 'roles', apiVersion: 'rbac.authorization.k8s.io/v1' },
        HorizontalPodAutoscaler: { apiName: 'horizontalpodautoscalers', apiVersion: 'autoscaling/v2' },
      },
    },
  };
});

/** A workspace serving what a kcp workspace with Cluster API bound serves. */
const capiWorkspace: ServedApis = {
  coreResources: new Set(['namespaces', 'configmaps', 'secrets', 'serviceaccounts', 'events']),
  groups: new Map([
    ['cluster.x-k8s.io', 'v1beta2'],
    ['controlplane.cluster.x-k8s.io', 'v1beta2'],
    ['rbac.authorization.k8s.io', 'v1'],
    ['tenancy.kcp.io', 'v1alpha1'],
    ['apis.kcp.io', 'v1alpha2'],
  ]),
};

/** The same shard, one workspace up: no Cluster API bound here. */
const plainWorkspace: ServedApis = {
  coreResources: new Set(['namespaces', 'configmaps', 'secrets']),
  groups: new Map([
    ['rbac.authorization.k8s.io', 'v1'],
    ['tenancy.kcp.io', 'v1alpha1'],
  ]),
};

const gates: PluginGate[] = [
  { sidebarEntry: 'Cluster-api', apiGroups: ['cluster.x-k8s.io'], routePrefix: '/cluster-api' },
];

describe('what a workspace serves decides what it shows', () => {
  it('hides a resource the workspace does not serve', () => {
    expect(entryVisible({ name: 'Pods' }, capiWorkspace, gates)).toBe(false);
    expect(entryVisible({ name: 'nodes' }, capiWorkspace, gates)).toBe(false);
    expect(entryVisible({ name: 'Deployments' }, capiWorkspace, gates)).toBe(false);
  });

  it('keeps a resource it does serve, however the entry spells it', () => {
    expect(entryVisible({ name: 'configMaps' }, capiWorkspace, gates)).toBe(true);
    expect(entryVisible({ name: 'secrets' }, capiWorkspace, gates)).toBe(true);
    expect(entryVisible({ name: 'serviceAccounts' }, capiWorkspace, gates)).toBe(true);
    expect(entryVisible({ name: 'roles' }, capiWorkspace, gates)).toBe(true);
  });

  it('keeps what is not a resource at all, so there is always a way out', () => {
    expect(entryVisible({ name: 'home' }, plainWorkspace, gates)).toBe(true);
    expect(entryVisible({ name: 'settings' }, plainWorkspace, gates)).toBe(true);
    expect(entryVisible({ name: 'kcp-workspaces' }, plainWorkspace, gates)).toBe(true);
  });

  it('drops a heading once everything under it has gone', () => {
    const workloads = {
      name: 'workloads',
      subList: [{ name: 'Pods' }, { name: 'Deployments' }, { name: 'Jobs' }],
    };
    expect(entryVisible(workloads, capiWorkspace, gates)).toBe(false);

    const config = {
      name: 'config',
      subList: [{ name: 'configMaps' }, { name: 'horizontalPodAutoscalers' }],
    };
    expect(entryVisible(config, capiWorkspace, gates)).toBe(true);
  });
});

describe('a plugin appears where its APIs are bound', () => {
  it('opens the Cluster API section in a workspace that binds it', () => {
    expect(gateOpen(gates[0], capiWorkspace)).toBe(true);
    expect(entryVisible({ name: 'Cluster-api' }, capiWorkspace, gates)).toBe(true);
  });

  it('closes it one workspace up, where nothing binds it', () => {
    expect(gateOpen(gates[0], plainWorkspace)).toBe(false);
    expect(entryVisible({ name: 'Cluster-api' }, plainWorkspace, gates)).toBe(false);
  });

  // The gate is three strings: this is what makes the next service's plugin a
  // line of configuration rather than a plugin of its own.
  it('gates anything else the same way', () => {
    const tekton: PluginGate = { sidebarEntry: 'tekton', apiGroups: ['tekton.dev'] };
    const withTekton: ServedApis = {
      coreResources: new Set(),
      groups: new Map([['tekton.dev', 'v1']]),
    };
    expect(entryVisible({ name: 'tekton' }, withTekton, [tekton])).toBe(true);
    expect(entryVisible({ name: 'tekton' }, capiWorkspace, [tekton])).toBe(false);
  });
});

describe('when discovery has not answered', () => {
  // Hiding half the UI because one request has not come back yet, or failed,
  // is worse than offering a page that turns out to be empty.
  it('shows everything', () => {
    expect(entryVisible({ name: 'Pods' }, undefined, gates)).toBe(true);
    const failed: ServedApis = {
      coreResources: new Set(),
      groups: new Map(),
      error: new Error('nope'),
    };
    expect(entryVisible({ name: 'Pods' }, failed, gates)).toBe(true);
    expect(entryVisible({ name: 'Cluster-api' }, failed, gates)).toBe(true);
  });
});
