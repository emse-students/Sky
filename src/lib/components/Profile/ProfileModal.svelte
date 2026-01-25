<script lang="ts">
    import { selectedPersonId, graphStore } from '$stores/graphStore';
    import { cameraStore } from '$stores/cameraStore';
    import type { Person } from '$types/graph';

    $: personId = $selectedPersonId;
    $: person = personId ? $graphStore.people.find(p => p.id === personId) : null;
    $: relations = person ? getRelations(person) : [];

    interface RelationInfo {
        person: Person;
        type: string;
    }

    function getRelations(p: Person): RelationInfo[] {
        const result: RelationInfo[] = [];
        const allRelations = $graphStore.relations;
        const allPeople = $graphStore.people;

        allRelations.forEach(rel => {
            let relatedId: string | null = null;
            let type = '';

            if (rel.id1 === p.id) {
                relatedId = rel.id2;
                type = rel.type;
            } else if (rel.id2 === p.id) {
                relatedId = rel.id1;
                type = getReverseRelation(rel.type);
            }

            if (relatedId) {
                const relatedPerson = allPeople.find(person => person.id === relatedId);
                if (relatedPerson) {
                    result.push({ person: relatedPerson, type });
                }
            }
        });

        return result;
    }

    function getReverseRelation(type: string): string {
        const reverseMap: Record<string, string> = {
            'enfant': 'parent',
            'parent': 'enfant',
            'conjoint': 'conjoint',
            'frère/sœur': 'frère/sœur'
        };
        return reverseMap[type] || type;
    }

    function close() {
        selectedPersonId.set(null);
    }

    function focusOnPerson(personId: string) {
        selectedPersonId.set(personId);
        const pos = $graphStore.positions[personId];
        if (pos) {
            cameraStore.setTarget(pos.x, pos.y, 1.5);
        }
    }

    function handleBackdropClick(e: MouseEvent) {
        if (e.target === e.currentTarget) {
            close();
        }
    }
</script>

{#if person}
    <!-- svelte-ignore a11y-click-events-have-key-events -->
    <!-- svelte-ignore a11y-no-static-element-interactions -->
    <div class="modal-backdrop" on:click={handleBackdropClick}>
        <div class="modal">
            <button class="close-btn" on:click={close}>×</button>

            <div class="modal-header">
                <h2 class="person-name">
                    {person.name || ''}
                </h2>
            </div>

            <div class="modal-body">
                <!-- Basic Info -->
                <div class="info-section">
                    <h3>Informations</h3>
                    <div class="info-grid">
                        {#if person.level}
                            <div class="info-item">
                                <span class="label">Promotion:</span>
                                <span class="value">{person.level}</span>
                            </div>
                        {/if}
                        {#if person.bio}
                            <div class="info-item">
                                <span class="label">Bio:</span>
                                <span class="value">{person.bio}</span>
                            </div>
                        {/if}
                    </div>
                </div>

                <!-- Relations -->
                {#if relations.length > 0}
                    <div class="info-section">
                        <h3>Relations ({relations.length})</h3>
                        <div class="relations-list">
                            {#each relations as rel}
                                <button class="relation-item" on:click={() => rel.person.id && focusOnPerson(rel.person.id)}>
                                    <span class="relation-type">{rel.type}</span>
                                    <span class="relation-name">
                                        {rel.person.name || ''}
                                    </span>
                                </button>
                            {/each}
                        </div>
                    </div>
                {/if}
            </div>
        </div>
    </div>
{/if}

<style>
    .modal-backdrop {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.7);
        backdrop-filter: blur(5px);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 1000;
        padding: 2rem;
    }

    .modal {
        background: linear-gradient(135deg, rgba(17, 24, 39, 0.95) 0%, rgba(31, 41, 55, 0.95) 100%);
        border: 1px solid rgba(96, 165, 250, 0.3);
        border-radius: 16px;
        max-width: 600px;
        width: 100%;
        max-height: 80vh;
        overflow-y: auto;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
        position: relative;
    }

    .close-btn {
        position: absolute;
        top: 1rem;
        right: 1rem;
        width: 40px;
        height: 40px;
        border: none;
        background: rgba(255, 255, 255, 0.1);
        color: #fff;
        font-size: 2rem;
        line-height: 1;
        border-radius: 50%;
        cursor: pointer;
        transition: all 0.2s;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .close-btn:hover {
        background: rgba(239, 68, 68, 0.2);
        transform: scale(1.1);
    }

    .modal-header {
        padding: 2rem;
        border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    }

    .person-name {
        font-family: 'Orbitron', sans-serif;
        font-size: 1.75rem;
        font-weight: 700;
        background: linear-gradient(135deg, #60a5fa 0%, #a78bfa 100%);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
        margin: 0;
        padding-right: 3rem;
    }

    .modal-body {
        padding: 2rem;
    }

    .info-section {
        margin-bottom: 2rem;
    }

    .info-section:last-child {
        margin-bottom: 0;
    }

    .info-section h3 {
        font-family: 'Orbitron', sans-serif;
        font-size: 1.1rem;
        color: #60a5fa;
        margin: 0 0 1rem;
    }

    .info-grid {
        display: grid;
        gap: 0.75rem;
    }

    .info-item {
        display: flex;
        gap: 0.5rem;
    }

    .label {
        color: rgba(255, 255, 255, 0.6);
        font-weight: 500;
        min-width: 120px;
    }

    .value {
        color: #fff;
    }

    .relations-list {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }

    .relation-item {
        display: flex;
        align-items: center;
        gap: 1rem;
        padding: 0.75rem 1rem;
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 8px;
        color: #fff;
        text-align: left;
        cursor: pointer;
        transition: all 0.2s;
    }

    .relation-item:hover {
        background: rgba(96, 165, 250, 0.1);
        border-color: rgba(96, 165, 250, 0.3);
        transform: translateX(4px);
    }

    .relation-type {
        color: #60a5fa;
        font-size: 0.85rem;
        text-transform: uppercase;
        font-weight: 600;
        min-width: 100px;
    }

    .relation-name {
        font-weight: 500;
    }
</style>
