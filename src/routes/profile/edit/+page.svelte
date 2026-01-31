<script lang="ts">
  import { onMount } from "svelte";
  import { authStore } from "$stores/authStore";
  import { goto } from "$app/navigation";
  import {
    Linkedin,
    Mail,
    Globe,
    Github,
    Instagram,
    Phone,
  } from "lucide-svelte";

  let profile: any = null;
  let relationships: any[] = [];
  let bio = "";
  let links: Record<string, string> = {
    LinkedIn: "",
    Email: "",
    GitHub: "",
    Instagram: "",
    Phone: "",
    Website: "",
  };
  let loading = true;
  let saving = false;
  let searchTerm = "";
  let searchResults: any[] = [];
  let isSearching = false;
  let selectedRelationType: "family1" | "family2" = "family1";

  $: user = $authStore.user;
  $: if (!user) goto("/");

  // Filter relationships by type
  // Parrainage: Source (Parrain) -> Target (Fillot)
  // Fillots: I am the Source (person_id_1)
  $: fillots = relationships.filter((r) => r.person_id_1 === user?.profile_id);

  $: fillotFamily1 = fillots.filter((r) => r.type === "family1");
  $: fillotFamily2 = fillots.filter((r) => r.type === "family2");

  // Parrains: I am the Target (person_id_2)
  $: parrains = relationships.filter((r) => r.person_id_2 === user?.profile_id);

  $: parrainFamily1 = parrains.find((r) => r.type === "family1");
  $: parrainFamily2 = parrains.find((r) => r.type === "family2");

  onMount(async () => {
    await loadProfile();
  });

  async function loadProfile() {
    loading = true;
    try {
      const res = await fetch("/api/profile");
      if (res.ok) {
        const data = await res.json();
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
        // Mapper l'ancien champ 'Autre' vers 'Website' si nécessaire
        if (links.Autre && !links.Website) {
          links.Website = links.Autre;
        }
      } else {
        console.error("Failed to load profile");
      }
    } catch (error) {
      console.error("Error loading profile:", error);
    } finally {
      loading = false;
    }
  }

  async function saveProfile() {
    saving = true;
    try {
      // Filter out empty links
      const cleanLinks = Object.fromEntries(
        Object.entries(links).filter(([_, v]) => v.trim() !== ""),
      );

      const res = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bio, links: cleanLinks }),
      });

      if (res.ok) {
        goto("/");
      } else {
        alert("Erreur lors de la sauvegarde");
      }
    } catch (error) {
      console.error("Error saving profile:", error);
      alert("Erreur lors de la sauvegarde");
    } finally {
      saving = false;
    }
  }

  async function searchPeople() {
    if (!searchTerm.trim()) {
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
        // Filter out self and already related people
        const relatedIds = new Set(
          relationships.map((r) =>
            r.person_id_1 === user?.profile_id ? r.person_id_2 : r.person_id_1,
          ),
        );
        searchResults = data.results.filter(
          (p: any) => p.id !== user?.profile_id && !relatedIds.has(p.id),
        );
        console.log("Search results:", searchResults);
      }
    } catch (error) {
      console.error("Error searching:", error);
    } finally {
      isSearching = false;
    }
  }

  async function addRelationship(targetId: string) {
    try {
      const res = await fetch("/api/relationships", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetId,
          type: selectedRelationType,
        }),
      });

      if (res.ok) {
        searchTerm = "";
        searchResults = [];
        await loadProfile();
      } else {
        const data = await res.json();
        alert(data.error || "Erreur lors de l'ajout");
      }
    } catch (error) {
      console.error("Error adding relationship:", error);
      alert("Erreur lors de l'ajout");
    }
  }

  async function removeRelationship(relationshipId: number) {
    if (!confirm("Supprimer cette relation ?")) return;

    try {
      const res = await fetch("/api/relationships", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ relationshipId }),
      });

      if (res.ok) {
        await loadProfile();
      } else {
        alert("Erreur lors de la suppression");
      }
    } catch (error) {
      console.error("Error removing relationship:", error);
      alert("Erreur lors de la suppression");
    }
  }
