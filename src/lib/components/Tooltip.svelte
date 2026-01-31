<script lang="ts">
  import { fade } from "svelte/transition";
  import { getPersonName } from "$lib/utils/format";

  interface Props {
    person: any;
    x: number;
    y: number;
  }

  let { person, x, y }: Props = $props();
</script>

{#if person}
  <div
    class="tooltip"
    style="left: {x}px; top: {y}px;"
    transition:fade={{ duration: 150 }}
  >
    <div class="tooltip-header">
      <div class="tooltip-avatar">
        <img
          src={`/api/avatar/${person.id}`}
          alt={getPersonName(person)}
          onerror={(e) => {
            const target = e.currentTarget as HTMLImageElement;
            const sibling = target.nextElementSibling as HTMLElement;
            if (sibling) {
              target.style.display = "none";
              sibling.style.display = "flex";
            }
          }}
        />
        <div class="avatar-placeholder" style="display: none;">
          {person.prenom?.charAt(0) || "?"}
        </div>
      </div>
      <div class="tooltip-info">
        <div class="tooltip-name">{getPersonName(person)}</div>
        <div class="tooltip-promo">Promo {person.level || "N/A"}</div>
      </div>
    </div>
  </div>
{/if}

<style>
  .tooltip {
    position: fixed;
    z-index: 1000;
    pointer-events: none;
    background: rgba(17, 24, 39, 0.95);
    border: 1px solid rgba(59, 130, 246, 0.3);
    border-radius: 12px;
    padding: 12px;
    backdrop-filter: blur(10px);
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
    min-width: 200px;
    max-width: 300px;
    transform: translate(-50%, -100%);
    margin-top: -12px;
  }

  .tooltip-header {
    display: flex;
    gap: 12px;
    align-items: center;
  }

  .tooltip-avatar {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    overflow: hidden;
    flex-shrink: 0;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .tooltip-avatar img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .avatar-placeholder {
    color: white;
    font-size: 18px;
    font-weight: 600;
    text-transform: uppercase;
  }

  .tooltip-info {
    flex: 1;
    min-width: 0;
  }

  .tooltip-name {
    color: white;
    font-weight: 600;
    font-size: 14px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .tooltip-promo {
    color: rgba(255, 255, 255, 0.7);
    font-size: 12px;
    margin-top: 2px;
  }
</style>
