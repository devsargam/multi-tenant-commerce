## Stage 1: install workspace deps
FROM node:22-alpine AS deps
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/provision-web/package.json apps/provision-web/package.json
COPY packages/deployment-types/package.json packages/deployment-types/package.json
COPY packages/eslint-config/package.json packages/eslint-config/package.json
COPY packages/typescript-config/package.json packages/typescript-config/package.json

RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile

## Stage 2: build the Vite SPA into static assets
FROM deps AS builder
WORKDIR /app

ARG VITE_ORCHESTRATOR_API_URL=http://localhost:3010
ENV VITE_ORCHESTRATOR_API_URL=$VITE_ORCHESTRATOR_API_URL

COPY apps/provision-web apps/provision-web
COPY packages/deployment-types packages/deployment-types
COPY packages/eslint-config packages/eslint-config
COPY packages/typescript-config packages/typescript-config

RUN pnpm --filter provision-web build

## Stage 3: serve static assets via nginx
FROM nginx:1.27-alpine AS runner

COPY --from=builder /app/apps/provision-web/dist /usr/share/nginx/html
COPY apps/provision-web/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 3003

CMD ["nginx", "-g", "daemon off;"]
