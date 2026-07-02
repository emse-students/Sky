<script lang="ts">
  import { onMount } from "svelte";
  import { fade } from "svelte/transition";
  import {
    Search,
    Edit,
    Trash2,
    UserPlus,
    Save,
    X,
    ArrowLeft,
    Network,
    Shield,
    Unlink,
    GitMerge,
  } from "lucide-svelte";
  import { goto } from "$app/navigation";
  import { m } from "$lib/paraglide/messages";

  let people: any[] = $state([]);
  let searchTerm = $state("");
  let loading = $state(true);
  let editingPerson: any = $state(null);
  let isCreating = $state(false);
  let selectedIds: string[] = $state([]);

  let filteredPeople = $derived.by(() => {
    const term = searchTerm.toLowerCase().trim();
    if (!term) return people;

    return people.filter((p: any) => {
      const fullName = `${p.prenom || ""} ${p.nom || ""}`.toLowerCase();
      const id = (p.id || "").toLowerCase();
      const level = p.level?.toString() || "";
      return (
        fullName.includes(term) || id.includes(term) || level.includes(term)
      );
    });
  });

  let allSelected = $derived(
    filteredPeople.length > 0 &&
      filteredPeople.every((p) => selectedIds.includes(p.id)),
  );

  // Form state. Bio and photo come from Canari/MiGallery: not editable here.
  let form = $state({
    id: "",
    prenom: "",
    nom: "",
    level: "",
  });

  onMount(async () => {
    await loadPeople();
  });

  async function loadPeople() {
    loading = true;
    try {
      const res = await fetch("/api/admin/people");
      if (res.ok) {
        const data = await res.json();
        people = Array.isArray(data) ? data : data.people || [];
      }
    } finally {
      loading = false;
    }
  }

  /** Promote/demote a fiche (admin management). */
  async function toggleRole(person: any) {
    const role = person.role === "admin" ? "user" : "admin";
    if (
      !confirm(
        m.admin_people_role_confirm({
          name: `${person.prenom} ${person.nom}`,
          role,
        }),
      )
    ) {
      return;
    }
    const res = await fetch(`/api/admin/people/${person.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "set-role", role }),
    });
    if (res.ok) await loadPeople();
  }

  /**
   * Merge the 2 selected fiches. The one linked to an account always survives
   * ("one star = one person" lock); otherwise the first selected is kept.
   * Merging two linked accounts is refused.
   */
  async function mergeSelected() {
    if (selectedIds.length !== 2) return;
    const target = people.find((p) => p.id === selectedIds[0]);
    const source = people.find((p) => p.id === selectedIds[1]);
    if (!target || !source) return;
    if (
      !confirm(
        m.admin_people_merge_confirm({
          source: `${source.prenom} ${source.nom}`,
          target: `${target.prenom} ${target.nom}`,
        }),
      )
    ) {
      return;
    }
    const res = await fetch("/api/admin/merge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sourceId: source.id, targetId: target.id }),
    });
    if (res.ok) {
      selectedIds = [];
      await loadPeople();
    } else {
      const data = await res.json().catch(() => ({}));
      alert(data.error || m.admin_people_merge_alert_failed());
    }
  }

  /** Unlink the Authentik account: the fiche becomes a placeholder again. */
  async function unlinkAccount(person: any) {
    if (
      !confirm(
        m.admin_people_unlink_confirm({
          name: `${person.prenom} ${person.nom}`,
        }),
      )
    ) {
      return;
    }
    const res = await fetch(`/api/admin/people/${person.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "unlink" }),
    });
    if (res.ok) await loadPeople();
  }

  function toggleAll() {
    if (allSelected) {
      selectedIds = [];
    } else {
      selectedIds = filteredPeople.map((p) => p.id);
    }
  }

  function toggleSelection(id: string) {
    if (selectedIds.includes(id)) {
      selectedIds = selectedIds.filter((i) => i !== id);
    } else {
      selectedIds = [...selectedIds, id];
    }
  }

  async function deleteSelected() {
    if (
      !confirm(
        m.admin_people_delete_selected_confirm({ count: selectedIds.length }),
      )
    )
      return;
    loading = true;
    try {
      await Promise.all(
        selectedIds.map((id) =>
          fetch(`/api/admin/people/${id}`, { method: "DELETE" }),
        ),
      );
      await loadPeople();
      selectedIds = [];
    } catch (e) {
      console.error("Bulk delete error", e);
    } finally {
      loading = false;
    }
  }

  function startEdit(person: any) {
    editingPerson = person;
    form = {
      id: person.id,
      prenom: person.prenom,
      nom: person.nom,
      level: person.level?.toString() || "",
    };
    isCreating = false;
  }

  function startCreate() {
    editingPerson = null;
    form = {
      id: "",
      prenom: "",
      nom: "",
      level: "",
    };
    isCreating = true;
  }

  function cancelEdit() {
    editingPerson = null;
    isCreating = false;
  }

  async function savePerson() {
    // Last name, first name and promo are mandatory (ID too when creating).
    if (
      !form.prenom.trim() ||
      !form.nom.trim() ||
      !form.level ||
      (isCreating && !form.id.trim())
    ) {
      alert(m.admin_people_required());
      return;
    }
    try {
      const payload = {
        id: form.id,
        prenom: form.prenom,
        nom: form.nom,
        level: form.level ? parseInt(form.level) : null,
      };

      const url = isCreating
        ? "/api/admin/people"
        : `/api/admin/people/${editingPerson.id}`;
      const method = isCreating ? "POST" : "PUT";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        await loadPeople();
        cancelEdit();
      } else {
        const d = await res.json().catch(() => ({}));
        alert(d.error || m.admin_people_save_failed());
      }
    } catch (error) {
      console.error("Save error:", error);
    }
  }

  /**
   * Displayed identifier: once a fiche is linked to an account, show the
   * Authentik sub (real identity); otherwise the placeholder id (prenom.nom).
   */
  function displayId(person: any): string {
    return person.linked && person.auth_sub ? person.auth_sub : person.id;
  }

  /** Truncate a long identifier (the sub is 64 characters) for display. */
  function truncateId(value: string): string {
    return value.length > 16 ? `${value.slice(0, 14)}…` : value;
  }

  async function deletePerson(id: string) {
    if (!confirm(m.admin_people_delete_confirm({ id }))) return;

    try {
      const res = await fetch(`/api/admin/people/${id}`, {
        method: "DELETE",
      });

      if (res.ok) {
        await loadPeople();
      }
    } catch (error) {
      console.error("Delete error:", error);
    }
  }
