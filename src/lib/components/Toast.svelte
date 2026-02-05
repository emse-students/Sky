<script lang="ts">
  import { fade } from "svelte/transition";
  import { CheckCircle2 } from "lucide-svelte";

  type Props = {
    message: string;
    duration?: number;
  };

  let { message, duration = 3000 }: Props = $props();
  let visible = $derived(!!message);

  $effect(() => {
    if (message) {
      const timer = setTimeout(() => {
        message = "";
      }, duration);
      return () => clearTimeout(timer);
    }
  });
</script>

{#if visible && message}
  <div class="toast" transition:fade>
    <CheckCircle2 size={18} />
    <span>{message}</span>
  </div>
{/if}

<style>
  .toast {
    position: fixed;
    bottom: 24px;
    right: 24px;
    background: var(--success);
    color: white;
    padding: 12px 20px;
    border-radius: 8px;
    display: flex;
    align-items: center;
    gap: 10px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    font-size: 0.95rem;
    z-index: 10000;
  }
</style>
