<script lang="ts">
  import { onMount } from 'svelte';
  import { fade, fly } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { page } from '$app/stores';
  import {
    graphStore,
    selectedPersonId,
    focusDepth,
    directLinks,
    filteredGraph,
    profileReopenRequests,
  } from '$stores/graphStore';
  import { cameraStore } from '$stores/cameraStore';
  import StarfieldCanvas from '$components/Canvas/StarfieldCanvas.svelte';
  import GraphCanvas from '$components/Canvas/GraphCanvas.svelte';
  import MapControls from '$components/Canvas/MapControls.svelte';
  import ProfileSheet from '$components/ProfileSheet.svelte';
  import { getPersonName, getPersonInitials, personMatchScore } from '$lib/utils/format';
  import {
    Link,
    User,
    LogOut,
    Search,
    Target,
    X,
    ChevronDown,
    LoaderCircle,
    Database,
    Network,
    ExternalLink,
    Minus,
    Plus,
  } from '@lucide/svelte';
  import BioMarkdown from '$components/BioMarkdown.svelte';
  import LocaleSwitcher from '$components/LocaleSwitcher.svelte';
  import Seo from '$components/Seo.svelte';
  import { institutionNode, siteNode } from '$lib/seo';
  import { m } from '$lib/paraglide/messages';
  import type { CanariProfileResponse } from '$types/graph';

  // UI State
  let searchTerm = '';
  let isSearchActive = false;
  let searchResults: any[] = [];
  let isProfileModalOpen = false;
  let currentProfile: any = null;
  let isLoading = true;
  let innerWidth = 0;

  let innerHeight = 0;

  // The profile panel is a left drawer on desktop and a draggable bottom sheet on a phone
  // (ProfileSheet); `sheetCovered` is how much of the screen bottom the sheet takes.
  $: isMobile = innerWidth > 0 && innerWidth <= 768;
  let sheetCovered = 0;
  $: if (!isProfileModalOpen) sheetCovered = 0;
  // Past half the screen the sheet is being read, not the map: the controls step aside.
  $: showMapControls = sheetCovered <= innerHeight / 2;
  // While a sheet is open on a phone the focus hub shrinks to one row, so the two together never
  // hide the person they are about.
  $: compactHub = isMobile && isProfileModalOpen;

  // The selected person's direct links, listed in the sheet: the accessible path through the graph.
  $: currentLinks = directLinks(currentProfile?.id ?? null, $graphStore.relations);

  // The account menu is rendered only while open, so a closed menu is absent from the
  // accessibility tree (it used to be a hover-only CSS fade, present to screen readers throughout).
  let menuOpen = false;
  function openMenuOnHover(e: PointerEvent) {
    if (e.pointerType === 'mouse') menuOpen = true;
  }
  function closeMenuOnLeave(e: PointerEvent) {
    if (e.pointerType === 'mouse') menuOpen = false;
  }
  function closeMenuOnOutside(e: PointerEvent) {
    if (menuOpen && !(e.target as Element).closest?.('.user-dropdown-container')) menuOpen = false;
  }

  // Text alternative of the canvas (WCAG 1.1.1): what the map shows, in one sentence.
  $: mapSummary =
    $selectedPersonId && currentProfile
      ? m.map_summary_focus({
          name: getPersonName(currentProfile),
          count: $filteredGraph.people.length,
          depth: $focusDepth,
        })
      : m.map_summary_all({ people: people.length, links: $graphStore.relations.length });

  const loadingMessages = [
    m.home_loading_vault(),
    m.home_loading_stars(),
    m.home_loading_constellations(),
    m.home_loading_telescope(),
    m.home_loading_galaxy(),
  ];
  let currentLoadingMessage = loadingMessages[Math.floor(Math.random() * loadingMessages.length)];

  // Per-id flag set when an avatar fails to load, so we fall back to initials.
  let imageErrors: { [id: string]: boolean } = {};

  // Derived values
  $: user = $page.data.user;
  $: isAuthenticated = !!user;
  $: people = $graphStore.people;

  // Create a map for efficient lookups by ID
  $: peopleMap = new Map(people.map((p) => [p.id, p]));

  // Open the panel of the selected person - on a new selection, and on a tap on the star already
  // selected, which reopens a panel dismissed on a phone (the star stays in focus).
  $: syncProfile($selectedPersonId, $profileReopenRequests, peopleMap);

  function syncProfile(id: string | null, _reopenRequests: number, byId: Map<string, any>) {
    if (!id) {
      isProfileModalOpen = false;
      return;
    }
    const person = byId.get(id);
    if (person) {
      currentProfile = person;
      isProfileModalOpen = true;
    }
  }

  // Canari profile (bio, clubs) of the selected person: the source of truth for
  // everything but parrainage (Sky only edits links, the rest comes from Canari).
  let canariProfile: CanariProfileResponse | null = null;
  let canariLoadedId: string | null = null;
  $: loadCanariProfile($selectedPersonId);

  async function loadCanariProfile(id: string | null) {
    if (!id) {
      canariProfile = null;
      canariLoadedId = null;
      return;
    }
    if (id === canariLoadedId) return;
    canariLoadedId = id;
    canariProfile = null;
    try {
      const r = await fetch(`/api/canari/${id}`);
      if (r.ok) canariProfile = await r.json();
    } catch (e) {
      console.error('[Home] failed to load Canari profile:', e);
    }
  }

  onMount(() => {
    // Rotate the loading messages while the initial load runs.
    const messageInterval = setInterval(() => {
      currentLoadingMessage = loadingMessages[Math.floor(Math.random() * loadingMessages.length)];
    }, 2000);

    // Brief initial-load splash before the graph is ready.
    const timer = setTimeout(() => {
      isLoading = false;
      clearInterval(messageInterval);
    }, 800);

    return () => {
      clearTimeout(timer);
      clearInterval(messageInterval);
    };
  });

  function getAvatarUrl(personId: string): string {
    return `/api/avatar/${personId}`;
  }

  function handleImageError(id: string) {
    // Legacy (non-runes) component: a member assignment already invalidates `imageErrors`.
    imageErrors[id] = true;
  }

  function handleSearch() {
    const query = searchTerm.trim();
    if (!query) {
      isSearchActive = false;
      searchResults = [];
      return;
    }

    // Tolerant ranking: substring, word inversion, promo and typo (edit
    // distance) all handled by personMatchScore (lower score = better match).
    searchResults = people
      .map((p: any) => ({
        p,
        score: personMatchScore(p.nom, p.prenom, p.level, query),
      }))
      .filter((c) => c.score !== null)
      .sort((a, b) => (a.score as number) - (b.score as number))
      .slice(0, 8)
      .map((c) => c.p);

    isSearchActive = true;
  }

  function selectResult(person: any) {
    selectedPersonId.set(person.id);
    centerOnPerson(person.id);
    searchTerm = '';
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
    const isMobile = typeof window !== 'undefined' && window.innerHeight > window.innerWidth;
    if (!isMobile) {
      selectedPersonId.set(null);
    }
  }

  function handleLogin() {
    window.location.href = '/auth/login';
  }

  function handleLogout() {
    window.location.href = '/auth/logout';
  }

  function goToMyProfile() {
    if (user?.profile_id && peopleMap.has(user.profile_id)) {
      selectedPersonId.set(user.profile_id);
      centerOnPerson(user.profile_id);
    }
  }

  // First-visit hint: how to use the map, until the first touch or click anywhere. Remembered per
  // browser; storage may be unavailable (private window), in which case it simply shows again.
  const HINT_KEY = 'sky.mapHintSeen';
  let showHint = false;
  let coarsePointer = false;
  onMount(() => {
    coarsePointer = window.matchMedia('(pointer: coarse)').matches;
    try {
      showHint = localStorage.getItem(HINT_KEY) !== '1';
    } catch (e) {
      console.debug('[Home] hint storage unavailable, showing the hint:', e);
      showHint = true;
    }
  });
  function dismissHint() {
    if (!showHint) return;
    showHint = false;
    try {
      localStorage.setItem(HINT_KEY, '1');
    } catch (e) {
      console.debug('[Home] hint storage unavailable, not remembering the dismissal:', e);
    }
  }

  function resetView() {
    selectedPersonId.set(null);
    cameraStore.reset();
  }
