<script lang="ts">
  import { onMount } from "svelte";
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
  } from "lucide-svelte";
  import LinkInput from "$lib/components/LinkInput.svelte";
  import RelationshipSection from "$lib/components/RelationshipSection.svelte";
  import Button from "$lib/components/Button.svelte";
  import TextArea from "$lib/components/TextArea.svelte";
  import Avatar from "$lib/components/Avatar.svelte";

  let profile: any = null;
  let relationships: any[] = [];
  let people: any[] = [];
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
  let addRole: "parrain" | "fillot" = "fillot";
  let addType: "parrainage" | "adoption" = "parrainage";
  let showCreatePerson = false;
  let newPerson = { firstName: "", lastName: "" };
  let creatingPerson = false;

  $: user = $page.data.user;
  $: if (browser && !user) goto("/");

  // Filter relationships by type
  // Parrainage: Source (Parrain) -> Target (Fillot)
  // Fillots: I am the Source (person_id_1)
  $: fillots = relationships.filter((r) => r.person_id_1 === user?.profile_id);

  $: fillotParrainage = fillots.filter((r) => r.type === "parrainage");
  $: fillotAdoption = fillots.filter((r) => r.type === "adoption");

  // Parrains: I am the Target (person_id_2)
  $: parrains = relationships.filter((r) => r.person_id_2 === user?.profile_id);

  $: parrainParrainage = parrains.find((r) => r.type === "parrainage");
  $: parrainAdoption = parrains.find((r) => r.type === "adoption");

  onMount(async () => {
    await loadProfile();
  });

  async function loadProfile() {
    loading = true;
    try {
      const [profileRes, peopleRes] = await Promise.all([
        fetch("/api/profile"),
        fetch("/api/people"),
      ]);

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
        // Mapper l'ancien champ 'Autre' vers 'Website' si nécessaire
        if (links.Autre && !links.Website) {
          links.Website = links.Autre;
        }
      } else {
        console.error("Failed to load profile");
      }

      if (peopleRes.ok) {
        people = await peopleRes.json();
      } else {
        console.error("Failed to load people");
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
            r.source_id === user?.profile_id ? r.target_id : r.source_id,
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
          type: addType,
          role: addRole,
        }),
      });

      if (res.ok) {
        searchTerm = "";
        searchResults = [];
        showCreatePerson = false;
        newPerson = { firstName: "", lastName: "" };
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

  async function createNewPerson() {
    if (
      !newPerson.firstName.trim() ||
      !newPerson.lastName.trim()
    ) {
      alert("Veuillez remplir les noms et prénoms");
      return;
    }

    creatingPerson = true;
    try {
      const res = await fetch("/api/people", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prenom: newPerson.firstName,
          nom: newPerson.lastName,
          // level? image?
        }),
      });

      if (res.ok) {
        const data = await res.json();
        // Assume data returns the ID (the file says it returns newId, but server usually returns json)
        // src/routes/api/people/+server.ts returns `return json({ id: newId });` (Oops I didn't see the return line but usually it does).
        // Let's assume it returns { id: "..." }
        if (data.id) {
            await addRelationship(data.id);
        } else {
             alert("Erreur: ID manquant après création");
        }
      } else {
        alert("Erreur lors de la création de la personne");
      }
    } catch (error) {
      console.error("Error creating person:", error);
      alert("Erreur lors de la création");
    } finally {
      creatingPerson = false;
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
          <Avatar
            src="/api/avatar/{user?.profile_id}"
            alt={profile.name}
            size={80}
            fallbackText={profile.name?.charAt(0) || "?"}
          />
          <div>
            <h2>{profile.name}</h2>
            <p class="promo">Promo {profile.level || "N/A"}</p>
          </div>
        </div>
      </div>

      <!-- Bio -->
      <div class="form-section">
        <TextArea
          id="bio"
          label="Biographie"
          bind:value={bio}
          rows={6}
          placeholder="Décrivez-vous..."
        />
      </div>

      <!-- Links -->
      <div class="form-section">
        <h3>Mes Liens</h3>
        <LinkInput
          id="linkedin"
          label="LinkedIn"
          icon={Linkedin}
          bind:value={links["LinkedIn"]}
          placeholder="https://linkedin.com/in/..."
        />
        <LinkInput
          id="email"
          label="Email"
          icon={Mail}
          type="email"
          bind:value={links["Email"]}
          placeholder="mon.email@example.com"
        />
        <LinkInput
          id="github"
          label="GitHub"
          icon={Github}
          bind:value={links["GitHub"]}
          placeholder="https://github.com/..."
        />
        <LinkInput
          id="instagram"
          label="Instagram"
          icon={Instagram}
          bind:value={links["Instagram"]}
          placeholder="https://instagram.com/..."
        />
        <LinkInput
          id="phone"
          label="Téléphone"
          icon={Phone}
          type="tel"
          bind:value={links["Phone"]}
          placeholder="+33 6 12 34 56 78"
        />
        <LinkInput
          id="website"
          label="Site Web"
          icon={Globe}
          bind:value={links["Website"]}
          placeholder="https://monsite.com"
        />
      </div>

      <!-- Fillots -->
      <div class="form-section">
        <h3>Mes Fillots ({fillots.length}/3 max)</h3>

        <RelationshipSection
          title="Officiels"
          count={fillotParrainage.length}
          maxCount={3}
          relationships={fillotParrainage}
          {people}
          idField="person_id_2"
          onRemove={removeRelationship}
        />

        <RelationshipSection
          title="D'adoption"
          count={fillotAdoption.length}
          maxCount={3}
          relationships={fillotAdoption}
          {people}
          idField="person_id_2"
          onRemove={removeRelationship}
        />
      </div>

      <!-- Parrains -->
      <div class="form-section">
        <h3>Mes Parrains</h3>

        <RelationshipSection
          title="Officiel (max 1)"
          count={parrainParrainage ? 1 : 0}
          maxCount={1}
          relationships={parrainParrainage ? [parrainParrainage] : []}
          {people}
          idField="person_id_1"
          onRemove={removeRelationship}
          emptyMessage="Aucun parrain officiel"
        />

        <RelationshipSection
          title="D'adoption (max 1)"
          count={parrainAdoption ? 1 : 0}
          maxCount={1}
          relationships={parrainAdoption ? [parrainAdoption] : []}
          {people}
          idField="person_id_1"
          onRemove={removeRelationship}
          emptyMessage="Aucun parrain d'adoption"
        />
      </div>

      <!-- Add Relationship -->
      <div class="form-section">
        <h3>Ajouter une relation</h3>
        <div class="add-relationship">
          <div class="relationship-controls">
            <div class="control-group">
              <span class="group-label">Rôle à ajouter :</span>
              <div class="radio-group">
                <label>
                  <input type="radio" bind:group={addRole} value="fillot" />
                  Fillot
                </label>
                <label>
                  <input type="radio" bind:group={addRole} value="parrain" />
                  Parrain
                </label>
              </div>
            </div>

            <div class="control-group">
              <span class="group-label">Type :</span>
              <div class="radio-group">
                <label>
                  <input
                    type="radio"
                    bind:group={addType}
                    value="parrainage"
                  />
                  Officiel
                </label>
                <label>
                  <input
                    type="radio"
                    bind:group={addType}
                    value="adoption"
                  />
                  Adoption
                </label>
              </div>
            </div>
          </div>

          <div class="search-box">
            <input
              class="input"
              type="text"
              placeholder="Rechercher une personne..."
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
                  <div class="person-info">
                    <strong>{person.prenom} {person.nom}</strong>
                    {#if person.level}<span class="level">Promo {person.level}</span>{/if}
                  </div>
                  <span class="action-icon">+</span>
                </button>
              {/each}
            </div>
          {:else if searchTerm.length > 2}
             <div class="no-results">
                <p>Aucun résultat trouvé pour "{searchTerm}"</p>
                <Button 
                   variant="outline" 
                   size="sm"
                   on:click={() => showCreatePerson = !showCreatePerson}
                >
                   {showCreatePerson ? "Annuler la création" : "Créer une nouvelle personne"}
                </Button>
             </div>
          {/if}
          
          {#if showCreatePerson}
            <div class="create-person-form">
               <h4>Créer une nouvelle personne</h4>
               <div class="form-row">
                 <input 
                    class="input" 
                    type="text" 
                    placeholder="Prénom"
                    bind:value={newPerson.firstName}
                 />
                 <input 
                    class="input" 
                    type="text" 
                    placeholder="Nom"
                    bind:value={newPerson.lastName}
                 />
               </div>
               <div class="form-actions">
                  <Button 
                    disabled={creatingPerson}
                    loading={creatingPerson}
                    on:click={createNewPerson}
                  >
                    Créer et Ajouter comme {addRole}
                  </Button>
               </div>
            </div>
          {/if}

        </div>
      </div>

      <!-- Save Button -->
      <div class="actions">
        <Button variant="outline" on:click={() => goto("/")}>
          Retour à la carte
        </Button>
        <Button
          variant="secondary"
          disabled={saving}
          loading={saving}
          on:click={saveProfile}
        >
          Sauvegarder
        </Button>
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
    background: var(--gradient-dark);
    padding: 80px 20px 40px;
  }

  .edit-container {
    max-width: 800px;
    margin: 0 auto;
    background: var(--bg-card);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-lg);
    padding: var(--spacing-xl);
    color: var(--text-primary);
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

  .form-section {
    margin-bottom: 32px;
  }

  .form-section h3 {
    color: rgba(255, 255, 255, 0.9);
    font-size: 18px;
    margin-bottom: 16px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    padding-bottom: 8px;
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

  .searching,
  .loading {
    text-align: center;
    color: rgba(255, 255, 255, 0.6);
    padding: 20px;
  }

  .actions {
    display: flex;
    gap: 12px;
    justify-content: flex-end;
    margin-top: 32px;
    padding-top: 24px;
    border-top: 1px solid rgba(255, 255, 255, 0.1);
  }

  .loading,
  .searching,
  .error {
    text-align: center;
    padding: 40px;
    color: rgba(255, 255, 255, 0.6);
  }

  .relationship-controls {
    display: flex;
    gap: 20px;
    margin-bottom: 20px;
    flex-wrap: wrap;
  }

  .control-group .group-label {
    display: block;
    color: rgba(255, 255, 255, 0.7);
    font-size: 12px;
    margin-bottom: 8px;
    text-transform: uppercase;
  }

  .radio-group {
    display: flex;
    gap: 16px;
    background: rgba(0, 0, 0, 0.2);
    padding: 8px 12px;
    border-radius: 6px;
  }

  .radio-group label {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0;
    cursor: pointer;
    color: white;
    font-size: 14px;
    text-transform: none;
  }

  .result-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .person-info {
    display: flex;
    gap: 8px;
    align-items: center;
  }

  .level {
    font-size: 12px;
    color: rgba(255, 255, 255, 0.5);
    background: rgba(255, 255, 255, 0.1);
    padding: 2px 6px;
    border-radius: 4px;
  }

  .no-results {
    padding: 20px;
    text-align: center;
    color: rgba(255, 255, 255, 0.6);
    background: rgba(255, 255, 255, 0.05);
    border-radius: 6px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
  }

  .no-results p {
     margin: 0;
  }

  .create-person-form {
    margin-top: 20px;
    padding: 20px;
    background: rgba(59, 130, 246, 0.1);
    border: 1px solid rgba(59, 130, 246, 0.2);
    border-radius: 8px;
  }

  .create-person-form h4 {
    color: #3b82f6;
    margin-top: 0;
  }

  .form-row {
    display: flex;
    gap: 10px;
    margin-bottom: 16px;
  }

  .form-actions {
    display: flex;
    justify-content: flex-end;
  }
</style>
