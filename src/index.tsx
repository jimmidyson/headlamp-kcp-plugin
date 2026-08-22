/*
 * Copyright 2025 The kcp Authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * kcp workspaces for Headlamp.
 *
 * Three things, all of them consequences of one fact - a kcp workspace serves
 * the APIs bound into it and nothing else:
 *
 *   - a navigator, because a workspace is a server URL and moving between
 *     workspaces is moving between Headlamp clusters;
 *   - a sidebar showing what the workspace actually serves, so a workspace
 *     with no Pods does not offer a Pods page;
 *   - gates, so a plugin's section appears in the workspaces whose bindings
 *     back it and nowhere else.
 *
 * Nothing here reads `CustomResourceDefinition`s. A bound API has no CRD in
 * the workspace serving it, so a CRD list is the one question that gets the
 * wrong answer in every workspace this plugin exists for.
 */
import {
  registerClusterChooser,
  registerPluginSettings,
  registerRoute,
  registerRouteFilter,
  registerSidebarEntry,
  registerSidebarEntryFilter,
} from '@kinvolk/headlamp-plugin/lib';
import { getCluster } from '@kinvolk/headlamp-plugin/lib/Utils';
import { WorkspaceChooser } from './components/WorkspaceChooser';
import { WorkspacesPage } from './components/WorkspacesPage';
import { ensureDiscovery, servedApis, subscribe } from './kcp/discovery';
import { gates, PLUGIN_NAME, Settings } from './settings';
import { entryVisible, gateOpen } from './sidebar/gates';

/**
 * A hidden entry, re-registered whenever discovery lands.
 *
 * Headlamp's sidebar recomputes when its entries or its filters change, and a
 * filter whose *answer* changed - because the workspace finished saying what
 * it serves - is neither. Re-registering one entry is the smallest change
 * that makes the sidebar ask the filters again; the filter below drops it, so
 * nobody ever sees it.
 */
const TICK_ENTRY = 'kcp-workspaces-tick';

subscribe(() =>
  registerSidebarEntry({
    name: TICK_ENTRY,
    label: '',
    url: '/',
    parent: null,
  })
);

registerSidebarEntry({
  name: 'kcp-workspaces',
  label: 'Workspaces',
  icon: 'mdi:file-tree',
  url: '/kcp/workspaces',
  parent: null,
});

registerRoute({
  path: '/kcp/workspaces',
  sidebar: 'kcp-workspaces',
  name: 'kcp-workspaces',
  exact: true,
  component: WorkspacesPage,
});

registerClusterChooser(WorkspaceChooser);

registerSidebarEntryFilter(entry => {
  if (entry.name === TICK_ENTRY) {
    return null;
  }
  const cluster = getCluster();
  if (!cluster) {
    return entry;
  }
  ensureDiscovery(cluster);
  const apis = servedApis(cluster);
  if (!apis) {
    // Nothing known about this workspace yet. Showing everything for the one
    // render it takes to find out is the right way round: a sidebar that
    // fills in is better than one that empties out.
    return entry;
  }
  return entryVisible(entry, apis, gates()) ? entry : null;
});

registerRouteFilter(route => {
  const cluster = getCluster();
  if (!cluster) {
    return route;
  }
  const apis = servedApis(cluster);
  if (!apis) {
    return route;
  }
  const path = (route as any).path ?? '';
  const closed = gates().some(
    gate => gate.routePrefix && path.startsWith(gate.routePrefix) && !gateOpen(gate, apis)
  );
  // Only removal: Headlamp applies a route filter as a predicate and drops
  // what returns null, so a modified route it returns is discarded. Nothing
  // here relies on changing one.
  return closed ? null : route;
});

registerPluginSettings(PLUGIN_NAME, Settings, false);
