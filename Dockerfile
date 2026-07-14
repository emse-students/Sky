# syntax=docker/dockerfile:1
#
# Sky production image (SvelteKit adapter-node, Node runtime).
# Node (not Bun) because better-sqlite3 is used by non-bundled scripts
# (init-db.js, migrate-add-bio.js) that Bun cannot load (bare specifier
# interception, cf oven-sh/bun#4290). Graph positions are now computed
# in-process in TypeScript (src/lib/server/positions.ts): no more Python
# dependency at runtime.

# ── Build ─────────────────────────────────────────────────────────────────────
FROM node:24-bookworm AS build
WORKDIR /app
ENV HUSKY=0
# Build toolchain for the better-sqlite3 native module (node-gyp -> python3).
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
# --ignore-scripts skips prepare(husky)/prebuild; better-sqlite3 is built right after.
RUN npm ci --ignore-scripts && npm rebuild better-sqlite3
COPY . .
# Call vite directly to bypass the npm "prebuild" hook (which tries bun/pnpm).
RUN node_modules/.bin/vite build

# ── Runtime ───────────────────────────────────────────────────────────────────
FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3001
# TLS roots for outbound HTTPS (Authentik OIDC, MiGallery avatars).
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*

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
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3001)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Seed the schema into the volume if absent, run idempotent migrations, then start.
CMD ["sh", "-c", "mkdir -p database; [ -f database/schema.sql ] || cp db-seed/schema.sql database/schema.sql; node scripts/init-db.js; node scripts/migrate-add-bio.js || true; node scripts/migrate-auth.js || true; node scripts/rebuild-db.js || true; node build/index.js"]
