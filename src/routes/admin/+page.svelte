<script lang="ts">
  import { onMount } from "svelte";
  import { page } from "$app/stores";
  import { goto } from "$app/navigation";
  import {
    Users,
    Link2,
    Download,
    Upload,
    Archive,
    AlertCircle,
    ChevronRight,
    RefreshCw,
    GitMerge,
  } from "lucide-svelte";
  import { confirmDialog } from "$lib/stores/dialogStore";
  import { m } from "$lib/paraglide/messages";
  import { formatPromoShort } from "$lib/utils/format";

  type SuggPerson = {
    id: string;
    prenom: string;
    nom: string;
    level: number | null;
    linked: boolean;
  };
  type Suggestion = { a: SuggPerson; b: SuggPerson; distance: number };

  let stats = $state({ people: 0, relationships: 0 });
  let message = $state("");
  let messageType: "success" | "error" | "" = $state("");
  let busy = $state(false);
  let suggestions = $state<Suggestion[]>([]);
  let suggBusy = $state(false);

  let user = $derived($page.data.user);
  let isAdmin = $derived(user?.role === "admin");

  onMount(() => {
    if (isAdmin) {
      loadStats();
      loadSuggestions();
    }
  });

  /** Load the near-duplicate merge suggestions. */
  async function loadSuggestions() {
    try {
      const res = await fetch("/api/admin/merge/suggestions");
      if (res.ok) {
        const d = await res.json();
        suggestions = d.suggestions ?? [];
      }
    } catch (e) {
      console.error("[Admin] suggestions error", e);
    }
  }

  /** Merge a suggested pair (the linked fiche survives; see /api/admin/merge). */
  async function mergePair(s: Suggestion) {
    suggBusy = true;
    try {
      const res = await fetch("/api/admin/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceId: s.a.id, targetId: s.b.id }),
      });
      if (res.ok) {
        await Promise.all([loadSuggestions(), loadStats()]);
      } else {
        const d = await res.json().catch(() => ({}));
        flash(d.error || m.admin_merge_failed(), "error");
      }
    } finally {
      suggBusy = false;
    }
  }

  /** Dismiss a suggested pair so it stops being proposed. */
  async function ignorePair(s: Suggestion) {
    suggBusy = true;
    try {
      const res = await fetch("/api/admin/merge/suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aId: s.a.id, bId: s.b.id }),
      });
      if (res.ok) {
        suggestions = suggestions.filter(
          (x) => !(x.a.id === s.a.id && x.b.id === s.b.id),
        );
      }
    } finally {
      suggBusy = false;
    }
  }

  /** Ignore every currently listed suggestion. */
  async function ignoreAll() {
    if (
      !(await confirmDialog(
        m.admin_ignore_all_confirm({ count: suggestions.length }),
      ))
    )
      return;
    suggBusy = true;
    try {
      for (const s of [...suggestions]) {
        await fetch("/api/admin/merge/suggestions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ aId: s.a.id, bId: s.b.id }),
        });
      }
      suggestions = [];
    } finally {
      suggBusy = false;
    }
  }

  /** Merge every currently listed pair (skips ones that became invalid). */
  async function mergeAll() {
    if (
      !(await confirmDialog(
        m.admin_merge_all_confirm({ count: suggestions.length }),
      ))
    ) {
      return;
    }
    suggBusy = true;
    try {
      for (const s of [...suggestions]) {
        await fetch("/api/admin/merge", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sourceId: s.a.id, targetId: s.b.id }),
        }).catch(() => {});
      }
      await Promise.all([loadSuggestions(), loadStats()]);
    } finally {
      suggBusy = false;
    }
  }

  /** Load the counters (people, godparent links). */
  async function loadStats() {
    try {
      const [peopleRes, relRes] = await Promise.all([
        fetch("/api/admin/people"),
        fetch("/api/relationships"),
      ]);
      if (peopleRes.ok) {
        const people = await peopleRes.json();
        stats.people = Array.isArray(people) ? people.length : 0;
      }
      if (relRes.ok) {
        const rels = await relRes.json();
        stats.relationships = Array.isArray(rels) ? rels.length : 0;
      }
    } catch (e) {
      console.error("[Admin] stats error", e);
    }
  }

  function flash(msg: string, type: "success" | "error") {
    message = msg;
    messageType = type;
    setTimeout(() => (message = ""), 4000);
  }

  async function exportDatabase() {
    busy = true;
    try {
      const res = await fetch("/api/admin/export");
      if (!res.ok) throw new Error("export");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `sky-backup-${new Date().toISOString().split("T")[0]}.db`;
      a.click();
      URL.revokeObjectURL(url);
      flash(m.admin_export_done(), "success");
    } catch {
      flash(m.admin_export_failed(), "error");
    } finally {
      busy = false;
    }
  }

  /**
   * Manually recompute the star positions and surface the outcome, so a failing
   * layout (e.g. a crash in the layout computation) is visible instead of silent.
   */
  async function recalcPositions() {
    busy = true;
    try {
      const res = await fetch("/api/admin/positions/recalc", {
        method: "POST",
      });
      const data = await res.json();
      if (res.ok && data.success) {
        flash(
          m.admin_positions_done({
            positioned: data.positioned,
            total: data.total,
          }),
          "success",
        );
      } else {
        flash(
          m.admin_positions_failed({
            error: data.error ?? m.admin_recalc_unknown_error(),
          }),
          "error",
        );
      }
    } catch (e) {
      flash(m.admin_positions_failed_generic(), "error");
      console.error("[Admin] recalc positions error", e);
    } finally {
      busy = false;
    }
  }

  async function importDatabase(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    if (!(await confirmDialog(m.admin_import_confirm(), { danger: true }))) {
      input.value = "";
      return;
    }
    busy = true;
    try {
      const formData = new FormData();
      formData.append("database", file);
      const res = await fetch("/api/admin/import", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) throw new Error("import");
      flash(m.admin_import_done(), "success");
      setTimeout(() => window.location.reload(), 1200);
    } catch {
      flash(m.admin_import_failed(), "error");
    } finally {
      busy = false;
      input.value = "";
    }
  }
