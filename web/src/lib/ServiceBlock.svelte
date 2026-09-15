<script lang="ts">
  import type {
    ApiError,
    CatalogItem,
    Composition,
    CreateCompositionBody,
  } from './api';
  import ErrorBanner from './ErrorBanner.svelte';
  import { compositionStatus, duration, operationOrigin, warning } from './format';

  /**
   * UI-303 et UI-305 : saisie de la prestation, puis restitution de ce que le serveur
   * en a fait — zone, opérations retenues, avertissements. Le panneau teinté ne contient
   * que des valeurs venues de l'API.
   */
  let {
    productTypes,
    composition,
    disabled,
    busy,
    error,
    onCompose,
    onSelectOperation,
  }: {
    productTypes: CatalogItem[];
    composition: Composition | null;
    disabled: boolean;
    busy: boolean;
    error: ApiError | null;
    onCompose: (body: CreateCompositionBody) => void;
    onSelectOperation: (operationId: string, selected: boolean) => void;
  } = $props();

  let productTypeId = $state('');
  let productRef = $state('');
  let addressLine = $state('');
  let postalCode = $state('');
  let city = $state('');

  const complete = $derived(
    productTypeId !== '' &&
      productRef.trim() !== '' &&
      addressLine.trim() !== '' &&
      postalCode.trim() !== '' &&
      city.trim() !== '',
  );

  function compose(event: SubmitEvent): void {
    event.preventDefault();
    onCompose({
      productTypeId,
      productRef: productRef.trim(),
      addressLine: addressLine.trim(),
      postalCode: postalCode.trim(),
      city: city.trim(),
    });
  }
</script>

<section class="block" data-locked={disabled}>
  <h2>Prestation</h2>

  <div class="block-body">
    <form onsubmit={compose}>
      <div class="fields">
        <div class="field">
          <label for="product-type">Type de produit</label>
          <select
            id="product-type"
            bind:value={productTypeId}
            disabled={composition !== null || disabled}
          >
            <option value="">Choisir…</option>
            {#each productTypes as productType (productType.id)}
              <option value={productType.id}>{productType.label}</option>
            {/each}
          </select>
        </div>
        <div class="field">
          <label for="product-ref">Référence produit</label>
          <input
            type="text"
            id="product-ref"
            bind:value={productRef}
            disabled={composition !== null || disabled}
          />
        </div>
        <div class="field wide">
          <label for="address-line">Adresse</label>
          <input
            type="text"
            id="address-line"
            bind:value={addressLine}
            disabled={composition !== null || disabled}
          />
        </div>
        <div class="field">
          <label for="postal-code">Code postal</label>
          <input
            type="text"
            id="postal-code"
            class="tabular"
            bind:value={postalCode}
            disabled={composition !== null || disabled}
          />
        </div>
        <div class="field">
          <label for="city">Ville</label>
          <input
            type="text"
            id="city"
            bind:value={city}
            disabled={composition !== null || disabled}
          />
        </div>
      </div>

      {#if composition === null}
        <div class="actions">
          <button type="submit" disabled={!complete || busy}>Composer</button>
          {#if busy}<span class="busy">Composition en cours…</span>{/if}
        </div>
      {/if}
    </form>
  </div>

  {#if composition}
    <div class="computed">
      <div class="computed-head">
        <h3>
          {#if composition.zone}
            Zone {composition.zone.code} — {composition.zone.label}
          {:else}
            Hors zone d'intervention
          {/if}
        </h3>
        <span class="origin-note">
          Prestation {compositionStatus(composition.status)}
        </span>
      </div>

      <ul class="operations">
        {#each composition.operations as operation (operation.operationId)}
          <li>
            <input
              type="checkbox"
              aria-label={operation.label}
              checked={operation.selected}
              disabled={operation.origin === 'MANDATORY' || disabled || busy}
              onchange={(event) =>
                onSelectOperation(
                  operation.operationId,
                  event.currentTarget.checked,
                )}
            />
            <span>{operation.label}</span>
            <span
              class="origin"
              class:mandatory={operation.origin === 'MANDATORY'}
            >
              {operationOrigin(operation.origin)}
            </span>
            <span class="time tabular">
              {duration(operation.referenceDurationMinutes)}
            </span>
          </li>
        {/each}
      </ul>

      {#if composition.warnings.length > 0}
        <ul class="warnings">
          {#each composition.warnings as code (code)}
            <li>{warning(code)}</li>
          {/each}
        </ul>
      {/if}
    </div>
  {/if}

  <ErrorBanner {error} />
</section>
