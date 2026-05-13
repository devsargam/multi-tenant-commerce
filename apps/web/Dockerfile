## Stage 1: install workspace deps
FROM node:22-alpine AS deps
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/web/package.json apps/web/package.json
COPY packages/eslint-config/package.json packages/eslint-config/package.json
COPY packages/typescript-config/package.json packages/typescript-config/package.json
COPY packages/ui/package.json packages/ui/package.json

RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile

## Stage 2: build Next.js and emit a pruned prod deployment to /out
FROM deps AS builder
WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1
ARG NEXT_PUBLIC_API_URL=http://localhost:3001
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

COPY apps/web apps/web
COPY packages packages

RUN pnpm --filter web build
RUN pnpm --filter web deploy --prod /out

## Stage 3: minimal runtime image
FROM node:22-alpine AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV NEXT_PUBLIC_API_URL=http://localhost:3001
WORKDIR /app

RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001

COPY --from=builder --chown=nextjs:nodejs /out ./

USER nextjs
EXPOSE 3000

CMD ["node_modules/.bin/next", "start", "--port", "3000"]
