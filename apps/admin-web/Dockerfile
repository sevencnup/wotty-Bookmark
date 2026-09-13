FROM node:22-bookworm-slim AS builder
WORKDIR /app

RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/admin-web/package.json apps/admin-web/package.json
COPY apps/sidebar-extension/package.json apps/sidebar-extension/package.json
COPY packages/protocol/package.json packages/protocol/package.json
RUN pnpm install --frozen-lockfile

COPY packages/protocol packages/protocol
COPY apps/admin-web apps/admin-web
RUN pnpm --filter @bookmark-vault/admin-web build

FROM caddy:2-alpine
COPY infra/Caddyfile /etc/caddy/Caddyfile
COPY --from=builder /app/apps/admin-web/dist /srv/admin-web
