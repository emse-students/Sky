<script lang="ts">
  type Props = {
    personId: string;
    name: string;
    size?: number;
    class?: string;
  };

  let { personId, name, size = 40, class: className = "" }: Props = $props();
  let hasError = $state(false);
</script>

<img
  src="/api/avatar/{personId}"
  alt={name}
  class="avatar {className}"
  style="width: {size}px; height: {size}px;"
  onerror={() => (hasError = true)}
  onload={() => (hasError = false)}
  hidden={hasError}
/>
{#if hasError}
  <img
    src="https://ui-avatars.com/api/?name={encodeURIComponent(
      name,
    )}&background=0D8ABC&color=fff"
    alt={name}
    class="avatar {className}"
    style="width: {size}px; height: {size}px;"
  />
{/if}

<style>
  .avatar {
    border-radius: 50%;
    object-fit: cover;
  }
</style>
