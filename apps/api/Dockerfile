## Stage 1: install workspace deps
FROM node:22-alpine AS deps
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/api/package.json apps/api/package.json
COPY packages/eslint-config/package.json packages/eslint-config/package.json
COPY packages/typescript-config/package.json packages/typescript-config/package.json

RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile

## Stage 2: build and emit a pruned prod deployment to /out
FROM deps AS builder
WORKDIR /app

COPY apps/api apps/api
COPY packages/eslint-config packages/eslint-config
COPY packages/typescript-config packages/typescript-config

RUN pnpm --filter api build
RUN pnpm --filter api deploy --prod /out

## Stage 3: minimal runtime image
FROM node:22-alpine AS runner
ENV NODE_ENV=production
ENV PORT=3001
WORKDIR /app

RUN addgroup -g 1001 -S nodejs && adduser -S api -u 1001

COPY --from=builder --chown=api:nodejs /out ./
COPY --from=builder --chown=api:nodejs /app/apps/api/drizzle ./drizzle

USER api
EXPOSE 3001

# Apply pending migrations on boot, then start the API.
# Override CMD to skip migrations (e.g. when a separate migration job runs).
CMD ["sh", "-c", "node dist/db/migrate.js && node dist/index.js"]
