<script lang="ts">
  import Button from '$lib/components/Button.svelte';

  let searchTerm1 = "";
  let searchTerm2 = "";
  let results1: any[] = [];
  let results2: any[] = [];
  
  let selectedSource: any = null;
  let selectedTarget: any = null;
  
  let loading = false;
  let successMsg = "";
  let errorMsg = "";

  async function search(term: string, targetResults: 'results1' | 'results2') {
    if (term.length < 2) {
        if (targetResults === 'results1') results1 = [];
        else results2 = [];
        return;
    }
    const res = await fetch(`/api/search?q=${encodeURIComponent(term)}`);
    const data = await res.json();
    if (targetResults === 'results1') results1 = data.results;
    else results2 = data.results;
  }

  async function performMerge() {
    if (!selectedSource || !selectedTarget) return;
    if (!confirm(`Êtes-vous sûr de vouloir fusionner ${selectedSource.prenom} ${selectedSource.nom} (SUPPRIMÉ) DANS ${selectedTarget.prenom} ${selectedTarget.nom} (CONSERVÉ) ?`)) return;

    loading = true;
    errorMsg = "";
    successMsg = "";

    try {
        const res = await fetch('/api/admin/merge', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                sourceId: selectedSource.id,
                targetId: selectedTarget.id
            })
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
    <h1>Fusion de doublons</h1>
    
    <div class="cols">
        <div class="col">
            <h2>Source (sera SUPPRIMÉ)</h2>
            <input type="text" placeholder="Rechercher..." bind:value={searchTerm1} on:input={() => search(searchTerm1, 'results1')} />
            {#if selectedSource}
                <div class="selected card danger">
                    <h3>{selectedSource.prenom} {selectedSource.nom}</h3>
                    <p>{selectedSource.id}</p>
                    <button class="link-btn" on:click={() => selectedSource = null}>Annuler</button>
                </div>
            {:else}
                <ul class="results">
                    {#each results1 as p}
                        <li>
                            <button on:click={() => selectedSource = p}>{p.prenom} {p.nom} ({p.id})</button>
                        </li>
                    {/each}
                </ul>
            {/if}
        </div>

        <div class="col arrow">
            ➡️
        </div>

        <div class="col">
            <h2>Cible (sera CONSERVÉ)</h2>
            <input type="text" placeholder="Rechercher..." bind:value={searchTerm2} on:input={() => search(searchTerm2, 'results2')} />
            {#if selectedTarget}
                <div class="selected card success">
                    <h3>{selectedTarget.prenom} {selectedTarget.nom}</h3>
                    <p>{selectedTarget.id}</p>
                    <button class="link-btn" on:click={() => selectedTarget = null}>Annuler</button>
                </div>
            {:else}
                <ul class="results">
                    {#each results2 as p}
                        <li>
                            <button on:click={() => selectedTarget = p}>{p.prenom} {p.nom} ({p.id})</button>
                        </li>
                    {/each}
                </ul>
            {/if}
        </div>
    </div>

    <div class="actions">
        {#if errorMsg}<p class="error">{errorMsg}</p>{/if}
        {#if successMsg}<p class="success">{successMsg}</p>{/if}
        
        <Button 
            disabled={!selectedSource || !selectedTarget || loading || selectedSource.id === selectedTarget.id} 
            loading={loading}
            on:click={performMerge}
        >
            Fusionner
        </Button>
    </div>
</div>

<style>
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
        background: rgba(255,255,255,0.05);
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
        background: rgba(255,255,255,0.1);
    }
    .card {
        padding: 15px;
        border-radius: 5px;
        text-align: center;
    }
    .danger { background: rgba(255, 0, 0, 0.2); border: 1px solid red; }
    .success { background: rgba(0, 255, 0, 0.2); border: 1px solid green; }
    .actions {
        margin-top: 40px;
        text-align: center;
    }
    .error { color: #ff6b6b; margin-bottom: 10px; }
    .success { color: #51cf66; margin-bottom: 10px; }
    .link-btn {
        background: none;
        border: none;
        color: #aaa;
        text-decoration: underline;
        cursor: pointer;
        margin-top: 10px;
    }
</style>
