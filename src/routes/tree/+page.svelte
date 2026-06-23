<script lang="ts">
  import { onMount } from "svelte";
  import { fade } from "svelte/transition";
  import { page } from "$app/stores";
  import { goto } from "$app/navigation";
  import { browser } from "$app/environment";
  import {
    ArrowLeft,
    Plus,
    Trash2,
    Loader2,
    ChevronUp,
    Crown,
    Home,
  } from "lucide-svelte";
  import AddRelativeModal from "$components/AddRelativeModal.svelte";
  import type {
    EntourageResponse,
    EntourageMember,
    RelationKind,
    RelationRole,
  } from "$types/graph";

  let user = $derived($page.data.user);

  let data = $state<EntourageResponse | null>(null);
  let loading = $state(true);
  let modal: { role: RelationRole; kind: RelationKind; title: string } | null =
    $state(null);

  // Editable uniquement quand l arbre est centre sur l utilisateur connecte
  // (on construit son propre entourage ; les autres sont en lecture seule).
  let isMe = $derived(!!data && !!user && data.person.id === user.profile_id);

  $effect(() => {
    if (browser && !user) goto("/");
  });

  onMount(() => {
    if (user?.profile_id) {
      load(user.profile_id);
    } else {
      loading = false;
    }
  });

  /** Charge l entourage d une personne et la place au centre de l arbre. */
  async function load(id: string) {
    loading = true;
    try {
      const res = await fetch(`/api/entourage?id=${encodeURIComponent(id)}`);
      if (res.ok) {
        data = (await res.json()) as EntourageResponse;
      }
    } catch (e) {
      console.error("[Tree] load error", e);
    } finally {
      loading = false;
    }
  }

  function backToMe() {
    if (user?.profile_id) {
      load(user.profile_id);
    }
  }

  function avatarUrl(id: string): string {
    return `/api/avatar/${id}`;
  }

  function initials(m: { prenom: string; nom: string }): string {
    return `${m.prenom?.[0] ?? ""}${m.nom?.[0] ?? ""}`.toUpperCase() || "?";
  }

  const KIND_LABEL: Record<RelationKind, string> = {
    parrainage: "officiel",
    adoption: "adoption",
  };

  /**
   * Construit les slots d un cote (ascendant/descendant) pour un type donne :
   * les membres existants puis, si editable, les slots vides restants.
   */
  function slots(
    members: EntourageMember[],
    kind: RelationKind,
    max: number,
  ): { member: EntourageMember | null }[] {
    const filled = members.filter((m) => m.kind === kind);
    const result: { member: EntourageMember | null }[] = filled.map((m) => ({
      member: m,
    }));
    if (isMe) {
      for (let i = filled.length; i < max; i++) {
        result.push({ member: null });
      }
    }
    return result;
  }

  function openAdd(role: RelationRole, kind: RelationKind) {
    const who = role === "parrain" ? "parrain/marraine" : "fillot/fillote";
    modal = { role, kind, title: `Ajouter un ${who} ${KIND_LABEL[kind]}` };
  }

  function onAdded() {
    modal = null;
    if (data) {
      load(data.person.id);
    }
  }

  async function removeRelation(relId: number) {
    try {
      const res = await fetch("/api/relationships", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ relationshipId: relId }),
      });
      if (res.ok && data) {
        await load(data.person.id);
      }
    } catch (e) {
      console.error("[Tree] remove error", e);
    }
  }
</script>

<svelte:head>
  <title>Mon arbre - Sky</title>
</svelte:head>

<div class="tree-page">
  <header class="bar">
    <button class="back" onclick={() => goto("/")}>
      <ArrowLeft size={18} /> Carte
    </button>
    <h1>Arbre de parrainage</h1>
    {#if data && !isMe}
      <button class="back" onclick={backToMe}>
        <Home size={18} /> Mon arbre
      </button>
    {:else}
      <span class="spacer"></span>
    {/if}
  </header>

  {#if loading}
    <div class="state"><Loader2 size={40} class="spin" /></div>
  {:else if !data}
    <div class="state">Aucune fiche liee a votre compte.</div>
  {:else}
    <div class="tree" in:fade>
      <!-- Ascendants (parrains) -->
      <div class="row ascendants">
        {#each slots(data.parrains, "parrainage", data.maxParrains.parrainage) as s}
          {@render slotCard(s.member, "parrain", "parrainage")}
        {/each}
        {#each slots(data.parrains, "adoption", data.maxParrains.adoption) as s}
          {@render slotCard(s.member, "parrain", "adoption")}
        {/each}
      </div>

      <div class="connector up"><ChevronUp size={16} /></div>

      <!-- Centre (moi / personne ciblee) -->
      <div class="row center">
        <div class="card self">
          <div class="avatar big">
            <img
              src={avatarUrl(data.person.id)}
              alt=""
              onerror={(e) =>
                ((e.currentTarget as HTMLImageElement).style.visibility =
                  "hidden")}
            />
            <span class="ini">{initials(data.person)}</span>
          </div>
          <div class="meta">
            <span class="name">{data.person.prenom} {data.person.nom}</span>
            <span class="promo">Promo {data.person.level || "?"}</span>
          </div>
          {#if isMe}<span class="me-badge"><Crown size={12} /> Moi</span>{/if}
        </div>
      </div>

      <div class="connector down"></div>

      <!-- Descendants (fillots) -->
      <div class="row descendants">
        {#each slots(data.fillots, "parrainage", data.maxFillots.parrainage) as s}
          {@render slotCard(s.member, "fillot", "parrainage")}
        {/each}
        {#each slots(data.fillots, "adoption", data.maxFillots.adoption) as s}
          {@render slotCard(s.member, "fillot", "adoption")}
        {/each}
      </div>
    </div>
  {/if}
</div>

{#snippet slotCard(
  member: EntourageMember | null,
  role: RelationRole,
  kind: RelationKind,
)}
  {#if member}
    <div class="card filled" class:adoption={kind === "adoption"}>
      <button
        class="nav"
        onclick={() => load(member.id)}
        title="Voir son arbre"
      >
        <div class="avatar">
          <img
            src={avatarUrl(member.id)}
            alt=""
            onerror={(e) =>
              ((e.currentTarget as HTMLImageElement).style.visibility =
                "hidden")}
          />
          <span class="ini">{initials(member)}</span>
        </div>
        <div class="meta">
          <span class="name">{member.prenom} {member.nom}</span>
          <span class="promo">P{member.level || "?"} · {KIND_LABEL[kind]}</span>
        </div>
      </button>
      {#if isMe}
        <button
          class="del"
          onclick={() => removeRelation(member.relId)}
          aria-label="Retirer"
        >
          <Trash2 size={14} />
        </button>
      {/if}
    </div>
  {:else}
    <button
      class="card empty"
      class:adoption={kind === "adoption"}
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
    onClose={() => (modal = null)}
    {onAdded}
  />
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
    background: linear-gradient(
      rgba(59, 130, 246, 0.6),
      rgba(59, 130, 246, 0.1)
    );
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
  :global(.spin) {
    animation: spin 1s linear infinite;
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
</style>
