# syntax=docker/dockerfile:1

# ---- Base ----------------------------------------------------------------
FROM node:24-alpine AS base
# tzdata so the pinned business timezone resolves inside the container
# (ROADMAP P1.3); libc6-compat + curl for the healthcheck.
RUN apk add --no-cache libc6-compat curl tzdata
ENV TZ=Asia/Dhaka
RUN corepack enable
WORKDIR /app

# ---- All Dependencies (for building AND migrations) -----------------------
# Used by both the builder stage and the standalone `migrate` service, so we
# only run `pnpm install` once instead of three times.
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --ignore-scripts

# ---- Builder -------------------------------------------------------------
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# NEXT_PUBLIC_* values are inlined into client bundles at build time. They are
# injected here as build args (see .dockerignore — .env files never enter the
# image), while server-only secrets are supplied at runtime via env_file.
ARG NEXT_PUBLIC_SITE_URL=http://localhost:3000
ARG NEXT_PUBLIC_ENV=development
ARG NEXT_PUBLIC_BASE_URL=
ENV NEXT_TELEMETRY_DISABLED=1 \
    NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL \
    NEXT_PUBLIC_ENV=$NEXT_PUBLIC_ENV \
    NEXT_PUBLIC_BASE_URL=$NEXT_PUBLIC_BASE_URL
RUN --mount=type=cache,id=nextcache,target=/app/.next/cache \
    pnpm build

# ---- Runner --------------------------------------------------------------
# This image is used for BOTH the `app` service and the one-off `migrate`
# service in compose.monolith.yml (which overrides `entrypoint`/`command` to
# run src/lib/db/migrate.ts instead of the server). That is why the runner keeps
# the FULL dependency tree from `deps` rather than a `--prod` install: tsx +
# drizzle-orm must be present for the migrate service, and shipping a second
# prod-only stage just to copy from the full one only doubled the install work.
FROM base AS runner
WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

COPY --from=builder --chown=nextjs:nodejs /app/drizzle.config.* ./
COPY --from=builder --chown=nextjs:nodejs /app/src/lib/db ./src/lib/db
COPY --from=builder --chown=nextjs:nodejs /app/src/content ./src/content
COPY --from=builder --chown=nextjs:nodejs /app/drizzle ./drizzle
COPY --from=deps --chown=nextjs:nodejs /app/node_modules ./node_modules

RUN mkdir -p /app/uploads && chown -R nextjs:nodejs /app/uploads

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

HEALTHCHECK --interval=10s --timeout=5s --start-period=60s --retries=3 \
  CMD curl -f http://localhost:3000/api/ready || exit 1

CMD ["node", "server.js"]
