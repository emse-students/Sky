<script lang="ts">
  import { page } from '$app/stores';
  import { canonicalUrl, defaultImage, jsonLdScript, type SeoMeta } from '$lib/seo';

  let { meta }: { meta: SeoMeta } = $props();

  // The REQUEST's own origin, never a constant: Sky answers on its production hostname and on
  // localhost during development, and an absolute URL built from the wrong one is a preview image
  // no unfurler can fetch.
  const origin = $derived($page.url.origin);
  const canonical = $derived(canonicalUrl(origin, $page.url.pathname));
  const image = $derived(meta.image || defaultImage(origin));
</script>

<svelte:head>
  <title>{meta.title}</title>
  <meta name="description" content={meta.description} />

  {#if meta.noindex}
    <meta name="robots" content="noindex, nofollow" />
  {:else}
    <link rel="canonical" href={canonical} />
  {/if}

  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="Sky" />
  <meta property="og:title" content={meta.title} />
  <meta property="og:description" content={meta.description} />
  <meta property="og:url" content={canonical} />
  <meta property="og:image" content={image} />
  {#if meta.imageAlt}
    <meta property="og:image:alt" content={meta.imageAlt} />
  {/if}

  <!-- Without an explicit card type, X and the several clients that copy its vocabulary render a
       bare link rather than falling back to the Open Graph image. -->
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content={meta.title} />
  <meta name="twitter:description" content={meta.description} />
  <meta name="twitter:image" content={image} />

  {#if meta.jsonLd && meta.jsonLd.length > 0}
    <!-- The only way for a component to emit a script element. The content is machine-authored
         JSON whose `<` and `&` are unicode-escaped by `serializeJsonLd`. -->
    <!-- eslint-disable-next-line svelte/no-at-html-tags -->
    {@html jsonLdScript(meta.jsonLd)}
  {/if}
</svelte:head>
