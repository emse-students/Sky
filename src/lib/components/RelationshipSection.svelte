<script lang="ts">
  export let title: string;
  export let count: number;
  export let maxCount: number;
  export let relationships: any[];
  export let people: any[];
  export let idField: "source_id" | "target_id";
  export let onRemove: (id: number) => void;
  export let emptyMessage: string = "";
</script>

<div class="subsection">
  <h4>{title} ({count}/{maxCount})</h4>
  {#if relationships.length > 0}
    <div class="relationship-list">
      {#each relationships as rel}
        <div class="relationship-item">
          <span>{people.find((p) => p.id === rel[idField])?.name || "Inconnu"}</span>
          <button class="btn-remove" onclick={() => onRemove(rel.id)}>✕</button>
        </div>
      {/each}
    </div>
  {:else if emptyMessage}
    <p class="empty">{emptyMessage}</p>
  {/if}
</div>

<style>
  .subsection {
    margin-bottom: 24px;
    padding: 16px;
    background: rgba(255, 255, 255, 0.03);
    border-radius: 8px;
  }

  h4 {
    color: rgba(255, 255, 255, 0.7);
    font-size: 14px;
    margin-bottom: 12px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .relationship-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .relationship-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px;
    background: rgba(59, 130, 246, 0.1);
    border: 1px solid rgba(59, 130, 246, 0.2);
    border-radius: 6px;
  }

  .relationship-item span {
    color: white;
    font-size: 14px;
  }

  .btn-remove {
    background: rgba(239, 68, 68, 0.2);
    border: 1px solid rgba(239, 68, 68, 0.4);
    color: #f87171;
    padding: 4px 8px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 16px;
    transition: all 0.2s;
  }

  .btn-remove:hover {
    background: rgba(239, 68, 68, 0.3);
  }

  .empty {
    color: rgba(255, 255, 255, 0.4);
    font-size: 13px;
    font-style: italic;
  }
</style>
