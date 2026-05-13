## Stage 1: install workspace deps
FROM node:22-alpine AS deps
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/k8s-orchestrator-api/package.json apps/k8s-orchestrator-api/package.json
COPY packages/deployment-types/package.json packages/deployment-types/package.json
COPY packages/eslint-config/package.json packages/eslint-config/package.json
COPY packages/typescript-config/package.json packages/typescript-config/package.json

RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile

## Stage 2: build and emit a pruned prod deployment to /out
FROM deps AS builder
WORKDIR /app

COPY apps/k8s-orchestrator-api apps/k8s-orchestrator-api
COPY packages/deployment-types packages/deployment-types
COPY packages/eslint-config packages/eslint-config
COPY packages/typescript-config packages/typescript-config

RUN pnpm --filter k8s-orchestrator-api build
RUN pnpm --filter k8s-orchestrator-api deploy --prod /out

## Stage 3: minimal runtime image
FROM node:22-alpine AS runner
ENV NODE_ENV=production
ENV PORT=3010
ENV K8S_APPLY_MODE=dry-run
WORKDIR /app

RUN addgroup -g 1001 -S nodejs && adduser -S orchestrator -u 1001

COPY --from=builder --chown=orchestrator:nodejs /out ./

USER orchestrator
EXPOSE 3010

CMD ["node", "dist/index.js"]
