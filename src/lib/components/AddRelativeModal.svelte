<script lang="ts">
  import { fade, scale } from "svelte/transition";
  import { Search, UserPlus, X, Loader2 } from "lucide-svelte";
  import type { RelationRole, RelationKind } from "$types/graph";
  import { m } from "$lib/paraglide/messages";
  import { formatPromoShort } from "$lib/utils/format";

  /**
   * Modal to add a network member for a given slot (role + kind fixed by the
   * clicked slot). Searches an existing record or creates a new one; on a
   * namesake, offers linking rather than a duplicate. Delegates the 1/1/3/2
   * rules and the anti-cycle check to the server (/api/relationships).
   */
  let {
    role,
    kind,
    title,
    centerId,
    onClose,
    onAdded,
  }: {
    role: RelationRole;
    kind: RelationKind;
    title: string;
    /** Person at the center of the link (server default: the signed-in user). */
    centerId?: string;
    onClose: () => void;
    onAdded: () => void;
  } = $props();

  let searchTerm = $state("");
  let searchResults: {
    id: string;
    prenom: string;
    nom: string;
    level: number | null;
  }[] = $state([]);
  let isSearching = $state(false);
  let showCreate = $state(false);
  let newPerson = $state({ firstName: "", lastName: "", level: "" });
  let busy = $state(false);
  let errorMessage = $state("");
  let candidates: {
    id: string;
    firstName: string;
    lastName: string;
    level: number | null;
    linked: boolean;
  }[] = $state([]);

  function showError(msg: string) {
    errorMessage = msg;
    setTimeout(() => (errorMessage = ""), 4000);
  }

  async function handleSearch() {
    if (searchTerm.trim().length < 2) {
      searchResults = [];
      return;
    }
    isSearching = true;
    try {
      const res = await fetch(
        `/api/search?q=${encodeURIComponent(searchTerm)}`,
      );
      if (res.ok) {
        const data = await res.json();
        searchResults = data.results ?? [];
      }
    } finally {
      isSearching = false;
    }
  }

  /** Handle the server response: success, link request (dedup), or error. */
  async function handleResponse(res: Response) {
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      onAdded();
      return;
    }
    if (res.status === 409 && data.needsConfirmation) {
      candidates = data.candidates ?? [];
      return;
    }
    showError(data.error || m.modal_add_failed());
  }

  async function linkExisting(targetId: string) {
    busy = true;
    try {
      const res = await fetch("/api/relationships", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetId, type: kind, role, centerId }),
      });
      await handleResponse(res);
    } catch {
      showError(m.common_network_error());
    } finally {
      busy = false;
    }
  }

  async function createAndLink(confirmCreate = false) {
    // Last name, first name and promo are all mandatory when creating a star.
    if (!newPerson.firstName || !newPerson.lastName || !newPerson.level) {
      showError(m.modal_required_fields());
      return;
    }
    busy = true;
    errorMessage = "";
    try {
      const res = await fetch("/api/relationships", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: kind,
          role,
          confirmCreate,
          centerId,
          newPerson: {
            firstName: newPerson.firstName,
            lastName: newPerson.lastName,
            level: newPerson.level ? parseInt(newPerson.level) : null,
          },
        }),
      });
      await handleResponse(res);
    } catch {
      showError(m.common_network_error());
    } finally {
      busy = false;
    }
  }
</script>

