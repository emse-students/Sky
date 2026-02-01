<script lang="ts">
  import { onMount } from "svelte";
  import { authStore } from "$stores/authStore";
  import {
    Database,
    Download,
    Upload,
    Users,
    Link2,
    AlertCircle,
  } from "lucide-svelte";

  let stats = { people: 0, relationships: 0, links: 0 };
  let loading = false;
  let message = "";
  let messageType: "success" | "error" | "" = "";

  $: user = $authStore.user;
  $: isAdmin = user?.email?.endsWith("@emse.fr") || false;

  onMount(async () => {
    if (!isAdmin) return;
    await loadStats();
  });

  async function loadStats() {
    try {
      const [peopleRes, relRes] = await Promise.all([
        fetch("/api/people"),
        fetch("/api/relationships"),
      ]);

      const people = await peopleRes.json();
      const relationships = await relRes.json();

      stats.people = people.length;
      stats.relationships = relationships.length;
      stats.links = people.reduce(
        (acc: number, p: any) =>
          acc + (p.links ? Object.keys(p.links).length : 0),
        0,
      );
    } catch (error) {
      console.error("Failed to load stats:", error);
    }
  }

  async function exportDatabase() {
    loading = true;
    message = "";
    try {
      const response = await fetch("/api/admin/export");
      if (!response.ok) throw new Error("Export failed");

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `sky-backup-${new Date().toISOString().split("T")[0]}.db`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      message = "Base de données exportée avec succès !";
      messageType = "success";
    } catch (error) {
      message = "Erreur lors de l'export";
      messageType = "error";
    } finally {
      loading = false;
    }
  }

  async function importDatabase(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    loading = true;
    message = "";

    try {
      const formData = new FormData();
      formData.append("database", file);

      const response = await fetch("/api/admin/import", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) throw new Error("Import failed");

      message = "Base de données importée avec succès ! Rechargement...";
      messageType = "success";

      setTimeout(() => {
        window.location.reload();
      }, 1500);
    } catch (error) {
      message = "Erreur lors de l'import";
      messageType = "error";
    } finally {
      loading = false;
      input.value = "";
    }
  }

  async function recalculatePositions() {
    loading = true;
    message = "";
    try {
      const response = await fetch("/api/admin/recalculate", {
        method: "POST",
      });
      if (!response.ok) throw new Error("Recalculation failed");

      message = "Recalcul des positions lancé en arrière-plan";
      messageType = "success";
    } catch (error) {
      message = "Erreur lors du recalcul";
      messageType = "error";
    } finally {
      loading = false;
    }
  }
</script>

