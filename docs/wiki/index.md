# Sky technical wiki

Sky is the star map of EMSE's ICM godparent tree. It renders every ICM student
as a star on an interactive canvas, connected by parrainage (godparent) and
adoption links, and lets a signed-in student edit their own godparent
entourage. Identity, avatars and the rest of the profile come from the shared
EMSE stack (Authentik SSO, MiGallery, Canari); Sky owns only the godparent
graph.

This wiki is the canonical, English source of truth for how Sky works. It is
written against the code, not against intentions; when a page and the code
disagree, the code wins and the page is a bug.

## Stack at a glance

- **Framework**: SvelteKit 2 + Svelte 5 (SSR, `adapter-node`), TypeScript.
- **Styling**: Tailwind CSS 4.
- **Database**: SQLite via `better-sqlite3` (single file `database/sky.db`).
- **Graph layout**: in-process ForceAtlas2 (graphology), no Python at runtime.
- **i18n**: Paraglide (inlang), French + English, `messages/{fr,en}.json`.
- **Auth**: Authentik OIDC (miconnect), opaque server sessions.
- **Runtime**: Node in production (Docker), Bun for local dev tooling.

## Map of the wiki

| Page                                             | What it covers                                                               |
| ------------------------------------------------ | ---------------------------------------------------------------------------- |
| [architecture.md](architecture.md)               | Request lifecycle, hook sequence, route map, repo layout                     |
| [authentication.md](authentication.md)           | OIDC flow, the ICM gate, sessions, admin roles                               |
| [identity-model.md](identity-model.md)           | Placeholder vs account records, login linking, relink/unlink/merge           |
| [data-model.md](data-model.md)                   | SQLite schema, FTS, `positions.json`, the legacy snapshot                    |
| [godparent-graph.md](godparent-graph.md)         | Relations, the 1/1/3/2 rules, cycles, families, the entourage editor, layout |
| [matching-and-search.md](matching-and-search.md) | Tolerant name matching and search ranking                                    |
| [frontend.md](frontend.md)                       | Stores, canvas rendering, focus mode, the profile panel, i18n                |
| [integrations.md](integrations.md)               | MiGallery avatars, Canari profile, the outbound entourage API                |
| [api-reference.md](api-reference.md)             | Every HTTP endpoint, its auth and its shape                                  |
| [deployment.md](deployment.md)                   | Docker, CD, secrets, migrations, backups                                     |

## Conventions used in Sky code

- All code comments and developer-facing strings (logs, thrown error messages)
  are English. User-visible text goes through Paraglide (`m.*()`), never inline.
- Text is normalized to ASCII (straight `'` and `"`, hyphen `-`); the ellipsis
  `…` is the one intentional non-ASCII character.
- Path aliases: `$lib`, `$components`, `$stores`, `$types`, `$utils`, `$server`.
- Domain vocabulary kept as identifiers: `nom`/`prenom` (DB columns and the
  `Person` shape), `parrain`/`fillot` (godparent/godchild), `promo` (graduation
  year, stored as `people.level`), `fiche` (a `people` record).
