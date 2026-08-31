<script lang="ts">
  import SvelteMarkdown, { allowHtmlOnly } from '@humanspeak/svelte-markdown';
  import { normalizeBioLineBreaks } from '$lib/utils/markdown';

  // Canari bios are authored in Markdown; render them the same way here (GFM + hard line breaks).
  //
  // THE HTML ALLOWLIST IS EMPTY, AND IT IS NOT DECORATION. This comment used to claim that
  // SvelteMarkdown "escapes raw HTML, so external bio text cannot inject markup". Measured on
  // 2026-08-31 that was FALSE: `<div id="x">` and `<iframe src="https://evil.example">` were both
  // built as real elements, the iframe keeping its `src`. Event handlers (`onerror`, `onclick`),
  // `javascript:` hrefs and `<script>` execution were all already stripped by the library, so this
  // was never script execution - but a bio could embed an arbitrary third-party frame in the page,
  // and a bio is text this application did not write.
  //
  // An ALLOWLIST rather than a block on `iframe`: a denylist is a list of the attacks somebody
  // thought of. Empty is the right allowlist here because a bio is Markdown - `**bold**`, links and
  // lists all still render, since those are markdown nodes and not raw HTML. A blocked tag renders
  // as plain escaped text, which is what the old comment promised was already happening.
  //
  // `BioMarkdown.test.ts` is what keeps this true across an upgrade of the renderer.
  const NO_RAW_HTML = allowHtmlOnly([]);

  let { source, class: className = '' }: { source: string; class?: string } = $props();

  const rendered = $derived(normalizeBioLineBreaks(source.trim()));
</script>

<div class="bio-markdown {className}">
  <SvelteMarkdown
    source={rendered}
    options={{ gfm: true, breaks: true }}
    renderers={{ html: NO_RAW_HTML }}
  />
</div>

<style>
  .bio-markdown {
    color: #cbd5e1;
  }
  .bio-markdown :global(p) {
    margin: 0 0 0.6em;
    line-height: 1.6;
  }
  .bio-markdown :global(p:last-child) {
    margin-bottom: 0;
  }
  .bio-markdown :global(a) {
    color: #60a5fa;
    text-decoration: underline;
    word-break: break-word;
  }
  .bio-markdown :global(ul),
  .bio-markdown :global(ol) {
    margin: 0 0 0.6em;
    padding-left: 1.3em;
  }
  .bio-markdown :global(li) {
    margin: 0.15em 0;
  }
  .bio-markdown :global(h1),
  .bio-markdown :global(h2),
  .bio-markdown :global(h3) {
    margin: 0.5em 0 0.3em;
    line-height: 1.25;
  }
  .bio-markdown :global(h1) {
    font-size: 1.3em;
    font-weight: 800;
  }
  .bio-markdown :global(h2) {
    font-size: 1.15em;
    font-weight: 700;
  }
  .bio-markdown :global(h3) {
    font-size: 1.05em;
    font-weight: 700;
  }
  .bio-markdown :global(strong) {
    font-weight: 700;
  }
  .bio-markdown :global(code) {
    background: rgba(255, 255, 255, 0.08);
    padding: 0.1em 0.35em;
    border-radius: 4px;
    font-size: 0.9em;
  }
  .bio-markdown :global(pre) {
    background: rgba(255, 255, 255, 0.06);
    padding: 10px 12px;
    border-radius: 8px;
    overflow-x: auto;
  }
  .bio-markdown :global(pre code) {
    background: none;
    padding: 0;
  }
  .bio-markdown :global(blockquote) {
    border-left: 3px solid rgba(255, 255, 255, 0.2);
    margin: 0 0 0.6em;
    padding-left: 0.8em;
    color: #cbd5e1;
  }
  .bio-markdown :global(img) {
    max-width: 100%;
    border-radius: 8px;
  }
</style>
