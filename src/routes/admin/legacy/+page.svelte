<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { ArrowLeft, Search, Database, X } from "lucide-svelte";
  import { m } from "$lib/paraglide/messages";

  interface LegacyPerson {
    id: string;
    first_name: string;
    last_name: string;
    level: number | null;
    bio: string | null;
    image_url: string | null;
  }
  interface LegacyRel {
    id: string;
    name: string;
    type: string;
  }

  let exists = $state(false);
  let counts = $state({ people: 0, relationships: 0, links: 0 });
  let people = $state<LegacyPerson[]>([]);
  let loading = $state(true);
  let query = $state("");
  let selected = $state<LegacyPerson | null>(null);
  let relations = $state<{ parrains: LegacyRel[]; fillots: LegacyRel[] }>({
    parrains: [],
    fillots: [],
  });

  let searchTimer: ReturnType<typeof setTimeout> | undefined;

  onMount(load);

  async function load() {
    loading = true;
    try {
      const res = await fetch(
        `/api/admin/legacy?q=${encodeURIComponent(query)}`,
      );
      if (res.ok) {
        const data = await res.json();
        exists = data.exists;
        counts = data.counts;
        people = data.people;
      }
    } finally {
      loading = false;
    }
  }

  function onSearch() {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(load, 250);
  }

  async function openPerson(p: LegacyPerson) {
    selected = p;
    relations = { parrains: [], fillots: [] };
    const res = await fetch(`/api/admin/legacy?id=${encodeURIComponent(p.id)}`);
    if (res.ok) {
      relations = (await res.json()).relations;
    }
  }
</script>

<svelte:head>
  <title>{m.legacy_page_title()}</title>
</svelte:head>

