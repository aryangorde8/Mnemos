## Mnemos — agent (Node 22 + Express + SSE) for Cloud Run
## Build from repo root:  docker build -f apps/agent/Dockerfile -t mnemos-agent .

# 1. install all workspace deps (dev + prod) for compilation
FROM node:22-bookworm-slim AS deps
WORKDIR /repo
ENV CI=1
COPY package.json package-lock.json tsconfig.base.json ./
COPY apps/web/package.json apps/web/package.json
COPY apps/agent/package.json apps/agent/package.json
RUN npm ci --no-audit --no-fund

# 2. compile TypeScript → dist/
FROM node:22-bookworm-slim AS build
WORKDIR /repo
COPY --from=deps /repo/node_modules ./node_modules
COPY package.json package-lock.json tsconfig.base.json ./
COPY apps/agent ./apps/agent
COPY apps/web/package.json ./apps/web/package.json
RUN npm --workspace apps/agent run build

# 3. prune to production-only deps for runtime
FROM node:22-bookworm-slim AS prod-deps
WORKDIR /repo
ENV CI=1
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/package.json
COPY apps/agent/package.json apps/agent/package.json
RUN npm ci --omit=dev --no-audit --no-fund

# 4. minimal runtime image
FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV AGENT_PORT=8080
EXPOSE 8080

RUN groupadd --system --gid 1001 nodejs \
  && useradd --system --uid 1001 --gid nodejs node-runtime

COPY --from=prod-deps --chown=node-runtime:nodejs /repo/node_modules ./node_modules
COPY --from=build --chown=node-runtime:nodejs /repo/apps/agent/package.json ./package.json
COPY --from=build --chown=node-runtime:nodejs /repo/apps/agent/dist ./dist

USER node-runtime

CMD ["node", "dist/server.js"]
