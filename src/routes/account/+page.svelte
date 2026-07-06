<script lang="ts">
  import { enhance } from "$app/forms";
  import { ArrowLeft, Search, Link2, Check } from "lucide-svelte";
  import { goto } from "$app/navigation";
  import { personMatchScore } from "$lib/utils/format";
  import { confirmDialog } from "$lib/stores/dialogStore";
  import { m } from "$lib/paraglide/messages";
  import LocaleSwitcher from "$components/LocaleSwitcher.svelte";

  let { data, form } = $props();

  // The relink form is submitted programmatically once the in-app confirm
  // modal is accepted (a native confirm() cannot gate an async submit here).
  let relinkForm: HTMLFormElement | undefined = $state();

  /** Ask for confirmation, then submit the relink form if accepted. */
  async function confirmRelink() {
    if (await confirmDialog(m.account_relink_confirm())) {
      relinkForm?.requestSubmit();
    }
  }

  let searchTerm = $state("");
  // Currently selected target fiche id (the one the account will move to).
  let chosenId = $state("");

  type Candidate = {
    id: string;
    prenom: string;
    nom: string;
    level: number | null;
  };

  /**
   * Tolerant search over unlinked fiches (substring, word inversion, promo and
   * typo tolerance via personMatchScore). When the box is empty, show the
   * suggested placeholders that match the signed-in identity.
   */
  let results = $derived.by((): Candidate[] => {
    if (!searchTerm.trim()) {
      return data.suggested as Candidate[];
    }
    return (data.unlinked as Candidate[])
      .map((p) => ({
        p,
        score: personMatchScore(p.nom, p.prenom, p.level, searchTerm),
      }))
      .filter((c) => c.score !== null)
      .sort((a, b) => (a.score as number) - (b.score as number))
      .slice(0, 20)
      .map((c) => c.p);
  });

  function pick(id: string) {
    chosenId = chosenId === id ? "" : id;
  }
</script>

<svelte:head>
  <title>{m.account_page_title()}</title>
</svelte:head>

<div class="account-layout">
  <header class="account-header">
    <button class="btn-back" onclick={() => goto("/")}>
      <ArrowLeft size={20} />
      <span>{m.common_back()}</span>
    </button>
    <h1>{m.account_heading()}</h1>
    <LocaleSwitcher />
  </header>

  <div class="account-content">
    <p class="current">
      {m.account_relink_intro_before()}
      <strong>{data.currentName}</strong>. {m.account_relink_intro_after()}
    </p>

    {#if form?.error}
      <div class="error">{form.error}</div>
    {/if}

    <div class="search-bar">
      <Search size={18} />
      <input
        type="text"
        placeholder={m.account_search_placeholder()}
        bind:value={searchTerm}
      />
    </div>

    {#if !searchTerm && results.length > 0}
      <p class="hint">{m.account_suggest_hint()}</p>
    {/if}

    <ul class="candidate-list">
      {#each results as person (person.id)}
        <li>
          <button
            class="candidate"
            class:chosen={chosenId === person.id}
            onclick={() => pick(person.id)}
          >
            <span class="cand-name"
              >{person.nom.toUpperCase()} {person.prenom}</span
            >
            <span class="cand-promo"
              >{m.common_promo({ level: person.level ?? "-" })}</span
            >
            {#if chosenId === person.id}
              <Check size={16} class="cand-check" />
            {/if}
          </button>
        </li>
      {:else}
        <li class="empty">{m.account_empty()}</li>
      {/each}
    </ul>

    {#if chosenId}
      <form method="POST" action="?/relink" use:enhance bind:this={relinkForm}>
        <input type="hidden" name="targetId" value={chosenId} />
        <button type="button" class="btn-relink" onclick={confirmRelink}>
          <Link2 size={18} />
          <span>{m.account_relink_button()}</span>
        </button>
      </form>
    {/if}
  </div>
</div>

<style>
  .account-layout {
    min-height: 100vh;
    background: #05070a;
    color: #f8fafc;
  }
  .account-header {
    position: sticky;
    top: 0;
    background: rgba(10, 15, 25, 0.95);
    backdrop-filter: blur(12px);
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    padding: 20px 40px;
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: center;
    gap: 20px;
  }
  .account-header h1 {
    margin: 0;
    text-align: center;
    font-size: 22px;
  }
  .btn-back {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 16px;
    border-radius: 8px;
    border: none;
    background: transparent;
    color: #94a3b8;
    cursor: pointer;
  }
  .btn-back:hover {
    color: white;
  }
  .account-content {
    max-width: 720px;
    margin: 0 auto;
    padding: 32px 24px 64px;
  }
  .current {
    line-height: 1.6;
    color: #cbd5e1;
    margin-bottom: 24px;
  }
  .current strong {
    color: white;
  }
  .error {
    background: rgba(239, 68, 68, 0.1);
    border: 1px solid rgba(239, 68, 68, 0.3);
    color: #fca5a5;
    padding: 12px 16px;
    border-radius: 10px;
    margin-bottom: 16px;
  }
  .search-bar {
    display: flex;
    align-items: center;
    gap: 12px;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 10px;
    padding: 12px 16px;
    margin-bottom: 20px;
  }
  .search-bar input {
    flex: 1;
    background: transparent;
    border: none;
    color: white;
    outline: none;
    font-size: 15px;
  }
  .hint {
    color: #94a3b8;
    font-size: 13px;
    margin: 0 0 10px;
  }
  .candidate-list {
    list-style: none;
    margin: 0 0 24px;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .candidate {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 14px 16px;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 10px;
    color: white;
    cursor: pointer;
    transition: all 0.2s;
    text-align: left;
  }
  .candidate:hover {
    background: rgba(255, 255, 255, 0.07);
  }
  .candidate.chosen {
    border-color: #3b82f6;
    background: rgba(59, 130, 246, 0.12);
  }
  .cand-name {
    flex: 1;
    font-weight: 600;
  }
  .cand-promo {
    color: #94a3b8;
    font-size: 13px;
  }
  .empty {
    color: #64748b;
    text-align: center;
    padding: 24px;
  }
  .btn-relink {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    width: 100%;
    padding: 14px;
    border: none;
    border-radius: 10px;
    background: #3b82f6;
    color: white;
    font-weight: 600;
    font-size: 15px;
    cursor: pointer;
  }
  .btn-relink:hover {
    background: #2563eb;
  }
</style>
