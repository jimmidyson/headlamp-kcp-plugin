/**
 * Which plugins belong to which APIs, as something a person can edit.
 *
 * The gate this plugin ships with is Cluster API's, because that is the one
 * the demo shows. The setting exists so that the next one - a workspace that
 * binds Tekton, or Crossplane, or an API somebody wrote last week - needs a
 * line of configuration rather than a plugin.
 */
import { ConfigStore } from '@kinvolk/headlamp-plugin/lib';
import { Box, TextField, Typography } from '@mui/material';
import React from 'react';
import { DEFAULT_GATES, PluginGate } from '../sidebar/gates';

export const PLUGIN_NAME = 'kcp-workspaces';

interface PluginConfig {
  /** One `sidebarEntry=group[,group]` per line. */
  gates?: string;
}

export const store = new ConfigStore<PluginConfig>(PLUGIN_NAME);

/** Parses the setting, ignoring lines that say nothing. */
export function parseGates(text: string | undefined): PluginGate[] {
  const gates: PluginGate[] = [];
  for (const line of (text ?? '').split('\n')) {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) {
      continue;
    }
    const [entry, groups] = trimmed.split('=');
    const apiGroups = (groups ?? '')
      .split(',')
      .map(group => group.trim())
      .filter(Boolean);
    if (entry?.trim() && apiGroups.length > 0) {
      gates.push({ sidebarEntry: entry.trim(), apiGroups });
    }
  }
  return gates;
}

/** Every gate in force: the ones shipped, plus the ones configured. */
export function gates(): PluginGate[] {
  const configured = parseGates(store.get()?.gates);
  const shipped = DEFAULT_GATES.filter(
    gate => !configured.some(other => other.sidebarEntry === gate.sidebarEntry)
  );
  return [...shipped, ...configured];
}

export function Settings() {
  const config = store.useConfig()();

  return (
    <Box sx={{ maxWidth: 640 }}>
      <Typography variant="body2" sx={{ mb: 2 }}>
        A sidebar section is shown in a workspace only when that workspace serves one of its API
        groups. One <code>sidebarEntry=group,group</code> per line; the Cluster API gate is built
        in.
      </Typography>
      <TextField
        multiline
        minRows={4}
        fullWidth
        label="Extra gates"
        placeholder={'flux=source.toolkit.fluxcd.io\nCluster-api=cluster.x-k8s.io'}
        value={config?.gates ?? ''}
        onChange={event => store.update({ gates: event.target.value })}
      />
    </Box>
  );
}
