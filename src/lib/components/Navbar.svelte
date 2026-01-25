<script lang="ts">
  import { signIn, signOut } from "@auth/sveltekit/client";
  import { page } from "$app/state";
  // Lucide icons
  import { LogIn, LogOut, Map } from "lucide-svelte";

  let u = $derived(page.data?.session?.user);
  let isAuthenticated = $derived(!!u);
</script>

<nav class="topbar">
  <div class="brand">
    <a href="/">Sky</a>
  </div>

  <div class="links">
    {#if isAuthenticated}
      <div class="links-left">
        <a href="/">
          <Map size={18} />
          <span>Carte</span>
        </a>
      </div>
    {/if}
  </div>

  <div class="user">
    {#if u}
      <span class="user-name">{u.name || u.email}</span>
      <button
        class="btn-logout"
        onclick={() => signOut()}
        aria-label="Déconnexion"
      >
        <LogOut size={18} />
      </button>
    {:else}
      <button
        class="btn-login"
        onclick={() => signIn("cas-emse")}
        aria-label="Connexion"
      >
        <LogIn size={18} /> Connexion
      </button>
    {/if}
  </div>
</nav>
