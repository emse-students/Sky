# Data protection (GDPR)

**Source**: `src/routes/confidentialite/+page.svelte`, `messages/{fr,en}.json` (`privacy_*`),
`src/lib/server/database.ts` (`exportDatabaseWithoutSessions`), `scripts/migrate-drop-dead-schema.js`

The public notice is `/confidentialite` (French, "tu", also in English through Paraglide). It is
linked from the landing (bottom-left, signed out), the account menu and the account page. It is
public so people WITHOUT an account can read it, and `noindex` like every page but `/`
([seo.md](seo.md)).

## Decisions taken by the owner (2026-10-16)

- **Controller**: Association Rootz - EMSE, contact `bureau@rootz-emse.fr`.
- **Legal basis**: performance of the service (the account) for sign-in; legitimate interest for the
  student map. Identity data comes from MiConnect at each login; the photo is displayed from
  MiGallery, never stored by Sky.
- **Requests**: by e-mail, answered within 30 days (one month for removal of a placeholder); complaint
  to the CNIL.

## Inventory

| Data                                                                                         | Where               | Kept                                    | Why                     |
| -------------------------------------------------------------------------------------------- | ------------------- | --------------------------------------- | ----------------------- |
| first/last name, promo (`level`), formation, `auth_sub` (MiConnect id), `role`, `last_login` | `people`            | while the map exists, or until erasure  | the account and the map |
| godparent / adoption links between named people                                              | `relationships`     | same                                    | the map                 |
| clubs                                                                                        | `associations`      | same                                    | the map, if used        |
| login session                                                                                | `sessions`          | 7 days                                  | stay signed in          |
| identity awaiting a link choice                                                              | `pending_links`     | 15 minutes                              | disambiguation screen   |
| database backups                                                                             | `scripts/backup.sh` | 14 days, mirrored to a second school VM | recovery                |

**People without an account exist**: a student creates a placeholder record (name, promo) to link
their own godparent or godchild. These people never agreed to anything, which is why the notice says
so and gives the removal route. Removal is an admin action (`/admin/people`, delete the record).

Hosting: the school's shared server, administered with the DSI. Recipients: signed-in ICM students
(map), MiConnect (identity provider), MiGallery (photos).

## What was changed on 2026-10-16

- **E-mail is no longer collected.** The scope never asked for it (`openid profile promo name
formation`) and no code read `people.email`; every write path and the `email` fields of the
  identity types are gone. `migrate-drop-dead-schema.js` (step 3, at every container start) sets
  `people.email` and `pending_links.email` to NULL. The columns are KEPT (stop-writing plus null, no
  `DROP COLUMN`), so an older backup still restores against the current schema; dropping them is a
  later, optional cleanup.
- **Fonts are self-hosted** (`@fontsource/orbitron`, `@fontsource/space-grotesk`, latin subset,
  imported in `src/app.css`): no request to Google, so no visitor IP leaves for a third party.
- **The admin export carries no sessions.** `GET /api/admin/export` serves a `VACUUM INTO` copy in
  which `sessions` and `pending_links` are emptied and the copy is vacuumed again, since deleted rows
  stay readable in free pages until the file is rewritten.

## Left, deliberately

- Session tokens are still stored in clear in `sessions.token` (and so in the 14-day backups).
  Hashing them is a small change but invalidates every live session at deploy and touches the login,
  relink and logout paths; it is a separate, announced change.
- The backups themselves (`scripts/backup.sh`) still contain the sessions table: they are an
  operator artefact, not a download.
