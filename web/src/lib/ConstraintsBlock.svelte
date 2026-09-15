<script lang="ts">
  import type { ApiError, CatalogItem } from './api';
  import ErrorBanner from './ErrorBanner.svelte';

  /**
   * UI-304 : cases à cocher des contraintes. Tout changement renvoie l'ensemble des
   * contraintes au serveur ; la liste des opérations et les avertissements qui en
   * découlent sont recalculés par l'API, jamais ici.
   */
  let {
    constraintTypes,
    selectedIds,
    disabled,
    busy,
    error,
    onToggle,
  }: {
    constraintTypes: CatalogItem[];
    selectedIds: string[];
    disabled: boolean;
    busy: boolean;
    error: ApiError | null;
    onToggle: (constraintTypeId: string, checked: boolean) => void;
  } = $props();
</script>

<section class="block" data-locked={disabled}>
  <h2>Situation du client</h2>
  <div class="block-body">
    {#if constraintTypes.length === 0}
      <p class="empty">Aucune contrainte au catalogue de cette enseigne.</p>
    {:else}
      <ul class="checks">
        {#each constraintTypes as constraintType (constraintType.id)}
          <li class="check" class:locked={disabled}>
            <input
              type="checkbox"
              id={`constraint-${constraintType.id}`}
              checked={selectedIds.includes(constraintType.id)}
              {disabled}
              onchange={(event) =>
                onToggle(constraintType.id, event.currentTarget.checked)}
            />
            <label for={`constraint-${constraintType.id}`}>
              {constraintType.label}
            </label>
          </li>
        {/each}
      </ul>
    {/if}
    {#if busy}
      <p class="busy">Mise à jour de la prestation…</p>
    {/if}
  </div>
  <ErrorBanner {error} />
</section>
