/**
 * The app bar's cluster chooser, saying which workspace you are in.
 *
 * It replaces Headlamp's chooser rather than sitting beside it because in a
 * kcp deployment they are the same control: every cluster in the list is a
 * workspace, and "switch cluster" and "switch workspace" are one action. The
 * built-in list is still one click away, for a Headlamp that has ordinary
 * clusters in it too.
 */
import { Icon } from '@iconify/react';
import { useClustersConf } from '@kinvolk/headlamp-plugin/lib/k8s';
import { Box, Button, Tooltip, Typography } from '@mui/material';
import React, { useState } from 'react';
import { workspaceLeaf, workspaceOf, parentWorkspace } from '../kcp/clusters';
import { WorkspaceNavigatorDialog } from './WorkspaceNavigator';

export interface WorkspaceChooserProps {
  clickHandler: (event?: React.MouseEvent<HTMLButtonElement, MouseEvent>) => void;
  cluster?: string;
}

export function WorkspaceChooser({ clickHandler, cluster }: WorkspaceChooserProps) {
  const clusters = useClustersConf();
  const [open, setOpen] = useState(false);
  const workspace = workspaceOf(cluster ?? null, clusters);

  if (!workspace) {
    // Not a workspace: leave the built-in behaviour alone rather than
    // pretending an ordinary cluster is somewhere in a tree.
    return (
      <Button size="small" onClick={clickHandler} sx={{ color: 'inherit' }}>
        {cluster ?? 'Choose cluster'}
      </Button>
    );
  }

  const parent = parentWorkspace(workspace);

  return (
    <>
      <Tooltip title={`${workspace} — click to move around the workspace tree`}>
        <Button
          size="small"
          onClick={() => setOpen(true)}
          startIcon={<Icon icon="mdi:file-tree" />}
          sx={{ color: 'inherit', textTransform: 'none', maxWidth: 360 }}
        >
          <Box sx={{ textAlign: 'left', overflow: 'hidden' }}>
            <Typography variant="body2" noWrap sx={{ fontWeight: 600, lineHeight: 1.1 }}>
              {workspaceLeaf(workspace)}
            </Typography>
            {parent && (
              <Typography variant="caption" noWrap sx={{ opacity: 0.75, display: 'block' }}>
                {parent}
              </Typography>
            )}
          </Box>
        </Button>
      </Tooltip>
      <WorkspaceNavigatorDialog open={open} onClose={() => setOpen(false)} onShowClusters={clickHandler} />
    </>
  );
}
