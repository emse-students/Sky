<script lang="ts">
  import { ShieldAlert } from "lucide-svelte";
</script>

<svelte:head>
  <title>Acces reserve aux ICM — Sky</title>
</svelte:head>

<div class="unauthorized">
  <ShieldAlert size={64} class="icon" />
  <h1>Acces reserve aux ICM</h1>
  <p>
    Sky est l arbre de parrainage des ICM. Ton compte n est pas rattache a la
    formation ICM, l acces n est donc pas autorise.
  </p>
  <p class="hint">
    Si tu penses qu il s agit d une erreur, contacte un administrateur.
  </p>
  <a class="back" href="/auth/logout">Se deconnecter</a>
</div>

<style>
  .unauthorized {
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

  :global(.unauthorized .icon) {
    color: #f87171;
  }

  h1 {
    font-size: 1.75rem;
    font-weight: 700;
    margin: 0;
  }

  p {
    max-width: 32rem;
    line-height: 1.6;
    color: #94a3b8;
    margin: 0;
  }

  .hint {
    font-size: 0.9rem;
  }

  .back {
    margin-top: 1rem;
    padding: 0.6rem 1.4rem;
    border-radius: 9999px;
    background: #334155;
    color: #e2e8f0;
    text-decoration: none;
    transition: background 0.2s;
  }

  .back:hover {
    background: #475569;
  }
</style>
