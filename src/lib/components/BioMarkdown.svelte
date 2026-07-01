<script lang="ts">
  import SvelteMarkdown from "@humanspeak/svelte-markdown";
  import { normalizeBioLineBreaks } from "$lib/utils/markdown";

  // Canari bios are authored in Markdown; render them the same way here (GFM +
  // hard line breaks). SvelteMarkdown renders through Svelte components and
  // escapes raw HTML, so external bio text cannot inject markup.
  let { source, class: className = "" }: { source: string; class?: string } =
    $props();

  const rendered = $derived(normalizeBioLineBreaks(source.trim()));
</script>

<div class="bio-markdown {className}">
  <SvelteMarkdown source={rendered} options={{ gfm: true, breaks: true }} />
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
