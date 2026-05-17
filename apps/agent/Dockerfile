## Mnemos — agent (Node 22 + Express + SSE) for Cloud Run
## Build from repo root:  docker build -f apps/agent/Dockerfile -t mnemos-agent .

# 1. install all workspace deps (dev + prod) for compilation
FROM node:22-bookworm-slim AS deps
WORKDIR /repo
ENV CI=1
COPY package.json package-lock.json tsconfig.base.json ./
COPY apps/web/package.json apps/web/package.json
COPY apps/agent/package.json apps/agent/package.json
RUN npm ci --no-audit --no-fund \
  && mkdir -p apps/agent/node_modules apps/web/node_modules \
  && touch apps/agent/node_modules/.keep apps/web/node_modules/.keep

# 2. compile TypeScript → dist/
# npm workspaces sometimes nests deps under apps/agent/node_modules instead of
# hoisting them to /repo/node_modules — copy both so tsc resolves all imports.
FROM node:22-bookworm-slim AS build
WORKDIR /repo
COPY package.json package-lock.json tsconfig.base.json ./
COPY apps/agent ./apps/agent
COPY apps/web/package.json ./apps/web/package.json
COPY --from=deps /repo/node_modules ./node_modules
COPY --from=deps /repo/apps/agent/node_modules ./apps/agent/node_modules
RUN npm --workspace apps/agent run build

# 3. prune to production-only deps for runtime
FROM node:22-bookworm-slim AS prod-deps
WORKDIR /repo
ENV CI=1
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/package.json
COPY apps/agent/package.json apps/agent/package.json
RUN npm ci --omit=dev --no-audit --no-fund \
  && mkdir -p apps/agent/node_modules \
  && touch apps/agent/node_modules/.keep

# 4. minimal runtime image — mirror the workspace layout so Node resolves
#    both hoisted (/app/node_modules) and nested (/app/apps/agent/node_modules) deps.
FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV AGENT_PORT=8080
EXPOSE 8080

RUN groupadd --system --gid 1001 nodejs \
  && useradd --system --uid 1001 --gid nodejs node-runtime

COPY --from=prod-deps --chown=node-runtime:nodejs /repo/node_modules ./node_modules
COPY --from=prod-deps --chown=node-runtime:nodejs /repo/apps/agent/node_modules ./apps/agent/node_modules
COPY --from=build --chown=node-runtime:nodejs /repo/apps/agent/package.json ./apps/agent/package.json
COPY --from=build --chown=node-runtime:nodejs /repo/apps/agent/dist ./apps/agent/dist

USER node-runtime
WORKDIR /app/apps/agent

CMD ["node", "dist/server.js"]
