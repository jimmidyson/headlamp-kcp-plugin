/**
 * The workspace navigator: where you are in the tree, what is under you, and
 * what each workspace serves.
 *
 * Moving between workspaces is moving between Headlamp clusters, because a
 * workspace *is* a server URL. The interesting column is the last one: what a
 * workspace serves is what its `APIBinding`s bound, so the plugins that have
 * anything to show differ from one row to the next, and the navigator says
 * which before you go there rather than leaving you to find an empty page.
 */
import { Icon } from '@iconify/react';
import { Loader, SectionBox } from '@kinvolk/headlamp-plugin/lib/CommonComponents';
import { useClustersConf } from '@kinvolk/headlamp-plugin/lib/k8s';
import { getCluster } from '@kinvolk/headlamp-plugin/lib/Utils';
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  Link,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from '@mui/material';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useDispatch } from 'react-redux';
import { useHistory } from 'react-router-dom';
import {
  childWorkspace,
  clusterForWorkspace,
  parentWorkspace,
  workspaceLeaf,
  workspaceOf,
} from '../kcp/clusters';
import { ensureDiscovery, ServedApis, servedApis, subscribe } from '../kcp/discovery';
import { canMint, canMintFrom, mintWorkspaceCluster } from '../kcp/mint';
import { ApiBindingEntry, listApiBindings, listWorkspaces, WorkspaceEntry } from '../kcp/workspaces';
import { DEFAULT_GATES, gateOpen, PluginGate } from '../sidebar/gates';

/** Counts discovery results, so what is derived from them is derived again. */
function useDiscoveryTick(): number {
  const [tick, setTick] = useState(0);
  useEffect(() => subscribe(() => setTick(current => current + 1)), []);
  return tick;
}

/** Re-renders when any cluster's discovery result lands. */
export function useServedApis(cluster: string | null): ServedApis | undefined {
  useDiscoveryTick();
  useEffect(() => {
    if (cluster) {
      ensureDiscovery(cluster);
    }
  }, [cluster]);
  return cluster ? servedApis(cluster) : undefined;
}

/** The plugins a workspace has anything to show for. */
function openGates(apis: ServedApis | undefined, gates: PluginGate[]): PluginGate[] {
  return gates.filter(gate => gateOpen(gate, apis));
}

/**
 * The plugins a workspace lights up, or why that is not known yet.
 *
 * A workspace nothing has been read from yet is not a workspace with no
 * plugins, and saying so would be worse than saying nothing: everywhere else
 * an unread workspace hides nothing, here it would claim something.
 */
function GateChips({ apis, gates }: { apis: ServedApis | undefined; gates: PluginGate[] }) {
  if (!apis || apis.error) {
    return (
      <Typography variant="body2" color="text.secondary">
        {apis?.error ? 'unknown' : 'reading…'}
      </Typography>
    );
  }
  const open = openGates(apis, gates);
  if (open.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary">
        —
      </Typography>
    );
  }
  return (
    <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
      {open.map(gate => (
        <Chip key={gate.sidebarEntry} size="small" color="primary" variant="outlined" label={gate.sidebarEntry} />
      ))}
    </Stack>
  );
}

interface ChildRow extends WorkspaceEntry {
  path: string;
  cluster?: string;
  apis?: ServedApis;
}

