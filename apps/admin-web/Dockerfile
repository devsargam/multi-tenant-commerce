## Stage 1: install workspace deps
FROM node:22-alpine AS deps
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/admin-web/package.json apps/admin-web/package.json
COPY packages/eslint-config/package.json packages/eslint-config/package.json
COPY packages/typescript-config/package.json packages/typescript-config/package.json

RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile

## Stage 2: build the Vite SPA into static assets
FROM deps AS builder
WORKDIR /app

# Compile-time API URL (Vite inlines VITE_* vars at build time).
ARG VITE_API_URL=http://localhost:3001
ENV VITE_API_URL=$VITE_API_URL

COPY apps/admin-web apps/admin-web
COPY packages/eslint-config packages/eslint-config
COPY packages/typescript-config packages/typescript-config

RUN pnpm --filter admin-web build

## Stage 3: serve static assets via nginx (proper SPA fallback)
FROM nginx:1.27-alpine AS runner

COPY --from=builder /app/apps/admin-web/dist /usr/share/nginx/html
COPY apps/admin-web/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 3002

CMD ["nginx", "-g", "daemon off;"]
