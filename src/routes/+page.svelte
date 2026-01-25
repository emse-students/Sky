<script lang="ts">
    import { onMount } from 'svelte';
    import { authStore } from '$stores/authStore';
    import StarfieldCanvas from '$components/Canvas/StarfieldCanvas.svelte';
    import GraphCanvas from '$components/Canvas/GraphCanvas.svelte';
    import TopBar from '$components/Navigation/TopBar.svelte';
    import ProfileModal from '$components/Profile/ProfileModal.svelte';

    onMount(() => {
        // Check auth but don't block the interface
        authStore.checkAuth();
    });
</script>

<svelte:head>
    <title>Sky - Constellation Généalogique</title>
</svelte:head>

<StarfieldCanvas />
<GraphCanvas />
<TopBar />
<ProfileModal />
