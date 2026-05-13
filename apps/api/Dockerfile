FROM node:22-alpine AS base

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/api/package.json apps/api/package.json
COPY packages/eslint-config/package.json packages/eslint-config/package.json
COPY packages/typescript-config/package.json packages/typescript-config/package.json

RUN pnpm install --frozen-lockfile

COPY apps/api apps/api
COPY packages/eslint-config packages/eslint-config
COPY packages/typescript-config packages/typescript-config

RUN pnpm --filter api build

ENV NODE_ENV=production
ENV PORT=3001

EXPOSE 3001

CMD ["pnpm", "--filter", "api", "start"]
