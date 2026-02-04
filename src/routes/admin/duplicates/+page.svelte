<script lang="ts">
  import { page } from '$app/stores';
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
  <title>Administration - Fusion de doublons</title>
</svelte:head>

<div class="admin-merge">
  <div class="header-nav">
    <button class="back-btn" onclick={() => goto("/admin")}>
      <ArrowLeft size={20} />
      <span>Retour à l'admin</span>
    </button>
  </div>
  <h1>Fusion de doublons</h1>

  <div class="cols">
    <div class="col">
      <h2>Source (sera SUPPRIMÉ)</h2>
      <input type="text" placeholder="Rechercher..." bind:value={searchTerm1} />
      {#if selectedSource}
        <div class="selected card danger">
          <h3>{selectedSource.prenom} {selectedSource.nom}</h3>
          <p>{selectedSource.id}</p>
          <button class="link-btn" onclick={() => (selectedSource = null)}
            >Annuler</button
          >
        </div>
      {:else}
        <ul class="results">
          {#each results1 as p}
            <li>
              <button onclick={() => (selectedSource = p)}
                >{p.prenom} {p.nom} ({p.id})</button
              >
            </li>
          {/each}
        </ul>
      {/if}
    </div>

    <div class="col arrow">
      <ArrowRight size={40} />
    </div>

    <div class="col">
      <h2>Cible (sera CONSERVÉ)</h2>
      <input type="text" placeholder="Rechercher..." bind:value={searchTerm2} />
      {#if selectedTarget}
        <div class="selected card success">
          <h3>{selectedTarget.prenom} {selectedTarget.nom}</h3>
          <p>{selectedTarget.id}</p>
          <button class="link-btn" onclick={() => (selectedTarget = null)}
            >Annuler</button
          >
        </div>
      {:else}
        <ul class="results">
          {#each results2 as p}
            <li>
              <button onclick={() => (selectedTarget = p)}
                >{p.prenom} {p.nom} ({p.id})</button
              >
            </li>
          {/each}
        </ul>
      {/if}
    </div>
  </div>

  <div class="actions">
    {#if errorMsg}<p class="error">{errorMsg}</p>{/if}
    {#if successMsg}<p class="success">{successMsg}</p>{/if}

    <button
      class="merge-btn"
      disabled={!selectedSource ||
        !selectedTarget ||
        loading ||
        selectedSource.id === selectedTarget.id}
      onclick={performMerge}
    >
      {loading ? "Fusion en cours..." : "Fusionner"}
    </button>
  </div>
</div>

<style>
  .header-nav {
    margin-bottom: 2rem;
  }

  .back-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem 1.25rem;
    background: var(--bg-elevated);
    border: 1px solid var(--border-color);
    border-radius: 8px;
    color: var(--text-primary);
    cursor: pointer;
    font-size: 0.95rem;
    transition: all 0.2s;
  }

  .back-btn:hover {
    background: var(--bg-hover);
    border-color: var(--primary);
    color: var(--primary);
  }

  .admin-merge {
    padding: 40px;
    color: white;
    max-width: 1200px;
    margin: 0 auto;
  }
  .cols {
    display: flex;
    gap: 20px;
    align-items: flex-start;
    margin-top: 40px;
  }
  .col {
    flex: 1;
    background: rgba(255, 255, 255, 0.05);
    padding: 20px;
    border-radius: 8px;
  }
  .arrow {
    flex: 0 0 50px;
    font-size: 40px;
    display: flex;
    justify-content: center;
    align-self: center;
    background: none;
  }
  input {
    width: 100%;
    padding: 10px;
    margin-bottom: 10px;
    border-radius: 4px;
    border: 1px solid #444;
    background: #222;
    color: white;
  }
  .results {
    list-style: none;
    padding: 0;
    margin: 0;
    max-height: 300px;
    overflow-y: auto;
  }
  .results li button {
    width: 100%;
    text-align: left;
    padding: 10px;
    background: none;
    border: none;
    color: white;
    cursor: pointer;
    border-bottom: 1px solid #333;
  }
  .results li button:hover {
    background: rgba(255, 255, 255, 0.1);
  }
  .card {
    padding: 15px;
    border-radius: 5px;
    text-align: center;
  }
  .danger {
    background: rgba(255, 0, 0, 0.2);
    border: 1px solid red;
  }
  .success {
    background: rgba(0, 255, 0, 0.2);
    border: 1px solid green;
  }
  .actions {
    margin-top: 40px;
    text-align: center;
  }
  .error {
    color: #ff6b6b;
    margin-bottom: 10px;
  }
  .success {
    color: #51cf66;
    margin-bottom: 10px;
  }
  .link-btn {
    background: none;
    border: none;
    color: #aaa;
    text-decoration: underline;
    cursor: pointer;
    margin-top: 10px;
  }

  .merge-btn {
    padding: 12px 32px;
    background: var(--primary);
    color: white;
    border: none;
    border-radius: 8px;
    font-size: 1rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
  }

  .merge-btn:hover:not(:disabled) {
    background: var(--primary-hover);
    transform: translateY(-1px);
  }

  .merge-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
