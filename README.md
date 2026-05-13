# Scalable Commerce

Turborepo monorepo for the scalable commerce apps.

## Apps and Packages

- `apps/web`: Next.js web app
- `apps/api`: Express API
- `apps/admin-web`: Vite admin app for catalog operations
- `apps/provision-web`: Vite provisioning console for ecommerce suites
- `apps/k8s-orchestrator-api`: Express Kubernetes control-plane API
- `packages/ui`: shared React UI package
- `packages/deployment-types`: shared provisioning and deployment types
- `packages/eslint-config`: shared ESLint config
- `packages/typescript-config`: shared TypeScript config

## Development

Install dependencies:

```sh
pnpm install
```

Run all apps:

```sh
pnpm dev
```

Run one app:

```sh
pnpm --filter web dev
pnpm --filter api dev
pnpm --filter k8s-orchestrator-api dev
pnpm --filter provision-web dev
```

Default local ports:

- Web: `http://localhost:3000`
- API: `http://localhost:3001`
- Admin: `http://localhost:3002`
- Provisioning console: `http://localhost:3003`
- Kubernetes orchestrator API: `http://localhost:3010`

## Provisioning Control Plane

The provisioning console talks to `apps/k8s-orchestrator-api` and can create,
edit, apply, redeploy, delete, inspect manifests, inspect pods, and read logs for
commerce suites.
It also configures per-container CPU and memory requests/limits for `api`, `web`,
`admin-web`, and the internal Postgres StatefulSet.

The orchestrator defaults to dry-run mode. It generates the Kubernetes manifests
without mutating a cluster:

```sh
pnpm --filter k8s-orchestrator-api dev
pnpm --filter provision-web dev
```

To apply to Kubernetes, run the orchestrator in live mode. The default kubeconfig
path is `/Users/sargampoudel/.kube/config`, and `KUBECONFIG` can override it:

```sh
K8S_APPLY_MODE=live KUBECONFIG=/Users/sargampoudel/.kube/config pnpm --filter k8s-orchestrator-api dev
pnpm --filter provision-web dev
```

Or start the local control plane with the checked-in make target:

```sh
make dev-control-plane
```

Generated resources include a namespace, ConfigMap, Secret, internal Postgres
StatefulSet when selected, migration Job, Deployments, Services, and optional
Ingress for `web`, `api.<host>`, and `admin.<host>`. The default workload
images come from this repo's GHCR packages:

- `ghcr.io/devsargam/multi-tenant-commerce-api:latest`
- `ghcr.io/devsargam/multi-tenant-commerce-web:latest`
- `ghcr.io/devsargam/multi-tenant-commerce-admin-web:latest`

### Local Suite Access

The provision console has a `Local` tab for localhost testing. It asks the
orchestrator to start `kubectl port-forward` sessions for each selected suite:

- `web` forwards to the suite storefront service port `3000`
- `api` forwards to the suite API service port `3001`
- `admin-web` forwards to the suite admin service port `3002`

Ports are allocated from `LOCAL_ACCESS_PORT_BASE` (`3100` by default) with a
stable project-based offset, so multiple local projects can run at the same
time without sharing `localhost:3000`, `localhost:3001`, or `localhost:3002`.
The API endpoints are:

- `GET /projects/:id/local-access`
- `POST /projects/:id/local-access/start`
- `POST /projects/:id/local-access/stop`

## Checks

```sh
pnpm lint
pnpm check-types
pnpm build
```

## Docker

Build both images locally:

```sh
make docker-build
```

Or use Docker Compose directly:

```sh
docker compose build
docker compose up
```

Local image names:

- `scalable-commerce-web`
- `scalable-commerce-api`

## GitHub Container Registry

GitHub Actions publishes app images to GHCR on pushes to `main` or `master`, version tags matching `v*`, and manual workflow runs.

Published image names:

- `ghcr.io/devsargam/multi-tenant-commerce-api`
- `ghcr.io/devsargam/multi-tenant-commerce-web`
- `ghcr.io/devsargam/multi-tenant-commerce-admin-web`

Published tags include:

- `latest` from the default branch
- branch name tags
- git tag names such as `v0.1.0`
- commit SHA tags such as `sha-<commit>`

No custom token is required. The workflow uses GitHub's built-in `GITHUB_TOKEN` with `packages: write`.

Make sure GitHub Actions has write access:

```text
Settings -> Actions -> General -> Workflow permissions -> Read and write permissions
```

## Release

Create and push a version tag, then create the GitHub release:

```sh
make release VERSION=v0.1.0 RELEASE_NOTES="Initial Docker image release for web and api."
```

To run the steps separately:

```sh
make release-tag VERSION=v0.1.0
make github-release VERSION=v0.1.0 RELEASE_NOTES="Initial Docker image release for web and api."
```

The pushed tag triggers GitHub Actions to publish:

```text
ghcr.io/devsargam/multi-tenant-commerce-api:v0.1.0
ghcr.io/devsargam/multi-tenant-commerce-web:v0.1.0
ghcr.io/devsargam/multi-tenant-commerce-admin-web:v0.1.0
```
