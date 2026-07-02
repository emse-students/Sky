<script lang="ts">
  import "../app.css";
  import { page } from "$app/stores";

  let { children } = $props();

  // Only the home map ("/") locks the viewport; all other routes scroll.
  let isMap = $derived($page.url.pathname === "/");
</script>

<main class:map-view={isMap}>
  {@render children()}
</main>
