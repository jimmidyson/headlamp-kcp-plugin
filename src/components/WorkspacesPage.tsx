/**
 * The navigator as a page of its own, for a link somebody can bookmark and
 * for the sidebar entry.
 */
import { SectionBox } from '@kinvolk/headlamp-plugin/lib/CommonComponents';
import { Box } from '@mui/material';
import React from 'react';
import { WorkspaceNavigator } from './WorkspaceNavigator';

export function WorkspacesPage() {
  return (
    <SectionBox title="Workspaces" textAlign="center" paddingTop={2}>
      <Box sx={{ textAlign: 'left' }}>
        <WorkspaceNavigator />
      </Box>
    </SectionBox>
  );
}
