# SEO and link previews

**Source**: `src/lib/seo.ts`, `src/lib/components/Seo.svelte`, `static/robots.txt`

## The constraint everything here follows from

Sky is **not a public site**. `src/hooks.server.ts` reserves every path except
`/` and `/unauthorized` to a signed-in ICM student and redirects the rest to the
login flow, and what it protects is personal data about named students: who
their godparent is, who their godchildren are, their photo, their bio.

So this page is not about getting content indexed. There is one indexable page,
and the job is that it **identifies itself** - because the way Sky actually
travels is a link pasted into a chat, and Discord, Slack and WhatsApp never run
the JavaScript.

Measured on prod on 2026-08-19, before any change:

```
curl https://sky.mitv.fr/
  -> <head> with charset, icon, viewport, two font preconnects, a stylesheet
     and <title>Sky - Cartographie ICM</title>. Nothing else.
```

No description, no image, no canonical. Pasted anywhere, that unfurls as a bare
URL.

## The method

One component and one module, used by the two public pages.

| Piece                      | File                            | Job                                           |
| -------------------------- | ------------------------------- | --------------------------------------------- |
| `SeoMeta` + graph builders | `src/lib/seo.ts`                | What a page contributes, and the JSON-LD      |
| `<Seo {meta} />`           | `src/lib/components/Seo.svelte` | Emits the head, from the request's own origin |

- **`/`** gets the full head: description, `og:*`, `twitter:*`, a canonical, and
  a `WebSite` node published by one `CollegeOrUniversity` node for Mines
  Saint-Etienne. "Sky" is a word nothing can be won on; being consistently
  attached to an institution a search engine already knows, by name, URL and
  postal address, is the only thing that makes it placeable at all.
- **`/unauthorized`** gets `noindex, nofollow` and no canonical. It is public
  only so a refused sign-in has somewhere to land - it is a refusal, not a
  destination.

Every other page keeps its plain `<title>` and gets nothing. **Being unreachable
is stronger than `noindex`**: a crawler is an anonymous visitor, the gate
redirects it to the login flow, and it never receives a page to index. A meta tag
on a page nothing can fetch would be decoration that reads as the protection.

### Absolute URLs come from the request

`og:image`, `og:url` and `link rel=canonical` are resolved by a machine with no
page context, so a relative path is silently useless to every one of them. They
are built from `$page.url.origin` - never a constant - so the same code is right
on production and on localhost.

Under `adapter-node` that origin comes from the request, and without `ORIGIN` the
adapter derives it from the `Host` header: the right hostname, but the scheme the
reverse proxy spoke, which is `http`. A preview image at `http://` is one no
unfurler will fetch. `docker-compose.prod.yml` therefore sets
`ORIGIN=${SKY_ORIGIN:-https://sky.mitv.fr}`, which is also the origin
`adapter-node` compares against for its CSRF check.

### Escaping is the part that will matter later

`JSON.stringify` leaves `</script>` byte-for-byte intact, and inside a script
element that sequence ENDS the element: everything after it parses as markup.
Nothing user-supplied reaches a graph today - the only public page describes the
site itself - and `serializeJsonLd` escapes `<` and `&` as unicode escapes
anyway, which is what keeps that true the day a node is built from a student's
name. Covered by `tests/seo.test.ts`.

The `<script>` element itself is assembled in `seo.ts`, a plain `.ts` module,
rather than in the component: built inside a `.svelte` file the closing tag needs
an escape to stop the Svelte parser ending the block early, which reads as a
mistake and is one cleanup away from being deleted.

## robots.txt, and why there is no sitemap

`static/robots.txt` used to be `Disallow:` - allow everything. It now names the
private prefixes explicitly. They are unreachable anyway; the rules exist so that
**a change to the gate cannot quietly open the graph**, and so the intent is
written down where a crawler reads it rather than only in a hook.

There is deliberately no sitemap. A sitemap states a link graph, and Sky's has
one indexable page. Advertising one that lists a single URL tells a crawler
nothing it does not already have - and a `Sitemap:` line pointing at a path that
does not answer is worse than none, which is exactly what portail-etu shipped and
what cost it its whole detail half.

## Verifying a change

Against a local production build (`npm run build`, then
`ORIGIN=https://sky.mitv.fr PORT=4321 node build/index.js`):

```sh
curl -s http://localhost:4321/ | grep -o '<meta property="og:image" content="[^"]*"'
curl -s http://localhost:4321/unauthorized | grep -o '<meta name="robots"[^>]*>'
curl -s http://localhost:4321/robots.txt
```

`curl` is the right tool and a browser is not: a browser runs the JavaScript, so
it cannot tell you what the SERVER wrote - which is the only thing an unfurler
ever sees.

## Related

- [architecture.md](architecture.md) - the hook sequence and the public/private
  route split this page depends on
- [authentication.md](authentication.md) - the ICM gate itself
- [deployment.md](deployment.md) - where `ORIGIN` is set
