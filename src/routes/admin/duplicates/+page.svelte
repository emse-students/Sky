<script lang="ts">
  import { onMount } from "svelte";
  import { fade } from "svelte/transition";
  import { page } from "$app/stores";
  import { goto } from "$app/navigation";
  import { ArrowLeft, ArrowRight } from "lucide-svelte";

  let user = $derived($page.data.user);

  let searchTerm1 = $state("");
  let searchTerm2 = $state("");
  let results1: any[] = $state([]);
  let results2: any[] = $state([]);

  let selectedSource: any = $state(null);
  let selectedTarget: any = $state(null);

  let loading = $state(false);
  let successMsg = $state("");
  let errorMsg = $state("");

  $effect(() => {
    if (searchTerm1.length >= 2) {
      search(searchTerm1, "results1");
    } else {
      results1 = [];
    }
  });

  $effect(() => {
    if (searchTerm2.length >= 2) {
      search(searchTerm2, "results2");
    } else {
      results2 = [];
    }
  });

  async function search(term: string, targetResults: "results1" | "results2") {
    if (term.length < 2) {
      if (targetResults === "results1") results1 = [];
      else results2 = [];
      return;
    }
    const res = await fetch(`/api/search?q=${encodeURIComponent(term)}`);
    const data = await res.json();
    if (targetResults === "results1") results1 = data.results;
    else results2 = data.results;
  }

  async function performMerge() {
    if (!selectedSource || !selectedTarget) return;
    if (
      !confirm(
        `Êtes-vous sûr de vouloir fusionner ${selectedSource.prenom} ${selectedSource.nom} (SUPPRIMÉ) DANS ${selectedTarget.prenom} ${selectedTarget.nom} (CONSERVÉ) ?`,
      )
    )
      return;

    loading = true;
    errorMsg = "";
    successMsg = "";

    try {
      const res = await fetch("/api/admin/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceId: selectedSource.id,
          targetId: selectedTarget.id,
        }),
      });

      if (res.ok) {
        successMsg = "Fusion réussie !";
        selectedSource = null;
        selectedTarget = null;
        searchTerm1 = "";
        searchTerm2 = "";
        results1 = [];
        results2 = [];
      } else {
        const data = await res.json();
        errorMsg = data.error || "Erreur inconnue";
      }
    } catch (e) {
      errorMsg = "Erreur réseau";
    } finally {
      loading = false;
    }
  }
</script>

<svelte:head>
  <title>Fusion de doublons — Admin</title>
</svelte:head>