<div class="legacy">
  <header>
    <button class="btn-back" onclick={() => goto("/admin")}>
      <ArrowLeft size={18} /> {m.common_back()}
    </button>
    <h1>{m.legacy_heading()} <span class="ro">{m.legacy_readonly()}</span></h1>
    <div class="counts">
      <Database size={16} />
      {m.legacy_counts({
        people: counts.people,
        relationships: counts.relationships,
        links: counts.links,
      })}
    </div>
  </header>

  {#if !exists}
    <p class="empty">
      {m.legacy_empty_before()}<code>sky-legacy.db</code>{m.legacy_empty_after()}
    </p>
  {:else}
    <div class="search">
      <Search size={18} />
      <input
        placeholder={m.legacy_search_placeholder()}
        bind:value={query}
        oninput={onSearch}
      />
    </div>

    <div class="grid">
      <div class="list">
        {#if loading}
          <div class="muted">{m.common_loading()}</div>
        {:else}
          <table>
            <thead>
              <tr
                ><th>{m.common_lastname()}</th><th>{m.common_firstname()}</th><th
                  >{m.admin_people_col_promo()}</th
                ></tr
              >
            </thead>
            <tbody>
              {#each people as p (p.id)}
                <tr
                  class:active={selected?.id === p.id}
                  onclick={() => openPerson(p)}
                >
                  <td>{p.last_name}</td>
                  <td>{p.first_name}</td>
                  <td>{p.level ?? "-"}</td>
                </tr>
              {/each}
            </tbody>
          </table>
          <div class="muted foot">
            {m.legacy_results({ count: people.length })}
          </div>
        {/if}
      </div>

      {#if selected}
        <aside class="detail">
          <button class="btn-close" onclick={() => (selected = null)}>
            <X size={18} />
          </button>
          <h2>{selected.last_name} {selected.first_name}</h2>
          <div class="muted mono">{selected.id}</div>
          <div class="muted">
            {m.common_promo({ level: selected.level ?? "-" })}
          </div>
          {#if selected.bio}
            <p class="bio">{selected.bio}</p>
          {/if}

          <h3>{m.legacy_sponsors()}</h3>
          {#if relations.parrains.length === 0}
            <div class="muted">{m.legacy_none()}</div>
          {:else}
            {#each relations.parrains as r}
              <div class="rel">
                <span class="badge {r.type}">{r.type}</span>
                {r.name}
              </div>
            {/each}
          {/if}

          <h3>{m.legacy_godchildren()}</h3>
          {#if relations.fillots.length === 0}
            <div class="muted">{m.legacy_none()}</div>
          {:else}
            {#each relations.fillots as r}
              <div class="rel">
                <span class="badge {r.type}">{r.type}</span>
                {r.name}
              </div>
            {/each}
          {/if}
        </aside>
      {/if}
    </div>
  {/if}
</div>

<style>
  .legacy {
    min-height: 100vh;
    background: #05070a;
    color: #e2e8f0;
    padding: 24px clamp(16px, 4vw, 48px);
  }
  header {
    display: flex;
    align-items: center;
    gap: 16px;
    flex-wrap: wrap;
    margin-bottom: 20px;
  }
  h1 {
    font-size: 22px;
    margin: 0;
    flex: 1;
  }
  .ro {
    font-size: 12px;
    color: #f59e0b;
    border: 1px solid #f59e0b55;
    border-radius: 999px;
    padding: 2px 10px;
    vertical-align: middle;
  }
  .counts {
    display: flex;
    align-items: center;
    gap: 8px;
    color: #94a3b8;
    font-size: 13px;
  }
  .btn-back {
    display: flex;
    align-items: center;
    gap: 6px;
    background: transparent;
    border: none;
    color: #94a3b8;
    cursor: pointer;
  }
  .btn-back:hover {
    color: #fff;
  }
  .search {
    display: flex;
    align-items: center;
    gap: 10px;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 10px;
    padding: 10px 14px;
    margin-bottom: 16px;
  }
  .search input {
    flex: 1;
    background: transparent;
    border: none;
    color: #fff;
    outline: none;
    font-size: 15px;
  }
  .grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 20px;
  }
  @media (min-width: 900px) {
    .grid {
      grid-template-columns: 1fr 360px;
    }
  }
  .list {
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 12px;
    overflow: hidden;
  }
  table {
    width: 100%;
    border-collapse: collapse;
  }
  th {
    text-align: left;
    padding: 12px 16px;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 1px;
    color: #94a3b8;
  }
  td {
    padding: 12px 16px;
    border-top: 1px solid rgba(255, 255, 255, 0.05);
  }
  tbody tr {
    cursor: pointer;
  }
  tbody tr:hover {
    background: rgba(255, 255, 255, 0.05);
  }
  tbody tr.active {
    background: rgba(59, 130, 246, 0.15);
  }
  .detail {
    position: relative;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 12px;
    padding: 20px;
    height: fit-content;
  }
  .detail h2 {
    margin: 0 0 4px;
    font-size: 18px;
  }
  .detail h3 {
    margin: 18px 0 8px;
    font-size: 13px;
    text-transform: uppercase;
    letter-spacing: 1px;
    color: #94a3b8;
  }
  .btn-close {
    position: absolute;
    top: 14px;
    right: 14px;
    background: transparent;
    border: none;
    color: #94a3b8;
    cursor: pointer;
  }
  .bio {
    color: #cbd5e1;
    line-height: 1.5;
    margin: 12px 0;
  }
  .rel {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 0;
  }
  .badge {
    font-size: 10px;
    text-transform: uppercase;
    border-radius: 999px;
    padding: 2px 8px;
  }
  .badge.parrainage {
    background: rgba(59, 130, 246, 0.2);
    color: #93c5fd;
  }
  .badge.adoption {
    background: rgba(168, 85, 247, 0.2);
    color: #d8b4fe;
  }
  .muted {
    color: #94a3b8;
    font-size: 13px;
  }
  .foot {
    padding: 10px 16px;
  }
  .mono {
    font-family: "Courier New", monospace;
  }
  .empty {
    color: #94a3b8;
  }
  code {
    background: rgba(255, 255, 255, 0.08);
    padding: 1px 6px;
    border-radius: 4px;
  }
</style>
