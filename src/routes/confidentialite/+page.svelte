<script lang="ts">
  import { m } from '#lib/paraglide/messages.js';
  import Seo from '#lib/components/Seo.svelte';

  // Each section is a heading plus its paragraphs, so the page reads as data and a new
  // section is one entry here and its message keys.
  const sections = [
    { h: m.privacy_controller_h(), p: [m.privacy_controller_p()] },
    {
      h: m.privacy_data_h(),
      p: [
        m.privacy_data_people(),
        m.privacy_data_links(),
        m.privacy_data_sessions(),
        m.privacy_data_photo(),
        m.privacy_data_backups(),
      ],
      list: true,
    },
    { h: m.privacy_why_h(), p: [m.privacy_why_p()] },
    { h: m.privacy_noaccount_h(), p: [m.privacy_noaccount_p()] },
    { h: m.privacy_recipients_h(), p: [m.privacy_recipients_p()] },
    { h: m.privacy_retention_h(), p: [m.privacy_retention_p()] },
    { h: m.privacy_rights_h(), p: [m.privacy_rights_p()] },
  ];
</script>

<!-- Public so that people WITHOUT an account can read it, but never indexed: Sky's robots rules
     allow the home page only (see docs/wiki/seo.md), and the hook stamps the header as well. -->
<Seo
  meta={{
    title: m.privacy_page_title(),
    description: m.seo_site_description(),
    noindex: true,
  }}
/>

<div class="privacy">
  <a class="back" href="/">{m.privacy_back()}</a>
  <h1>{m.privacy_title()}</h1>
  <p class="intro">{m.privacy_intro()}</p>

  {#each sections as section (section.h)}
    <section>
      <h2>{section.h}</h2>
      {#if section.list}
        <ul>
          {#each section.p as item (item)}
            <li>{item}</li>
          {/each}
        </ul>
      {:else}
        {#each section.p as paragraph (paragraph)}
          <p>{paragraph}</p>
        {/each}
      {/if}
    </section>
  {/each}
</div>

<style>
  .privacy {
    min-height: 100vh;
    box-sizing: border-box;
    max-width: 44rem;
    margin: 0 auto;
    padding: 2rem 1.25rem 4rem;
    color: #e2e8f0;
    line-height: 1.6;
  }

  .back {
    color: #87cefa;
    text-decoration: none;
    font-size: 0.9rem;
  }

  h1 {
    font-size: 1.75rem;
    margin: 1rem 0 0.5rem;
  }

  h2 {
    font-size: 1.15rem;
    margin: 1.75rem 0 0.4rem;
  }

  p,
  li {
    color: #94a3b8;
    margin: 0 0 0.5rem;
  }

  .intro {
    color: #cbd5e1;
  }

  ul {
    padding-left: 1.25rem;
    margin: 0;
  }
</style>
