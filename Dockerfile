# syntax=docker/dockerfile:1
#
# Sky production image (SvelteKit adapter-node, Bun runtime).
#
# It ran on Node until 2026-08-27, for a reason that no longer exists: better-sqlite3 was a native
# module the non-bundled scripts loaded, and Bun could not (oven-sh/bun#4290). The driver is now
# `bun:sqlite`, which INVERTS the constraint - `bun:` is a Bun builtin, so those same scripts can no
# longer run under Node at all. Graph positions are computed in-process in TypeScript
# (src/lib/server/positions.ts): no Python at runtime either.

# -- Build ---------------------------------------------------------------------
FROM oven/bun:1.4.0-alpine AS build
WORKDIR /app
ENV HUSKY=0
# No node-gyp, no python3, no make: nothing native is compiled any more.
COPY package.json bun.lock ./
# --ignore-scripts skips prepare(husky); there is nothing else to run.
RUN bun install --frozen-lockfile --ignore-scripts
COPY . .
# `bun run build` is `bun --bun vite build`. The `--bun` is load-bearing: Bun honours a bin's node
# shebang, so a plain `vite build` runs Vite under Node, and SSR then fails resolving `bun:sqlite`
# with ERR_UNSUPPORTED_ESM_URL_SCHEME.
RUN bun run build

# -- Runtime -------------------------------------------------------------------
FROM oven/bun:1.4.0-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3001
# TLS roots for outbound HTTPS (Authentik OIDC, MiGallery avatars).
RUN apk add --no-cache ca-certificates

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/build ./build
COPY --from=build /app/scripts ./scripts
# Keep the schema outside the database/ volume (a mount would hide it); it is
# seeded into the volume at startup if absent (fresh volume / new server).
COPY --from=build /app/database/schema.sql ./db-seed/schema.sql

RUN mkdir -p database
VOLUME ["/app/database"]

EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=5 \
  CMD bun -e "fetch('http://127.0.0.1:'+(process.env.PORT||3001)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Seed the schema into the volume if absent, run idempotent migrations, then start.
# Every migration here is documented idempotent and re-runs on each container start.
# They used to be chained with `|| true`, which meant a FAILED migration was indistinguishable
# from a successful one and the server started anyway - against a half-migrated database, with
# nothing in the logs accusing anything. A migration that fails must stop the container; the
# deploy's health check then reports it instead of the site answering wrongly.
#
# This chain is the one `start:prod` declares; the two must not drift. It named
# migrate-drop-profile-columns.js until 2026-08-27, a file renamed to migrate-drop-dead-schema.js,
# so every container start died on the fourth migration.
CMD ["sh", "-c", "set -e; mkdir -p database; [ -f database/schema.sql ] || cp db-seed/schema.sql database/schema.sql; bun scripts/init-db.js; bun scripts/migrate-auth.js; bun scripts/rebuild-db.js; bun scripts/migrate-drop-dead-schema.js; bun build/index.js"]
