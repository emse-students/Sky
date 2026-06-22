<script lang="ts">
  // Icone de marque Instagram (retiree de lucide-svelte 1.x). Reprend la definition
  // outline d origine de lucide pour rester coherent avec les autres icones.
  type Props = {
    size?: number | string;
    class?: string;
    [key: string]: unknown;
  };
  let { size = 24, class: className = "", ...rest }: Props = $props();
</script>

<svg
  xmlns="http://www.w3.org/2000/svg"
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="2"
  stroke-linecap="round"
  stroke-linejoin="round"
  class={className}
  aria-hidden="true"
  {...rest}
>
  <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
  <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
  <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
</svg>
