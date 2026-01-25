<script lang="ts">
    import { authStore } from '$stores/authStore';
    import { searchQuery, graphStore, selectedPersonId } from '$stores/graphStore';
    import { cameraStore } from '$stores/cameraStore';

    $: auth = $authStore;
    $: query = $searchQuery;

    let showResults = false;
    let searchResults: any[] = [];
    let searchTimeout: ReturnType<typeof setTimeout>;

    function handleSearch() {
        if (!$searchQuery.trim()) {
            searchResults = [];
            showResults = false;
            return;
        }
        
        // Debounce search
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            searchResults = graphStore.searchPeople($searchQuery);
            showResults = searchResults.length > 0;
        }, 100);
    }

    function selectPerson(personId: string) {
        selectedPersonId.set(personId);
        
        // Center camera on person
        const state = $graphStore;
        const pos = state.positions[personId];
        if (pos) {
            cameraStore.setTarget(pos.x, pos.y, 1.5);
        }
        
        // Close search
        searchQuery.set('');
        showResults = false;
    }

    async function handleLogout() {
        await authStore.logout();
        window.location.reload();
    }
</script>

<div class="topbar">
    <div class="topbar-content">
        <!-- Logo -->
        <div class="logo">
            <img src="/sky.png" alt="Sky Logo" class="logo-img" />
            <span class="logo-text">Sky</span>
        </div>

        <!-- Search -->
        <div class="search-container">
            <input
                type="text"
                bind:value={$searchQuery}
                on:input={handleSearch}
                on:focus={handleSearch}
                on:blur={() => setTimeout(() => showResults = false, 200)}
                placeholder="Rechercher une personne..."
                class="search-input"
            />
            
            {#if showResults}
                <div class="search-results">
                    {#each searchResults as person}
                        <button
                            class="search-result-item"
                            on:click={() => selectPerson(person.id)}
                        >
                            <div class="result-name">
                                {person.prenom || ''} {person.nom || ''}
                            </div>
                            {#if person.surnom}
                                <div class="result-nickname">"{person.surnom}"</div>
                            {/if}
                        </button>
                    {/each}
                </div>
            {/if}
        </div>

        <!-- User menu -->
        {#if auth.user}
            <div class="user-menu">
                <span class="user-name">{auth.user.name}</span>
                {#if auth.user.role === 'admin'}
                    <a href="/admin" class="admin-link">Admin</a>
                {/if}
                <button on:click={handleLogout} class="logout-btn">
                    Déconnexion
                </button>
            </div>
        {/if}
    </div>
</div>

<style>
    .topbar {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        z-index: 100;
        background: linear-gradient(180deg, rgba(0, 0, 0, 0.9) 0%, rgba(0, 0, 0, 0.7) 100%);
        backdrop-filter: blur(10px);
        border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    }

    .topbar-content {
        max-width: 1400px;
        margin: 0 auto;
        padding: 1rem 2rem;
        display: flex;
        align-items: center;
        gap: 2rem;
    }

    .logo {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        flex-shrink: 0;
    }

    .logo-img {
        width: 32px;
        height: 32px;
    }

    .logo-text {
        font-family: 'Orbitron', sans-serif;
        font-size: 1.5rem;
        font-weight: 700;
        background: linear-gradient(135deg, #60a5fa 0%, #a78bfa 100%);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
    }

    .search-container {
        position: relative;
        flex: 1;
        max-width: 500px;
    }

    .search-input {
        width: 100%;
        padding: 0.75rem 1rem;
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 8px;
        color: #fff;
        font-size: 0.95rem;
        transition: all 0.2s;
    }

    .search-input:focus {
        outline: none;
        background: rgba(255, 255, 255, 0.1);
        border-color: rgba(96, 165, 250, 0.5);
        box-shadow: 0 0 0 3px rgba(96, 165, 250, 0.1);
    }

    .search-input::placeholder {
        color: rgba(255, 255, 255, 0.4);
    }

    .search-results {
        position: absolute;
        top: calc(100% + 0.5rem);
        left: 0;
        right: 0;
        background: rgba(17, 24, 39, 0.95);
        backdrop-filter: blur(10px);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 8px;
        overflow: hidden;
        max-height: 400px;
        overflow-y: auto;
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
    }

    .search-result-item {
        width: 100%;
        padding: 0.75rem 1rem;
        text-align: left;
        background: transparent;
        border: none;
        color: #fff;
        cursor: pointer;
        transition: background 0.2s;
        border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    }

    .search-result-item:last-child {
        border-bottom: none;
    }

    .search-result-item:hover {
        background: rgba(96, 165, 250, 0.1);
    }

    .result-name {
        font-weight: 500;
    }

    .result-nickname {
        font-size: 0.85rem;
        color: rgba(255, 255, 255, 0.6);
        margin-top: 0.25rem;
    }

    .user-menu {
        display: flex;
        align-items: center;
        gap: 1rem;
        margin-left: auto;
    }

    .user-name {
        color: rgba(255, 255, 255, 0.9);
        font-size: 0.9rem;
    }

    .admin-link {
        color: #fbbf24;
        text-decoration: none;
        font-size: 0.9rem;
        font-weight: 500;
        transition: color 0.2s;
    }

    .admin-link:hover {
        color: #fcd34d;
    }

    .logout-btn {
        padding: 0.5rem 1rem;
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid rgba(255, 255, 255, 0.2);
        border-radius: 6px;
        color: rgba(255, 255, 255, 0.7);
        font-size: 0.85rem;
        cursor: pointer;
        transition: all 0.2s;
    }

    .logout-btn:hover {
        background: rgba(255, 255, 255, 0.1);
        border-color: rgba(255, 255, 255, 0.3);
        color: rgba(255, 255, 255, 0.9);
    }
</style>
