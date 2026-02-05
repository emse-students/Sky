<script lang="ts">
  import { Loader2 } from "lucide-svelte";

  type Props = {
    loading?: boolean;
    class?: string;
  };

  let { loading = false, class: className = "" }: Props = $props();
</script>

{#if loading}
  <div class="spinner {className}">
    <Loader2 class="spin" size={20} />
  </div>
{/if}

<style>
  .spinner {
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .spinner :global(.spin) {
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
</style>
