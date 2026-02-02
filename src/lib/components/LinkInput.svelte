<script lang="ts">
  import type { ComponentType } from "svelte";

  export let id: string;
  export let label: string;
  export let value: string;
  export let placeholder: string;
  export let type: string = "text";
  export let icon: ComponentType;
</script>

<div class="field-group">
  <label for={id}>
    <svelte:component this={icon} size={16} />
    {label}
  </label>
  <input {id} {type} {placeholder} bind:value />
</div>

<style>
  .field-group {
    margin-bottom: 12px;
  }

  label {
    display: flex;
    align-items: center;
    gap: 8px;
    color: rgba(255, 255, 255, 0.8);
    font-size: 14px;
    font-weight: 500;
    margin-bottom: 8px;
  }

  input {
    width: 100%;
    background: rgba(0, 0, 0, 0.3);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px;
    padding: 10px;
    color: white;
    font-size: 14px;
  }

  input:focus {
    outline: none;
    border-color: rgba(59, 130, 246, 0.5);
  }
</style>
