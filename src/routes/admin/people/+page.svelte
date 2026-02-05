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
  } from "lucide-svelte";
  import { goto } from "$app/navigation";

  let people: any[] = $state([]);
  let searchTerm = $state("");
  let loading = $state(true);
  let editingPerson: any = $state(null);
  let isCreating = $state(false);

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
      const res = await fetch("/api/people");
      if (res.ok) {
        const data = await res.json();
        people = Array.isArray(data) ? data : data.people || [];
      }
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
        <div class="table-container">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Nom</th>
                <th>Prénom</th>
                <th>Promo</th>
                <th>Bio</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {#each filteredPeople as person (person.id)}
                <tr transition:fade>
                  <td class="mono">{person.id}</td>
                  <td>{person.nom}</td>
                  <td>{person.prenom}</td>
                  <td>{person.level || "—"}</td>
                  <td class="bio-cell"
                    >{person.bio
                      ? person.bio.substring(0, 50) + "..."
                      : "—"}</td
                  >
                  <td class="actions">
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
              rows="5"
            ></textarea>
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

  .bio-cell {
    max-width: 300px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    color: #cbd5e1;
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
</style>
