# syntax=docker/dockerfile:1
#
# Image de production Sky (SvelteKit adapter-node, runtime Node).
# Node (et non Bun) car better-sqlite3 est utilise par des scripts non-bundles
# (init-db.js, migrate-add-bio.js) que Bun ne sait pas charger (specifier nu
# intercepte, cf oven-sh/bun#4290). Inclut Python + libs scientifiques pour
# scripts/calcul_positions.py (spawn au runtime).

# ── Build ─────────────────────────────────────────────────────────────────────
FROM node:22-bookworm AS build
WORKDIR /app
ENV HUSKY=0
# Outils de compilation pour le module natif better-sqlite3.
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
# --ignore-scripts evite prepare(husky)/prebuild ; on compile better-sqlite3 ensuite.
RUN npm ci --ignore-scripts && npm rebuild better-sqlite3
COPY . .
# Appel direct de vite pour contourner le hook npm "prebuild" (qui tente bun/pnpm).
RUN node_modules/.bin/vite build

# ── Runtime ───────────────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3001
# Python + libs requises par scripts/calcul_positions.py (paquets Debian prebuilt).
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 python3-numpy python3-scipy python3-networkx ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/build ./build
COPY --from=build /app/scripts ./scripts
# Schema hors du volume database/ (sinon le montage le masque) ; sema dans le
# volume au demarrage s il est absent (volume vierge / nouveau serveur).
COPY --from=build /app/database/schema.sql ./db-seed/schema.sql

RUN mkdir -p database
VOLUME ["/app/database"]

EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3001)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Seme le schema dans le volume si absent, migrations idempotentes, puis demarrage.
CMD ["sh", "-c", "mkdir -p database; [ -f database/schema.sql ] || cp db-seed/schema.sql database/schema.sql; node scripts/init-db.js; node scripts/migrate-add-bio.js || true; node scripts/migrate-auth.js || true; node build/index.js"]
