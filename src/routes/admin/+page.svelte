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
  } from "lucide-svelte";

  let stats = $state({ people: 0, relationships: 0 });
  let message = $state("");
  let messageType: "success" | "error" | "" = $state("");
  let busy = $state(false);

  let user = $derived($page.data.user);
  let isAdmin = $derived(user?.role === "admin");

  onMount(() => {
    if (isAdmin) loadStats();
  });

  /** Charge les compteurs (personnes, liens de parrainage). */
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
      flash("Base exportee.", "success");
    } catch {
      flash("Echec de l'export.", "error");
    } finally {
      busy = false;
    }
  }

  async function importDatabase(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    if (
      !confirm(
        "Remplacer la base actuelle par ce fichier ? Une sauvegarde est faite avant, mais l'operation reecrit les donnees en cours.",
      )
    ) {
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
      flash("Base importee. Rechargement...", "success");
      setTimeout(() => window.location.reload(), 1200);
    } catch {
      flash("Echec de l'import.", "error");
    } finally {
      busy = false;
      input.value = "";
    }
  }
</script>

<svelte:head>
  <title>Administration - Sky</title>
</svelte:head>

{#if !isAdmin}
  <div class="denied">
    <AlertCircle size={48} />
    <h1>Acces refuse</h1>
    <p>Reserve aux administrateurs.</p>
  </div>
{:else}
  <div class="admin">
    <header>
      <h1>Administration</h1>
      <p>Gestion des personnes et des liens de parrainage.</p>
    </header>

    {#if message}
      <div class="flash {messageType}">{message}</div>
    {/if}

    <div class="stats">
      <div class="stat">
        <Users size={28} />
        <div>
          <div class="num">{stats.people}</div>
          <div class="lbl">Personnes</div>
        </div>
      </div>
      <div class="stat">
        <Link2 size={28} />
        <div>
          <div class="num">{stats.relationships}</div>
          <div class="lbl">Liens de parrainage</div>
        </div>
      </div>
    </div>

    <!-- Action principale -->
    <button class="primary-card" onclick={() => goto("/admin/people")}>
      <Users size={28} />
      <div class="pc-text">
        <span class="pc-title">Gerer les personnes</span>
        <span class="pc-sub"
          >Rechercher, editer, fusionner, lier un compte, definir les admins,
          editer l'arbre de chacun.</span
        >
      </div>
      <ChevronRight size={22} />
    </button>

    <!-- Outils avances -->
    <h2 class="section">Outils avances</h2>
    <div class="tools">
      <div class="tool">
        <h3><Download size={18} /> Exporter</h3>
        <p>Telecharger une copie de la base (sauvegarde).</p>
        <button class="btn" disabled={busy} onclick={exportDatabase}
          >Exporter</button
        >
      </div>
      <div class="tool">
        <h3><Upload size={18} /> Importer</h3>
        <p>Remplacer la base par une sauvegarde. Sensible.</p>
        <label class="btn" class:disabled={busy}>
          Choisir un fichier
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
        <h3><Archive size={18} /> Ancienne base</h3>
        <p>Consulter le snapshot historique (lecture seule).</p>
        <button class="btn" onclick={() => goto("/admin/legacy")}
          >Consulter</button
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
</style>
