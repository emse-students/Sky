<script lang="ts">
  import { onMount } from "svelte";
  import { fade } from "svelte/transition";
  import {
    Search,
    Edit,
    Trash2,
    UserPlus,
    Save,
    X,
    ArrowLeft,
    Network,
    Shield,
    Unlink,
    GitMerge,
  } from "lucide-svelte";
  import { goto } from "$app/navigation";

  let people: any[] = $state([]);
  let searchTerm = $state("");
  let loading = $state(true);
  let editingPerson: any = $state(null);
  let isCreating = $state(false);
  let selectedIds: string[] = $state([]);

  let filteredPeople = $derived.by(() => {
    const term = searchTerm.toLowerCase().trim();
    if (!term) return people;

    return people.filter((p: any) => {
      const fullName = `${p.prenom || ""} ${p.nom || ""}`.toLowerCase();
      const id = (p.id || "").toLowerCase();
      const level = p.level?.toString() || "";
      return (
        fullName.includes(term) || id.includes(term) || level.includes(term)
      );
    });
  });

  let allSelected = $derived(
    filteredPeople.length > 0 &&
      filteredPeople.every((p) => selectedIds.includes(p.id)),
  );

  // Form state
  let form = $state({
    id: "",
    prenom: "",
    nom: "",
    level: "",
    bio: "",
    image_url: "",
  });

  onMount(async () => {
    await loadPeople();
  });

  async function loadPeople() {
    loading = true;
    try {
      const res = await fetch("/api/admin/people");
      if (res.ok) {
        const data = await res.json();
        people = Array.isArray(data) ? data : data.people || [];
      }
    } finally {
      loading = false;
    }
  }

  /** Promeut/retrograde une fiche (gestion des admins). */
  async function toggleRole(person: any) {
    const role = person.role === "admin" ? "user" : "admin";
    if (!confirm(`Definir ${person.prenom} ${person.nom} comme ${role} ?`)) {
      return;
    }
    const res = await fetch(`/api/admin/people/${person.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "set-role", role }),
    });
    if (res.ok) await loadPeople();
  }

  /**
   * Fusionne les 2 fiches selectionnees : la 1ere (selectionnee en premier) est
   * conservee et recupere les liens de parrainage de la 2eme, qui est supprimee.
   */
  async function mergeSelected() {
    if (selectedIds.length !== 2) return;
    const target = people.find((p) => p.id === selectedIds[0]);
    const source = people.find((p) => p.id === selectedIds[1]);
    if (!target || !source) return;
    if (
      !confirm(
        `Fusionner "${source.prenom} ${source.nom}" dans "${target.prenom} ${target.nom}" ?\n\n` +
          `La 1ere fiche est conservee et recupere les liens de la 2eme, puis la 2eme est supprimee.`,
      )
    ) {
      return;
    }
    const res = await fetch("/api/admin/merge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sourceId: source.id, targetId: target.id }),
    });
    if (res.ok) {
      selectedIds = [];
      await loadPeople();
    }
  }

  /** Delie le compte Authentik : la fiche redevient un placeholder. */
  async function unlinkAccount(person: any) {
    if (
      !confirm(
        `Delier le compte de ${person.prenom} ${person.nom} ? La fiche redevient un placeholder (le graphe est conserve).`,
      )
    ) {
      return;
    }
    const res = await fetch(`/api/admin/people/${person.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "unlink" }),
    });
    if (res.ok) await loadPeople();
  }

  function toggleAll() {
    if (allSelected) {
      selectedIds = [];
    } else {
      selectedIds = filteredPeople.map((p) => p.id);
    }
  }

  function toggleSelection(id: string) {
    if (selectedIds.includes(id)) {
      selectedIds = selectedIds.filter((i) => i !== id);
    } else {
      selectedIds = [...selectedIds, id];
    }
  }

  async function deleteSelected() {
    if (!confirm(`Supprimer ${selectedIds.length} utilisateurs ?`)) return;
    loading = true;
    try {
      await Promise.all(
        selectedIds.map((id) =>
          fetch(`/api/admin/people/${id}`, { method: "DELETE" }),
        ),
      );
      await loadPeople();
      selectedIds = [];
    } catch (e) {
      console.error("Bulk delete error", e);
    } finally {
      loading = false;
    }
  }

  function startEdit(person: any) {
    editingPerson = person;
    form = {
      id: person.id,
      prenom: person.prenom,
      nom: person.nom,
      level: person.level?.toString() || "",
      bio: person.bio || "",
      image_url: person.image || "",
    };
    isCreating = false;
  }

  function startCreate() {
    editingPerson = null;
    form = {
      id: "",
      prenom: "",
      nom: "",
      level: "",
      bio: "",
      image_url: "",
    };
    isCreating = true;
  }

  function cancelEdit() {
    editingPerson = null;
    isCreating = false;
  }

  async function savePerson() {
    try {
      const payload = {
        id: form.id,
        prenom: form.prenom,
        nom: form.nom,
        level: form.level ? parseInt(form.level) : null,
        bio: form.bio,
        image_url: form.image_url || null,
      };

      const url = isCreating
        ? "/api/admin/people"
        : `/api/admin/people/${editingPerson.id}`;
      const method = isCreating ? "POST" : "PUT";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        await loadPeople();
        cancelEdit();
      }
    } catch (error) {
      console.error("Save error:", error);
    }
  }

  async function deletePerson(id: string) {
    if (!confirm(`Supprimer définitivement ${id} ?`)) return;

    try {
      const res = await fetch(`/api/admin/people/${id}`, {
        method: "DELETE",
      });

      if (res.ok) {
        await loadPeople();
      }
    } catch (error) {
      console.error("Delete error:", error);
    }
  }
