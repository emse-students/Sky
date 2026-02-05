<script lang="ts">
  import { onMount } from "svelte";
  import { fade, fly, slide } from "svelte/transition";
  import { cubicOut } from "svelte/easing";
  import { page } from "$app/stores";
  import { goto } from "$app/navigation";
  import { browser } from "$app/environment";
  import {
    Linkedin,
    Mail,
    Globe,
    Github,
    Instagram,
    Phone,
    User,
    Save,
    Plus,
    Search,
    Trash2,
    ChevronLeft,
    UserPlus,
    X,
    Loader2,
    CheckCircle2,
    Info,
  } from "lucide-svelte";

  // State
  let profile: any = $state(null);
  let relationships: any[] = $state([]);
  let bio = $state("");
  let links: { [key: string]: string } = $state({
    LinkedIn: "",
    Email: "",
    GitHub: "",
    Instagram: "",
    Phone: "",
    Website: "",
  });

  let loading = $state(true);
  let saving = $state(false);
  let searchTerm = $state("");
  let searchResults: any[] = $state([]);
  let isSearching = $state(false);
  let addRole: "parrain" | "fillot" = $state("fillot");
  let addType: "parrainage" | "adoption" = $state("parrainage");
  let showCreatePerson = $state(false);
  let newPerson = $state({ firstName: "", lastName: "", level: "" });
  let creatingPerson = $state(false);
  let successMessage = $state("");

  const loadingMessages = [
    "Initialisation de la voûte céleste...",
    "Récupération des constellations...",
    "Calibration des étoiles...",
    "Synchronisation des données stellaires...",
    "Chargement de votre galaxie personnelle...",
  ];
  let currentLoadingMessage = $state(
    loadingMessages[Math.floor(Math.random() * loadingMessages.length)],
  );

  let user = $derived($page.data.user);

  // Filtering Logic
  let fillots = $derived(
    relationships.filter((r) => r.person_id_1 === user?.profile_id),
  );
  let parrains = $derived(
    relationships.filter((r) => r.person_id_2 === user?.profile_id),
  );

  $effect(() => {
    if (browser && !user) goto("/");
  });

  onMount(async () => {
    // Changer le message de chargement toutes les 2 secondes
    const interval = setInterval(() => {
      currentLoadingMessage =
        loadingMessages[Math.floor(Math.random() * loadingMessages.length)];
    }, 2000);

    await loadProfile();
    clearInterval(interval);
  });

  async function loadProfile() {
    loading = true;
    try {
      const profileRes = await fetch("/api/profile");
      if (profileRes.ok) {
        const data = await profileRes.json();
        profile = data.person;
        relationships = data.relationships || [];
        bio = profile?.bio || "";
        links = {
          LinkedIn: "",
          Email: "",
          GitHub: "",
          Instagram: "",
          Phone: "",
          Website: "",
          ...(profile?.links || {}),
        };
        if (links.Autre && !links.Website) links.Website = links.Autre;
      }
    } catch (error) {
      console.error("Load error:", error);
    } finally {
      loading = false;
    }
  }

  function showToast(msg: string) {
    successMessage = msg;
    setTimeout(() => (successMessage = ""), 3000);
  }

  async function saveProfile() {
    saving = true;
    try {
      const cleanLinks = Object.fromEntries(
        Object.entries(links).filter(([_, v]) => v && v.trim() !== ""),
      );

      const res = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bio, links: cleanLinks }),
      });

      if (res.ok) {
        showToast("Profil mis à jour !");
        setTimeout(() => goto("/"), 1000);
      }
    } catch (error) {
      console.error("Save error:", error);
    } finally {
      saving = false;
    }
  }

  async function handleSearch() {
    if (searchTerm.length < 2) {
      searchResults = [];
      return;
    }
    isSearching = true;
    try {
      const res = await fetch(
        `/api/search?q=${encodeURIComponent(searchTerm)}`,
      );
      if (res.ok) {
        const data = await res.json();
        const relatedIds = new Set(
          relationships.map((r) =>
            r.person_id_1 === user?.profile_id ? r.person_id_2 : r.person_id_1,
          ),
        );
        searchResults = data.results.filter(
          (p: any) => p.id !== user?.profile_id && !relatedIds.has(p.id),
        );
      }
    } finally {
      isSearching = false;
    }
  }

  async function addRelationship(targetId: string) {
    try {
      const res = await fetch("/api/relationships", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetId, type: addType, role: addRole }),
      });

      if (res.ok) {
        searchTerm = "";
        searchResults = [];
        showCreatePerson = false;
        showToast("Relation ajoutée");
        await loadProfile();
      }
    } catch (error) {
      console.error("Add error:", error);
    }
  }

  async function removeRelationship(relationshipId: number) {
    try {
      const res = await fetch("/api/relationships", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ relationshipId }),
      });

      if (res.ok) {
        relationships = relationships.filter((r) => r.id !== relationshipId);
        showToast("Relation supprimée");
      }
    } catch (error) {
      console.error("Delete error:", error);
    }
  }

  async function createNewPerson() {
    if (!newPerson.firstName || !newPerson.lastName) return;
    creatingPerson = true;
    try {
      const res = await fetch("/api/people", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prenom: newPerson.firstName,
          nom: newPerson.lastName,
          level: newPerson.level ? parseInt(newPerson.level) : null,
        }),
      });
      const data = await res.json();
      if (data.id) await addRelationship(data.id);
    } finally {
      creatingPerson = false;
    }
  }

  function getLinkIcon(name: string) {
    switch (name) {
      case "LinkedIn":
        return Linkedin;
      case "Email":
        return Mail;
      case "GitHub":
        return Github;
      case "Instagram":
        return Instagram;
      case "Phone":
        return Phone;
      default:
        return Globe;
    }
  }
