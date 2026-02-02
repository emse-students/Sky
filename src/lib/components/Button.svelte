<script lang="ts">
  export let variant: "primary" | "secondary" | "outline" | "danger" =
    "primary";
  export let size: "sm" | "md" | "lg" = "md";
  export let disabled = false;
  export let loading = false;
  export let type: "button" | "submit" = "button";
</script>

<button {type} class="btn btn-{variant} btn-{size}" {disabled} on:click>
  {#if loading}
    <span class="loading-spinner"></span>
  {:else}
    <slot />
  {/if}
</button>

<style>
  button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
  }
</style>