<div
  class="backdrop"
  transition:fade={{ duration: 150 }}
  onclick={(e) => e.target === e.currentTarget && onClose()}
  onkeydown={(e) => e.key === "Escape" && onClose()}
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
      <h2>{title}</h2>
      <button class="close" onclick={onClose} aria-label={m.common_close()}>
        <X size={20} />
      </button>
    </header>

    <div class="search-wrapper">
      <Search size={18} class="s-icon" />
      <input
        type="text"
        placeholder={m.modal_search_placeholder()}
        bind:value={searchTerm}
        oninput={handleSearch}
      />
    </div>

    {#if isSearching}
      <div class="hint">
        <Loader2 size={16} class="spin" /> {m.modal_searching()}
      </div>
    {/if}

    {#if searchResults.length > 0}
      <div class="results">
        {#each searchResults as person (person.id)}
          <button
            class="result"
            disabled={busy}
            onclick={() => linkExisting(person.id)}
          >
            <UserPlus size={16} />
            <span>{person.prenom} {person.nom}</span>
            <small>{formatPromoShort(person.level)}</small>
          </button>
        {/each}
      </div>
    {/if}

    <!-- Create is always offered once the query is long enough, even when
         namesakes matched: the person to add may be a genuine new record. -->
    {#if searchTerm.trim().length >= 2 && !isSearching}
      <div class="empty-hint">
        {#if searchResults.length === 0}
          <span>{m.modal_no_result()}</span>
        {/if}
        <button class="ghost" onclick={() => (showCreate = !showCreate)}>
          {showCreate ? m.common_cancel() : m.modal_create_person()}
        </button>
      </div>
    {/if}

    {#if showCreate}
      <div class="create">
        <div class="row">
          <input
            type="text"
            placeholder={m.common_firstname()}
            bind:value={newPerson.firstName}
          />
          <input
            type="text"
            placeholder={m.common_lastname()}
            bind:value={newPerson.lastName}
          />
        </div>
        <input
          type="number"
          placeholder={m.tree_promo_placeholder()}
          bind:value={newPerson.level}
        />
        <button
          class="primary"
          disabled={busy ||
            !newPerson.firstName ||
            !newPerson.lastName ||
            !newPerson.level}
          onclick={() => createAndLink()}
        >
          {#if busy}<Loader2 size={16} class="spin" />{/if}
          {m.modal_create_and_link()}
        </button>
      </div>
    {/if}

    {#if candidates.length > 0}
      <div class="create">
        <p class="dedup">{m.modal_dedup()}</p>
        {#each candidates as c (c.id)}
          <button
            class="result"
            disabled={busy}
            onclick={() => linkExisting(c.id)}
          >
            <UserPlus size={16} />
            <span>{c.firstName} {c.lastName}</span>
            <small
              >{formatPromoShort(c.level)}{c.linked
                ? ` · ${m.modal_account()}`
                : ""}</small
            >
          </button>
        {/each}
        <button
          class="ghost"
          disabled={busy}
          onclick={() => createAndLink(true)}
        >
          {m.modal_create_anyway()}
        </button>
      </div>
    {/if}

    {#if errorMessage}
      <div class="error" transition:fade>{errorMessage}</div>
    {/if}
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
    margin-bottom: 1rem;
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
  .search-wrapper {
    position: relative;
    display: flex;
    align-items: center;
    gap: 8px;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 10px;
    padding: 0 12px;
  }
  .search-wrapper :global(.s-icon) {
    color: #94a3b8;
  }
  .search-wrapper input {
    flex: 1;
    background: transparent;
    border: none;
    color: white;
    padding: 12px 0;
    outline: none;
  }
  .results {
    margin-top: 10px;
    max-height: 240px;
    overflow-y: auto;
    border-radius: 10px;
    border: 1px solid rgba(255, 255, 255, 0.1);
  }
  .result {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px;
    background: transparent;
    border: none;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    color: white;
    cursor: pointer;
    text-align: left;
  }
  .result:hover:not(:disabled) {
    background: rgba(59, 130, 246, 0.15);
  }
  .result small {
    margin-left: auto;
    color: #94a3b8;
  }
  .hint {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-top: 12px;
    color: #94a3b8;
    font-size: 0.9rem;
  }
  .empty-hint {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
    margin-top: 12px;
  }
  .empty-hint span {
    color: #94a3b8;
    font-size: 0.9rem;
    text-align: center;
  }
  .create {
    margin-top: 12px;
    padding: 14px;
    background: rgba(59, 130, 246, 0.06);
    border: 1px dashed rgba(59, 130, 246, 0.4);
    border-radius: 12px;
  }
  .row {
    display: flex;
    gap: 8px;
    margin-bottom: 8px;
  }
  .create input {
    width: 100%;
    background: rgba(0, 0, 0, 0.3);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px;
    padding: 9px 12px;
    color: white;
    outline: none;
  }
  .dedup {
    margin: 0 0 10px;
    font-size: 0.85rem;
    color: #94a3b8;
  }
  .primary {
    width: 100%;
    margin-top: 10px;
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
  .ghost {
    width: 100%;
    margin-top: 10px;
    background: transparent;
    border: 1px solid rgba(255, 255, 255, 0.15);
    color: #94a3b8;
    padding: 9px;
    border-radius: 8px;
    cursor: pointer;
  }
  .error {
    margin-top: 12px;
    padding: 10px 14px;
    background: rgba(239, 68, 68, 0.12);
    border: 1px solid rgba(239, 68, 68, 0.3);
    color: #fca5a5;
    border-radius: 8px;
    font-size: 0.85rem;
  }
  :global(.spin) {
    animation: spin 1s linear infinite;
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
</style>