</script>

<Seo
  meta={{
    title: m.home_page_title(),
    description: m.seo_site_description(),
    imageAlt: m.seo_image_alt(),
    jsonLd: [siteNode($page.url.origin), institutionNode()],
  }}
/>

<svelte:window
  bind:innerWidth
  bind:innerHeight
  onpointerdown={(e) => {
    dismissHint();
    closeMenuOnOutside(e);
  }}
/>

<StarfieldCanvas />

{#if isAuthenticated}
  <GraphCanvas />
  <p class="sr-only" aria-live="polite">{mapSummary}</p>
  {#if showMapControls}
    <MapControls
      onMe={user?.profile_id && peopleMap.has(user.profile_id) ? goToMyProfile : undefined}
      topInset={72}
      bottomInset={sheetCovered}
    />
  {/if}
  {#if showHint && !isLoading}
    <div class="map-hint" role="status" transition:fade>
      {coarsePointer ? m.map_hint_touch() : m.map_hint_pointer()}
    </div>
  {/if}

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
              (e.currentTarget as HTMLElement).style.display = 'none';
            }}
          />
        </div>
        <span class="brand-text">SKY</span>
      </a>

      <div class="search-container">
        <div class="search-box" class:has-focus={isSearchActive}>
          <Search size={18} class="search-icon" aria-hidden="true" />
          <input
            type="search"
            aria-label={m.home_search_label()}
            onkeydown={(e) => {
              if (e.key === 'Escape') {
                // Close the results only: the window-level Escape would also close the sheet.
                e.stopPropagation();
                isSearchActive = false;
                (e.currentTarget as HTMLInputElement).blur();
              }
            }}
            placeholder={isMobile ? m.home_search_placeholder_short() : m.home_search_placeholder()}
            bind:value={searchTerm}
            oninput={handleSearch}
            onfocus={() => searchTerm && (isSearchActive = true)}
            onblur={() => setTimeout(() => (isSearchActive = false), 200)}
          />
          {#if searchTerm}
            <button
              class="clear-search"
              aria-label={m.common_close()}
              onclick={() => {
                searchTerm = '';
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
              {#each searchResults as result (result.id)}
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
                    <span class="item-sub">{m.common_promo({ level: result.level || '-' })}</span>
                  </div>
                </button>
              {/each}
            {:else}
              <div class="search-empty">{m.home_search_empty()}</div>
            {/if}
          </div>
        {/if}
      </div>

      <div class="actions">
        {#if !isAuthenticated}
          <button class="login-trigger" onclick={handleLogin}>
            {m.nav_login()}
          </button>
        {:else}
          <div
            class="user-dropdown-container"
            role="presentation"
            onpointerenter={openMenuOnHover}
            onpointerleave={closeMenuOnLeave}
          >
            <button
              class="user-trigger"
              aria-expanded={menuOpen}
              onclick={() => (menuOpen = !menuOpen)}
              onkeydown={(e) => {
                if (e.key === 'Escape' && menuOpen) {
                  e.stopPropagation();
                  menuOpen = false;
                }
              }}
            >
              <div class="user-avatar-small">
                <img
                  src={getAvatarUrl(user?.profile_id || user?.id)}
                  alt=""
                  onerror={(e) => {
                    (e.currentTarget as HTMLImageElement).src =
                      `https://ui-avatars.com/api/?name=${encodeURIComponent(user?.name || 'U')}&background=random`;
                  }}
                />
              </div>
              <span class="user-label">
                {user?.profile_id ? peopleMap.get(user.profile_id)?.prenom || user.name : user.name}
              </span>
              <span class="sr-only">{m.nav_account_menu()}</span>
              <ChevronDown size={14} class="chevron" aria-hidden="true" />
            </button>

            {#if menuOpen}
              <div class="dropdown-menu">
                <button onclick={goToMyProfile} class="menu-item">
                  <User size={16} />
                  {m.nav_my_profile()}
                </button>
                <a href="/tree" class="menu-item">
                  <Network size={16} />
                  {m.nav_my_tree()}
                </a>
                <a href="/account" class="menu-item">
                  <Link size={16} />
                  {m.nav_fix_link()}
                </a>
                {#if user?.role === 'admin'}
                  <div class="menu-divider"></div>
                  <a href="/admin" class="menu-item">
                    <Database size={16} />
                    {m.nav_admin()}
                  </a>
                {/if}
                <div class="menu-divider"></div>
                <div class="menu-item locale-row">
                  <LocaleSwitcher />
                </div>
                <div class="menu-divider"></div>
                <button onclick={handleLogout} class="menu-item logout">
                  <LogOut size={16} />
                  {m.nav_logout()}
                </button>
              </div>
            {/if}
          </div>
        {/if}
      </div>
    </div>
  </nav>

  {#if isLoading}
    <div class="loader-overlay" transition:fade>
      <div class="loader-content">
        <LoaderCircle class="spin" size={40} />
        <span>{currentLoadingMessage}</span>
      </div>
    </div>
  {/if}

  {#if $selectedPersonId}
    <div
      class="focus-hub"
      class:compact={compactHub}
      transition:fly={{ y: 50, duration: 400, easing: cubicOut }}
    >
      {#if compactHub}
        <!-- One row while a sheet is open on a phone: depth stepper and exit, nothing else. -->
        <div class="hub-row">
          <Target size={16} aria-hidden="true" />
          <div class="depth-stepper" role="group" aria-label={m.focus_depth_label()}>
            <button
              onclick={() => ($focusDepth = Math.max(1, $focusDepth - 1))}
              disabled={$focusDepth <= 1}
              aria-label={m.focus_depth_less()}
            >
              <Minus size={16} />
            </button>
            <span class="range-value" aria-live="polite"
              >{$focusDepth} {$focusDepth > 1 ? m.focus_hops() : m.focus_hop()}</span
            >
            <button
              onclick={() => ($focusDepth = Math.min(5, $focusDepth + 1))}
              disabled={$focusDepth >= 5}
              aria-label={m.focus_depth_more()}
            >
              <Plus size={16} />
            </button>
          </div>
          <button class="hub-reset" onclick={resetView}>{m.focus_exit()}</button>
        </div>
      {:else}
        <div class="hub-header">
          <div class="hub-title">
            <Target size={16} aria-hidden="true" />
            <span>{m.focus_mode()}</span>
          </div>
          <button class="hub-reset" onclick={resetView}>{m.focus_exit()}</button>
        </div>
        <div class="hub-body">
          <div class="range-group">
            <div class="range-labels">
              <label for="fdepth">{m.focus_depth_label()}</label>
              <span class="range-value"
                >{$focusDepth} {$focusDepth > 1 ? m.focus_hops() : m.focus_hop()}</span
              >
            </div>
            <input id="fdepth" type="range" min="1" max="5" bind:value={$focusDepth} />
          </div>
        </div>
      {/if}
    </div>
  {/if}

  {#if isProfileModalOpen && currentProfile}
    <ProfileSheet
      mobile={isMobile}
      onClose={closeProfile}
      labelledBy="profile-name"
      bind:covered={sheetCovered}
    >
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
        <h2 id="profile-name">{getPersonName(currentProfile)}</h2>
        <div class="badge-promo">
          {m.profile_promotion({
            level: currentProfile.level || m.profile_promotion_unknown(),
          })}
        </div>

        <div class="hero-actions">
          <button class="btn-center" onclick={() => centerOnPerson(currentProfile.id)}>
            <Target size={16} />
            {m.profile_center_view()}
          </button>
          {#if canariProfile?.profile?.sub}
            <a
              class="btn-profil"
              href={`${$page.data.canariUrl}/profile/${canariProfile.profile.sub}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <ExternalLink size={16} />
              {m.profile_link()}
            </a>
          {/if}
        </div>
      </header>

      <section class="sidebar-info">
        <div class="info-block">
          {#if currentLinks.parrains.length === 0 && currentLinks.fillots.length === 0}
            <p class="links-empty">{m.profile_no_links()}</p>
          {/if}
          {#each [{ title: m.profile_godparents(), rels: currentLinks.parrains, end: 'id1' as const }, { title: m.profile_godchildren(), rels: currentLinks.fillots, end: 'id2' as const }] as group (group.end)}
            {#if group.rels.length}
              <h3>{group.title}</h3>
              <ul class="link-list">
                {#each group.rels as rel (rel[group.end])}
                  {@const other = peopleMap.get(rel[group.end])}
                  {#if other}
                    <li>
                      <button class="link-item" onclick={() => selectResult(other)}>
                        <span class="link-name">{getPersonName(other)}</span>
                        <span class="link-sub"
                          >{m.common_promo({ level: other.level || '-' })}{rel.type === 'adoption'
                            ? ` - ${m.tree_kind_adoption()}`
                            : ''}</span
                        >
                      </button>
                    </li>
                  {/if}
                {/each}
              </ul>
            {/if}
          {/each}
        </div>

        {#if canariProfile?.profile?.bio}
          <div class="info-block">
            <h3>{m.profile_bio()}</h3>
            <BioMarkdown source={canariProfile.profile.bio} />
          </div>
        {/if}

        {#if canariProfile?.profile?.associations?.length}
          <div class="info-block">
            <h3>{m.profile_associations()}</h3>
            <div class="asso-list">
              {#each canariProfile.profile.associations as asso (asso.slug)}
                <div class="asso-card">
                  {#if asso.logo}
                    <img class="asso-logo" src={asso.logo} alt="" />
                  {/if}
                  <div class="asso-meta">
                    <span class="asso-n">{asso.name}</span>
                    <span class="asso-r">{asso.role}</span>
                  </div>
                </div>
              {/each}
            </div>
          </div>
        {/if}

        {#if canariProfile?.profile?.formerAssociations?.length}
          <div class="info-block">
            <h3>{m.profile_former_associations()}</h3>
            <div class="asso-list">
              {#each canariProfile.profile.formerAssociations as asso, i (i)}
                <div class="asso-card">
                  {#if asso.logo}
                    <img class="asso-logo" src={asso.logo} alt="" />
                  {/if}
                  <div class="asso-meta">
                    <span class="asso-n">{asso.name}</span>
                    <span class="asso-r"
                      >{asso.role}{asso.startYear
                        ? ` (${asso.startYear}${asso.endYear ? `-${asso.endYear}` : ''})`
                        : ''}</span
                    >
                  </div>
                </div>
              {/each}
            </div>
          </div>
        {/if}
      </section>
    </ProfileSheet>
  {/if}
{:else}
  <div class="login-landing" transition:fade>
    <div class="login-card">
      <div class="login-logo">
        <img
          src="/sky.png"
          alt="Sky"
          onerror={(e) => {
            (e.currentTarget as HTMLElement).style.display = 'none';
          }}
        />
      </div>
      <h1 class="login-title">SKY</h1>
      <p class="login-tagline">{m.landing_tagline()}</p>
      <p class="login-sub">{m.landing_sub()}</p>
      <button class="login-cta" onclick={handleLogin}>{m.landing_cta()}</button>
      <p class="login-note">{m.landing_note()}</p>
    </div>
  </div>
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
    /* Above the person sheet: search results and the account menu must never open under it. */
    z-index: 1200;
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
    font-family: 'Orbitron', sans-serif;
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
    gap: 10px;
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
    min-width: 0;
    outline: none;
    font-size: 15px;
    -webkit-appearance: none;
    appearance: none;
  }
  /* The field has its own clear button; the native one of type=search would double it. */
  .search-box input::-webkit-search-cancel-button {
    display: none;
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
    text-align: left;
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
    flex-shrink: 0;
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
    min-width: 0;
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
    top: calc(100% + 6px);
    right: 0;
    width: 200px;
    background: #1e293b;
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 6px;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
  }
  /* Invisible bridge covering the gap between the trigger and the menu, so
     moving the mouse across it does not drop the hover and close the menu. */
  .dropdown-menu::before {
    content: '';
    position: absolute;
    left: 0;
    right: 0;
    top: -10px;
    height: 10px;
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

  .sidebar-hero {
    padding: 60px 40px 40px;
    text-align: center;
    background: linear-gradient(to bottom, rgba(59, 130, 246, 0.1), transparent);
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
  .hero-actions {
    display: flex;
    gap: 10px;
    justify-content: center;
    flex-wrap: wrap;
  }
  .btn-center {
    display: flex;
    align-items: center;
    gap: 8px;
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
  .btn-profil {
    display: flex;
    align-items: center;
    gap: 8px;
    background: rgba(59, 130, 246, 0.2);
    color: var(--accent);
    border: 1px solid rgba(59, 130, 246, 0.4);
    padding: 8px 16px;
    border-radius: 8px;
    font-weight: 600;
    font-size: 13px;
    text-decoration: none;
  }
  .btn-profil:hover {
    background: rgba(59, 130, 246, 0.3);
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
  .links-empty {
    color: var(--text-dim);
    font-size: 14px;
  }
  .link-list {
    list-style: none;
    margin-bottom: 16px;
  }
  .link-item {
    width: 100%;
    min-height: 48px;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: flex-start;
    gap: 2px;
    padding: 6px 12px;
    background: rgba(255, 255, 255, 0.03);
    border: none;
    border-radius: 8px;
    margin-bottom: 6px;
    text-align: left;
    color: white;
    cursor: pointer;
  }
  .link-item:hover {
    background: rgba(255, 255, 255, 0.07);
  }
  .link-name {
    font-weight: 600;
    font-size: 14px;
  }
  .link-sub {
    font-size: 12px;
    color: var(--text-dim);
  }
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }

  .asso-card {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    background: rgba(255, 255, 255, 0.03);
    border-left: 3px solid var(--accent);
    border-radius: 4px;
    margin-bottom: 8px;
  }
  .asso-logo {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    object-fit: cover;
    background: rgba(255, 255, 255, 0.1);
    flex-shrink: 0;
  }
  .asso-meta {
    display: flex;
    flex-direction: column;
    min-width: 0;
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

  .map-hint {
    position: fixed;
    left: 50%;
    bottom: calc(24px + env(safe-area-inset-bottom, 0px));
    transform: translateX(-50%);
    z-index: 800;
    max-width: calc(100vw - 160px);
    padding: 10px 16px;
    background: #0f172a;
    border: 1px solid var(--border);
    border-radius: 12px;
    color: var(--text-main);
    font-size: 14px;
    text-align: center;
    pointer-events: none;
  }

  /* Top-right, under the bar: the bottom-right corner belongs to the map controls. */
  .focus-hub {
    position: fixed;
    top: calc(var(--nav-height) + 16px);
    right: 16px;
    width: 280px;
    background: #1e293b;
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 16px;
    z-index: 100;
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
  /* Leaving focus is neutral, not destructive: a plain text button, never red. */
  .hub-reset {
    min-height: 40px;
    padding: 0 12px;
    background: transparent;
    border: 1px solid var(--border);
    border-radius: 8px;
    color: var(--text-main);
    font-size: 13px;
    cursor: pointer;
  }
  .hub-reset:hover {
    background: rgba(255, 255, 255, 0.06);
  }
  .hub-row {
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--accent);
  }
  .depth-stepper {
    display: flex;
    align-items: center;
    flex: 1;
    justify-content: center;
    gap: 4px;
    font-size: 13px;
  }
  .depth-stepper button {
    width: 44px;
    height: 44px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    color: var(--text-main);
    cursor: pointer;
  }
  .depth-stepper button:disabled {
    color: var(--text-dim);
    opacity: 0.5;
    cursor: default;
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

  /* Login landing shown to visitors who are not signed in (the graph is
     reserved to authenticated ICM users). */
  .login-landing {
    position: fixed;
    inset: 0;
    z-index: 1500;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
  }
  .login-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    gap: 12px;
    max-width: 420px;
    width: 100%;
    padding: 48px 40px;
    background: var(--glass-bg);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    border: 1px solid var(--border);
    border-radius: 20px;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
  }
  .login-logo {
    width: 72px;
    height: 72px;
    border-radius: 18px;
    background: linear-gradient(135deg, var(--accent), #8b5cf6);
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 0 24px var(--accent-glow);
    margin-bottom: 8px;
  }
  .login-logo img {
    height: 44px;
  }
  .login-title {
    margin: 0;
    font-family: 'Orbitron', sans-serif;
    font-weight: 800;
    font-size: 34px;
    letter-spacing: 4px;
    color: var(--text-main);
  }
  .login-tagline {
    margin: 0;
    color: var(--text-main);
    font-size: 16px;
    font-weight: 600;
  }
  .login-sub {
    margin: 0;
    color: var(--text-dim);
    font-size: 14px;
  }
  .login-cta {
    margin-top: 12px;
    width: 100%;
    padding: 14px 20px;
    background: var(--accent);
    color: white;
    border: none;
    border-radius: 12px;
    font-weight: 700;
    font-size: 15px;
    cursor: pointer;
    transition: background 0.2s;
  }
  .login-cta:hover {
    background: #2563eb;
  }
  .login-note {
    margin: 4px 0 0;
    color: var(--text-dim);
    font-size: 12px;
  }

  @media (max-width: 768px) {
    .brand-text,
    .user-label {
      display: none;
    }
    /* The PEEK of the sheet (~30% of the screen) must name the person and offer the actions:
       a compact row - avatar left, name and promo beside it, actions below. */
    .sidebar-hero {
      display: grid;
      grid-template-columns: 56px 1fr;
      column-gap: 14px;
      align-items: center;
      padding: 0 20px 16px;
      text-align: left;
      background: none;
    }
    .hero-avatar {
      width: 56px;
      height: 56px;
      margin: 0;
      grid-row: span 2;
    }
    .avatar-ring {
      inset: -4px;
    }
    .avatar-initials {
      font-size: 20px;
    }
    .sidebar-hero h2 {
      margin: 0;
      font-size: 18px;
      align-self: end;
    }
    .badge-promo {
      margin: 4px 0 0;
      justify-self: start;
      align-self: start;
    }
    .hero-actions {
      grid-column: 1 / -1;
      justify-content: flex-start;
      margin-top: 14px;
    }
    .sidebar-info {
      padding: 0 20px 32px;
    }
    .focus-hub {
      left: 16px;
      width: auto;
    }
    .focus-hub.compact {
      padding: 4px 4px 4px 14px;
    }
    /* Full-screen results on a phone, as Maps and Photos: the list below the bar, edge to edge,
       over everything else on the map. The container stops being the positioning context, so
       the list is placed against the (fixed) bar. */
    .search-container {
      position: static;
    }
    .search-dropdown {
      top: 100%;
      height: calc(100dvh - var(--nav-height));
      border: none;
      border-top: 1px solid var(--border);
      border-radius: 0;
      overflow-y: auto;
    }
  }
</style>
