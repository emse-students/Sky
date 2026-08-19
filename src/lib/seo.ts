import { m } from "$lib/paraglide/messages";

/**
 * What a crawler and a link unfurler are given, and how it is built.
 *
 * Sky is not a public site: `src/hooks.server.ts` redirects everything except `/` and
 * `/unauthorized` to the login flow, and the graph itself is personal data about named students.
 * So this module has a narrower job than the same file in the other repos - it is not here to get
 * content indexed, it is here so that **the one public page identifies itself**.
 *
 * Two facts shape it:
 *
 * 1. **The head is what a link becomes.** Sky is shared between students in chats far more often
 *    than it is searched for, and Discord, Slack and WhatsApp never run the JavaScript. Before
 *    this, `https://sky.mitv.fr` unfurled as a bare URL: the page carried a `<title>` and nothing
 *    else - no description, no image - measured on prod 2026-08-19.
 * 2. **Absolute URLs, from the REQUEST's own origin.** `og:image` and `og:url` are resolved by a
 *    machine with no page context, so a relative path is silently useless to every one of them.
 *    Under `adapter-node` that origin comes from the request, which is why `ORIGIN` is set in
 *    `docker-compose.prod.yml` - without it the scheme is whatever the reverse proxy spoke.
 */

/** Everything one page contributes to its head. */
export interface SeoMeta {
  /** The full `<title>`. Pages already own their titles, so this is not composed here. */
  title: string;
  /** The sentence a search result and an unfurl card both show. */
  description: string;
  /** Absolute URL of the preview image, or null to fall back to the site logo. */
  image?: string | null;
  /** What the image shows, for a reader who cannot see it. */
  imageAlt?: string;
  /**
   * Keep this page out of an index. Set on `/unauthorized`, which is public only so that a
   * refused sign-in has somewhere to land - it is not a page anybody should arrive at from a
   * search result.
   */
  noindex?: boolean;
  /** JSON-LD graph nodes for this page, if any. */
  jsonLd?: unknown[];
}

/** Absolute URL of the default preview image, from a request origin. */
export function defaultImage(origin: string): string {
  return `${origin}/sky.png`;
}

/** Absolute URL for a path, from a request origin. Query and hash are deliberately dropped. */
export function canonicalUrl(origin: string, pathname: string): string {
  return `${origin}${pathname}`;
}

/**
 * Serialises a JSON-LD graph for embedding in a `<script>` element.
 *
 * `JSON.stringify` leaves `</script>` byte-for-byte intact, and inside a script element that
 * sequence ENDS the element: everything after it parses as markup. Nothing user-supplied reaches a
 * graph today - the only public page describes the site itself - but the escape is what keeps that
 * true when the next node is built from a name. Escaping `<` and `&` as unicode escapes keeps the
 * JSON identical to a parser and inert to the HTML tokenizer.
 */
export function serializeJsonLd(nodes: unknown[]): string {
  return JSON.stringify({ "@context": "https://schema.org", "@graph": nodes })
    .replace(/</g, "\\u003c")
    .replace(/&/g, "\\u0026");
}

/**
 * The complete script element carrying a page's JSON-LD graph.
 *
 * Built here rather than in the component: this is a plain `.ts` module, so the closing tag is
 * nine characters. Assembled inside a `.svelte` file the same string needs an escape to stop the
 * Svelte parser ending the block early - noise that reads as a mistake and that the next person is
 * one cleanup away from deleting. The escaping that matters is {@link serializeJsonLd}'s.
 */
export function jsonLdScript(nodes: unknown[]): string {
  return `<script type="application/ld+json">${serializeJsonLd(nodes)}</script>`;
}

/** Drops undefined, null and empty members: a declared-but-empty property is reported as malformed. */
export function prune<T extends Record<string, unknown>>(node: T): T {
  return Object.fromEntries(
    Object.entries(node).filter(
      ([, v]) => v !== undefined && v !== null && v !== "",
    ),
  ) as T;
}

/**
 * The school Sky belongs to, as one node the site node points at.
 *
 * "Sky" is a word nothing can be won on. What makes this findable at all is being attached to an
 * institution a search engine already knows, by name, URL and postal address.
 */
export const INSTITUTION_ID = "https://www.mines-stetienne.fr/#organization";

export function institutionNode(): Record<string, unknown> {
  return {
    "@type": "CollegeOrUniversity",
    "@id": INSTITUTION_ID,
    name: "Ecole des Mines de Saint-Etienne",
    alternateName: "Mines Saint-Etienne",
    url: "https://www.mines-stetienne.fr/",
    address: {
      "@type": "PostalAddress",
      streetAddress: "158 cours Fauriel",
      postalCode: "42023",
      addressLocality: "Saint-Etienne",
      addressCountry: "FR",
    },
  };
}

/** The site itself. Referenced by `@id` rather than repeated, so one name means one thing. */
export function siteNode(origin: string): Record<string, unknown> {
  return {
    "@type": "WebSite",
    "@id": `${origin}/#website`,
    name: "Sky",
    description: m.seo_site_description(),
    url: `${origin}/`,
    publisher: { "@id": INSTITUTION_ID },
  };
}
