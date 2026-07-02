<script lang="ts">
  import { Languages } from "lucide-svelte";
  import { getLocale, setLocale, type Locale } from "$lib/paraglide/runtime";
  import { m } from "$lib/paraglide/messages";

  // setLocale persists the choice in the paraglide cookie and reloads the page
  // so the server middleware re-renders every string in the new language.
  function onChange(event: Event) {
    const value = (event.currentTarget as HTMLSelectElement).value as Locale;
    setLocale(value);
  }

  const label = $derived({
    fr: m.lang_french(),
    en: m.lang_english(),
  });
</script>

<label class="locale-switcher" title={m.lang_label()}>
  <Languages size={16} />
  <select value={getLocale()} onchange={onChange} aria-label={m.lang_label()}>
    <option value="fr">{label.fr}</option>
    <option value="en">{label.en}</option>
  </select>
</label>

<style>
  .locale-switcher {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: #94a3b8;
  }
  select {
    background: transparent;
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 8px;
    color: #e2e8f0;
    padding: 4px 8px;
    font-size: 13px;
    cursor: pointer;
  }
  select option {
    background: #0f172a;
    color: #e2e8f0;
  }
</style>