/** The tree under the workspace being viewed, one level down. */
function useChildren(cluster: string | null, workspace: string | undefined, apis: ServedApis | undefined) {
  const clusters = useClustersConf();
  const [children, setChildren] = useState<WorkspaceEntry[] | null>(null);
  const [error, setError] = useState<Error | undefined>();

  useEffect(() => {
    if (!cluster || !workspace || !apis) {
      return;
    }
    let cancelled = false;
    listWorkspaces(cluster, apis)
      .then(items => !cancelled && setChildren(items))
      .catch(err => !cancelled && setError(err));
    return () => {
      cancelled = true;
    };
  }, [cluster, workspace, apis]);

  // Rebuilt as each child's discovery lands, so the plugins column fills in
  // rather than staying at whatever was known when the list arrived.
  const tick = useDiscoveryTick();
  const rows: ChildRow[] = useMemo(() => {
    if (!children || !workspace) {
      return [];
    }
    return children
      .map(child => {
        const path = childWorkspace(workspace, child.name);
        const childCluster = clusterForWorkspace(path, clusters);
        return { ...child, path, cluster: childCluster, apis: childCluster ? servedApis(childCluster) : undefined };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [children, workspace, clusters, tick]);

  // What each reachable child serves, so the last column is filled in before
  // anybody goes there. Workspaces with no context of their own stay blank:
  // asking would mean minting a cluster for every row, which is a lot of
  // clusters to leave behind for a list somebody may not click on.
  useEffect(() => {
    rows.forEach(row => row.cluster && ensureDiscovery(row.cluster));
  }, [rows]);

  return { rows, error, loading: children === null && !error };
}

function useBindings(cluster: string | null, apis: ServedApis | undefined) {
  const [bindings, setBindings] = useState<ApiBindingEntry[] | null>(null);
  useEffect(() => {
    if (!cluster || !apis) {
      return;
    }
    let cancelled = false;
    listApiBindings(cluster, apis)
      .then(items => !cancelled && setBindings(items))
      .catch(() => !cancelled && setBindings([]));
    return () => {
      cancelled = true;
    };
  }, [cluster, apis]);
  return bindings;
}

export interface WorkspaceNavigatorProps {
  /** Called once a workspace has been switched to, so a dialog can close itself. */
  onNavigate?: () => void;
  gates?: PluginGate[];
}

export function WorkspaceNavigator({ onNavigate, gates = DEFAULT_GATES }: WorkspaceNavigatorProps) {
  const cluster = getCluster();
  const clusters = useClustersConf();
  const workspace = workspaceOf(cluster, clusters);
  const apis = useServedApis(cluster);
  const { rows, error, loading } = useChildren(cluster, workspace, apis);
  const bindings = useBindings(cluster, apis);
  const history = useHistory();
  const dispatch = useDispatch();
  const [minting, setMinting] = useState<string | undefined>();
  const [mintError, setMintError] = useState<string | undefined>();
  const [mintable, setMintable] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (cluster && canMint()) {
      canMintFrom(cluster).then(ok => !cancelled && setMintable(ok));
    }
    return () => {
      cancelled = true;
    };
  }, [cluster]);

  const go = useCallback(
    async (path: string, existing?: string) => {
      setMintError(undefined);
      let target = existing;
      if (!target) {
        setMinting(path);
        try {
          target = await mintWorkspaceCluster(cluster!, path, dispatch);
        } catch (err: any) {
          setMintError(err?.message ?? String(err));
          setMinting(undefined);
          return;
        }
        setMinting(undefined);
        // A cluster Headlamp learned about a moment ago is in its store but
        // not yet in every component that reads it, and the ones that matter
        // here read it at startup. A full load is a blunt way to be sure the
        // workspace opens as any other cluster does, and this happens once
        // per workspace rather than once per click.
        // Not encoded: Headlamp matches the cluster name as the raw path
        // segment, and a percent-encoded one is a name it has never heard of.
        window.location.href = `${window.location.origin}/c/${target}/`;
        return;
      }
      history.push(`/c/${target}/`);
      onNavigate?.();
    },
    [cluster, dispatch, history, onNavigate]
  );

  if (!workspace) {
    return (
      <Alert severity="info" sx={{ m: 2 }}>
        {cluster
          ? `${cluster} does not address a kcp workspace: its server URL has no /clusters/ path.`
          : 'No cluster selected.'}
      </Alert>
    );
  }

  const parent = parentWorkspace(workspace);
  const parentCluster = parent ? clusterForWorkspace(parent, clusters) : undefined;
  const segments = workspace.split(':');

  return (
    <Box sx={{ minWidth: 520 }}>
      <SectionBox title="Where you are">
        <Stack direction="row" spacing={0.5} alignItems="center" flexWrap="wrap" useFlexGap>
          {segments.map((segment, index) => {
            const path = segments.slice(0, index + 1).join(':');
            const target = clusterForWorkspace(path, clusters);
            const last = index === segments.length - 1;
            return (
              <React.Fragment key={path}>
                {index > 0 && <Typography color="text.secondary">:</Typography>}
                {last || (!target && !mintable) ? (
                  <Typography fontWeight={last ? 600 : 400}>{segment}</Typography>
                ) : (
                  <Link component="button" variant="body1" onClick={() => go(path, target)}>
                    {segment}
                  </Link>
                )}
              </React.Fragment>
            );
          })}
        </Stack>
        <Box sx={{ mt: 1 }}>
          <Typography variant="body2" color="text.secondary" component="span" sx={{ mr: 1 }}>
            Plugins enabled here:
          </Typography>
          <GateChips apis={apis} gates={gates} />
        </Box>
        {apis?.error && (
          <Alert severity="warning" sx={{ mt: 1 }}>
            Could not read what this workspace serves ({apis.error.message}). Nothing is being
            hidden.
          </Alert>
        )}
      </SectionBox>

      <Divider />

      <SectionBox title="Workspaces here">
        {parent && (
          <Box sx={{ mb: 1 }}>
            <Button
              size="small"
              startIcon={<Icon icon="mdi:arrow-up-left" />}
              disabled={!parentCluster && !mintable}
              onClick={() => go(parent, parentCluster)}
            >
              {parent}
            </Button>
          </Box>
        )}
        {mintError && (
          <Alert severity="error" sx={{ mb: 1 }}>
            {mintError}
          </Alert>
        )}
        {loading && <Loader title="Listing workspaces…" />}
        {error && (
          <Alert severity="info">
            This workspace does not list its children: {error.message}
          </Alert>
        )}
        {!loading && !error && rows.length === 0 && (
          <Typography variant="body2" color="text.secondary">
            No workspaces inside this one.
          </Typography>
        )}
        {rows.length > 0 && (
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Workspace</TableCell>
                <TableCell>Type</TableCell>
                <TableCell>Phase</TableCell>
                <TableCell>Plugins</TableCell>
                <TableCell align="right" />
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map(row => {
                const reachable = Boolean(row.cluster) || mintable;
                return (
                  <TableRow key={row.path} hover>
                    <TableCell>{workspaceLeaf(row.path)}</TableCell>
                    <TableCell>{row.type ?? '—'}</TableCell>
                    <TableCell>{row.phase ?? '—'}</TableCell>
                    <TableCell>
                      {row.cluster ? (
                        <GateChips apis={row.apis} gates={gates} />
                      ) : (
                        <Typography variant="body2" color="text.secondary">
                          no context
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell align="right">
                      <Tooltip
                        title={
                          reachable
                            ? row.cluster
                              ? `Open ${row.path}`
                              : `Add a cluster for ${row.path} and open it`
                            : 'No context for this workspace, and this Headlamp holds no kubeconfig to build one from'
                        }
                      >
                        <span>
                          <Button
                            size="small"
                            variant={row.cluster ? 'contained' : 'outlined'}
                            disabled={!reachable || minting === row.path}
                            onClick={() => go(row.path, row.cluster)}
                          >
                            {minting === row.path ? 'Adding…' : 'Open'}
                          </Button>
                        </span>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </SectionBox>

      <Divider />

      <SectionBox title="What this workspace binds">
        {bindings === null && <Loader title="Reading APIBindings…" />}
        {bindings?.length === 0 && (
          <Typography variant="body2" color="text.secondary">
            No APIBindings: this workspace serves only what kcp serves everywhere.
          </Typography>
        )}
        {bindings && bindings.length > 0 && (
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>APIBinding</TableCell>
                <TableCell>Export</TableCell>
                <TableCell>Phase</TableCell>
                <TableCell>API groups it serves</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {bindings.map(binding => (
                <TableRow key={binding.name}>
                  <TableCell>{binding.name}</TableCell>
                  <TableCell>{binding.exportRef || '—'}</TableCell>
                  <TableCell>{binding.phase ?? '—'}</TableCell>
                  <TableCell>
                    <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                      {binding.groups.map(group => (
                        <Chip key={group} size="small" label={group} variant="outlined" />
                      ))}
                    </Stack>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </SectionBox>
    </Box>
  );
}

/** The navigator in a dialog, which is how the app bar opens it. */
export function WorkspaceNavigatorDialog({
  open,
  onClose,
  onShowClusters,
}: {
  open: boolean;
  onClose: () => void;
  /** Opens Headlamp's own cluster list, for a deployment that has ordinary clusters too. */
  onShowClusters?: () => void;
}) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" scroll="paper" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Icon icon="mdi:file-tree" />
        Workspaces
        <Box sx={{ flexGrow: 1 }} />
        {onShowClusters && (
          <Button
            size="small"
            onClick={() => {
              onClose();
              onShowClusters();
            }}
          >
            All clusters
          </Button>
        )}
        <IconButton size="small" onClick={onClose} aria-label="close">
          <Icon icon="mdi:close" />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers>
        <WorkspaceNavigator onNavigate={onClose} />
      </DialogContent>
    </Dialog>
  );
}