</script>

<svelte:head>
  <title>Gestion des utilisateurs - Admin</title>
</svelte:head>

<div class="admin-layout">
  <header class="admin-header">
    <button class="btn-back" onclick={() => goto("/admin")}>
      <ArrowLeft size={20} />
      <span>Retour</span>
    </button>
    <h1>Gestion des utilisateurs</h1>
    <button class="btn-create" onclick={startCreate}>
      <UserPlus size={18} />
      <span>Nouveau</span>
    </button>
  </header>

  <div class="admin-content">
    {#if !editingPerson && !isCreating}
      <div class="search-bar">
        <Search size={20} />
        <input
          type="text"
          placeholder="Rechercher par nom, ID ou promo..."
          bind:value={searchTerm}
        />
      </div>

      {#if loading}
        <div class="loading">Chargement...</div>
      {:else}
        {#if selectedIds.length > 0}
          <div class="selection-bar" transition:fade>
            <div class="selection-info">
              <span class="count">{selectedIds.length} sélectionné(s)</span>
              <button class="btn-link" onclick={() => (selectedIds = [])}
                >Tout désélectionner</button
              >
            </div>
            <div class="selection-actions">
              {#if selectedIds.length === 2}
                <button class="btn-merge" onclick={mergeSelected}>
                  <GitMerge size={16} />
                  <span>Fusionner</span>
                </button>
              {/if}
              <button class="btn-danger-outline" onclick={deleteSelected}>
                <Trash2 size={16} />
                <span>Supprimer</span>
              </button>
            </div>
          </div>
        {/if}
        <div class="table-container">
          <table>
            <thead>
              <tr>
                <th class="checkbox-col">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onchange={toggleAll}
                  />
                </th>
                <th>ID</th>
                <th>Nom</th>
                <th>Prénom</th>
                <th>Promo</th>
                <th>Compte</th>
                <th>Rôle</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {#each filteredPeople as person (person.id)}
                <tr
                  transition:fade
                  class:selected={selectedIds.includes(person.id)}
                >
                  <td class="checkbox-col">
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(person.id)}
                      onchange={() => toggleSelection(person.id)}
                    />
                  </td>
                  <td class="mono">{person.id}</td>
                  <td>{person.nom}</td>
                  <td>{person.prenom}</td>
                  <td>{person.level || "—"}</td>
                  <td>
                    {#if person.linked}
                      <span class="badge linked">Compte</span>
                    {:else}
                      <span class="badge ghost">Fiche</span>
                    {/if}
                  </td>
                  <td>
                    <span
                      class="badge"
                      class:admin={person.role === "admin"}
                      class:ghost={person.role !== "admin"}
                    >
                      {person.role === "admin" ? "Admin" : "User"}
                    </span>
                  </td>
                  <td class="actions">
                    <button
                      class="btn-icon"
                      title="Voir/editer son arbre"
                      onclick={() => goto(`/tree?id=${person.id}`)}
                    >
                      <Network size={16} />
                    </button>
                    <button
                      class="btn-icon"
                      title={person.role === "admin"
                        ? "Retirer admin"
                        : "Promouvoir admin"}
                      onclick={() => toggleRole(person)}
                    >
                      <Shield size={16} />
                    </button>
                    {#if person.linked}
                      <button
                        class="btn-icon"
                        title="Delier le compte"
                        onclick={() => unlinkAccount(person)}
                      >
                        <Unlink size={16} />
                      </button>
                    {/if}
                    <button class="btn-icon" onclick={() => startEdit(person)}>
                      <Edit size={16} />
                    </button>
                    <button
                      class="btn-icon danger"
                      onclick={() => deletePerson(person.id)}
                    >
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
        <div class="table-footer">
          {filteredPeople.length} / {people.length} utilisateurs
        </div>
      {/if}
    {:else}
      <div class="edit-form" transition:fade>
        <div class="form-header">
          <h2>
            {isCreating ? "Nouveau profil" : `Édition : ${editingPerson.id}`}
          </h2>
          <button class="btn-close" onclick={cancelEdit}>
            <X size={20} />
          </button>
        </div>

        <div class="form-grid">
          <div class="form-group">
            <label for="id">ID (identifiant unique)</label>
            <input
              id="id"
              type="text"
              bind:value={form.id}
              placeholder="prenom.nom"
              disabled={!isCreating}
            />
          </div>

          <div class="form-group">
            <label for="prenom">Prénom</label>
            <input
              id="prenom"
              type="text"
              bind:value={form.prenom}
              placeholder="Jean"
            />
          </div>

          <div class="form-group">
            <label for="nom">Nom</label>
            <input
              id="nom"
              type="text"
              bind:value={form.nom}
              placeholder="Dupont"
            />
          </div>

          <div class="form-group">
            <label for="level">Promotion</label>
            <input
              id="level"
              type="number"
              bind:value={form.level}
              placeholder="2024"
            />
          </div>

          <div class="form-group full">
            <label for="image_url">
              URL Image (Optionnel)
              <span class="hint"
                >Laisser vide pour utiliser la photo MiGallery par défaut</span
              >
            </label>
            <input
              id="image_url"
              type="text"
              bind:value={form.image_url}
              placeholder="https://..."
            />
          </div>

          <div class="form-group full">
            <label for="bio">Biographie</label>
            <textarea
              id="bio"
              bind:value={form.bio}
              placeholder="Parcours au sein de l'école..."
              rows="5"></textarea>
          </div>
        </div>

        <div class="form-actions">
          <button class="btn-cancel" onclick={cancelEdit}>Annuler</button>
          <button class="btn-save" onclick={savePerson}>
            <Save size={18} />
            <span>Enregistrer</span>
          </button>
        </div>
      </div>
    {/if}
  </div>
</div>

<style>
  .admin-layout {
    height: 100vh;
    background: #05070a;
    color: #f8fafc;
    overflow-y: auto;
  }

  .admin-header {
    position: sticky;
    top: 0;
    background: rgba(10, 15, 25, 0.95);
    backdrop-filter: blur(12px);
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    padding: 20px 40px;
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: center;
    gap: 20px;
    z-index: 100;
  }

  .admin-header h1 {
    margin: 0;
    text-align: center;
    font-size: 24px;
  }

  .btn-back,
  .btn-create {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 16px;
    border-radius: 8px;
    border: none;
    cursor: pointer;
    transition: all 0.2s;
  }

  .btn-back {
    background: transparent;
    color: #94a3b8;
  }

  .btn-back:hover {
    color: white;
  }

  .btn-create {
    background: #3b82f6;
    color: white;
  }

  .admin-content {
    max-width: 1400px;
    margin: 0 auto;
    padding: 40px;
  }

  .search-bar {
    display: flex;
    align-items: center;
    gap: 12px;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 10px;
    padding: 12px 16px;
    margin-bottom: 24px;
  }

  .search-bar input {
    flex: 1;
    background: transparent;
    border: none;
    color: white;
    outline: none;
    font-size: 15px;
  }

  .table-container {
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 12px;
    overflow: hidden;
  }

  table {
    width: 100%;
    border-collapse: collapse;
  }

  thead {
    background: rgba(255, 255, 255, 0.05);
  }

  th {
    padding: 16px;
    text-align: left;
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 1px;
    color: #94a3b8;
    font-weight: 600;
  }

  td {
    padding: 16px;
    border-top: 1px solid rgba(255, 255, 255, 0.05);
  }

  .mono {
    font-family: "Courier New", monospace;
    font-size: 13px;
    color: #94a3b8;
  }

  .badge {
    display: inline-block;
    padding: 3px 10px;
    border-radius: 99px;
    font-size: 12px;
    font-weight: 600;
  }
  .badge.linked {
    background: rgba(34, 197, 94, 0.12);
    color: #4ade80;
  }
  .badge.admin {
    background: rgba(251, 191, 36, 0.12);
    color: #fbbf24;
  }
  .badge.ghost {
    background: rgba(255, 255, 255, 0.06);
    color: #94a3b8;
  }

  .actions {
    display: flex;
    gap: 8px;
  }

  .btn-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    background: rgba(255, 255, 255, 0.05);
    border: none;
    border-radius: 6px;
    color: white;
    cursor: pointer;
    transition: all 0.2s;
  }

  .btn-icon:hover {
    background: rgba(255, 255, 255, 0.1);
  }

  .btn-icon.danger:hover {
    background: #ef4444;
  }

  .table-footer {
    padding: 12px 16px;
    text-align: center;
    color: #94a3b8;
    font-size: 13px;
  }

  .edit-form {
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 12px;
    padding: 32px;
  }

  .form-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 32px;
  }

  .form-header h2 {
    margin: 0;
    font-size: 20px;
  }

  .btn-close {
    background: transparent;
    border: none;
    color: #94a3b8;
    cursor: pointer;
  }

  .form-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 20px;
    margin-bottom: 32px;
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .form-group.full {
    grid-column: 1 / -1;
  }

  label {
    font-size: 13px;
    color: #94a3b8;
    font-weight: 500;
  }

  .hint {
    font-weight: 400;
    font-size: 11px;
    color: #64748b;
    margin-left: 8px;
    font-style: italic;
  }

  input,
  textarea {
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px;
    padding: 12px;
    color: white;
    outline: none;
    transition: all 0.2s;
  }

  input:focus,
  textarea:focus {
    border-color: #3b82f6;
    background: rgba(255, 255, 255, 0.08);
  }

  input:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  textarea {
    resize: vertical;
    font-family: inherit;
  }

  .form-actions {
    display: flex;
    justify-content: flex-end;
    gap: 12px;
  }

  .btn-cancel,
  .btn-save {
    padding: 12px 24px;
    border-radius: 8px;
    border: none;
    cursor: pointer;
    font-weight: 600;
    transition: all 0.2s;
  }

  .btn-cancel {
    background: rgba(255, 255, 255, 0.05);
    color: white;
  }

  .btn-save {
    background: #3b82f6;
    color: white;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .loading {
    text-align: center;
    padding: 40px;
    color: #94a3b8;
  }

  .checkbox-col {
    width: 48px;
    text-align: center;
    padding: 0 16px;
  }

  input[type="checkbox"] {
    width: 16px;
    height: 16px;
    cursor: pointer;
    accent-color: #3b82f6;
  }

  tr.selected td {
    background: rgba(59, 130, 246, 0.1);
  }

  .selection-bar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: rgba(59, 130, 246, 0.1);
    border: 1px solid rgba(59, 130, 246, 0.2);
    border-radius: 10px;
    padding: 12px 16px;
    margin-bottom: 24px;
  }

  .selection-info {
    display: flex;
    align-items: center;
    gap: 16px;
  }

  .count {
    color: #3b82f6;
    font-weight: 600;
  }

  .btn-link {
    background: none;
    border: none;
    color: #94a3b8;
    text-decoration: underline;
    cursor: pointer;
    font-size: 13px;
  }

  .btn-link:hover {
    color: white;
  }

  .btn-danger-outline {
    display: flex;
    align-items: center;
    gap: 8px;
    background: rgba(239, 68, 68, 0.1);
    border: 1px solid rgba(239, 68, 68, 0.2);
    color: #ef4444;
    padding: 8px 16px;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.2s;
  }

  .btn-danger-outline:hover {
    background: rgba(239, 68, 68, 0.2);
  }

  .selection-actions {
    display: flex;
    gap: 8px;
  }

  .btn-merge {
    display: flex;
    align-items: center;
    gap: 8px;
    background: rgba(59, 130, 246, 0.12);
    border: 1px solid rgba(59, 130, 246, 0.3);
    color: #93c5fd;
    padding: 8px 16px;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.2s;
  }

  .btn-merge:hover {
    background: rgba(59, 130, 246, 0.2);
  }
</style>
