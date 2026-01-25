<script lang="ts">
  import "../app.css";
  import Navbar from "$lib/components/Navbar.svelte";

  let { children } = $props();
</script>

<Navbar />

<main>
  {@render children()}
</main>
