# Scalable Commerce

Turborepo monorepo for the scalable commerce apps.

## Apps and Packages

- `apps/web`: Next.js web app
- `apps/api`: Express API
- `packages/ui`: shared React UI package
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
```

Default local ports:

- Web: `http://localhost:3000`
- API: `http://localhost:3001`

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

GitHub Actions publishes both images to GHCR on pushes to `main` or `master`, version tags matching `v*`, and manual workflow runs.

Published image names:

- `ghcr.io/devsargam/multi-tenant-commerce-web`
- `ghcr.io/devsargam/multi-tenant-commerce-api`

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
```
