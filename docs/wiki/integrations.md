# Integrations

Sky owns only the godparent graph. Identity, avatars and the rest of a profile
come from three shared EMSE services. All of them are keyed by the Authentik
`sub`, which is why an account record stores it as `auth_sub` (see
[identity-model.md](identity-model.md)).

## The outbound budget

`fetch` has **no default deadline**, so an upstream that accepts a connection and
then says nothing holds it - and the request behind it - for as long as it likes.
Nothing recovers from that: there is no error to catch, no fallback to reach,
only a page that never finishes. Every server-to-server call therefore carries
`signal: AbortSignal.timeout(OUTBOUND_BUDGET_MS)`, one 4 s constant declared in
`src/lib/server/outbound.ts` and shared by all four call sites (MiGallery, the
Canari profile, and Authentik's token and userinfo endpoints). It is the same
budget Canari's own avatar proxy uses, so a slow MiGallery degrades at the same
moment everywhere it is read.

A budget expires as a **throw** (`TimeoutError`), never as a status, so it is the
`catch` of each call - not a status check - that has to name the upstream as
unreachable.

## Authentik (miconnect) - identity

The OIDC provider. Covered in full in [authentication.md](authentication.md).
Config: `MICONNECT_BASE_URL` (default `https://auth.canari-emse.fr`),
`MICONNECT_CLIENT_ID`, `MICONNECT_CLIENT_SECRET`. Endpoints are global
(`/application/o/{authorize,token,userinfo}/`), the app slug lives only in the
token issuer.

## MiGallery - avatars

`GET /api/avatar/[id]` proxies a person's photo. It is public (so `<img>` can
load it) and resolves in this order:

1. If the `people` row has a custom `image` that looks like a URL, redirect to it
   (302).
2. Otherwise, resolve the record's `auth_sub` and, if present, fetch
   `MIGALLERY_API_URL/api/users/{sub}/avatar` with the `x-api-key` header. A
   placeholder (no linked account) has no MiGallery photo and skips straight to
   initials.
3. On any miss (no account, non-OK response, upstream unreachable), return a
   generated SVG with the person's initials (`getPersonInitials`, with an id-based
   fallback). Placeholder SVGs are served `Cache-Control: no-store` so the real
   photo appears as soon as the account links; real photos use a short cache with
   revalidation.

An avatar is a **decoration**: no MiGallery condition may cost the caller an
error, and none of them ever waits without end. What separates them is the log
level, not the status code, because all three answer 200 with an SVG:

| MiGallery says            | Answer    | Logged as                                      |
| ------------------------- | --------- | ---------------------------------------------- |
| an image                  | the image | nothing                                        |
| 404, or no linked account | initials  | `debug` - this person has no photo, a fact     |
| 401/403/5xx               | initials  | `error` - OUR key refused, or upstream broken  |
| nothing within the budget | initials  | `error`, naming the budget and the destination |

The third row is the one that had to be split out: a refused API key turns every
avatar in the tree into initials, which is exactly what a tree of faceless
accounts looks like, and nothing said which it was.

Config: `MIGALLERY_API_KEY` (required for photos), `MIGALLERY_API_URL` (default
`https://gallery.mitv.fr`).

## Canari - profile (inbound)

`GET /api/canari/[id]` proxies the public Canari profile (bio, current and former
clubs) of a Sky record. It resolves the record's `auth_sub` first; an unlinked
placeholder has no Canari profile and returns `{ linked: false }`. Otherwise it
calls `CANARI_API_URL/api/external/profile/{sub}` with `x-api-key`, and returns
the public projection `{ linked: true, profile }` (or `{ linked: true, profile:
null }` on 404). Club logo URLs are resolved to absolute URLs
(`resolveCanariLogo`: a same-origin `/api/media/public/:id` path becomes
`CANARI_URL + path`). The API key stays server-side; the client only ever sees
the public projection.

Config: `CANARI_API_URL` (default `https://canari-emse.fr`), `CANARI_API_KEY`.
The shapes are typed in `src/lib/types/graph.ts` (`CanariProfile`,
`CanariAssociation`, `CanariFormerAssociation`, `CanariProfileResponse`).

## Sky -> Canari - entourage (outbound)

`GET /api/external/entourage/[sub]` is Sky's own public API, consumed by Canari
to render the close godparent tree on a profile page. It is **not** ICM
session-gated (it is exempt in `hooks.server.ts`); instead it is protected by a
timing-safe `x-api-key` check against `SKY_API_KEY`. An empty `SKY_API_KEY`
rejects every call. It returns `getEntourageBySub(sub)` (the person's parrains and
fillots).

Config: `SKY_API_KEY` (the shared secret Canari presents).

## Summary of keys

| Direction        | Endpoint                         | Auth          | Env                                      |
| ---------------- | -------------------------------- | ------------- | ---------------------------------------- |
| Sky -> MiGallery | `.../api/users/{sub}/avatar`     | `x-api-key`   | `MIGALLERY_API_KEY`, `MIGALLERY_API_URL` |
| Sky -> Canari    | `.../api/external/profile/{sub}` | `x-api-key`   | `CANARI_API_KEY`, `CANARI_API_URL`       |
| Canari -> Sky    | `/api/external/entourage/{sub}`  | `x-api-key`   | `SKY_API_KEY`                            |
| Sky -> Authentik | `/application/o/*`               | client secret | `MICONNECT_*`                            |
