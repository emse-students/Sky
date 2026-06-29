<script lang="ts">
  import { page } from "$app/state";
  import { goto } from "$app/navigation";
  import { LogIn, LogOut, Map, Search, User } from "lucide-svelte";

  let u = $derived(page.data?.user);
  let isAuthenticated = $derived(!!u);
  let searchQuery = $state("");

  function handleSearch(e: Event) {
    e.preventDefault();
    if (searchQuery.trim()) {
      goto(`/api/search?q=${encodeURIComponent(searchQuery.trim())}`);
    }
  }
</script>

<nav class="topbar">
  <div class="brand">
    <a href="/">
      <img src="/sky.png" alt="Sky" class="logo" />
      <span>Sky</span>
    </a>
  </div>

  <div class="links">
    {#if isAuthenticated}
      <div class="links-left">
        <a href="/">
          <Map size={18} />
          <span>Carte</span>
        </a>
      </div>

      <form onsubmit={handleSearch} class="search-box">
        <Search size={18} class="search-icon" />
        <input
          type="text"
          placeholder="Rechercher..."
          bind:value={searchQuery}
        />
      </form>
    {/if}
  </div>

  <div class="nav-separator"></div>

  <div class="user">
    {#if u}
      <a
        href="/tree"
        class="user-link"
        style="display: flex; align-items: center; gap: 0.75rem; text-decoration: none;"
      >
        <div
          style="background: var(--bg-elevated); border-radius: 50%; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; overflow: hidden;"
        >
          <img
            src={`/api/avatar/${u.id}`}
            alt={u.name}
            style="width: 100%; height: 100%; object-fit: cover;"
            onerror={(e) => {
              const target = e.currentTarget as HTMLImageElement;
              target.style.display = "none";
              const placeholder = target.parentElement?.querySelector(
                ".avatar-fallback",
              ) as HTMLElement;
              if (placeholder) placeholder.style.display = "flex";
            }}
          />
          <div
            class="avatar-fallback"
            style="display: none; width: 100%; height: 100%; align-items: center; justify-content: center; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; font-size: 14px; font-weight: bold;"
          >
            {u.name?.charAt(0) || "?"}
          </div>
        </div>
        <span class="user-name">{u.name || u.email}</span>
      </a>

      <a class="btn-logout" href="/auth/logout">
        <LogOut size={16} />
        <span>Déconnexion</span>
      </a>
    {:else}
      <a class="btn-login" href="/auth/login">
        <LogIn size={16} />
        <span>Connexion</span>
      </a>
    {/if}
  </div>
</nav>
