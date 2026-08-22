import { describe, expect, it } from 'vitest';
import {
  childWorkspace,
  clusterForWorkspace,
  parentWorkspace,
  serverForWorkspace,
  workspaceLeaf,
  workspaceOf,
  workspaceOfServer,
} from './clusters';

describe('reading a workspace out of a server URL', () => {
  it('takes the path segment after /clusters/', () => {
    expect(workspaceOfServer('https://localhost:6443/clusters/root:acme:prod')).toBe(
      'root:acme:prod'
    );
  });

  it('stops at the next segment, so a scoped URL with a path after it still reads', () => {
    expect(workspaceOfServer('https://localhost:6443/clusters/root/api/v1')).toBe('root');
  });

  it('is undefined for a server that addresses no workspace', () => {
    expect(workspaceOfServer('https://localhost:6443')).toBeUndefined();
    expect(workspaceOfServer(undefined)).toBeUndefined();
    expect(workspaceOfServer('https://localhost:6443/clusters/')).toBeUndefined();
  });
});

describe('pointing a server URL at another workspace', () => {
  it('appends to an unscoped server', () => {
    expect(serverForWorkspace('https://localhost:6443', 'root:acme')).toBe(
      'https://localhost:6443/clusters/root:acme'
    );
  });

  // Joining onto a scoped URL would produce two /clusters/ segments and a 404
  // that says nothing about why.
  it('replaces the workspace of a scoped server', () => {
    expect(serverForWorkspace('https://localhost:6443/clusters/root', 'root:acme')).toBe(
      'https://localhost:6443/clusters/root:acme'
    );
  });

  it('does not double the slash', () => {
    expect(serverForWorkspace('https://localhost:6443/', 'root')).toBe(
      'https://localhost:6443/clusters/root'
    );
  });
});

describe('finding the cluster for a workspace', () => {
  const clusters = {
    root: { name: 'root', auth_type: '', server: 'https://localhost:6443/clusters/root' },
    'root:acme': {
      name: 'root:acme',
      auth_type: '',
      server: 'https://localhost:6443/clusters/root:acme',
    },
    'alice@root:acme': {
      name: 'alice@root:acme',
      auth_type: '',
      server: 'https://localhost:6443/clusters/root:acme',
    },
    other: { name: 'other', auth_type: '', server: 'https://example.test:6443' },
  };

  it('prefers the context named after the workspace when several address it', () => {
    expect(clusterForWorkspace('root:acme', clusters)).toBe('root:acme');
  });

  it('falls back to any context addressing it', () => {
    const onlyImpersonating = { 'alice@root:acme': clusters['alice@root:acme'] };
    expect(clusterForWorkspace('root:acme', onlyImpersonating)).toBe('alice@root:acme');
  });

  it('is undefined when nothing addresses it', () => {
    expect(clusterForWorkspace('root:nope', clusters)).toBeUndefined();
    expect(clusterForWorkspace('root', null)).toBeUndefined();
  });

  it('reads the workspace of a named cluster', () => {
    expect(workspaceOf('root:acme', clusters)).toBe('root:acme');
    expect(workspaceOf('other', clusters)).toBeUndefined();
    expect(workspaceOf(null, clusters)).toBeUndefined();
  });
});

describe('walking the tree', () => {
  it('goes up', () => {
    expect(parentWorkspace('root:acme:prod')).toBe('root:acme');
    expect(parentWorkspace('root')).toBeUndefined();
  });

  it('goes down', () => {
    expect(childWorkspace('root:acme', 'prod')).toBe('root:acme:prod');
  });

  it('names a workspace as its parent does', () => {
    expect(workspaceLeaf('root:acme:prod')).toBe('prod');
    expect(workspaceLeaf('root')).toBe('root');
  });
});
