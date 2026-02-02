<script lang="ts">
  export let src: string;
  export let alt: string;
  export let size: number = 80;
  export let fallbackText = "?";
</script>

<div class="avatar" style="width: {size}px; height: {size}px;">
  <img
    {src}
    {alt}
    on:error={(e) => {
      const target = e.currentTarget as HTMLImageElement;
      const sibling = target.nextElementSibling as HTMLElement;
      if (sibling) {
        target.style.display = "none";
        sibling.style.display = "flex";
      }
    }}
  />
  <div class="avatar-placeholder" style="display: none; font-size: {size / 2.5}px;">
    {fallbackText}
  </div>
</div>