</script>

<svelte:head>
  <title>{m.admin_people_page_title()}</title>
</svelte:head>

<div class="admin-layout">
  <header class="admin-header">
    <button class="btn-back" onclick={() => goto("/admin")}>
      <ArrowLeft size={20} />
      <span>{m.common_back()}</span>
    </button>
    <h1>{m.admin_people_heading()}</h1>
    <button class="btn-create" onclick={startCreate}>
      <UserPlus size={18} />
      <span>{m.admin_people_new()}</span>
    </button>
  </header>

  <div class="admin-content">
    {#if !editingPerson && !isCreating}
      <div class="search-bar">
        <Search size={20} />
        <input
          type="text"
          placeholder={m.admin_people_search_placeholder()}
          bind:value={searchTerm}
        />
      </div>

      {#if loading}
        <div class="loading">{m.common_loading()}</div>
      {:else}
        {#if selectedIds.length > 0}
          <div class="selection-bar" transition:fade>
            <div class="selection-info">
              <span class="count"
                >{m.admin_people_selected_count({
                  count: selectedIds.length,
                })}</span
              >
              <button class="btn-link" onclick={() => (selectedIds = [])}
                >{m.admin_people_deselect_all()}</button
              >
            </div>
            <div class="selection-actions">
              {#if selectedIds.length === 2}
                <button class="btn-merge" onclick={mergeSelected}>
                  <GitMerge size={16} />
                  <span>{m.admin_merge()}</span>
                </button>
              {/if}
              <button class="btn-danger-outline" onclick={deleteSelected}>
                <Trash2 size={16} />
                <span>{m.common_delete()}</span>
              </button>
            </div>
          </div>
        {/if}
        <div class="table-container">
          <table>
            <thead>
              <tr>
                <th class="checkbox-col">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onchange={toggleAll}
                  />
                </th>
                <th>ID</th>
                <th>{m.common_lastname()}</th>
                <th>{m.common_firstname()}</th>
                <th>{m.admin_people_col_promo()}</th>
                <th>{m.admin_people_col_account()}</th>
                <th>{m.admin_people_col_role()}</th>
                <th>{m.admin_people_col_actions()}</th>
              </tr>
            </thead>
            <tbody>
              {#each filteredPeople as person (person.id)}
                <tr
                  transition:fade
                  class:selected={selectedIds.includes(person.id)}
                >
                  <td class="checkbox-col">
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(person.id)}
                      onchange={() => toggleSelection(person.id)}
                    />
                  </td>
                  <td class="mono" title={displayId(person)}
                    >{truncateId(displayId(person))}</td
                  >
                  <td>{person.nom}</td>
                  <td>{person.prenom}</td>
                  <td>{person.level || "—"}</td>
                  <td>
                    {#if person.linked}
                      <span class="badge linked"
                        >{m.admin_people_badge_account()}</span
                      >
                    {:else}
                      <span class="badge ghost"
                        >{m.admin_people_badge_fiche()}</span
                      >
                    {/if}
                  </td>
                  <td>
                    <span
                      class="badge"
                      class:admin={person.role === "admin"}
                      class:ghost={person.role !== "admin"}
                    >
                      {person.role === "admin"
                        ? m.admin_people_badge_admin()
                        : m.admin_people_badge_user()}
                    </span>
                  </td>
                  <td class="actions">
                    <button
                      class="btn-icon"
                      title={m.admin_people_view_tree()}
                      onclick={() => goto(`/tree?id=${person.id}`)}
                    >
                      <Network size={16} />
                    </button>
                    <button
                      class="btn-icon"
                      title={person.role === "admin"
                        ? m.admin_people_remove_admin()
                        : m.admin_people_make_admin()}
                      onclick={() => toggleRole(person)}
                    >
                      <Shield size={16} />
                    </button>
                    {#if person.linked}
                      <button
                        class="btn-icon"
                        title={m.admin_people_unlink()}
                        onclick={() => unlinkAccount(person)}
                      >
                        <Unlink size={16} />
                      </button>
                    {/if}
                    <button class="btn-icon" onclick={() => startEdit(person)}>
                      <Edit size={16} />
                    </button>
                    <button
                      class="btn-icon danger"
                      onclick={() => deletePerson(person.id)}
                    >
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
        <div class="table-footer">
          {m.admin_people_footer({
            filtered: filteredPeople.length,
            total: people.length,
          })}
        </div>
      {/if}
    {:else}
      <div class="edit-form" transition:fade>
        <div class="form-header">
          <h2>
            {isCreating
              ? m.admin_people_new_profile()
              : m.admin_people_edit_title({ id: editingPerson.id })}
          </h2>
          <button class="btn-close" onclick={cancelEdit}>
            <X size={20} />
          </button>
        </div>

        <div class="form-grid">
          <div class="form-group">
            <label for="id">{m.admin_people_id_label()}</label>
            <input
              id="id"
              type="text"
              bind:value={form.id}
              placeholder={m.admin_people_id_placeholder()}
              disabled={!isCreating}
            />
          </div>

          <div class="form-group">
            <label for="prenom">{m.common_firstname()}</label>
            <input
              id="prenom"
              type="text"
              bind:value={form.prenom}
              placeholder={m.admin_people_firstname_placeholder()}
            />
          </div>

          <div class="form-group">
            <label for="nom">{m.common_lastname()}</label>
            <input
              id="nom"
              type="text"
              bind:value={form.nom}
              placeholder={m.admin_people_lastname_placeholder()}
            />
          </div>

          <div class="form-group">
            <label for="level">{m.admin_people_promo_label()}</label>
            <input
              id="level"
              type="number"
              bind:value={form.level}
              placeholder="2024"
            />
          </div>
        </div>

        <p class="form-note">
          {m.admin_people_form_note()}
        </p>

        <div class="form-actions">
          <button class="btn-cancel" onclick={cancelEdit}
            >{m.common_cancel()}</button
          >
          <button class="btn-save" onclick={savePerson}>
            <Save size={18} />
            <span>{m.common_save()}</span>
          </button>
        </div>
      </div>
    {/if}
  </div>
</div>

<style>
  .admin-layout {
    height: 100vh;
    background: #05070a;
    color: #f8fafc;
    overflow-y: auto;
  }

  .admin-header {
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
    z-index: 100;
  }

  .admin-header h1 {
    margin: 0;
    text-align: center;
    font-size: 24px;
  }

  .btn-back,
  .btn-create {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 16px;
    border-radius: 8px;
    border: none;
    cursor: pointer;
    transition: all 0.2s;
  }

  .btn-back {
    background: transparent;
    color: #94a3b8;
  }

  .btn-back:hover {
    color: white;
  }

  .btn-create {
    background: #3b82f6;
    color: white;
  }

  .admin-content {
    max-width: 1400px;
    margin: 0 auto;
    padding: 40px;
  }

  .search-bar {
    display: flex;
    align-items: center;
    gap: 12px;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 10px;
    padding: 12px 16px;
    margin-bottom: 24px;
  }

  .search-bar input {
    flex: 1;
    background: transparent;
    border: none;
    color: white;
    outline: none;
    font-size: 15px;
  }

  .table-container {
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 12px;
    overflow: hidden;
  }

  table {
    width: 100%;
    border-collapse: collapse;
  }

  thead {
    background: rgba(255, 255, 255, 0.05);
  }

  th {
    padding: 16px;
    text-align: left;
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 1px;
    color: #94a3b8;
    font-weight: 600;
  }

  td {
    padding: 16px;
    border-top: 1px solid rgba(255, 255, 255, 0.05);
  }

  .mono {
    font-family: "Courier New", monospace;
    font-size: 13px;
    color: #94a3b8;
  }

  .badge {
    display: inline-block;
    padding: 3px 10px;
    border-radius: 99px;
    font-size: 12px;
    font-weight: 600;
  }
  .badge.linked {
    background: rgba(34, 197, 94, 0.12);
    color: #4ade80;
  }
  .badge.admin {
    background: rgba(251, 191, 36, 0.12);
    color: #fbbf24;
  }
  .badge.ghost {
    background: rgba(255, 255, 255, 0.06);
    color: #94a3b8;
  }

  .actions {
    display: flex;
    gap: 8px;
  }

  .btn-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    background: rgba(255, 255, 255, 0.05);
    border: none;
    border-radius: 6px;
    color: white;
    cursor: pointer;
    transition: all 0.2s;
  }

  .btn-icon:hover {
    background: rgba(255, 255, 255, 0.1);
  }

  .btn-icon.danger:hover {
    background: #ef4444;
  }

  .table-footer {
    padding: 12px 16px;
    text-align: center;
    color: #94a3b8;
    font-size: 13px;
  }

  .edit-form {
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 12px;
    padding: 32px;
  }

  .form-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 32px;
  }

  .form-header h2 {
    margin: 0;
    font-size: 20px;
  }

  .btn-close {
    background: transparent;
    border: none;
    color: #94a3b8;
    cursor: pointer;
  }

  .form-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 20px;
    margin-bottom: 32px;
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  label {
    font-size: 13px;
    color: #94a3b8;
    font-weight: 500;
  }

  input {
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px;
    padding: 12px;
    color: white;
    outline: none;
    transition: all 0.2s;
  }

  input:focus {
    border-color: #3b82f6;
    background: rgba(255, 255, 255, 0.08);
  }

  input:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .form-note {
    margin: 16px 0 24px;
    font-size: 13px;
    color: #64748b;
    font-style: italic;
  }
  .form-actions {
    display: flex;
    justify-content: flex-end;
    gap: 12px;
  }

  .btn-cancel,
  .btn-save {
    padding: 12px 24px;
    border-radius: 8px;
    border: none;
    cursor: pointer;
    font-weight: 600;
    transition: all 0.2s;
  }

  .btn-cancel {
    background: rgba(255, 255, 255, 0.05);
    color: white;
  }

  .btn-save {
    background: #3b82f6;
    color: white;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .loading {
    text-align: center;
    padding: 40px;
    color: #94a3b8;
  }

  .checkbox-col {
    width: 48px;
    text-align: center;
    padding: 0 16px;
  }

  input[type="checkbox"] {
    width: 16px;
    height: 16px;
    cursor: pointer;
    accent-color: #3b82f6;
  }

  tr.selected td {
    background: rgba(59, 130, 246, 0.1);
  }

  .selection-bar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: rgba(59, 130, 246, 0.1);
    border: 1px solid rgba(59, 130, 246, 0.2);
    border-radius: 10px;
    padding: 12px 16px;
    margin-bottom: 24px;
  }

  .selection-info {
    display: flex;
    align-items: center;
    gap: 16px;
  }

  .count {
    color: #3b82f6;
    font-weight: 600;
  }

  .btn-link {
    background: none;
    border: none;
    color: #94a3b8;
    text-decoration: underline;
    cursor: pointer;
    font-size: 13px;
  }

  .btn-link:hover {
    color: white;
  }

  .btn-danger-outline {
    display: flex;
    align-items: center;
    gap: 8px;
    background: rgba(239, 68, 68, 0.1);
    border: 1px solid rgba(239, 68, 68, 0.2);
    color: #ef4444;
    padding: 8px 16px;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.2s;
  }

  .btn-danger-outline:hover {
    background: rgba(239, 68, 68, 0.2);
  }

  .selection-actions {
    display: flex;
    gap: 8px;
  }

  .btn-merge {
    display: flex;
    align-items: center;
    gap: 8px;
    background: rgba(59, 130, 246, 0.12);
    border: 1px solid rgba(59, 130, 246, 0.3);
    color: #93c5fd;
    padding: 8px 16px;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.2s;
  }

  .btn-merge:hover {
    background: rgba(59, 130, 246, 0.2);
  }
</style>
