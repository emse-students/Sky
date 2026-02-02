<script lang="ts">
  export let id: string;
  export let value: string;
  export let placeholder = "";
  export let rows = 4;
  export let label = "";
</script>

<div class="field-group">
  {#if label}
    <label class="label" for={id}>{label}</label>
  {/if}
  <textarea class="textarea" {id} {placeholder} {rows} bind:value on:input
  ></textarea>
</div>

<style>
  .field-group {
    margin-bottom: 12px;
  }
</style>