{#if !isAdmin}
  <div class="unauthorized">
    <AlertCircle size={48} />
    <h1>Accès refusé</h1>
    <p>Vous devez être administrateur pour accéder à cette page.</p>
  </div>
{:else}
  <div class="admin-container">
    <header>
      <h1>Administration</h1>
      <p>Gestion de la base de données Sky</p>
    </header>

    <div class="stats-grid">
      <div class="stat-card">
        <Users size={32} />
        <div class="stat-content">
          <div class="stat-value">{stats.people}</div>
          <div class="stat-label">Personnes</div>
        </div>
      </div>

      <div class="stat-card">
        <Link2 size={32} />
        <div class="stat-content">
          <div class="stat-value">{stats.relationships}</div>
          <div class="stat-label">Relations</div>
        </div>
      </div>

      <div class="stat-card">
        <Database size={32} />
        <div class="stat-content">
          <div class="stat-value">{stats.links}</div>
          <div class="stat-label">Liens externes</div>
        </div>
      </div>
    </div>

    {#if message}
      <div class="message message-{messageType}">
        {message}
      </div>
    {/if}

    <div class="actions-grid">
      <div class="action-card">
        <h2><Download size={24} /> Exporter la base</h2>
        <p>
          Télécharger une copie complète de la base de données SQLite pour
          sauvegarde ou migration.
        </p>
        <button class="btn-primary" onclick={exportDatabase} disabled={loading}>
          {loading ? "Export en cours..." : "Exporter"}
        </button>
      </div>

      <div class="action-card">
        <h2><Upload size={24} /> Importer une base</h2>
        <p>
          Remplacer la base de données actuelle par un fichier de sauvegarde.
          Attention : opération irréversible !
        </p>
        <label class="btn-primary" class:disabled={loading}>
          {loading ? "Import en cours..." : "Choisir un fichier"}
          <input
            type="file"
            accept=".db,.sqlite,.sqlite3"
            onchange={importDatabase}
            disabled={loading}
            style="display: none;"
          />
        </label>
      </div>

      <div class="action-card">
        <h2><Database size={24} /> Recalculer les positions</h2>
        <p>
          Relancer l'algorithme de positionnement des nœuds du graphe (peut
          prendre ~30 secondes).
        </p>
        <button
          class="btn-secondary"
          onclick={recalculatePositions}
          disabled={loading}
        >
          {loading ? "Calcul en cours..." : "Recalculer"}
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .unauthorized {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 80vh;
    gap: 1.5rem;
    color: var(--text-secondary);
  }

  .unauthorized h1 {
    font-size: 2rem;
    font-weight: 700;
    color: var(--text-primary);
  }

  .admin-container {
    max-width: 1200px;
    margin: 0 auto;
    padding: 2rem;
  }

  header {
    margin-bottom: 3rem;
  }

  header h1 {
    font-size: 2.5rem;
    font-weight: 700;
    color: var(--text-primary);
    margin-bottom: 0.5rem;
  }

  header p {
    color: var(--text-secondary);
    font-size: 1.1rem;
  }

  .stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 1.5rem;
    margin-bottom: 2rem;
  }

  .stat-card {
    background: var(--bg-elevated);
    border: 1px solid var(--border-color);
    border-radius: 12px;
    padding: 1.5rem;
    display: flex;
    align-items: center;
    gap: 1rem;
  }

  .stat-card :global(svg) {
    color: var(--primary);
    flex-shrink: 0;
  }

  .stat-content {
    flex: 1;
  }

  .stat-value {
    font-size: 2rem;
    font-weight: 700;
    color: var(--text-primary);
  }

  .stat-label {
    color: var(--text-secondary);
    font-size: 0.9rem;
  }

  .message {
    padding: 1rem 1.5rem;
    border-radius: 8px;
    margin-bottom: 2rem;
    font-weight: 500;
  }

  .message-success {
    background: rgba(34, 197, 94, 0.1);
    color: #22c55e;
    border: 1px solid rgba(34, 197, 94, 0.3);
  }

  .message-error {
    background: rgba(239, 68, 68, 0.1);
    color: #ef4444;
    border: 1px solid rgba(239, 68, 68, 0.3);
  }

  .actions-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: 2rem;
  }

  .action-card {
    background: var(--bg-elevated);
    border: 1px solid var(--border-color);
    border-radius: 12px;
    padding: 2rem;
  }

  .action-card h2 {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    font-size: 1.25rem;
    font-weight: 600;
    color: var(--text-primary);
    margin-bottom: 1rem;
  }

  .action-card p {
    color: var(--text-secondary);
    line-height: 1.6;
    margin-bottom: 1.5rem;
  }

  .btn-primary,
  .btn-secondary {
    width: 100%;
    padding: 0.75rem 1.5rem;
    border-radius: 8px;
    font-weight: 600;
    font-size: 1rem;
    border: none;
    cursor: pointer;
    transition: all 0.2s;
  }

  .btn-primary {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
  }

  .btn-primary:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
  }

  .btn-secondary {
    background: var(--bg-card);
    color: var(--text-primary);
    border: 1px solid var(--border-color);
  }

  .btn-secondary:hover:not(:disabled) {
    background: var(--bg-elevated);
    border-color: var(--primary);
  }

  .btn-primary:disabled,
  .btn-secondary:disabled,
  .disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  label.btn-primary {
    display: block;
    text-align: center;
  }
</style>