</script>

<svelte:head>
  <title>Édition Stellaire — {profile?.prenom || "Profil"}</title>
</svelte:head>

<div class="page-layout">
  <!-- Header Minimaliste -->
  <header class="top-nav">
    <div class="nav-container">
      <button class="btn-back" onclick={() => goto("/")}>
        <ChevronLeft size={20} />
        <span>Retour à la carte</span>
      </button>
      <h1 class="nav-title">Éditer mon profil</h1>
      <button class="btn-save" disabled={saving} onclick={saveProfile}>
        {#if saving}
          <Loader2 size={18} class="spinner" />
        {:else}
          <Save size={18} />
        {/if}
      </button>
    </div>
  </header>

  <main class="content">
    {#if loading}
      <div class="loading-state" in:fade>
        <Loader2 size={48} class="spinner" />
        <p>{currentLoadingMessage}</p>
      </div>
    {:else if profile}
      <div class="grid-layout">
        <!-- Colonne Gauche: Identité & Bio -->
        <section class="col-main">
          <div class="glass-card profile-hero">
            <div class="avatar-edit">
              <img
                src="/api/avatar/{user?.profile_id}"
                alt={profile.prenom}
                onerror={(e) => {
                  const target = e.currentTarget as HTMLImageElement;
                  target.src = `https://ui-avatars.com/api/?name=${profile.prenom}+${profile.nom}&background=0D8ABC&color=fff`;
                }}
              />
              <div class="avatar-glow"></div>
            </div>
            <div class="hero-text">
              <h1>{profile.prenom} {profile.nom}</h1>
              <span class="badge">Promotion {profile.level || "—"}</span>
            </div>
          </div>

          <div class="glass-card bio-section">
            <label for="bio"><h3>Ma Biographie</h3></label>
            <textarea
              id="bio"
              bind:value={bio}
              placeholder="Racontez votre parcours au sein de l'école..."
              rows="5"
            ></textarea>
            <div class="textarea-footer">
              <Info size={14} />
              <span>Cette bio sera visible par tous les ICM.</span>
            </div>
          </div>

          <div class="glass-card links-section">
            <h3>Réseaux & Contacts</h3>
            <div class="links-grid">
              {#each Object.keys(links) as linkKey}
                {@const Icon = getLinkIcon(linkKey)}
                <div class="link-input-group">
                  <div class="input-icon">
                    <Icon size={18} />
                  </div>
                  <input
                    type="text"
                    placeholder={linkKey}
                    bind:value={links[linkKey]}
                  />
                </div>
              {/each}
            </div>
          </div>
        </section>

        <!-- Colonne Droite: Relations -->
        <section class="col-side">
          <!-- Ajouter une relation -->
          <div class="glass-card add-rel-card">
            <h3>Ajouter une étoile</h3>

            <div class="toggle-group">
              <button
                class:active={addRole === "fillot"}
                onclick={() => (addRole = "fillot")}>Fillot</button
              >
              <button
                class:active={addRole === "parrain"}
                onclick={() => (addRole = "parrain")}>Parrain</button
              >
            </div>

            <div class="toggle-group secondary">
              <button
                class:active={addType === "parrainage"}
                onclick={() => (addType = "parrainage")}>Officiel</button
              >
              <button
                class:active={addType === "adoption"}
                onclick={() => (addType = "adoption")}>Adoption</button
              >
            </div>

            <div class="search-wrapper">
              <Search size={18} class="s-icon" />
              <input
                type="text"
                placeholder="Chercher par nom..."
                bind:value={searchTerm}
                oninput={handleSearch}
              />
            </div>

            {#if isSearching}
              <div class="searching-inline">
                <Loader2 size={16} class="spinner" /> Recherche...
              </div>
            {/if}

            {#if searchResults.length > 0}
              <div class="results-popover" transition:slide>
                {#each searchResults as person}
                  <button
                    class="result-btn"
                    onclick={() => addRelationship(person.id)}
                  >
                    <UserPlus size={16} />
                    <span>{person.prenom} {person.nom}</span>
                    <small>P{person.level || "?"}</small>
                  </button>
                {/each}
              </div>
            {:else if searchTerm.length > 2 && !isSearching}
              <div class="no-results" transition:fade>
                <p>Inconnu au bataillon ?</p>
                <button
                  class="btn-create-trigger"
                  onclick={() => (showCreatePerson = !showCreatePerson)}
                >
                  {showCreatePerson ? "Annuler" : "Créer cette personne"}
                </button>
              </div>
            {/if}

            {#if showCreatePerson}
              <div class="create-form" transition:slide>
                <div class="form-row">
                  <input
                    type="text"
                    placeholder="Prénom"
                    bind:value={newPerson.firstName}
                  />
                  <input
                    type="text"
                    placeholder="Nom"
                    bind:value={newPerson.lastName}
                  />
                </div>
                <input
                  type="number"
                  placeholder="Promotion (ex: 2024)"
                  bind:value={newPerson.level}
                />
                <button
                  class="btn-submit-create"
                  disabled={creatingPerson}
                  onclick={createNewPerson}
                >
                  {#if creatingPerson}
                    <Loader2 size={16} class="spinner" />
                  {/if}
                  Créer et Lier
                </button>
              </div>
            {/if}
          </div>

          <!-- Fillots -->
          <div class="glass-card relationships-card">
            <div class="card-header">
              <h3>Mes Fillots</h3>
              <span class="count">{fillots.length} / 3</span>
            </div>
            <div class="rel-list">
              {#each fillots as rel (rel.id)}
                <div class="rel-item" transition:fly={{ x: 20 }}>
                  <div class="rel-info">
                    <span class="rel-name"
                      >{rel.target_name || "Chargement..."}</span
                    >
                    <span class="rel-tag"
                      >{rel.type === "adoption" ? "Adoption" : "Officiel"}</span
                    >
                  </div>
                  <button
                    class="btn-remove"
                    onclick={() => removeRelationship(rel.id)}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              {:else}
                <p class="empty-msg">Aucun fillot enregistré.</p>
              {/each}
            </div>
          </div>

          <!-- Parrains -->
          <div class="glass-card relationships-card">
            <div class="card-header">
              <h3>Mes Parrains</h3>
            </div>
            <div class="rel-list">
              {#each parrains as rel (rel.id)}
                <div class="rel-item" transition:fly={{ x: 20 }}>
                  <div class="rel-info">
                    <span class="rel-name"
                      >{rel.source_name || "Chargement..."}</span
                    >
                    <span class="rel-tag"
                      >{rel.type === "adoption" ? "Adoption" : "Officiel"}</span
                    >
                  </div>
                  <button
                    class="btn-remove"
                    onclick={() => removeRelationship(rel.id)}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              {:else}
                <p class="empty-msg">Aucun parrain enregistré.</p>
              {/each}
            </div>
          </div>
        </section>
      </div>
    {/if}
  </main>
</div>

{#if successMessage}
  <div class="toast" transition:fly={{ y: 50 }}>
    <CheckCircle2 size={18} />
    <span>{successMessage}</span>
  </div>
{/if}

<style>
  :root {
    --bg: #05070a;
    --card-bg: rgba(255, 255, 255, 0.04);
    --border: rgba(255, 255, 255, 0.1);
    --accent: #3b82f6;
    --text: #f8fafc;
    --text-dim: #94a3b8;
  }

  .page-layout {
    min-height: 100vh;
    background: var(--bg);
    color: var(--text);
    font-family: "Inter", sans-serif;
  }

  .nav-container {
    max-width: 1200px;
    margin: 0 auto;
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    padding: 0 24px;
    gap: 32px;
  }

  .top-nav {
    position: sticky;
    top: 0;
    left: 0;
    right: 0;
    height: 70px;
    background: rgba(10, 15, 25, 0.95);
    backdrop-filter: blur(12px);
    border-bottom: 1px solid var(--border);
    z-index: 100;
    display: flex;
    align-items: center;
    margin-bottom: 20px;
  }

  .btn-back {
    background: transparent;
    color: var(--text-dim);
    flex-shrink: 0;
    justify-self: start;
  }

  .nav-title {
    font-weight: 600;
    font-size: 20px;
    letter-spacing: 0.3px;
    margin: 0;
    white-space: nowrap;
    justify-self: center;
  }

  .btn-save {
    background: var(--accent);
    color: white;
    padding: 10px;
    border-radius: 10px;
    font-weight: 600;
    width: 44px;
    height: 44px;
    justify-content: center;
    flex-shrink: 0;
    justify-self: end;
  }

  .content {
    max-width: 1200px;
    margin: 0 auto;
    padding: 0 20px 400px 20px;
    min-height: calc(100vh - 70px);
  }

  .grid-layout {
    display: grid;
    grid-template-columns: 1.5fr 1fr;
    gap: 24px;
  }

  .glass-card {
    background: var(--card-bg);
    border: 1px solid var(--border);
    border-radius: 16px;
    padding: 24px;
    margin-bottom: 24px;
    backdrop-filter: blur(8px);
  }

  /* --- Hero --- */
  .profile-hero {
    display: flex;
    align-items: center;
    gap: 24px;
    background: linear-gradient(135deg, rgba(59, 130, 246, 0.1), transparent);
  }

  .avatar-edit {
    position: relative;
    width: 100px;
    height: 100px;
  }

  .avatar-edit img {
    width: 100%;
    height: 100%;
    border-radius: 50%;
    border: 3px solid var(--accent);
    object-fit: cover;
    z-index: 2;
    position: relative;
  }

  .avatar-glow {
    position: absolute;
    inset: -5px;
    background: var(--accent);
    filter: blur(15px);
    opacity: 0.3;
    border-radius: 50%;
  }

  h1 {
    margin: 0;
    font-size: 28px;
  }
  .badge {
    background: rgba(59, 130, 246, 0.2);
    color: var(--accent);
    padding: 4px 12px;
    border-radius: 99px;
    font-size: 13px;
    font-weight: 600;
    margin-top: 8px;
    display: inline-block;
  }

  /* --- Form Elements --- */
  h3 {
    margin: 0 0 16px 0;
    font-size: 16px;
    color: var(--text-dim);
    text-transform: uppercase;
    letter-spacing: 1px;
  }

  textarea {
    width: 100%;
    background: rgba(0, 0, 0, 0.3);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 16px;
    color: white;
    font-family: inherit;
    resize: none;
    outline: none;
    transition: border-color 0.2s;
  }

  textarea:focus {
    border-color: var(--accent);
  }

  .textarea-footer {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: 8px;
    color: var(--text-dim);
    font-size: 12px;
  }

  .links-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 12px;
  }

  .link-input-group {
    display: flex;
    background: rgba(0, 0, 0, 0.2);
    border: 1px solid var(--border);
    border-radius: 8px;
    overflow: hidden;
  }

  .input-icon {
    padding: 10px;
    background: rgba(255, 255, 255, 0.05);
    color: var(--text-dim);
  }

  .link-input-group input {
    background: transparent;
    border: none;
    padding: 0 12px;
    color: white;
    width: 100%;
    outline: none;
    font-size: 14px;
  }

  /* --- Buttons --- */
  .btn-back,
  .btn-save,
  .btn-remove,
  .btn-create-trigger {
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    transition: all 0.2s;
    border: none;
  }

  .btn-back:hover {
    color: white;
  }

  .btn-save:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* --- Relationships --- */
  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 16px;
  }
  .count {
    font-size: 12px;
    font-weight: 700;
    color: var(--accent);
    background: rgba(59, 130, 246, 0.1);
    padding: 2px 8px;
    border-radius: 4px;
  }

  .rel-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: rgba(255, 255, 255, 0.03);
    padding: 12px 16px;
    border-radius: 10px;
    margin-bottom: 8px;
    border: 1px solid transparent;
  }
  .rel-item:hover {
    border-color: rgba(255, 255, 255, 0.1);
    background: rgba(255, 255, 255, 0.05);
  }

  .rel-info {
    display: flex;
    flex-direction: column;
  }
  .rel-name {
    font-weight: 600;
    font-size: 14px;
  }
  .rel-tag {
    font-size: 11px;
    color: var(--text-dim);
  }

  .btn-remove {
    background: rgba(239, 68, 68, 0.1);
    color: #ef4444;
    padding: 8px;
    border-radius: 6px;
  }
  .btn-remove:hover {
    background: #ef4444;
    color: white;
  }

  .empty-msg {
    font-size: 13px;
    color: var(--text-dim);
    font-style: italic;
  }

  /* --- Add Interface --- */
  .toggle-group {
    display: flex;
    background: rgba(0, 0, 0, 0.3);
    padding: 4px;
    border-radius: 10px;
    margin-bottom: 12px;
  }
  .toggle-group button {
    flex: 1;
    padding: 8px;
    border: none;
    background: transparent;
    color: var(--text-dim);
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    border-radius: 6px;
  }
  .toggle-group button.active {
    background: var(--accent);
    color: white;
  }
  .toggle-group.secondary button.active {
    background: rgba(255, 255, 255, 0.15);
  }

  .search-wrapper {
    position: relative;
    margin-top: 16px;
  }
  .search-wrapper input {
    width: 100%;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid var(--border);
    padding: 12px 12px 12px 40px;
    border-radius: 10px;
    color: white;
    outline: none;
  }

  .results-popover {
    position: relative;
    margin-top: 8px;
    max-height: 300px;
    overflow-y: auto;
    background: #111827;
    border-radius: 10px;
    border: 1px solid var(--border);
    z-index: 10;
  }

  .result-btn {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px;
    background: transparent;
    border: none;
    color: white;
    cursor: pointer;
    text-align: left;
    border-bottom: 1px solid var(--border);
  }
  .result-btn:hover {
    background: var(--accent);
  }
  .result-btn small {
    margin-left: auto;
    opacity: 0.6;
  }

  .create-form {
    margin-top: 16px;
    padding: 16px;
    background: rgba(59, 130, 246, 0.05);
    border-radius: 12px;
    border: 1px dashed var(--accent);
  }
  .form-row {
    display: flex;
    gap: 8px;
    margin-bottom: 8px;
  }
  .create-form input {
    background: rgba(0, 0, 0, 0.3);
    border: 1px solid var(--border);
    padding: 8px 12px;
    border-radius: 6px;
    color: white;
    width: 100%;
  }
  .btn-submit-create {
    width: 100%;
    margin-top: 12px;
    background: var(--accent);
    color: white;
    border: none;
    padding: 10px;
    border-radius: 8px;
    font-weight: 600;
    cursor: pointer;
  }

  .toast {
    position: fixed;
    bottom: 30px;
    left: 50%;
    transform: translateX(-50%);
    background: #10b981;
    color: white;
    padding: 12px 24px;
    border-radius: 99px;
    display: flex;
    align-items: center;
    gap: 10px;
    z-index: 2000;
    box-shadow: 0 10px 25px rgba(0, 0, 0, 0.5);
  }

  :global(.spinner) {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }

  /* --- Resp --- */
  @media (max-width: 900px) {
    .grid-layout {
      grid-template-columns: 1fr;
    }
    .links-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
