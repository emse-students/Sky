<script lang="ts">
  import { onMount } from "svelte";
  import { fade, fly } from "svelte/transition";
  import { cubicOut } from "svelte/easing";
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
    Search,
    Target,
    X,
    ChevronDown,
    Loader2,
    Database,
  } from "lucide-svelte";

  // UI State
  let searchTerm = "";
  let isSearchActive = false;
  let searchResults: any[] = [];
  let isProfileModalOpen = false;
  let currentProfile: any = null;
  let isLoading = true;

  const loadingMessages = [
    "Initialisation de la voûte céleste...",
    "Cartographie des étoiles...",
    "Synchronisation des constellations...",
    "Calibration du télescope...",
    "Déploiement de la galaxie...",
  ];
  let currentLoadingMessage =
    loadingMessages[Math.floor(Math.random() * loadingMessages.length)];

  // Correction de l'erreur de compilation en utilisant une syntaxe d'indexation plus simple
  let imageErrors: { [id: string]: boolean } = {};

  // Derived values
  $: user = $page.data.user;
  $: isAuthenticated = !!user;
  $: people = $graphStore.people;

  // Create a map for efficient lookups by ID
  $: peopleMap = new Map(people.map((p) => [p.id, p]));

  // Watch for selection changes
  $: if ($selectedPersonId) {
    const person = peopleMap.get($selectedPersonId);
    if (person) {
      currentProfile = person;
      isProfileModalOpen = true;
    }
  } else {
    isProfileModalOpen = false;
  }

  onMount(() => {
    // Rotation des messages de chargement
    const messageInterval = setInterval(() => {
      currentLoadingMessage =
        loadingMessages[Math.floor(Math.random() * loadingMessages.length)];
    }, 2000);

    // Simulation du chargement initial
    const timer = setTimeout(() => {
      isLoading = false;
      clearInterval(messageInterval);
    }, 800);

    return () => {
      clearTimeout(timer);
      clearInterval(messageInterval);
    };
  });

  function normalizeString(str: string): string {
    return (str || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  }

  function getAvatarUrl(personId: string): string {
    return `/api/avatar/${personId}`;
  }

  function handleImageError(id: string) {
    imageErrors[id] = true;
    imageErrors = imageErrors; // Déclenche la réactivité Svelte
  }

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
    if (!searchTerm.trim()) {
      isSearchActive = false;
      searchResults = [];
      return;
    }

    const normalizedTerm = normalizeString(searchTerm.trim());
    const terms = normalizedTerm.split(/\s+/);

    searchResults = people
      .filter((p: any) => {
        const normalizedName = normalizeString(getPersonName(p));
        const level = p.level?.toString() || "";

        if (normalizedName.includes(normalizedTerm)) return true;
        if (level.includes(normalizedTerm)) return true;

        return (
          terms.length > 1 && terms.every((t) => normalizedName.includes(t))
        );
      })
      .slice(0, 8);

    isSearchActive = true;
  }

  function selectResult(person: any) {
    selectedPersonId.set(person.id);
    centerOnPerson(person.id);
    searchTerm = "";
    isSearchActive = false;
  }

  function centerOnPerson(id: string) {
    const pos = $graphStore.positions[id];
    if (pos) {
      cameraStore.setTarget(pos.x, pos.y, 0.6);
    }
  }

  function closeProfile() {
    isProfileModalOpen = false;
    const isMobile =
      typeof window !== "undefined" && window.innerHeight > window.innerWidth;
    if (!isMobile) {
      selectedPersonId.set(null);
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
    if (user?.profile_id && peopleMap.has(user.profile_id)) {
      selectedPersonId.set(user.profile_id);
      centerOnPerson(user.profile_id);
    }
  }

  function resetView() {
    selectedPersonId.set(null);
    cameraStore.reset();
  }
</script>

<svelte:head>
  <title>Sky - Cartographie ICM</title>
</svelte:head>

<StarfieldCanvas />
<GraphCanvas />

<nav class="nav-glass">
  <div class="nav-content">
    <a
      href="/"
      class="brand"
      onclick={(e) => {
        e.preventDefault();
        resetView();
      }}
    >
      <div class="logo-wrapper">
        <img
          src="/sky.png"
          alt="Sky"
          class="logo"
          onerror={(e) => {
            (e.currentTarget as HTMLElement).style.display = "none";
          }}
        />
      </div>
      <span class="brand-text">SKY</span>
    </a>

    <div class="search-container">
      <div class="search-box" class:has-focus={isSearchActive}>
        <Search size={18} class="search-icon" />
        <input
          type="text"
          placeholder="Rechercher une étoile, une promo..."
          bind:value={searchTerm}
          oninput={handleSearch}
          onfocus={() => searchTerm && (isSearchActive = true)}
          onblur={() => setTimeout(() => (isSearchActive = false), 200)}
        />
        {#if searchTerm}
          <button
            class="clear-search"
            onclick={() => {
              searchTerm = "";
              handleSearch();
            }}
          >
            <X size={14} />
          </button>
        {/if}
      </div>

      {#if isSearchActive}
        <div class="search-dropdown" transition:fly={{ y: 10, duration: 200 }}>
          {#if searchResults.length > 0}
            {#each searchResults as result}
              <button class="search-item" onclick={() => selectResult(result)}>
                <div class="item-avatar">
                  {#if imageErrors[result.id]}
                    {getPersonInitials(result)}
                  {:else}
                    <img
                      src={getAvatarUrl(result.id)}
                      alt=""
                      onerror={() => handleImageError(result.id)}
                    />
                  {/if}
                </div>
                <div class="item-meta">
                  <span class="item-name">{getPersonName(result)}</span>
                  <span class="item-sub">Promo {result.level || "—"}</span>
                </div>
              </button>
            {/each}
          {:else}
            <div class="search-empty">Aucune étoile trouvée</div>
          {/if}
        </div>
      {/if}
    </div>

    <div class="actions">
      {#if !isAuthenticated}
        <button class="login-trigger" onclick={handleLogin}> Connexion </button>
      {:else}
        <div class="user-dropdown-container">
          <button class="user-trigger">
            <div class="user-avatar-small">
              <img
                src={getAvatarUrl(user?.profile_id || user?.id)}
                alt=""
                onerror={(e) => {
                  (e.currentTarget as HTMLImageElement).src =
                    `https://ui-avatars.com/api/?name=${encodeURIComponent(user?.name || "U")}&background=random`;
                }}
              />
            </div>
            <span class="user-label">
              {user?.profile_id
                ? peopleMap.get(user.profile_id)?.prenom || user.name
                : user.name}
            </span>
            <ChevronDown size={14} class="chevron" />
          </button>

          <div class="dropdown-menu">
            <button onclick={goToMyProfile} class="menu-item">
              <User size={16} /> Mon profil
            </button>
            <a href="/profile/edit" class="menu-item">
              <Edit size={16} /> Modifier
            </a>
            {#if user?.profile_id === "jolan.boudin"}
              <div class="menu-divider"></div>
              <a href="/admin" class="menu-item">
                <Database size={16} /> Administration
              </a>
            {/if}
            <div class="menu-divider"></div>
            <button onclick={handleLogout} class="menu-item logout">
              <LogOut size={16} /> Déconnexion
            </button>
          </div>
        </div>
      {/if}
    </div>
  </div>
</nav>

{#if isLoading}
  <div class="loader-overlay" transition:fade>
    <div class="loader-content">
      <Loader2 class="spin" size={40} />
      <span>{currentLoadingMessage}</span>
    </div>
  </div>
{/if}

{#if $selectedPersonId}
  <div
    class="focus-hub"
    transition:fly={{ y: 50, duration: 400, easing: cubicOut }}
  >
    <div class="hub-header">
      <div class="hub-title">
        <Target size={16} />
        <span>Mode Focus</span>
      </div>
      <button class="hub-reset" onclick={resetView}>Sortir</button>
    </div>
    <div class="hub-body">
      <div class="range-group">
        <div class="range-labels">
          <label for="fdepth">Profondeur du réseau</label>
          <span class="range-value"
            >{$focusDepth} {$focusDepth > 1 ? "sauts" : "saut"}</span
          >
        </div>
        <input
          id="fdepth"
          type="range"
          min="1"
          max="5"
          bind:value={$focusDepth}
        />
      </div>
    </div>
  </div>
{/if}

{#if isProfileModalOpen && currentProfile}
  <aside
    class="profile-sidebar"
    transition:fly={{ x: -400, duration: 400, easing: cubicOut }}
  >
    <button class="close-sidebar" onclick={closeProfile} aria-label="Fermer">
      <X size={24} />
    </button>

    <div class="sidebar-scroll">
      <header class="sidebar-hero">
        <div class="hero-avatar">
          <div class="avatar-ring"></div>
          {#if imageErrors[currentProfile.id]}
            <div class="avatar-initials">
              {getPersonInitials(currentProfile)}
            </div>
          {:else}
            <img
              src={getAvatarUrl(currentProfile.id)}
              alt=""
              onerror={() => handleImageError(currentProfile.id)}
            />
          {/if}
        </div>
        <h2>{getPersonName(currentProfile)}</h2>
        <div class="badge-promo">
          Promotion {currentProfile.level || "Inconnue"}
        </div>

        <button
          class="btn-center"
          onclick={() => centerOnPerson(currentProfile.id)}
        >
          <Target size={16} /> Centrer la vue
        </button>
      </header>

      <section class="sidebar-info">
        <div class="info-block">
          <h3>Bio</h3>
          <p>
            {currentProfile.bio ||
              "Cette étoile n'a pas encore rédigé sa biographie."}
          </p>
        </div>

        {#if currentProfile.links && Object.keys(currentProfile.links).length > 0}
          <div class="info-block">
            <h3>Coordonnées</h3>
            <div class="link-grid">
              {#each Object.entries(currentProfile.links) as [type, url]}
                <a
                  href={String(url)}
                  target="_blank"
                  rel="noopener noreferrer"
                  class="social-link"
                >
                  <svelte:component this={getLinkIcon(type)} size={16} />
                  <span>{type}</span>
                </a>
              {/each}
            </div>
          </div>
        {/if}

        {#if currentProfile.associations?.length > 0}
          <div class="info-block">
            <h3>Constellations (Associations)</h3>
            <div class="asso-list">
              {#each currentProfile.associations as asso}
                <div class="asso-card">
                  <span class="asso-n">{asso.name}</span>
                  <span class="asso-r">{asso.role}</span>
                </div>
              {/each}
            </div>
          </div>
        {/if}
      </section>
    </div>
  </aside>
{/if}

<style>
  :root {
    --bg-dark: #05070a;
    --glass-bg: rgba(10, 15, 30, 0.85);
    --accent: #3b82f6;
    --accent-glow: rgba(59, 130, 246, 0.5);
    --text-main: #f8fafc;
    --text-dim: #94a3b8;
    --border: rgba(255, 255, 255, 0.1);
    --nav-height: 72px;
  }

  .nav-glass {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    height: var(--nav-height);
    z-index: 1000;
    background: var(--glass-bg);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    border-bottom: 1px solid var(--border);
    display: flex;
    align-items: center;
  }

  .nav-content {
    width: 100%;
    max-width: 1600px;
    margin: 0 auto;
    padding: 0 24px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 20px;
  }

  .brand {
    display: flex;
    align-items: center;
    gap: 12px;
    text-decoration: none;
  }
  .logo-wrapper {
    width: 40px;
    height: 40px;
    background: linear-gradient(135deg, var(--accent), #8b5cf6);
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 0 15px var(--accent-glow);
  }
  .logo {
    height: 28px;
  }
  .brand-text {
    font-family: "Orbitron", sans-serif;
    font-weight: 800;
    font-size: 22px;
    color: var(--text-main);
    letter-spacing: 2px;
  }

  .search-container {
    flex: 1;
    max-width: 500px;
    position: relative;
  }
  .search-box {
    display: flex;
    align-items: center;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid var(--border);
    border-radius: 99px;
    padding: 0 16px;
    height: 44px;
    transition: all 0.2s ease;
  }
  .search-box.has-focus {
    background: rgba(255, 255, 255, 0.1);
    border-color: var(--accent);
    box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.1);
  }
  .search-box input {
    background: transparent;
    border: none;
    color: white;
    width: 100%;
    outline: none;
    font-size: 15px;
  }
  .clear-search {
    background: rgba(255, 255, 255, 0.1);
    border: none;
    color: white;
    border-radius: 50%;
    width: 20px;
    height: 20px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .search-dropdown {
    position: absolute;
    top: 52px;
    left: 0;
    right: 0;
    background: #0f172a;
    border: 1px solid var(--border);
    border-radius: 16px;
    overflow: hidden;
    box-shadow: 0 20px 50px rgba(0, 0, 0, 0.5);
  }
  .search-item {
    width: 100%;
    display: flex;
    align-items: center;
    padding: 12px 16px;
    gap: 12px;
    background: transparent;
    border: none;
    cursor: pointer;
    border-bottom: 1px solid var(--border);
    transition: background 0.2s;
  }
  .search-item:hover {
    background: rgba(59, 130, 246, 0.1);
  }
  .item-avatar {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    background: var(--accent);
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: bold;
    font-size: 12px;
    color: white;
  }
  .item-avatar img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .item-meta {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
  }
  .item-name {
    color: white;
    font-weight: 500;
    font-size: 14px;
  }
  .item-sub {
    color: var(--text-dim);
    font-size: 12px;
  }
  .search-empty {
    padding: 20px;
    text-align: center;
    color: var(--text-dim);
  }

  .user-trigger {
    display: flex;
    align-items: center;
    gap: 10px;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid var(--border);
    padding: 6px 14px 6px 6px;
    border-radius: 99px;
    color: white;
    cursor: pointer;
    transition: all 0.2s;
  }
  .user-trigger:hover {
    background: rgba(255, 255, 255, 0.1);
  }
  .user-avatar-small {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    overflow: hidden;
    background: var(--accent);
  }
  .user-avatar-small img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .user-dropdown-container {
    position: relative;
  }
  .dropdown-menu {
    position: absolute;
    top: 50px;
    right: 0;
    width: 200px;
    background: #1e293b;
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 6px;
    opacity: 0;
    pointer-events: none;
    transform: translateY(10px);
    transition: all 0.2s;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
  }
  .user-dropdown-container:hover .dropdown-menu {
    opacity: 1;
    pointer-events: auto;
    transform: translateY(0);
  }
  .menu-item {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    border-radius: 8px;
    color: var(--text-main);
    text-decoration: none;
    border: none;
    background: transparent;
    font-size: 14px;
    cursor: pointer;
    transition: background 0.2s;
  }
  .menu-item:hover {
    background: rgba(255, 255, 255, 0.05);
  }
  .menu-item.logout {
    color: #f87171;
  }
  .menu-divider {
    height: 1px;
    background: var(--border);
    margin: 6px 0;
  }

  .profile-sidebar {
    position: fixed;
    top: 0;
    left: 0;
    bottom: 0;
    width: 400px;
    background: #0f172a;
    border-right: 1px solid var(--border);
    z-index: 1100;
    display: flex;
    flex-direction: column;
    box-shadow: 20px 0 50px rgba(0, 0, 0, 0.5);
  }
  .close-sidebar {
    position: absolute;
    top: 20px;
    right: 20px;
    background: transparent;
    border: none;
    color: var(--text-dim);
    cursor: pointer;
    z-index: 10;
  }
  .sidebar-scroll {
    overflow-y: auto;
    flex: 1;
  }
  .sidebar-hero {
    padding: 60px 40px 40px;
    text-align: center;
    background: linear-gradient(
      to bottom,
      rgba(59, 130, 246, 0.1),
      transparent
    );
  }
  .hero-avatar {
    position: relative;
    width: 140px;
    height: 140px;
    margin: 0 auto 24px;
  }
  .avatar-ring {
    position: absolute;
    inset: -8px;
    border: 2px solid var(--accent);
    border-radius: 50%;
    opacity: 0.3;
  }
  .hero-avatar img,
  .avatar-initials {
    width: 100%;
    height: 100%;
    border-radius: 50%;
    object-fit: cover;
    background: var(--accent);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 40px;
    font-weight: 700;
    color: white;
  }
  .sidebar-hero h2 {
    margin: 0 0 8px;
    font-size: 24px;
    color: white;
  }
  .badge-promo {
    display: inline-block;
    padding: 4px 12px;
    background: rgba(59, 130, 246, 0.2);
    color: var(--accent);
    border-radius: 99px;
    font-size: 13px;
    font-weight: 600;
    margin-bottom: 20px;
  }
  .btn-center {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0 auto;
    background: white;
    color: black;
    border: none;
    padding: 8px 16px;
    border-radius: 8px;
    font-weight: 600;
    font-size: 13px;
    cursor: pointer;
    transition: transform 0.2s;
  }
  .sidebar-info {
    padding: 0 32px 40px;
  }
  .info-block {
    margin-bottom: 32px;
  }
  .info-block h3 {
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 1px;
    color: var(--text-dim);
    margin-bottom: 12px;
  }
  .info-block p {
    line-height: 1.6;
    color: #cbd5e1;
    margin: 0;
  }
  .link-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 10px;
  }
  .social-link {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid var(--border);
    border-radius: 8px;
    color: white;
    text-decoration: none;
    font-size: 13px;
  }
  .asso-card {
    padding: 12px;
    background: rgba(255, 255, 255, 0.03);
    border-left: 3px solid var(--accent);
    border-radius: 4px;
    margin-bottom: 8px;
  }
  .asso-n {
    display: block;
    font-weight: 600;
    font-size: 14px;
    color: white;
  }
  .asso-r {
    font-size: 12px;
    color: var(--text-dim);
  }

  .focus-hub {
    position: fixed;
    bottom: 32px;
    right: 32px;
    width: 280px;
    background: #1e293b;
    border: 1px solid var(--accent);
    border-radius: 16px;
    padding: 20px;
    z-index: 100;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.6);
  }
  .hub-header {
    display: flex;
    justify-content: space-between;
    margin-bottom: 20px;
  }
  .hub-title {
    display: flex;
    align-items: center;
    gap: 8px;
    font-weight: 600;
    color: var(--accent);
  }
  .hub-reset {
    background: transparent;
    border: none;
    color: #f87171;
    font-size: 12px;
    cursor: pointer;
  }
  .range-group {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .range-labels {
    display: flex;
    justify-content: space-between;
    font-size: 12px;
    color: var(--text-dim);
  }
  .range-value {
    font-weight: 700;
    color: white;
  }

  .loader-overlay {
    position: fixed;
    inset: 0;
    background: var(--bg-dark);
    z-index: 2000;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .loader-content {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16px;
    color: var(--text-dim);
  }

  :global(.spin) {
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

  .login-trigger {
    background: var(--accent);
    color: white;
    border: none;
    padding: 10px 20px;
    border-radius: 99px;
    font-weight: 600;
    cursor: pointer;
  }

  @media (max-width: 768px) {
    .brand-text,
    .user-label {
      display: none;
    }
    .profile-sidebar {
      width: 100%;
      height: 70vh;
      top: auto;
      border-radius: 24px 24px 0 0;
    }
    .focus-hub {
      left: 20px;
      right: 20px;
      width: auto;
    }
  }
</style>
