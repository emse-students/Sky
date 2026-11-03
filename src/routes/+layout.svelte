<script lang="ts">
  import '../app.css';
  import { page } from '$app/state';
  import ConfirmDialog from '#lib/components/ConfirmDialog.svelte';

  let { children } = $props();

  // Only the home map ("/") locks the viewport; all other routes scroll.
  let isMap = $derived(page.url.pathname === '/');
</script>

<main class:map-view={isMap}>
  {@render children()}
</main>

<!-- Global host for in-app confirm/alert modals (replaces browser dialogs). -->
<ConfirmDialog />
