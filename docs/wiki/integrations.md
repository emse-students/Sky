# Integrations

Sky owns only the godparent graph. Identity, avatars and the rest of a profile
come from three shared EMSE services. All of them are keyed by the Authentik
`sub`, which is why an account record stores it as `auth_sub` (see
[identity-model.md](identity-model.md)).

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
3. On any miss (no account, non-OK response), return a generated SVG with the
   person's initials (`getPersonInitials`, with an id-based fallback). Placeholder
   SVGs are served `Cache-Control: no-store` so the real photo appears as soon as
   the account links; real photos use a short cache with revalidation.

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
