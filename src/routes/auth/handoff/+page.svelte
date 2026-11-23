<script lang="ts">
  /**
   * `/auth/handoff` - where Canari lands a signed-in user with a one-time token in the FRAGMENT
   * (docs/wiki/authentication.md, "Signed in from Canari"). The token leaves the address bar
   * before anything else runs, is posted to `/api/auth/handoff`, and the page acts on the answer.
   * The interstitial is ALWAYS shown before a session opens: it names who the user is about to be.
   * The logic is the vendored `handoff-landing.ts`; this page draws it. Every way out that is not a
   * session goes to the ordinary MiConnect sign-in.
   */
  import { onMount } from 'svelte';
  import { replaceState } from '$app/navigation';
  import { resolve } from '$app/paths';
  import {
    redeemHandoff,
    takeHandoffToken,
    type HandoffInterstitial,
    type LandingStep,
  } from '#lib/handoff/handoff-landing.js';
  import { STEP_UP_LOGIN_PATH } from '#lib/step-up.js';
  import { m } from '#lib/paraglide/messages.js';
  import Seo from '#lib/components/Seo.svelte';

  let interstitial = $state<HandoffInterstitial | null>(null);
  let working = $state(true);
  /** Held in this page's memory only, for the click; never written anywhere. */
  let token = '';

  function act(step: LandingStep): void {
    if (step.kind === 'go') {
      location.replace(step.to);
    } else if (step.kind === 'login') {
      location.replace(STEP_UP_LOGIN_PATH);
    } else {
      interstitial = step.interstitial;
      working = false;
    }
  }

  onMount(() => {
    token = takeHandoffToken(location, {
      // The page's own path: the fragment, and with it the token, is what goes.
      replaceState: () => replaceState(resolve('/auth/handoff'), {}),
    });
    void redeemHandoff(token, false).then(act);
  });

  async function proceed(): Promise<void> {
    working = true;
    act(await redeemHandoff(token, true));
  }

  function cancel(): void {
    token = '';
    location.replace('/');
  }
</script>

<Seo
  meta={{
    title: m.handoff_title(),
    description: m.seo_site_description(),
    noindex: true,
  }}
/>

<div class="handoff">
  {#if interstitial}
    {#if interstitial.next.photo}
      <img class="avatar" src={interstitial.next.photo} alt="" width="96" height="96" />
    {/if}
    <p class="who">
      {interstitial.current
        ? m.handoff_switch({ current: interstitial.current, next: interstitial.next.name })
        : m.handoff_as_next({ next: interstitial.next.name })}
    </p>
    <div class="actions">
      <button class="secondary" type="button" onclick={cancel} disabled={working}>
        {m.handoff_cancel()}
      </button>
      <button class="primary" type="button" onclick={proceed} disabled={working}>
        {m.handoff_continue()}
      </button>
    </div>
  {:else}
    <p>{m.handoff_working()}</p>
  {/if}
</div>

<style>
  .handoff {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1rem;
    padding: 2rem;
    text-align: center;
    color: #e2e8f0;
    background: radial-gradient(circle at 50% 30%, #1e293b, #0b1120 70%);
  }

  .avatar {
    border-radius: 50%;
    object-fit: cover;
  }

  p {
    max-width: 32rem;
    line-height: 1.6;
    color: #94a3b8;
    margin: 0;
  }

  .who {
    color: #e2e8f0;
  }

  .actions {
    display: flex;
    gap: 0.75rem;
  }

  button {
    padding: 0.6rem 1.4rem;
    border-radius: 9999px;
    border: none;
    cursor: pointer;
    transition: background 0.2s;
  }

  .secondary {
    background: #334155;
    color: #e2e8f0;
  }

  .secondary:hover {
    background: #475569;
  }

  .primary {
    background: #e2e8f0;
    color: #0b1120;
  }

  .primary:hover {
    background: #cbd5e1;
  }
</style>
