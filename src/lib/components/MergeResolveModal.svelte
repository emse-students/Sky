<script lang="ts">
  import { fade, scale } from "svelte/transition";
  import { GitMerge, X } from "lucide-svelte";
  import { m } from "$lib/paraglide/messages";
  import { formatPromoShort } from "$lib/utils/format";
  import {
    diffIdentity,
    type MergeIdentity,
    type IdentityField,
  } from "$lib/utils/mergeIdentity";

  /**
   * Conflict resolver shown when two fiches about to be merged carry different
   * data (nom/prenom/promo). For each differing field the admin picks which
   * value the survivor keeps; unchanged fields pass through untouched. Emits the
   * full chosen identity via `onResolve`.
   */
  let {
    a,
    b,
    /** Side whose values are pre-selected (the fiche that will survive). */
    survivor,
    onResolve,
    onCancel,
  }: {
    a: MergeIdentity;
    b: MergeIdentity;
    survivor: "a" | "b";
    onResolve: (identity: MergeIdentity) => void;
    onCancel: () => void;
  } = $props();

  const diffs = $derived(diffIdentity(a, b));

  // Per differing field, an explicit override of the default side. A field left
  // out falls back to the survivor's side (see `selected`).
  let overrides = $state<Partial<Record<IdentityField, "a" | "b">>>({});

  /** The side currently selected for a field (override, else the survivor). */
  function selected(field: IdentityField): "a" | "b" {
    return overrides[field] ?? survivor;
  }

  /** Human label for a field. */
  function fieldLabel(field: IdentityField): string {
    if (field === "nom") return m.common_lastname();
    if (field === "prenom") return m.common_firstname();
    return m.admin_people_promo_label();
  }

  /** Display a field's value for a given side. */
  function fieldValue(field: IdentityField, side: "a" | "b"): string {
    const person = side === "a" ? a : b;
    if (field === "level") return formatPromoShort(person.level);
    return person[field];
  }

  /** Build the resolved identity: chosen value per diff field, common otherwise. */
  function resolve() {
    const diffFields = new Set(diffs.map((d) => d.field));
    const pick = (field: IdentityField) =>
      diffFields.has(field) ? (selected(field) === "a" ? a : b) : a;
    onResolve({
      nom: pick("nom").nom,
      prenom: pick("prenom").prenom,
      level: pick("level").level,
    });
  }
</script>

<div
  class="backdrop"
  transition:fade={{ duration: 150 }}
  onclick={(e) => e.target === e.currentTarget && onCancel()}
  onkeydown={(e) => e.key === "Escape" && onCancel()}
  role="presentation"
>
  <div
    class="dialog"
    transition:scale={{ duration: 180, start: 0.95 }}
    role="dialog"
    aria-modal="true"
    tabindex="-1"
  >
    <header>
      <h2>{m.merge_resolve_title()}</h2>
      <button class="close" onclick={onCancel} aria-label={m.common_close()}>
        <X size={20} />
      </button>
    </header>

    <p class="sub">{m.merge_resolve_sub()}</p>

    <div class="fields">
      {#each diffs as d (d.field)}
        <fieldset class="field">
          <legend>{fieldLabel(d.field)}</legend>
          <div class="opts">
            {#each ["a", "b"] as const as side (side)}
              <button
                type="button"
                class="opt"
                class:selected={selected(d.field) === side}
                aria-pressed={selected(d.field) === side}
                onclick={() => (overrides[d.field] = side)}
              >
                {fieldValue(d.field, side)}
              </button>
            {/each}
          </div>
        </fieldset>
      {/each}
    </div>

    <div class="actions">
      <button class="ghost" onclick={onCancel}>{m.common_cancel()}</button>
      <button class="primary" onclick={resolve}>
        <GitMerge size={16} />
        {m.admin_merge()}
      </button>
    </div>
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    background: rgba(2, 5, 12, 0.7);
    backdrop-filter: blur(4px);
    z-index: 1200;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1rem;
  }
  .dialog {
    width: 100%;
    max-width: 440px;
    background: #0f172a;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 16px;
    padding: 1.5rem;
    box-shadow: 0 30px 60px rgba(0, 0, 0, 0.6);
  }
  header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.5rem;
  }
  h2 {
    margin: 0;
    font-size: 1.1rem;
    color: #f8fafc;
  }
  .close {
    background: transparent;
    border: none;
    color: #94a3b8;
    cursor: pointer;
  }
  .sub {
    margin: 0 0 1rem;
    color: #94a3b8;
    font-size: 0.9rem;
  }
  .fields {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .field {
    border: none;
    padding: 0;
    margin: 0;
  }
  .field legend {
    padding: 0 0 6px;
    color: #cbd5e1;
    font-size: 0.8rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }
  .opts {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }
  .opt {
    padding: 10px 12px;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 10px;
    color: #e2e8f0;
    cursor: pointer;
    text-align: left;
    transition:
      border-color 0.15s,
      background 0.15s;
  }
  .opt:hover {
    background: rgba(59, 130, 246, 0.1);
  }
  .opt.selected {
    border-color: #3b82f6;
    background: rgba(59, 130, 246, 0.18);
    color: #f8fafc;
  }
  .actions {
    display: flex;
    gap: 10px;
    margin-top: 1.25rem;
  }
  .ghost {
    flex: 1;
    background: transparent;
    border: 1px solid rgba(255, 255, 255, 0.15);
    color: #94a3b8;
    padding: 10px;
    border-radius: 8px;
    cursor: pointer;
  }
  .primary {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    background: #3b82f6;
    color: white;
    border: none;
    padding: 10px;
    border-radius: 8px;
    font-weight: 600;
    cursor: pointer;
  }
</style>
