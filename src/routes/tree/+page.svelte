<script lang="ts">
  import { onMount } from 'svelte';
  import { fade } from 'svelte/transition';
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import { browser } from '$app/env';
  import {
    ArrowLeft,
    Plus,
    Trash2,
    LoaderCircle,
    ChevronUp,
    Crown,
    House,
    ExternalLink,
    Pencil,
  } from '@lucide/svelte';
  import AddRelativeModal from '#lib/components/AddRelativeModal.svelte';
  import BioMarkdown from '#lib/components/BioMarkdown.svelte';
  import { confirmDialog, alertDialog } from '#lib/stores/dialogStore.js';
  import { m } from '#lib/paraglide/messages.js';
  import { formatPromoShort } from '#lib/utils/format.js';
  import type {
    EntourageResponse,
    EntourageMember,
    RelationKind,
    RelationRole,
    CanariProfileResponse,
  } from '#lib/types/graph.js';

  let user = $derived(page.data.user);

  let data = $state<EntourageResponse | null>(null);
  let canari = $state<CanariProfileResponse | null>(null);
  let loading = $state(true);
  // The id of a tree that could not be read (no answer, or an error other than "no such fiche"):
  // the page says so and offers to ask again, instead of saying the member has no fiche.
  let failedId = $state<string | null>(null);
  let modal: { role: RelationRole; kind: RelationKind; title: string } | null = $state(null);
  // Edit form for a placeholder relative (name/promo), null when closed.
  let editing = $state<{
    id: string;
    prenom: string;
    nom: string;
    level: string;
  } | null>(null);

  let isMe = $derived(!!data && !!user && data.person.id === user.id);
  // The server decides who may edit a given tree (admin, or a member of the same
  // parrainage family); we mirror its verdict so the controls match the API.
  let canEdit = $derived(!!data?.canEdit);

  $effect(() => {
    if (browser && !user) goto('/');
  });

  onMount(() => {
    // ?id lets an admin open another person's tree directly.
    const requested = page.url.searchParams.get('id');
    const start = requested || user?.id;
    if (start) {
      load(start);
    } else {
      loading = false;
    }
  });

  /** Load a person's network and place them at the center of the tree. */
  async function load(id: string) {
    loading = true;
    canari = null;
    failedId = null;
    try {
      const res = await fetch(`/api/entourage?id=${encodeURIComponent(id)}`);
      if (res.ok) {
        data = (await res.json()) as EntourageResponse;
      } else if (res.status !== 404) {
        // A 404 is the server saying this person has no fiche; anything else is not an answer.
        console.error('[Tree] load refused', res.status);
        failedId = id;
      }
    } catch (e) {
      console.error('[Tree] load error', e);
      failedId = id;
    } finally {
      loading = false;
    }
    // A tree already on screen stays on screen; the person is told its refresh did not happen.
    if (failedId && data) await alertDialog(m.tree_load_failed());
    if (!failedId) loadCanari(id);
  }

  /** Load the Canari profile (bio, clubs) of the centered person. */
  async function loadCanari(id: string) {
    try {
      const res = await fetch(`/api/canari/${encodeURIComponent(id)}`);
      if (res.ok) {
        canari = (await res.json()) as CanariProfileResponse;
      }
    } catch (e) {
      console.error('[Tree] canari load error', e);
    }
  }

  function backToMe() {
    if (user?.id) {
      load(user.id);
    }
  }

  function avatarUrl(id: string): string {
    return `/api/avatar/${id}`;
  }

  function initials(m: { prenom: string; nom: string }): string {
    return `${m.prenom?.[0] ?? ''}${m.nom?.[0] ?? ''}`.toUpperCase() || '?';
  }

  let KIND_LABEL: Record<RelationKind, string> = $derived({
    parrainage: m.tree_kind_official(),
    adoption: m.tree_kind_adoption(),
  });

  /**
   * Build the slots for one side (ascendants/descendants) of a given kind:
   * existing members first, then the remaining empty slots when editable.
   */
  function slots(
    members: EntourageMember[],
    kind: RelationKind,
    max: number
  ): { member: EntourageMember | null }[] {
    const filled = members.filter((m) => m.kind === kind);
    const result: { member: EntourageMember | null }[] = filled.map((m) => ({
      member: m,
    }));
    if (canEdit) {
      for (let i = filled.length; i < max; i++) {
        result.push({ member: null });
      }
    }
    return result;
  }

  function openAdd(role: RelationRole, kind: RelationKind) {
    const who = role === 'parrain' ? m.tree_role_godparent() : m.tree_role_godchild();
    modal = { role, kind, title: m.tree_add_title({ who, kind: KIND_LABEL[kind] }) };
  }

  function onAdded() {
    modal = null;
    if (data) {
      load(data.person.id);
    }
  }

  /** Remove the link to `member`, once the person has said yes, and say so when it fails. */
  async function removeRelation(member: EntourageMember) {
    if (!data) return;
    const centerId = data.person.id;
    const confirmed = await confirmDialog(
      m.tree_remove_confirm({ name: `${member.prenom} ${member.nom}` }),
      { danger: true, confirmLabel: m.tree_remove_aria() }
    );
    if (!confirmed) return;
    try {
      const res = await fetch('/api/relationships', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ relationshipId: member.relId }),
      });
      if (!res.ok) {
        const refusal = (await res.json().catch(() => ({}))) as { error?: string };
        console.error('[Tree] remove refused', res.status);
        await alertDialog(refusal.error || m.tree_remove_failed());
        return;
      }
      const result = (await res.json().catch(() => ({}))) as {
        orphan?: { id: string; prenom: string; nom: string } | null;
      };
      await load(centerId);
      // Removing the link left a placeholder with no relation: offer to delete it
      // (a mistyped star recreated elsewhere leaves such an orphan behind).
      if (result.orphan) {
        const o = result.orphan;
        if (
          await confirmDialog(m.tree_orphan_confirm({ name: `${o.prenom} ${o.nom}` }), {
            danger: true,
            confirmLabel: m.common_delete(),
          })
        ) {
          const gone = await fetch(`/api/relatives/${encodeURIComponent(o.id)}`, {
            method: 'DELETE',
          });
          if (!gone.ok) {
            console.error('[Tree] orphan delete refused', gone.status);
            await alertDialog(m.tree_delete_failed());
          }
          await load(centerId);
        }
      }
    } catch (e) {
      console.error('[Tree] remove error', e);
      await alertDialog(m.tree_remove_failed());
    }
  }

  /** Open the edit form for a placeholder relative. */
  function openEdit(member: EntourageMember) {
    editing = {
      id: member.id,
      prenom: member.prenom,
      nom: member.nom,
      level: member.level != null ? String(member.level) : '',
    };
  }

  /** Save the edited placeholder identity (name/promo all required). */
  async function saveEdit() {
    if (!editing || !data) return;
    if (!editing.prenom.trim() || !editing.nom.trim() || !editing.level) {
      return;
    }
    const centerId = data.person.id;
    const res = await fetch(`/api/relatives/${encodeURIComponent(editing.id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prenom: editing.prenom,
        nom: editing.nom,
        level: parseInt(editing.level),
      }),
    });
    if (res.ok) {
      editing = null;
      await load(centerId);
    } else {
      const d = await res.json().catch(() => ({}));
      await alertDialog(d.error || m.tree_edit_failed());
    }
  }

  /** Delete the placeholder currently being edited (after confirmation). */
  async function deleteStar() {
    if (!editing || !data) return;
    if (
      !(await confirmDialog(m.tree_delete_confirm({ name: `${editing.prenom} ${editing.nom}` }), {
        danger: true,
        confirmLabel: m.common_delete(),
      }))
    ) {
      return;
    }
    const centerId = data.person.id;
    const res = await fetch(`/api/relatives/${encodeURIComponent(editing.id)}`, {
      method: 'DELETE',
    });
    if (res.ok) {
      editing = null;
      await load(centerId);
    } else {
      const d = await res.json().catch(() => ({}));
      await alertDialog(d.error || m.tree_delete_failed());
    }
  }
</script>

<svelte:head>
  <title>{m.tree_page_title()}</title>
</svelte:head>

<div class="tree-page">
  <header class="bar">
    <button class="back" onclick={() => goto('/')}>
      <ArrowLeft size={18} />
      {m.tree_map()}
    </button>
    <h1>{m.tree_heading()}</h1>
    {#if data && !isMe}
      <button class="back" onclick={backToMe}>
        <House size={18} />
        {m.nav_my_tree()}
      </button>
    {:else}
      <span class="spacer"></span>
    {/if}
  </header>

  {#if loading}
    <div class="state"><LoaderCircle size={40} class="spin" /></div>
  {:else if !data && failedId}
    {@const again = failedId}
    <div class="state failed">
      <p>{m.tree_load_failed()}</p>
      <button class="retry" onclick={() => load(again)}>{m.tree_retry()}</button>
    </div>
  {:else if !data}
    <div class="state">{m.tree_no_fiche()}</div>
  {:else}
    <div class="tree" in:fade>
      <!-- Ascendants (godparents) -->
      <div class="row ascendants">
        {#each slots(data.parrains, 'parrainage', data.maxParrains.parrainage) as s, i (s.member?.relId ?? `empty-${i}`)}
          {@render slotCard(s.member, 'parrain', 'parrainage')}
        {/each}
        {#each slots(data.parrains, 'adoption', data.maxParrains.adoption) as s, i (s.member?.relId ?? `empty-${i}`)}
          {@render slotCard(s.member, 'parrain', 'adoption')}
        {/each}
      </div>

      <div class="connector up"><ChevronUp size={16} /></div>

      <!-- Center (me / targeted person) -->
      <div class="row center">
        <div class="card self">
          <div class="avatar big">
            <img
              src={avatarUrl(data.person.id)}
              alt=""
              onerror={(e) => ((e.currentTarget as HTMLImageElement).style.visibility = 'hidden')}
            />
            <span class="ini">{initials(data.person)}</span>
          </div>
          <div class="meta">
            <span class="name">{data.person.prenom} {data.person.nom}</span>
            <span class="promo">{m.common_promo({ level: data.person.level || '?' })}</span>
          </div>
          {#if isMe}<span class="me-badge"><Crown size={12} /> {m.tree_me()}</span>{/if}
        </div>
      </div>

      <div class="connector down"></div>

      <!-- Descendants (godchildren) -->
      <div class="row descendants">
        {#each slots(data.fillots, 'parrainage', data.maxFillots.parrainage) as s, i (s.member?.relId ?? `empty-${i}`)}
          {@render slotCard(s.member, 'fillot', 'parrainage')}
        {/each}
        {#each slots(data.fillots, 'adoption', data.maxFillots.adoption) as s, i (s.member?.relId ?? `empty-${i}`)}
          {@render slotCard(s.member, 'fillot', 'adoption')}
        {/each}
      </div>

      {#if canari?.linked && canari.profile}
        <section class="canari" in:fade>
          <div class="canari-head">
            <h2>{m.profile_link()}</h2>
            <a
              class="profil-link"
              href={`${page.data.canariUrl}/profile/${canari.profile.sub}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <ExternalLink size={14} />
              {m.tree_view_on_canari()}
            </a>
          </div>
          {#if canari.profile.bio}
            <BioMarkdown source={canari.profile.bio} />
          {/if}
          {#if canari.profile.associations.length > 0}
            <h3>{m.profile_associations()}</h3>
            <div class="chips">
              {#each canari.profile.associations as a (a.slug)}
                <span class="chip">
                  {#if a.logo}
                    <img class="chip-logo" src={a.logo} alt="" />
                  {/if}
                  {a.name}<small>{a.role}</small>
                </span>
              {/each}
            </div>
          {/if}
          {#if canari.profile.formerAssociations.length > 0}
            <h3>{m.profile_former_associations()}</h3>
            <div class="chips">
              {#each canari.profile.formerAssociations as a, i (i)}
                <span class="chip ghost">
                  {#if a.logo}
                    <img class="chip-logo" src={a.logo} alt="" />
                  {/if}
                  {a.name}<small
                    >{a.role}{a.startYear
                      ? ` (${a.startYear}${a.endYear ? `-${a.endYear}` : ''})`
                      : ''}</small
                  ></span
                >
              {/each}
            </div>
          {/if}
        </section>
      {/if}
    </div>
  {/if}
</div>

{#snippet slotCard(member: EntourageMember | null, role: RelationRole, kind: RelationKind)}
  {#if member}
    <div class="card filled" class:adoption={kind === 'adoption'}>
      <button class="nav" onclick={() => load(member.id)} title={m.tree_see_tree()}>
        <div class="avatar">
          <img
            src={avatarUrl(member.id)}
            alt=""
            onerror={(e) => ((e.currentTarget as HTMLImageElement).style.visibility = 'hidden')}
          />
          <span class="ini">{initials(member)}</span>
        </div>
        <div class="meta">
          <span class="name">{member.prenom} {member.nom}</span>
          <span class="promo">{formatPromoShort(member.level)} · {KIND_LABEL[kind]}</span>
        </div>
      </button>
      {#if canEdit}
        {#if !member.linked}
          <button
            class="edit"
            onclick={() => openEdit(member)}
            aria-label={m.tree_edit_star_aria()}
            title={m.tree_edit_star_title()}
          >
            <Pencil size={14} />
          </button>
        {/if}
        <button
          class="del"
          onclick={() => removeRelation(member)}
          aria-label={m.tree_remove_aria()}
          title={m.tree_remove_title()}
        >
          <Trash2 size={14} />
        </button>
      {/if}
    </div>
  {:else}
    <button
      class="card empty"
      class:adoption={kind === 'adoption'}
      onclick={() => openAdd(role, kind)}
    >
      <Plus size={20} />
      <span>{KIND_LABEL[kind]}</span>
    </button>
  {/if}
{/snippet}

{#if modal}
  <AddRelativeModal
    role={modal.role}
    kind={modal.kind}
    title={modal.title}
    centerId={data?.person.id}
    onClose={() => (modal = null)}
    {onAdded}
  />
{/if}

{#if editing}
  <div
    class="edit-backdrop"
    transition:fade={{ duration: 150 }}
    onclick={(e) => e.target === e.currentTarget && (editing = null)}
    role="presentation"
  >
    <div class="edit-dialog" role="dialog" aria-modal="true">
      <h2>{m.tree_edit_dialog_title()}</h2>
      <p class="edit-hint">
        {m.tree_edit_hint()}
      </p>
      <div class="edit-row">
        <input placeholder={m.common_firstname()} bind:value={editing.prenom} />
        <input placeholder={m.common_lastname()} bind:value={editing.nom} />
      </div>
      <input type="number" placeholder={m.tree_promo_placeholder()} bind:value={editing.level} />
      <div class="edit-actions">
        <button class="edit-danger" onclick={deleteStar}>
          <Trash2 size={14} />
          {m.common_delete()}
        </button>
        <span class="spacer"></span>
        <button class="edit-ghost" onclick={() => (editing = null)}>{m.common_cancel()}</button>
        <button
          class="edit-primary"
          onclick={saveEdit}
          disabled={!editing.prenom.trim() || !editing.nom.trim() || !editing.level}
        >
          {m.common_save()}
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .tree-page {
    min-height: 100vh;
    background: radial-gradient(circle at 50% 0%, #111c33, #05070a 60%);
    color: #f8fafc;
    padding-bottom: 4rem;
  }
  .bar {
    position: sticky;
    top: 0;
    z-index: 10;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 1rem 1.5rem;
    background: rgba(8, 12, 22, 0.85);
    backdrop-filter: blur(12px);
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  }
  .bar h1 {
    margin: 0;
    font-size: 1.1rem;
    font-weight: 600;
  }
  .back {
    display: flex;
    align-items: center;
    gap: 6px;
    background: transparent;
    border: none;
    color: #94a3b8;
    cursor: pointer;
    font-size: 0.9rem;
  }
  .back:hover {
    color: white;
  }
  .spacer {
    width: 80px;
  }
  .state {
    display: flex;
    justify-content: center;
    padding: 6rem 1rem;
    color: #94a3b8;
  }
  .state.failed {
    flex-direction: column;
    align-items: center;
    gap: 1rem;
  }
  .retry {
    padding: 0.5rem 1.1rem;
    border-radius: 999px;
    border: 1px solid rgba(148, 163, 184, 0.4);
    background: transparent;
    color: inherit;
    cursor: pointer;
  }
  .tree {
    max-width: 980px;
    margin: 0 auto;
    padding: 2rem 1rem;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
  }
  .row {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 12px;
  }
  .connector {
    width: 2px;
    height: 28px;
    background: linear-gradient(rgba(59, 130, 246, 0.6), rgba(59, 130, 246, 0.1));
    color: #3b82f6;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .connector.up {
    height: 34px;
  }
  .card {
    display: flex;
    align-items: center;
    gap: 10px;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 14px;
    padding: 10px 12px;
    min-width: 180px;
  }
  .card.filled {
    position: relative;
    padding-right: 36px;
  }
  .card.filled.adoption {
    border-color: rgba(168, 85, 247, 0.4);
  }
  .card .nav {
    display: flex;
    align-items: center;
    gap: 10px;
    background: transparent;
    border: none;
    color: inherit;
    cursor: pointer;
    text-align: left;
    width: 100%;
  }
  .card.self {
    border-color: rgba(59, 130, 246, 0.6);
    background: rgba(59, 130, 246, 0.1);
    position: relative;
    padding-right: 60px;
  }
  .avatar {
    position: relative;
    width: 42px;
    height: 42px;
    border-radius: 50%;
    overflow: hidden;
    background: #3b82f6;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .avatar.big {
    width: 56px;
    height: 56px;
  }
  .avatar img {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .avatar .ini {
    font-size: 0.85rem;
    font-weight: 700;
    color: white;
  }
  .meta {
    display: flex;
    flex-direction: column;
  }
  .name {
    font-weight: 600;
    font-size: 0.9rem;
  }
  .promo {
    font-size: 0.75rem;
    color: #94a3b8;
  }
  .me-badge {
    position: absolute;
    top: 8px;
    right: 10px;
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 0.7rem;
    color: #fbbf24;
  }
  .del {
    position: absolute;
    top: 50%;
    right: 8px;
    transform: translateY(-50%);
    background: rgba(239, 68, 68, 0.1);
    border: none;
    color: #ef4444;
    border-radius: 6px;
    padding: 6px;
    cursor: pointer;
  }
  .del:hover {
    background: #ef4444;
    color: white;
  }
  .edit {
    position: absolute;
    top: 50%;
    right: 40px;
    transform: translateY(-50%);
    background: rgba(59, 130, 246, 0.12);
    border: none;
    color: #60a5fa;
    border-radius: 6px;
    padding: 6px;
    cursor: pointer;
  }
  .edit:hover {
    background: #3b82f6;
    color: white;
  }
  .edit-backdrop {
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
  .edit-dialog {
    width: 100%;
    max-width: 420px;
    background: #0f172a;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 16px;
    padding: 1.5rem;
    box-shadow: 0 30px 60px rgba(0, 0, 0, 0.6);
  }
  .edit-dialog h2 {
    margin: 0 0 4px;
    font-size: 1.1rem;
  }
  .edit-hint {
    margin: 0 0 14px;
    font-size: 0.82rem;
    color: #94a3b8;
  }
  .edit-row {
    display: flex;
    gap: 8px;
    margin-bottom: 8px;
  }
  .edit-dialog input {
    width: 100%;
    background: rgba(0, 0, 0, 0.3);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px;
    padding: 9px 12px;
    color: white;
    outline: none;
  }
  .edit-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 14px;
  }
  .edit-actions .spacer {
    flex: 1;
  }
  .edit-danger,
  .edit-ghost,
  .edit-primary {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    border-radius: 8px;
    padding: 9px 14px;
    cursor: pointer;
    font-weight: 600;
    border: 1px solid transparent;
  }
  .edit-danger {
    background: rgba(239, 68, 68, 0.12);
    border-color: rgba(239, 68, 68, 0.3);
    color: #fca5a5;
  }
  .edit-ghost {
    background: transparent;
    border-color: rgba(255, 255, 255, 0.15);
    color: #94a3b8;
  }
  .edit-primary {
    background: #3b82f6;
    color: white;
  }
  .edit-primary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .card.empty {
    flex-direction: column;
    gap: 4px;
    min-width: 110px;
    color: #64748b;
    border-style: dashed;
    cursor: pointer;
    justify-content: center;
    padding: 16px 12px;
  }
  .card.empty:hover {
    color: #3b82f6;
    border-color: #3b82f6;
  }
  .card.empty.adoption:hover {
    color: #a855f7;
    border-color: #a855f7;
  }
  .card.empty span {
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  .canari {
    margin-top: 2.5rem;
    width: 100%;
    max-width: 640px;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 16px;
    padding: 1.5rem;
  }
  .canari-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    margin-bottom: 0.75rem;
  }
  .canari h2 {
    margin: 0;
    font-size: 1rem;
    color: #f8fafc;
  }
  .profil-link {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    border-radius: 99px;
    background: rgba(59, 130, 246, 0.15);
    border: 1px solid rgba(59, 130, 246, 0.3);
    color: #93c5fd;
    text-decoration: none;
    font-size: 0.8rem;
    font-weight: 600;
  }
  .profil-link:hover {
    background: rgba(59, 130, 246, 0.25);
  }
  .canari h3 {
    margin: 1.25rem 0 0.5rem;
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: #94a3b8;
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    border-radius: 99px;
    background: rgba(59, 130, 246, 0.12);
    border: 1px solid rgba(59, 130, 246, 0.25);
    font-size: 0.85rem;
    color: #e2e8f0;
  }
  .chip small {
    color: #94a3b8;
    font-size: 0.7rem;
  }
  .chip-logo {
    width: 20px;
    height: 20px;
    border-radius: 50%;
    object-fit: cover;
    background: rgba(255, 255, 255, 0.1);
  }
  .chip.ghost {
    background: rgba(255, 255, 255, 0.04);
    border-color: rgba(255, 255, 255, 0.1);
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
