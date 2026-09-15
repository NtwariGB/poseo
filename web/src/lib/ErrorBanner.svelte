<script lang="ts">
  import type { ApiError } from './api';

  /** UI-308 : code et message de l'API rendus tels quels, sous le bloc concerné. */
  let { error }: { error: ApiError | null } = $props();
</script>

{#if error}
  <p class="banner" role="alert">
    <span class="code">{error.code}</span>
    <span>{error.message}</span>
  </p>
{/if}
