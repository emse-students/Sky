<script lang="ts">
  import { onMount } from "svelte";
  import { page } from "$app/stores";
  import { signIn } from "@auth/sveltekit/client";
  import { graphStore, selectedPersonId, focusDepth } from "$stores/graphStore";
  import { cameraStore } from "$stores/cameraStore";
  import StarfieldCanvas from "$components/Canvas/StarfieldCanvas.svelte";
  import GraphCanvas from "$components/Canvas/GraphCanvas.svelte";
  import { getPersonName, getPersonInitials } from "$lib/utils/format";
  import {
    Linkedin,
    Mail,
    Globe,
    Github,
    Instagram,
    Phone,
    Link,
    User,
    Edit,
    LogOut,
  } from "lucide-svelte";

  // UI State
  let searchTerm = "";
  let isSearchActive = false;
  let searchResults: any[] = [];
  let isProfileModalOpen = false;
  let currentProfile: any = null;
  let isLoading = true;

  // Derived values
  $: user = $page.data.user;
  $: isAuthenticated = !!user;
  $: people = $graphStore.people;

  // Create a map for efficient lookups by ID
  $: peopleMap = new Map(people.map((p) => [p.id, p]));

  // Watch for selection changes (from Graph or Search)
  $: if ($selectedPersonId) {
    const person = peopleMap.get($selectedPersonId);
    if (person) {
      openProfile(person);
    }
  } else {
    // Fermer le profil si la sélection est annulée (ex: clic sur fond)
    isProfileModalOpen = false;
  }

  onMount(() => {
    // Simulate loading done when mounted (or bind to graph loaded state if available)
    setTimeout(() => {
      isLoading = false;
    }, 1000);
  });

  // Normalize string for search: remove accents, lowercase
  function normalizeString(str: string): string {
    return str
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  }

  // Get avatar URL from MiGallery API via our proxy
  function getAvatarUrl(personId: string): string {
    return `/api/avatar/${personId}`;
  }

  // Get icon component for link type
  function getLinkIcon(type: string) {
    const normalizedType = type.toLowerCase();
    if (normalizedType.includes("linkedin")) return Linkedin;
    if (normalizedType.includes("email") || normalizedType.includes("mail"))
      return Mail;
    if (normalizedType.includes("github")) return Github;
    if (normalizedType.includes("instagram")) return Instagram;
    if (normalizedType.includes("phone") || normalizedType.includes("tél"))
      return Phone;
    if (normalizedType.includes("website") || normalizedType.includes("site"))
      return Globe;
    return Link;
  }

  function handleSearch() {
    if (!searchTerm) {
      isSearchActive = false;
      return;
    }

    const normalizedTerm = normalizeString(searchTerm.trim());
    const terms = normalizedTerm.split(/\s+/); // Split by spaces

    searchResults = Object.values(people)
      .filter((p: any) => {
        const normalizedName = normalizeString(getPersonName(p));
        const level = p.level?.toString() || "";

        // Check if the full search term is in the name
        if (normalizedName.includes(normalizedTerm)) return true;

        // Check if level matches
        if (level.includes(normalizedTerm)) return true;

        // Check if all search terms are in the name (any order)
        if (terms.length > 1) {
          const allTermsMatch = terms.every((term) =>
            normalizedName.includes(term),
          );
          if (allTermsMatch) return true;
        }

        return false;
      })
      .slice(0, 10);

    isSearchActive = searchResults.length > 0;
  }

  function selectResult(person: any) {
    selectedPersonId.set(person.id);
    searchTerm = "";
    isSearchActive = false;
  }

  function openProfile(person: any) {
    currentProfile = person;
    isProfileModalOpen = true;
  }

  function closeProfile() {
    isProfileModalOpen = false;
    // Sur mobile (portrait), ne pas réinitialiser la sélection pour garder la position de la caméra
    const isMobile = window.innerHeight > window.innerWidth;
    if (!isMobile) {
      selectedPersonId.set(null); // Clear selection on graph (desktop only)
    }
  }

  function handleLogin() {
    signIn("cas-emse");
  }

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/";
  }

  function goToMyProfile() {
    if (user?.profile_id) {
      const userId = user.profile_id;
      if (peopleMap.has(userId)) {
        selectedPersonId.set(userId);
        // Center camera on user's star
        const userPos = $graphStore.positions[userId];
        if (userPos) {
          cameraStore.setTarget(userPos.x, userPos.y, 0.5);
        }
      }
    }
  }

  function resetView() {
    selectedPersonId.set(null);
    cameraStore.reset();
  }
