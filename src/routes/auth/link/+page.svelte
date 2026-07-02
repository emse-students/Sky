<script lang="ts">
  import { untrack } from "svelte";
  import { enhance } from "$app/forms";
  import { Star, UserPlus } from "lucide-svelte";
  import { m } from "$lib/paraglide/messages";

  let { data, form } = $props();

  // Valeur initiale figee (le choix devient ensuite pilote par l utilisateur).
  let choice = $state<string>(untrack(() => data.candidates[0]?.id ?? "new"));
  let submitting = $state(false);
</script>

<svelte:head>
  <title>{m.link_page_title()}</title>
</svelte:head>

<div class="link">
  <div class="card">
    <Star size={40} class="icon" />
    <h1>{m.link_heading()}</h1>
    <p class="sub">
      {m.link_subtitle_before()}
      <strong>{data.firstName} {data.lastName}</strong>{data.level
        ? ` ${m.link_promo_paren({ level: data.level })}`
        : ""}. {m.link_subtitle_after()}
    </p>

    {#if form?.error}
      <div class="err">{form.error}</div>
    {/if}

    <form
      method="POST"
      use:enhance={() => {
        submitting = true;
        return async ({ update }) => {
          await update();
          submitting = false;
        };
      }}
    >
      <div class="options">
        {#each data.candidates as c (c.id)}
          <label class="option" class:active={choice === c.id}>
            <input
              type="radio"
              name="choice"
              value={c.id}
              bind:group={choice}
            />
            <Star size={18} />
            <span class="name">{c.lastName} {c.firstName}</span>
            <span class="promo"
              >{c.level
                ? m.common_promo({ level: c.level })
                : m.link_promo_unknown()}</span
            >
          </label>
        {/each}

        <label class="option new" class:active={choice === "new"}>
          <input type="radio" name="choice" value="new" bind:group={choice} />
          <UserPlus size={18} />
          <span class="name">{m.link_option_new()}</span>
        </label>
      </div>

      <button class="submit" type="submit" disabled={submitting}>
        {submitting ? m.link_submitting() : m.common_continue()}
      </button>
    </form>
  </div>
</div>

<style>
  .link {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 2rem;
    background: radial-gradient(circle at 50% 30%, #1e293b, #05070a 70%);
    color: #e2e8f0;
  }
  .card {
    width: 100%;
    max-width: 480px;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 16px;
    padding: 2rem;
    text-align: center;
  }
  :global(.link .icon) {
    color: #fbbf24;
  }
  h1 {
    font-size: 1.5rem;
    margin: 0.75rem 0 0.5rem;
  }
  .sub {
    color: #94a3b8;
    line-height: 1.5;
    margin: 0 0 1.5rem;
    font-size: 0.95rem;
  }
  .err {
    background: rgba(239, 68, 68, 0.12);
    border: 1px solid rgba(239, 68, 68, 0.3);
    color: #fca5a5;
    border-radius: 8px;
    padding: 0.6rem 1rem;
    margin-bottom: 1rem;
    font-size: 0.9rem;
  }
  .options {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    margin-bottom: 1.5rem;
    text-align: left;
  }
  .option {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.85rem 1rem;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 10px;
    cursor: pointer;
    transition:
      border-color 0.15s,
      background 0.15s;
  }
  .option:hover {
    background: rgba(255, 255, 255, 0.05);
  }
  .option.active {
    border-color: #fbbf24;
    background: rgba(251, 191, 36, 0.08);
  }
  .option input {
    accent-color: #fbbf24;
  }
  .option .name {
    flex: 1;
    font-weight: 500;
  }
  .option .promo {
    font-size: 0.8rem;
    color: #94a3b8;
  }
  .option.new {
    border-style: dashed;
  }
  .submit {
    width: 100%;
    padding: 0.8rem;
    border: none;
    border-radius: 10px;
    background: linear-gradient(135deg, #f59e0b, #d97706);
    color: #1a1300;
    font-weight: 700;
    font-size: 1rem;
    cursor: pointer;
  }
  .submit:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
</style>
