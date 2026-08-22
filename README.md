# kcp workspaces for Headlamp

A [Headlamp](https://headlamp.dev) plugin that makes a [kcp](https://kcp.io)
shard navigable: move around the workspace tree, and see only the APIs — and
only the plugins — each workspace actually serves.

## What it does

**Navigate the tree.** A kcp workspace is a URL prefix on one server
(`/clusters/root:acme:prod`), which is the same granularity Headlamp calls a
cluster. The plugin reads the workspace path back out of each cluster's server
URL, lists the `Workspaces` inside the one being viewed, and switches to any of
them. Where a workspace has no context of its own, it copies the one in use and
rewrites its server URL, so the tree stays navigable past whatever was
configured up front.

**Show what a workspace serves.** A kcp workspace serves the APIs its
`APIBinding`s bind and nothing else. A workspace with no `apps/v1` gets no
Deployments entry, one with no Pods gets no Workloads section at all, and a
heading whose children have all gone goes with them. This is discovery-driven:
no list of resources is maintained here.

**Gate plugins on the APIs behind them.** A gate is a sidebar section and the
API groups that make it worth showing:

```
Cluster-api=cluster.x-k8s.io
```

Bind the Cluster API `APIExport` into a workspace and the Cluster API plugin's
section appears there; move one workspace up, where nothing binds it, and it is
gone — along with its routes, so a bookmarked link renders the workspace it
lands in rather than an error. The Cluster API gate ships with the plugin; the
rest are one line each in the plugin's settings, which is the point. A platform
serving Tekton to some tenants and Crossplane to others describes that in
configuration rather than in code.

### Why not `CustomResourceDefinition`s?

Because in a workspace they are not there. A type bound from an `APIExport` is
served without a CRD existing in the workspace serving it, so a plugin that
detects its API by listing CRDs reports "not installed" in exactly the
workspaces where the objects are sitting in front of it. Discovery is the
question that has an answer everywhere — in a workspace, behind an aggregated
API server, and on an ordinary cluster.

## Install

From the Headlamp plugin catalogue, or by hand:

```sh
npm install && npm run build
mkdir -p ~/.config/Headlamp/plugins/kcp-workspaces
cp dist/main.js package.json ~/.config/Headlamp/plugins/kcp-workspaces/
```

For a server-side Headlamp, put the same two files under its `-plugins-dir`.

## Getting the contexts

The plugin navigates whatever Headlamp has been given. A kubeconfig with one
context per workspace is the usual way in, and its contexts differ only in the
`/clusters/<path>` on the end of the server URL:

```yaml
clusters:
  - name: root:acme:prod
    cluster:
      server: https://kcp.example:6443/clusters/root:acme:prod
      certificate-authority-data: ...
```

Name each context after the workspace it addresses and Headlamp's cluster
chooser reads as a workspace list.
[`kcp-cluster-api`](https://github.com/jimmidyson/kcp-cluster-api)'s demo
writes such a file for the workspaces it creates
(`--workspace-kubeconfig`).

Workspaces without a context are still reachable when Headlamp holds the
kubeconfig itself — a cluster added in the browser rather than configured on
the backend — because that is the case where a plugin can build a new context
from the one in use. With backend-configured clusters the credentials never
leave the backend, and the navigator says so rather than failing at the click.

## Development

```sh
npm install
npm run start     # against a running Headlamp
npm run test
npm run tsc
npm run build
```

## License

Apache 2.0.