</script>

<svelte:head>
  <title>Sky - Navigation des Étoiles ICM</title>
</svelte:head>

<!-- Background Starfield -->
<StarfieldCanvas />

<!-- Graph Canvas -->
<GraphCanvas />

<!-- Navigation Bar -->
<nav class="navbar">
  <div class="navbar-container">
    <!-- Logo -->
    <a href="/" class="navbar-brand">
      <img src="/sky.png" alt="Sky" class="navbar-logo" />
      <span class="navbar-title">SKY</span>
    </a>

    <!-- Search -->
    <div class="navbar-search">
      <input
        type="text"
        placeholder="Rechercher une étoile..."
        bind:value={searchTerm}
        oninput={handleSearch}
        onfocus={() => {
          if (searchTerm) isSearchActive = true;
        }}
        onblur={() => setTimeout(() => (isSearchActive = false), 200)}
        class="search-input"
      />
      {#if isSearchActive && searchResults.length > 0}
        <div class="search-results">
          {#each searchResults as result}
            <!-- svelte-ignore a11y-click-events-have-key-events -->
            <!-- svelte-ignore a11y-no-static-element-interactions -->
            <div
              class="search-result-item"
              onclick={() => selectResult(result)}
            >
              <div class="result-name">{getPersonName(result)}</div>
              <div class="result-info">
                Promo {result.level || "N/A"}
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </div>

    <!-- User Actions -->
    <div class="navbar-actions">
      {#if !isAuthenticated}
        <button class="btn-login" onclick={handleLogin}> Se connecter </button>
      {:else}
        <div class="user-menu">
          <button class="user-button">
            <img
              src={`/api/avatar/${user?.profile_id || user?.id}`}
              alt={user?.name}
              class="user-avatar"
              onerror={(e) => {
                const target = e.currentTarget as HTMLImageElement;
                target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(user?.name || "User")}`;
              }}
            />
            <span class="user-name">{user?.name || "Utilisateur"}</span>
            <svg
              class="user-chevron"
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
            >
              <path
                d="M4 6L8 10L12 6"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </button>
          <div class="user-dropdown">
            <button class="dropdown-item" onclick={goToMyProfile}>
              <User size={16} />
              <span>Mon profil</span>
            </button>
            <a href="/profile/edit" class="dropdown-item">
              <Edit size={16} />
              <span>Éditer</span>
            </a>
            <div class="dropdown-divider"></div>
            <button class="dropdown-item danger" onclick={handleLogout}>
              <LogOut size={16} />
              <span>Déconnexion</span>
            </button>
          </div>
        </div>
      {/if}
    </div>
  </div>
</nav>

<!-- Loading -->
<div id="loading" class="loading" class:hidden={!isLoading}>
  <div class="spinner"></div>
  <div class="loading-text">Chargement des constellations...</div>
</div>

<!-- Focus Controls (only visible when someone is selected) -->
{#if $selectedPersonId}
  <div class="focus-controls">
    <div class="focus-control-header">
      <span class="focus-label">Mode Focus</span>
      <button class="btn-reset" onclick={resetView}>Tout afficher</button>
    </div>
    <div class="focus-depth-control">
      <label for="focusDepth">Profondeur: {$focusDepth} sauts</label>
      <input
        type="range"
        id="focusDepth"
        min="1"
        max="5"
        bind:value={$focusDepth}
      />
    </div>
  </div>
{/if}

<!-- Profile Sidebar Panel -->
<aside
  id="profilePanel"
  class="profile-panel"
  class:active={isProfileModalOpen}
>
  <div class="panel-header">
    <h2>Profil</h2>
    <button class="panel-close" onclick={closeProfile}>×</button>
  </div>

  {#if currentProfile}
    <div class="panel-content">
      <div class="profile-avatar-section">
        <div class="profile-avatar-large">
          <img
            src={getAvatarUrl(currentProfile.id)}
            alt={getPersonName(currentProfile)}
            onerror={(e) => {
              const target = e.currentTarget as HTMLImageElement;
              const sibling = target.nextElementSibling as HTMLElement;
              if (sibling) {
                target.style.display = "none";
                sibling.style.display = "flex";
              }
            }}
          />
          <div class="avatar-placeholder-large" style="display: none;">
            {getPersonInitials(currentProfile)}
          </div>
        </div>
        <h3 class="profile-name">{getPersonName(currentProfile)}</h3>
        <div class="profile-promo">Promo {currentProfile.level || "N/A"}</div>
      </div>

      <div class="profile-section">
        <h4>Biographie</h4>
        <p class="profile-bio">
          {currentProfile.bio || "Aucune biographie disponible."}
        </p>
      </div>

      {#if currentProfile.links && Object.keys(currentProfile.links).length > 0}
        <div class="profile-section">
          <h4>Liens</h4>
          <div class="profile-links">
            {#each Object.entries(currentProfile.links) as [type, url]}
              <a
                href={String(url)}
                target="_blank"
                rel="noopener noreferrer"
                class="profile-link"
              >
                <svelte:component this={getLinkIcon(type)} size={16} />
                <span>{type}</span>
              </a>
            {/each}
          </div>
        </div>
      {/if}

      {#if currentProfile.associations && currentProfile.associations.length > 0}
        <div class="profile-section">
          <h4>Associations</h4>
          <div class="profile-associations">
            {#each currentProfile.associations as asso}
              <div class="asso-item">
                <span class="asso-name">{asso.name}</span>
                <span class="asso-role">{asso.role}</span>
              </div>
            {/each}
          </div>
        </div>
      {/if}
    </div>
  {/if}
</aside>

<style>
  /* Navbar - Inspired by MiGallery */
  .navbar {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    z-index: 100;
    background: rgba(10, 15, 35, 0.95);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    border-bottom: 1px solid rgba(135, 206, 250, 0.2);
    box-shadow: 0 2px 20px rgba(0, 0, 0, 0.5);
  }

  .navbar-container {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 24px;
    max-width: 1400px;
    margin: 0 auto;
  }

  .navbar-brand {
    display: flex;
    align-items: center;
    gap: 12px;
    text-decoration: none;
    transition: opacity 0.2s;
  }

  .navbar-brand:hover {
    opacity: 0.8;
  }

  .navbar-logo {
    height: 40px;
    width: auto;
  }

  .navbar-title {
    font-family: "Orbitron", sans-serif;
    font-size: 24px;
    font-weight: 700;
    color: #87ceeb;
    letter-spacing: 2px;
  }

  .navbar-search {
    flex: 1;
    max-width: 500px;
    margin: 0 32px;
    position: relative;
  }

  .search-input {
    width: 100%;
    padding: 12px 20px;
    background: rgba(20, 30, 60, 0.8);
    border: 1px solid rgba(135, 206, 250, 0.3);
    border-radius: 24px;
    color: #fff;
    font-size: 15px;
    font-family: "Space Grotesk", sans-serif;
    outline: none;
    transition: all 0.3s ease;
  }

  .search-input::placeholder {
    color: rgba(135, 206, 250, 0.4);
  }

  .search-input:focus {
    background: rgba(20, 30, 60, 1);
    border-color: rgba(135, 206, 250, 0.6);
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.15);
  }

  .search-results {
    position: absolute;
    top: calc(100% + 8px);
    left: 0;
    right: 0;
    background: rgba(15, 20, 40, 0.98);
    backdrop-filter: blur(20px);
    border: 1px solid rgba(135, 206, 250, 0.3);
    border-radius: 12px;
    max-height: 400px;
    overflow-y: auto;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6);
  }

  .search-result-item {
    padding: 12px 16px;
    cursor: pointer;
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    transition: background 0.2s;
  }

  .search-result-item:last-child {
    border-bottom: none;
  }

  .search-result-item:hover {
    background: rgba(135, 206, 250, 0.1);
  }

  .result-name {
    color: #fff;
    font-weight: 500;
    margin-bottom: 4px;
  }

  .result-info {
    color: rgba(135, 206, 250, 0.7);
    font-size: 13px;
  }

  .navbar-actions {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .btn-login {
    padding: 10px 24px;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    border: none;
    border-radius: 24px;
    color: white;
    font-weight: 600;
    font-size: 14px;
    cursor: pointer;
    transition: all 0.3s ease;
    box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
  }

  .btn-login:hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 20px rgba(102, 126, 234, 0.5);
  }

  .user-menu {
    position: relative;
  }

  .user-button {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 16px;
    background: rgba(20, 30, 60, 0.8);
    border: 1px solid rgba(135, 206, 250, 0.3);
    border-radius: 24px;
    color: white;
    cursor: pointer;
    transition: all 0.2s;
  }

  .user-button:hover {
    background: rgba(30, 40, 70, 0.9);
    border-color: rgba(135, 206, 250, 0.5);
  }

  .user-avatar {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    border: 2px solid rgba(135, 206, 250, 0.5);
  }

  .user-name {
    font-size: 14px;
    font-weight: 500;
  }

  .user-chevron {
    color: rgba(135, 206, 250, 0.7);
    transition: transform 0.2s;
  }

  .user-menu:hover .user-chevron {
    transform: rotate(180deg);
  }

  .user-dropdown {
    position: absolute;
    top: calc(100% + 4px);
    right: 0;
    min-width: 200px;
    background: rgba(15, 20, 40, 0.98);
    backdrop-filter: blur(20px);
    border: 1px solid rgba(135, 206, 250, 0.3);
    border-radius: 12px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6);
    opacity: 0;
    visibility: hidden;
    transform: translateY(-10px);
    transition:
      opacity 0.15s,
      visibility 0.15s,
      transform 0.15s;
    transition-delay: 0s;
    overflow: hidden;
    pointer-events: none;
  }

  .user-menu:hover .user-dropdown,
  .user-dropdown:hover {
    opacity: 1;
    visibility: visible;
    transform: translateY(0);
    transition-delay: 0s, 0s, 0s;
    pointer-events: auto;
  }

  /* Keep dropdown visible when moving from button to dropdown */
  .user-menu:hover .user-dropdown {
    transition-delay: 0.15s, 0.15s, 0.15s;
  }

  .dropdown-item {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 12px 16px;
    background: none;
    border: none;
    color: rgba(255, 255, 255, 0.9);
    font-size: 14px;
    text-align: left;
    text-decoration: none;
    cursor: pointer;
    transition: background 0.2s;
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  }

  .dropdown-item:last-child {
    border-bottom: none;
  }

  .dropdown-item:hover {
    background: rgba(135, 206, 250, 0.1);
  }

  .dropdown-item.danger {
    color: #ff6b6b;
  }

  .dropdown-item.danger:hover {
    background: rgba(255, 107, 107, 0.1);
  }

  .dropdown-divider {
    height: 1px;
    background: rgba(255, 255, 255, 0.1);
    margin: 4px 0;
  }

  /* Profile Sidebar Panel */
  .profile-panel {
    position: fixed;
    left: 0;
    top: 0;
    width: 400px;
    height: 100vh;
    background: rgba(17, 24, 39, 0.98);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    border-right: 1px solid rgba(59, 130, 246, 0.3);
    transform: translateX(-100%);
    transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    z-index: 100;
    overflow-y: auto;
    box-shadow: 4px 0 24px rgba(0, 0, 0, 0.5);
  }

  .profile-panel.active {
    transform: translateX(0);
  }

  .panel-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 20px 24px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    position: sticky;
    top: 0;
    background: rgba(17, 24, 39, 0.98);
    backdrop-filter: blur(20px);
    z-index: 10;
  }

  .panel-header h2 {
    font-size: 20px;
    font-weight: 600;
    color: white;
    margin: 0;
  }

  .panel-close {
    background: transparent;
    border: none;
    color: rgba(255, 255, 255, 0.7);
    font-size: 32px;
    cursor: pointer;
    padding: 0;
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 6px;
    transition: all 0.2s;
  }

  .panel-close:hover {
    background: rgba(255, 255, 255, 0.1);
    color: white;
  }

  .panel-content {
    padding: 24px;
  }

  .profile-avatar-section {
    text-align: center;
    margin-bottom: 32px;
  }

  .profile-avatar-large {
    width: 120px;
    height: 120px;
    margin: 0 auto 16px;
    border-radius: 50%;
    overflow: hidden;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    display: flex;
    align-items: center;
    justify-content: center;
    border: 3px solid rgba(59, 130, 246, 0.3);
  }

  .profile-avatar-large img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .avatar-placeholder-large {
    color: white;
    font-size: 48px;
    font-weight: 600;
    text-transform: uppercase;
  }

  .profile-name {
    font-size: 24px;
    font-weight: 600;
    color: white;
    margin: 0 0 8px 0;
  }

  .profile-promo {
    color: rgba(255, 255, 255, 0.7);
    font-size: 14px;
  }

  .profile-section {
    margin-bottom: 24px;
  }

  .profile-section h4 {
    font-size: 14px;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.9);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin: 0 0 12px 0;
  }

  .profile-bio {
    color: rgba(255, 255, 255, 0.8);
    line-height: 1.6;
    margin: 0;
  }

  .profile-links {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .profile-link {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 16px;
    background: rgba(59, 130, 246, 0.1);
    border: 1px solid rgba(59, 130, 246, 0.3);
    border-radius: 6px;
    color: #60a5fa;
    text-decoration: none;
    font-size: 14px;
    transition: all 0.2s;
  }

  .profile-link:hover {
    background: rgba(59, 130, 246, 0.2);
    border-color: rgba(59, 130, 246, 0.5);
  }

  .profile-associations {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .asso-item {
    padding: 12px;
    background: rgba(255, 255, 255, 0.05);
    border-radius: 8px;
    border: 1px solid rgba(255, 255, 255, 0.1);
  }

  .asso-name {
    display: block;
    color: white;
    font-weight: 500;
    margin-bottom: 4px;
  }

  .asso-role {
    display: block;
    color: rgba(255, 255, 255, 0.6);
    font-size: 13px;
  }

  /* Adjust canvas when panel is open */
  :global(body:has(.profile-panel.active) #graph) {
    transform: translateX(200px);
    transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  }

  /* Focus Controls */
  .focus-controls {
    position: fixed;
    bottom: 20px;
    right: 20px;
    z-index: 50;
    background: rgba(17, 24, 39, 0.95);
    backdrop-filter: blur(10px);
    border: 1px solid rgba(59, 130, 246, 0.3);
    border-radius: 12px;
    padding: 16px;
    min-width: 250px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
  }

  .focus-control-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
  }

  .focus-label {
    color: white;
    font-weight: 600;
    font-size: 14px;
  }

  .btn-reset {
    background: rgba(239, 68, 68, 0.2);
    border: 1px solid rgba(239, 68, 68, 0.4);
    color: #f87171;
    padding: 6px 12px;
    border-radius: 6px;
    cursor: pointer;
    font-size: 12px;
    font-weight: 500;
    transition: all 0.2s;
  }

  .btn-reset:hover {
    background: rgba(239, 68, 68, 0.3);
    border-color: rgba(239, 68, 68, 0.6);
  }

  .focus-depth-control {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .focus-depth-control label {
    color: rgba(255, 255, 255, 0.7);
    font-size: 13px;
  }

  .focus-depth-control input[type="range"] {
    width: 100%;
    accent-color: #3b82f6;
  }

  /* Mobile Responsiveness */
  @media (max-width: 768px) {
    .navbar-container {
      padding: 12px 12px;
      gap: 8px;
    }

    .navbar-title {
      display: none;
    }

    .navbar-search {
      margin: 0 8px;
    }

    .user-name {
      display: none;
    }

    .btn-login {
      padding: 8px 12px;
      font-size: 13px;
    }

    .user-button {
      padding: 6px 8px;
    }
  }

  /* Profile Panel - Bottom Sheet on Mobile & Portrait (screens taller than wide) */
  @media (max-width: 768px), (orientation: portrait) {
    .profile-panel {
      width: 100%;
      height: 60vh;
      top: auto;
      bottom: 0;
      left: 0;
      border-right: none;
      border-top: 1px solid rgba(59, 130, 246, 0.3);
      transform: translateY(100%);
      border-top-left-radius: 20px;
      border-top-right-radius: 20px;
      box-shadow: 0 -4px 24px rgba(0, 0, 0, 0.5);
    }

    .profile-panel.active {
      transform: translateY(0);
    }

    :global(body:has(.profile-panel.active) #graph) {
      transform: none;
    }
  }
</style>
