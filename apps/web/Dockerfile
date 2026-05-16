## Mnemos — web (Next.js 16) for Cloud Run
## Build from the repo root:  docker build -f apps/web/Dockerfile -t mnemos-web .

# 1. install deps using the full monorepo lockfile (workspaces hoist)
FROM node:22-bookworm-slim AS deps
WORKDIR /repo
ENV CI=1
COPY package.json package-lock.json tsconfig.base.json ./
COPY apps/web/package.json apps/web/package.json
COPY apps/agent/package.json apps/agent/package.json
RUN npm ci --no-audit --no-fund

# 2. build the standalone Next.js bundle
FROM node:22-bookworm-slim AS build
WORKDIR /repo
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV NEXT_TRACE_ROOT=/repo
COPY --from=deps /repo/node_modules ./node_modules
COPY package.json package-lock.json tsconfig.base.json ./
COPY apps/web ./apps/web
COPY apps/agent/package.json ./apps/agent/package.json
ARG NEXT_PUBLIC_AGENT_URL
ENV NEXT_PUBLIC_AGENT_URL=${NEXT_PUBLIC_AGENT_URL}
RUN npm --workspace apps/web run build

# 3. minimal runtime image — runs node server.js from .next/standalone
FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=8080
ENV HOSTNAME=0.0.0.0

RUN groupadd --system --gid 1001 nodejs \
  && useradd --system --uid 1001 --gid nodejs nextjs

COPY --from=build --chown=nextjs:nodejs /repo/apps/web/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=nextjs:nodejs /repo/apps/web/public ./apps/web/public

USER nextjs
EXPOSE 8080

# Cloud Run sends SIGTERM. Node's default exit handler is sufficient for Next standalone.
CMD ["node", "apps/web/server.js"]