</script>

<svelte:head>
  <title>{m.admin_page_title()}</title>
</svelte:head>

{#if !isAdmin}
  <div class="denied">
    <AlertCircle size={48} />
    <h1>{m.admin_denied_title()}</h1>
    <p>{m.admin_denied_body()}</p>
  </div>
{:else}
  <div class="admin">
    <header>
      <h1>{m.admin_heading()}</h1>
      <p>{m.admin_subtitle()}</p>
    </header>

    {#if message}
      <div class="flash {messageType}">{message}</div>
    {/if}

    {#if suggestions.length > 0}
      <section class="suggestions">
        <div class="sugg-head">
          <h2>
            <GitMerge size={18} />
            {m.admin_suggestions_title({ count: suggestions.length })}
          </h2>
          <div class="sugg-bulk">
            <button class="sugg-btn ignore" disabled={suggBusy} onclick={ignoreAll}
              >{m.admin_ignore_all()}</button
            >
            <button class="sugg-btn merge" disabled={suggBusy} onclick={mergeAll}
              >{m.admin_merge_all()}</button
            >
          </div>
        </div>
        <p class="sugg-sub">
          {m.admin_suggestions_sub()}
        </p>
        <ul class="sugg-list">
          {#each suggestions as s (s.a.id + "|" + s.b.id)}
            <li class="sugg-item">
              <div class="sugg-pair">
                <span class="sugg-name"
                  >{s.a.nom.toUpperCase()} {s.a.prenom}
                  <small
                    >{formatPromoShort(s.a.level)}{s.a.linked
                      ? ` · ${m.admin_sugg_account()}`
                      : ""}</small
                  ></span
                >
                <span class="sugg-vs">↔</span>
                <span class="sugg-name"
                  >{s.b.nom.toUpperCase()} {s.b.prenom}
                  <small
                    >{formatPromoShort(s.b.level)}{s.b.linked
                      ? ` · ${m.admin_sugg_account()}`
                      : ""}</small
                  ></span
                >
                <span class="sugg-dist"
                  >{s.distance === 0
                    ? m.admin_sugg_identical()
                    : m.admin_sugg_distance({ distance: s.distance })}</span
                >
              </div>
              <div class="sugg-actions">
                <button
                  class="sugg-btn ignore"
                  disabled={suggBusy}
                  onclick={() => ignorePair(s)}>{m.admin_ignore()}</button
                >
                <button
                  class="sugg-btn merge"
                  disabled={suggBusy}
                  onclick={() => mergePair(s)}
                >
                  <GitMerge size={14} />
                  {m.admin_merge()}
                </button>
              </div>
            </li>
          {/each}
        </ul>
      </section>
    {/if}

    <div class="stats">
      <div class="stat">
        <Users size={28} />
        <div>
          <div class="num">{stats.people}</div>
          <div class="lbl">{m.admin_stat_people()}</div>
        </div>
      </div>
      <div class="stat">
        <Link2 size={28} />
        <div>
          <div class="num">{stats.relationships}</div>
          <div class="lbl">{m.admin_stat_relationships()}</div>
        </div>
      </div>
    </div>

    <!-- Main action -->
    <button class="primary-card" onclick={() => goto("/admin/people")}>
      <Users size={28} />
      <div class="pc-text">
        <span class="pc-title">{m.admin_manage_people()}</span>
        <span class="pc-sub">{m.admin_manage_people_sub()}</span>
      </div>
      <ChevronRight size={22} />
    </button>

    <!-- Advanced tools -->
    <h2 class="section">{m.admin_advanced_tools()}</h2>
    <div class="tools">
      <div class="tool">
        <h3><Download size={18} /> {m.admin_export()}</h3>
        <p>{m.admin_export_desc()}</p>
        <button class="btn" disabled={busy} onclick={exportDatabase}
          >{m.admin_export()}</button
        >
      </div>
      <div class="tool">
        <h3><Upload size={18} /> {m.admin_import()}</h3>
        <p>{m.admin_import_desc()}</p>
        <label class="btn" class:disabled={busy}>
          {m.admin_choose_file()}
          <input
            type="file"
            accept=".db,.sqlite,.sqlite3"
            onchange={importDatabase}
            disabled={busy}
            hidden
          />
        </label>
      </div>
      <div class="tool">
        <h3><Archive size={18} /> {m.admin_legacy()}</h3>
        <p>{m.admin_legacy_desc()}</p>
        <button class="btn" onclick={() => goto("/admin/legacy")}
          >{m.admin_consult()}</button
        >
      </div>
      <div class="tool">
        <h3><RefreshCw size={18} /> {m.admin_positions()}</h3>
        <p>{m.admin_positions_desc()}</p>
        <button class="btn" disabled={busy} onclick={recalcPositions}
          >{m.admin_recalc()}</button
        >
      </div>
    </div>
  </div>
{/if}

<style>
  .denied {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 80vh;
    gap: 1rem;
    color: #94a3b8;
  }
  .admin {
    max-width: 1000px;
    margin: 0 auto;
    padding: 2.5rem 1.5rem;
    color: #f8fafc;
  }
  header h1 {
    font-size: 2rem;
    margin: 0 0 0.4rem;
  }
  header p {
    color: #94a3b8;
    margin: 0 0 2rem;
  }
  .flash {
    padding: 0.85rem 1.2rem;
    border-radius: 10px;
    margin-bottom: 1.5rem;
    font-weight: 500;
  }
  .flash.success {
    background: rgba(34, 197, 94, 0.12);
    color: #4ade80;
  }
  .flash.error {
    background: rgba(239, 68, 68, 0.12);
    color: #f87171;
  }
  .stats {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 1rem;
    margin-bottom: 2rem;
  }
  .stat {
    display: flex;
    align-items: center;
    gap: 1rem;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 14px;
    padding: 1.25rem 1.5rem;
  }
  .stat :global(svg) {
    color: #3b82f6;
  }
  .num {
    font-size: 1.8rem;
    font-weight: 700;
  }
  .lbl {
    color: #94a3b8;
    font-size: 0.85rem;
  }
  .primary-card {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 1.25rem;
    text-align: left;
    background: linear-gradient(135deg, rgba(59, 130, 246, 0.18), transparent);
    border: 1px solid rgba(59, 130, 246, 0.4);
    border-radius: 16px;
    padding: 1.5rem;
    color: #f8fafc;
    cursor: pointer;
    transition: border-color 0.2s;
  }
  .primary-card:hover {
    border-color: #3b82f6;
  }
  .primary-card :global(svg) {
    color: #3b82f6;
    flex-shrink: 0;
  }
  .pc-text {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .pc-title {
    font-size: 1.15rem;
    font-weight: 700;
  }
  .pc-sub {
    color: #94a3b8;
    font-size: 0.9rem;
  }
  .section {
    margin: 2.5rem 0 1rem;
    font-size: 0.85rem;
    text-transform: uppercase;
    letter-spacing: 1px;
    color: #64748b;
  }
  .tools {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
    gap: 1rem;
  }
  .tool {
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 14px;
    padding: 1.25rem;
  }
  .tool h3 {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin: 0 0 0.5rem;
    font-size: 1rem;
  }
  .tool p {
    color: #94a3b8;
    font-size: 0.85rem;
    margin: 0 0 1rem;
    min-height: 2.4em;
  }
  .btn {
    display: inline-block;
    text-align: center;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.12);
    color: #f8fafc;
    padding: 0.6rem 1rem;
    border-radius: 8px;
    font-weight: 600;
    cursor: pointer;
    width: 100%;
  }
  .btn:hover {
    background: rgba(255, 255, 255, 0.1);
  }
  .btn.disabled {
    opacity: 0.5;
    pointer-events: none;
  }

  /* Merge suggestions: amber-themed section, distinct from the rest. */
  .suggestions {
    margin-bottom: 24px;
    padding: 18px 20px;
    background: rgba(251, 191, 36, 0.06);
    border: 1px solid rgba(251, 191, 36, 0.3);
    border-radius: 14px;
  }
  .sugg-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
  }
  .sugg-head h2 {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0;
    font-size: 1.05rem;
    color: #fbbf24;
  }
  .sugg-bulk {
    display: flex;
    gap: 8px;
  }
  .sugg-sub {
    margin: 6px 0 14px;
    font-size: 0.85rem;
    color: #cbd5e1;
  }
  .sugg-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .sugg-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
    padding: 10px 12px;
    background: rgba(0, 0, 0, 0.25);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 10px;
  }
  .sugg-pair {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
    min-width: 0;
  }
  .sugg-name {
    font-weight: 600;
    color: #f8fafc;
  }
  .sugg-name small {
    margin-left: 4px;
    font-weight: 400;
    color: #94a3b8;
  }
  .sugg-vs {
    color: #fbbf24;
  }
  .sugg-dist {
    font-size: 0.75rem;
    padding: 2px 8px;
    border-radius: 99px;
    background: rgba(251, 191, 36, 0.15);
    color: #fbbf24;
  }
  .sugg-actions {
    display: flex;
    gap: 8px;
  }
  .sugg-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 8px 14px;
    border-radius: 8px;
    border: 1px solid transparent;
    cursor: pointer;
    font-weight: 600;
    font-size: 0.85rem;
  }
  .sugg-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .sugg-btn.ignore {
    background: transparent;
    border-color: rgba(255, 255, 255, 0.15);
    color: #94a3b8;
  }
  .sugg-btn.ignore:hover:not(:disabled) {
    color: white;
  }
  .sugg-btn.merge {
    background: #fbbf24;
    color: #1a1206;
  }
  .sugg-btn.merge:hover:not(:disabled) {
    background: #f59e0b;
  }
</style>