</script>

<svelte:head>
  <title>Éditer mon profil - Sky</title>
</svelte:head>

<div class="edit-page">
  <div class="edit-container">
    <h1>Éditer mon profil</h1>

    {#if loading}
      <div class="loading">Chargement...</div>
    {:else if profile}
      <div class="profile-section">
        <div class="profile-header-edit">
          <div class="profile-avatar-edit">
            <img
              src={`/api/avatar/${user?.profile_id}`}
              alt={profile.name}
              onerror={(e) => {
                const target = e.currentTarget as HTMLImageElement;
                const sibling = target.nextElementSibling as HTMLElement;
                if (sibling) {
                  target.style.display = "none";
                  sibling.style.display = "flex";
                }
              }}
            />
            <div class="avatar-placeholder-edit" style="display: none;">
              {profile.name?.charAt(0) || "?"}
            </div>
          </div>
          <div>
            <h2>{profile.name}</h2>
            <p class="promo">Promo {profile.level || "N/A"}</p>
          </div>
        </div>
      </div>

      <!-- Bio -->
      <div class="form-section">
        <label for="bio">Biographie</label>
        <textarea
          id="bio"
          bind:value={bio}
          rows="6"
          placeholder="Décrivez-vous..."
        ></textarea>
      </div>

      <!-- Links -->
      <div class="form-section">
        <h3>Mes Liens</h3>
        <div class="field-group">
          <label for="linkedin">
            <Linkedin size={16} />
            LinkedIn
          </label>
          <input
            type="text"
            id="linkedin"
            bind:value={links["LinkedIn"]}
            placeholder="https://linkedin.com/in/..."
          />
        </div>
        <div class="field-group">
          <label for="email">
            <Mail size={16} />
            Email
          </label>
          <input
            type="email"
            id="email"
            bind:value={links["Email"]}
            placeholder="mon.email@example.com"
          />
        </div>
        <div class="field-group">
          <label for="github">
            <Github size={16} />
            GitHub
          </label>
          <input
            type="text"
            id="github"
            bind:value={links["GitHub"]}
            placeholder="https://github.com/..."
          />
        </div>
        <div class="field-group">
          <label for="instagram">
            <Instagram size={16} />
            Instagram
          </label>
          <input
            type="text"
            id="instagram"
            bind:value={links["Instagram"]}
            placeholder="https://instagram.com/..."
          />
        </div>
        <div class="field-group">
          <label for="phone">
            <Phone size={16} />
            Téléphone
          </label>
          <input
            type="tel"
            id="phone"
            bind:value={links["Phone"]}
            placeholder="+33 6 12 34 56 78"
          />
        </div>
        <div class="field-group">
          <label for="website">
            <Globe size={16} />
            Site Web
          </label>
          <input
            type="text"
            id="website"
            bind:value={links["Website"]}
            placeholder="https://monsite.com"
          />
        </div>
      </div>

      <!-- Fillots -->
      <div class="form-section">
        <h3>Mes Fillots ({fillots.length}/3 max)</h3>

        <div class="subsection">
          <h4>Officiels ({fillotFamily1.length}/3)</h4>
          <div class="relationship-list">
            {#each fillotFamily1 as rel}
              <div class="relationship-item">
                <span>{rel.other_person_name}</span>
                <button
                  class="btn-remove"
                  onclick={() => removeRelationship(rel.id)}>✕</button
                >
              </div>
            {/each}
          </div>
        </div>

        <div class="subsection">
          <h4>D'adoption ({fillotFamily2.length}/3)</h4>
          <div class="relationship-list">
            {#each fillotFamily2 as rel}
              <div class="relationship-item">
                <span>{rel.other_person_name}</span>
                <button
                  class="btn-remove"
                  onclick={() => removeRelationship(rel.id)}>✕</button
                >
              </div>
            {/each}
          </div>
        </div>

        {#if fillots.length < 3}
          <div class="add-relationship">
            <h4>Ajouter un fillot</h4>
            <div class="search-box">
              <select bind:value={selectedRelationType}>
                <option value="family1">Officiel</option>
                <option value="family2">Adoption</option>
              </select>
              <input
                type="text"
                placeholder="Rechercher..."
                bind:value={searchTerm}
                oninput={searchPeople}
              />
            </div>
            {#if isSearching}
              <div class="searching">Recherche...</div>
            {:else if searchResults.length > 0}
              <div class="search-results">
                {#each searchResults as person}
                  <button
                    class="result-item"
                    onclick={() => addRelationship(person.id)}
                  >
                    {person.prenom}
                    {person.nom} ({person.level || "N/A"})
                  </button>
                {/each}
              </div>
            {/if}
          </div>
        {/if}
      </div>

      <!-- Parrains -->
      <div class="form-section">
        <h3>Mes Parrains</h3>

        <div class="subsection">
          <h4>Officiel (max 1)</h4>
          {#if parrainFamily1}
            <div class="relationship-item">
              <span>{parrainFamily1.other_person_name}</span>
              <button
                class="btn-remove"
                onclick={() => removeRelationship(parrainFamily1.id)}>✕</button
              >
            </div>
          {:else}
            <p class="empty">Aucun parrain officiel</p>
          {/if}
        </div>

        <div class="subsection">
          <h4>D'adoption (max 1)</h4>
          {#if parrainFamily2}
            <div class="relationship-item">
              <span>{parrainFamily2.other_person_name}</span>
              <button
                class="btn-remove"
                onclick={() => removeRelationship(parrainFamily2.id)}>✕</button
              >
            </div>
          {:else}
            <p class="empty">Aucun parrain d'adoption</p>
          {/if}
        </div>
      </div>

      <!-- Save Button -->
      <div class="actions">
        <!-- Changed label from Annuler to Retour -->
        <button class="btn-cancel" onclick={() => goto("/")}
          >Retour à la carte</button
        >
        <button class="btn-save" onclick={saveProfile} disabled={saving}>
          {saving ? "Sauvegarde..." : "Sauvegarder"}
        </button>
      </div>
    {:else}
      <div class="error">Profil non trouvé</div>
    {/if}
  </div>
</div>

<style>
  .edit-page {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100vh;
    overflow-y: auto;
    z-index: 10;
    background: linear-gradient(to bottom, #0f172a, #1e293b);
    padding: 80px 20px 40px;
  }

  .edit-container {
    max-width: 800px;
    margin: 0 auto;
    background: rgba(17, 24, 39, 0.95);
    border: 1px solid rgba(59, 130, 246, 0.3);
    border-radius: 16px;
    padding: 32px;
    color: white;
  }

  h1 {
    color: white;
    font-size: 32px;
    font-weight: 700;
    margin-bottom: 8px;
  }

  h2 {
    color: white;
    font-size: 24px;
    margin: 0;
  }

  h3 {
    color: rgba(255, 255, 255, 0.9);
    font-size: 18px;
    margin-bottom: 16px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    padding-bottom: 8px;
  }

  h4 {
    color: rgba(255, 255, 255, 0.7);
    font-size: 14px;
    margin-bottom: 12px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .promo {
    color: rgba(255, 255, 255, 0.6);
    font-size: 14px;
    margin: 0;
  }

  .profile-section {
    margin-bottom: 32px;
  }

  .profile-header-edit {
    display: flex;
    align-items: center;
    gap: 20px;
  }

  .profile-avatar-edit {
    position: relative;
    width: 80px;
    height: 80px;
    border-radius: 50%;
    overflow: hidden;
    border: 3px solid rgba(59, 130, 246, 0.5);
  }

  .profile-avatar-edit img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .avatar-placeholder-edit {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    font-size: 32px;
    font-weight: bold;
    color: white;
  }

  .form-section {
    margin-bottom: 32px;
  }

  .subsection {
    margin-bottom: 24px;
    padding: 16px;
    background: rgba(255, 255, 255, 0.03);
    border-radius: 8px;
  }

  label {
    display: flex;
    align-items: center;
    gap: 8px;
    color: rgba(255, 255, 255, 0.8);
    font-size: 14px;
    font-weight: 500;
    margin-bottom: 8px;
  }

  .field-group {
    margin-bottom: 12px;
  }

  input[type="text"],
  input[type="email"],
  input[type="tel"] {
    width: 100%;
    background: rgba(0, 0, 0, 0.3);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px;
    padding: 10px;
    color: white;
    font-size: 14px;
  }

  input[type="text"]:focus,
  input[type="email"]:focus,
  input[type="tel"]:focus {
    outline: none;
    border-color: rgba(59, 130, 246, 0.5);
  }

  textarea {
    width: 100%;
    background: rgba(0, 0, 0, 0.3);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px;
    padding: 12px;
    color: white;
    font-size: 14px;
    line-height: 1.6;
    resize: vertical;
    font-family: inherit;
  }

  textarea:focus {
    outline: none;
    border-color: rgba(59, 130, 246, 0.5);
  }

  .relationship-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .relationship-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px;
    background: rgba(59, 130, 246, 0.1);
    border: 1px solid rgba(59, 130, 246, 0.2);
    border-radius: 6px;
  }

  .relationship-item span {
    color: white;
    font-size: 14px;
  }

  .btn-remove {
    background: rgba(239, 68, 68, 0.2);
    border: 1px solid rgba(239, 68, 68, 0.4);
    color: #f87171;
    padding: 4px 8px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 16px;
    transition: all 0.2s;
  }

  .btn-remove:hover {
    background: rgba(239, 68, 68, 0.3);
  }

  .add-relationship {
    margin-top: 16px;
    padding: 16px;
    background: rgba(255, 255, 255, 0.03);
    border-radius: 8px;
  }

  .search-box {
    display: flex;
    gap: 8px;
    margin-bottom: 12px;
  }

  .search-box select {
    background: rgba(0, 0, 0, 0.3);
    border: 1px solid rgba(255, 255, 255, 0.1);
    color: white;
    padding: 8px 12px;
    border-radius: 6px;
    font-size: 14px;
  }

  .search-box input {
    flex: 1;
    background: rgba(0, 0, 0, 0.3);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 6px;
    padding: 8px 12px;
    color: white;
    font-size: 14px;
  }

  .search-box input:focus {
    outline: none;
    border-color: rgba(59, 130, 246, 0.5);
  }

  .search-results {
    display: flex;
    flex-direction: column;
    gap: 4px;
    max-height: 200px;
    overflow-y: auto;
  }

  .result-item {
    background: rgba(59, 130, 246, 0.1);
    border: 1px solid rgba(59, 130, 246, 0.2);
    color: white;
    padding: 10px;
    border-radius: 6px;
    text-align: left;
    cursor: pointer;
    font-size: 14px;
    transition: all 0.2s;
  }

  .result-item:hover {
    background: rgba(59, 130, 246, 0.2);
  }

  .empty {
    color: rgba(255, 255, 255, 0.4);
    font-size: 13px;
    font-style: italic;
  }

  .actions {
    display: flex;
    gap: 12px;
    justify-content: flex-end;
    margin-top: 32px;
    padding-top: 24px;
    border-top: 1px solid rgba(255, 255, 255, 0.1);
  }

  .btn-cancel,
  .btn-save {
    padding: 12px 24px;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
  }

  .btn-cancel {
    background: transparent;
    border: 1px solid rgba(255, 255, 255, 0.2);
    color: rgba(255, 255, 255, 0.7);
  }

  .btn-cancel:hover {
    background: rgba(255, 255, 255, 0.05);
  }

  .btn-save {
    background: linear-gradient(135deg, #3b82f6, #2563eb);
    border: none;
    color: white;
  }

  .btn-save:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(59, 130, 246, 0.4);
  }

  .btn-save:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .loading,
  .searching,
  .error {
    text-align: center;
    padding: 40px;
    color: rgba(255, 255, 255, 0.6);
  }
</style>