<div class="admin-layout">
  <header class="admin-header">
    <button class="btn-back" onclick={() => goto("/admin")}>
      <ArrowLeft size={20} />
      <span>Retour</span>
    </button>
    <h1>Fusion de doublons</h1>
    <div style="width: 86px"></div>
    <!-- Spacer for alignment -->
  </header>

  <div class="admin-content">
    <div class="merge-grid">
      <!-- Source Column -->
      <div class="merge-col source">
        <div class="col-header">
          <h2>Source</h2>
          <span class="badge danger">Sera supprimé</span>
        </div>

        <div class="search-box">
          <input
            type="text"
            placeholder="Rechercher la source..."
            bind:value={searchTerm1}
          />
        </div>

        {#if selectedSource}
          <div class="selected-card danger" transition:fade>
            <div class="card-content">
              <h3>{selectedSource.prenom} {selectedSource.nom}</h3>
              <p class="mono">{selectedSource.id}</p>
            </div>
            <button class="btn-remove" onclick={() => (selectedSource = null)}>
              Changer
            </button>
          </div>
        {:else if results1.length > 0}
          <div class="results-list">
            {#each results1 as p}
              <button class="result-item" onclick={() => (selectedSource = p)}>
                <span class="name">{p.prenom} {p.nom}</span>
                <span class="id">{p.id}</span>
              </button>
            {/each}
          </div>
        {/if}
      </div>

      <!-- Arrow -->
      <div class="merge-arrow">
        <div class="arrow-icon">
          <ArrowRight size={24} />
        </div>
      </div>

      <!-- Target Column -->
      <div class="merge-col target">
        <div class="col-header">
          <h2>Cible</h2>
          <span class="badge success">Sera conservé</span>
        </div>

        <div class="search-box">
          <input
            type="text"
            placeholder="Rechercher la cible..."
            bind:value={searchTerm2}
          />
        </div>

        {#if selectedTarget}
          <div class="selected-card success" transition:fade>
            <div class="card-content">
              <h3>{selectedTarget.prenom} {selectedTarget.nom}</h3>
              <p class="mono">{selectedTarget.id}</p>
            </div>
            <button class="btn-remove" onclick={() => (selectedTarget = null)}>
              Changer
            </button>
          </div>
        {:else if results2.length > 0}
          <div class="results-list">
            {#each results2 as p}
              <button class="result-item" onclick={() => (selectedTarget = p)}>
                <span class="name">{p.prenom} {p.nom}</span>
                <span class="id">{p.id}</span>
              </button>
            {/each}
          </div>
        {/if}
      </div>
    </div>

    <div class="actions-footer">
      {#if errorMsg}
        <div class="message error" transition:fade>{errorMsg}</div>
      {/if}
      {#if successMsg}
        <div class="message success" transition:fade>{successMsg}</div>
      {/if}

      <button
        class="btn-merge"
        disabled={!selectedSource ||
          !selectedTarget ||
          loading ||
          selectedSource.id === selectedTarget.id}
        onclick={performMerge}
      >
        {#if loading}
          Fusion en cours...
        {:else}
          Confirmer la fusion
        {/if}
      </button>
    </div>
  </div>
</div>

<style>
  .admin-layout {
    min-height: 100vh;
    background: #05070a;
    color: #f8fafc;
  }

  .admin-header {
    position: sticky;
    top: 0;
    background: rgba(10, 15, 25, 0.95);
    backdrop-filter: blur(12px);
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    padding: 20px 40px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    z-index: 100;
  }

  .admin-header h1 {
    margin: 0;
    font-size: 20px;
  }

  .btn-back {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 16px;
    background: transparent;
    border: none;
    color: #94a3b8;
    cursor: pointer;
    border-radius: 8px;
    transition: all 0.2s;
  }

  .btn-back:hover {
    color: white;
    background: rgba(255, 255, 255, 0.05);
  }

  .admin-content {
    max-width: 1200px;
    margin: 0 auto;
    padding: 40px;
  }

  .merge-grid {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    gap: 40px;
    align-items: flex-start;
  }

  .merge-col {
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 12px;
    padding: 24px;
    min-height: 400px;
  }

  .col-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 20px;
  }

  .col-header h2 {
    margin: 0;
    font-size: 16px;
    color: #94a3b8;
  }

  .badge {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    padding: 4px 8px;
    border-radius: 4px;
    font-weight: 600;
  }

  .badge.danger {
    background: rgba(239, 68, 68, 0.2);
    color: #ef4444;
  }

  .badge.success {
    background: rgba(34, 197, 94, 0.2);
    color: #22c55e;
  }

  .search-box input {
    width: 100%;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px;
    padding: 12px;
    color: white;
    outline: none;
    margin-bottom: 20px;
    transition: border-color 0.2s;
  }

  .search-box input:focus {
    border-color: #3b82f6;
  }

  .results-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
    max-height: 300px;
    overflow-y: auto;
  }

  .result-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    width: 100%;
    padding: 12px;
    background: rgba(255, 255, 255, 0.02);
    border: 1px solid rgba(255, 255, 255, 0.05);
    border-radius: 8px;
    color: white;
    cursor: pointer;
    transition: all 0.2s;
  }

  .result-item:hover {
    background: rgba(255, 255, 255, 0.08);
  }

  .result-item .name {
    font-weight: 500;
  }

  .result-item .id {
    font-size: 12px;
    color: #64748b;
    font-family: monospace;
  }

  .selected-card {
    padding: 20px;
    border-radius: 8px;
    text-align: center;
    border: 1px solid;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16px;
  }

  .selected-card.danger {
    background: rgba(239, 68, 68, 0.05);
    border-color: rgba(239, 68, 68, 0.3);
  }

  .selected-card.success {
    background: rgba(34, 197, 94, 0.05);
    border-color: rgba(34, 197, 94, 0.3);
  }

  .card-content h3 {
    margin: 0 0 4px;
    font-size: 18px;
  }

  .card-content p {
    margin: 0;
    color: #94a3b8;
    font-size: 13px;
  }

  .btn-remove {
    background: transparent;
    border: 1px solid rgba(255, 255, 255, 0.2);
    color: #94a3b8;
    padding: 6px 12px;
    border-radius: 6px;
    font-size: 12px;
    cursor: pointer;
    transition: all 0.2s;
  }

  .btn-remove:hover {
    background: rgba(255, 255, 255, 0.1);
    color: white;
  }

  .merge-arrow {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100px;
    color: #64748b;
  }

  .arrow-icon {
    width: 48px;
    height: 48px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.05);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .actions-footer {
    margin-top: 40px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 20px;
  }

  .message {
    padding: 12px 24px;
    border-radius: 8px;
    font-weight: 500;
  }

  .message.error {
    background: rgba(239, 68, 68, 0.1);
    color: #ef4444;
  }

  .message.success {
    background: rgba(34, 197, 94, 0.1);
    color: #22c55e;
  }

  .btn-merge {
    background: #3b82f6;
    color: white;
    border: none;
    padding: 16px 48px;
    border-radius: 99px;
    font-size: 16px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
    box-shadow: 0 4px 20px rgba(59, 130, 246, 0.3);
  }

  .btn-merge:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: 0 6px 25px rgba(59, 130, 246, 0.4);
  }

  .btn-merge:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    box-shadow: none;
  }
</style>
