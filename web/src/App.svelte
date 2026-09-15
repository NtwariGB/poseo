<script lang="ts">
  import * as api from './lib/api';
  import type { ApiError, CatalogItem, Composition, Quote } from './lib/api';
  import ConstraintsBlock from './lib/ConstraintsBlock.svelte';
  import ErrorBanner from './lib/ErrorBanner.svelte';
  import QuoteBlock from './lib/QuoteBlock.svelte';
  import ServiceBlock from './lib/ServiceBlock.svelte';

  /**
   * Parcours vendeur de bout en bout. Cette page ne décide rien : chaque action part à
   * l'API et l'état affiché est la réponse du serveur, y compris le verrou de la
   * prestation (`status === 'ACCEPTED'`, FR-212) et le statut des devis.
   */

  const envTenantId: string = import.meta.env.VITE_TENANT_ID ?? '';

  let tenantId = $state(envTenantId);
  let tenantCode = $state<string | null>(null);
  let tenantInput = $state('');
  let catalogLoaded = $state(false);

  let productTypes = $state<CatalogItem[]>([]);
  let constraintTypes = $state<CatalogItem[]>([]);
  let composition = $state<Composition | null>(null);
  let quotes = $state<Quote[]>([]);

  let tenantError = $state<ApiError | null>(null);
  let serviceError = $state<ApiError | null>(null);
  let constraintsError = $state<ApiError | null>(null);
  let quoteError = $state<ApiError | null>(null);

  let serviceBusy = $state(false);
  let constraintsBusy = $state(false);
  let quoteBusy = $state(false);

  // UI-307 : le verrou est lu sur la prestation, jamais déduit d'autre chose.
  const locked = $derived(composition?.status === 'ACCEPTED');
  const selectedConstraintIds = $derived(
    composition?.constraints.map((constraint) => constraint.id) ?? [],
  );

  const asApiError = (error: unknown): ApiError => error as ApiError;

  /** UI-302 : le tenant est résolu une fois, puis le catalogue est chargé. */
  async function resolveTenant(value: string): Promise<void> {
    tenantError = null;
    tenantCode = null;
    api.setTenantId(value);
    try {
      [productTypes, constraintTypes] = await Promise.all([
        api.listProductTypes(),
        api.listConstraintTypes(),
      ]);
      tenantId = value;
      catalogLoaded = true;
      try {
        tenantCode = (await api.getCurrentTenant()).code;
      } catch {
        // L'enseigne n'a pas pu être nommée : l'UUID reste affiché tel quel.
        tenantCode = null;
      }
    } catch (error) {
      tenantError = asApiError(error);
      catalogLoaded = false;
    }
  }

  if (envTenantId !== '') {
    void resolveTenant(envTenantId);
  }

  async function compose(body: api.CreateCompositionBody): Promise<void> {
    serviceBusy = true;
    serviceError = null;
    try {
      composition = await api.createComposition(body);
      quotes = [];
    } catch (error) {
      serviceError = asApiError(error);
    } finally {
      serviceBusy = false;
    }
  }

  /** UI-304 : l'ensemble des contraintes est renvoyé, le serveur recompose. */
  async function toggleConstraint(
    constraintTypeId: string,
    checked: boolean,
  ): Promise<void> {
    if (!composition) return;
    const next = checked
      ? [...selectedConstraintIds, constraintTypeId]
      : selectedConstraintIds.filter((id) => id !== constraintTypeId);

    constraintsBusy = true;
    constraintsError = null;
    try {
      composition = await api.replaceConstraints(composition.id, next);
    } catch (error) {
      constraintsError = asApiError(error);
      // La case reflète l'état du serveur : on relit plutôt que de la laisser mentir.
      await refreshComposition();
    } finally {
      constraintsBusy = false;
    }
  }

  /** UI-305 : cocher ou décocher une option. */
  async function selectOperation(
    operationId: string,
    selected: boolean,
  ): Promise<void> {
    if (!composition) return;
    serviceBusy = true;
    serviceError = null;
    try {
      composition = await api.selectOperation(
        composition.id,
        operationId,
        selected,
      );
    } catch (error) {
      serviceError = asApiError(error);
      await refreshComposition();
    } finally {
      serviceBusy = false;
    }
  }

  async function refreshComposition(): Promise<void> {
    if (!composition) return;
    try {
      composition = await api.getComposition(composition.id);
    } catch {
      // La relecture a échoué : le bandeau de l'action initiale reste affiché.
    }
  }

  /** UI-306 : émission, puis relecture de la prestation et de l'historique. */
  async function issue(): Promise<void> {
    if (!composition) return;
    quoteBusy = true;
    quoteError = null;
    try {
      await api.issueQuote(composition.id);
      await Promise.all([refreshComposition(), refreshQuotes()]);
    } catch (error) {
      quoteError = asApiError(error);
      await refreshQuotes();
    } finally {
      quoteBusy = false;
    }
  }

  /** UI-307 : acceptation du devis ISSUED. */
  async function accept(quoteId: string): Promise<void> {
    quoteBusy = true;
    quoteError = null;
    try {
      await api.acceptQuote(quoteId);
      await Promise.all([refreshComposition(), refreshQuotes()]);
    } catch (error) {
      quoteError = asApiError(error);
      await Promise.all([refreshComposition(), refreshQuotes()]);
    } finally {
      quoteBusy = false;
    }
  }

  async function refreshQuotes(): Promise<void> {
    if (!composition) return;
    try {
      quotes = await api.listQuotes(composition.id);
    } catch {
      // Idem : l'historique garde sa dernière valeur connue.
    }
  }
</script>

<div class="page">
  <header class="masthead">
    <div>
      <h1>Composer une prestation</h1>
      <p>
        Saisie du vendeur sur fond blanc, réponse de l'API sur fond teinté. Montants,
        opérations et statuts sont ceux du serveur.
      </p>
    </div>
    {#if catalogLoaded}
      <div class="tenant">
        Enseigne<br />
        <code title={tenantId}>{tenantCode ?? tenantId}</code>
      </div>
    {/if}
  </header>

  {#if !catalogLoaded}
    <section class="block">
      <h2>Enseigne</h2>
      <div class="block-body">
        <p class="empty">
          {#if envTenantId === ''}
            Renseignez l'identifiant du tenant, ou définissez <code
              >VITE_TENANT_ID</code
            > dans <code>web/.env</code>.
          {:else}
            Le tenant de <code>VITE_TENANT_ID</code> n'a pas pu être chargé.
          {/if}
        </p>
        <form
          onsubmit={(event) => {
            event.preventDefault();
            void resolveTenant(tenantInput.trim());
          }}
        >
          <div class="fields">
            <div class="field wide">
              <label for="tenant-id">Identifiant du tenant (UUID)</label>
              <input
                type="text"
                id="tenant-id"
                class="tabular"
                bind:value={tenantInput}
                placeholder="00000000-0000-0000-0000-000000000000"
              />
            </div>
          </div>
          <div class="actions">
            <button type="submit" disabled={tenantInput.trim() === ''}>
              Charger le catalogue
            </button>
          </div>
        </form>
      </div>
      <ErrorBanner error={tenantError} />
    </section>
  {:else}
    <ServiceBlock
      {productTypes}
      {composition}
      disabled={locked}
      busy={serviceBusy}
      error={serviceError}
      onCompose={(body) => void compose(body)}
      onSelectOperation={(operationId, selected) =>
        void selectOperation(operationId, selected)}
    />

    {#if composition}
      <ConstraintsBlock
        {constraintTypes}
        selectedIds={selectedConstraintIds}
        disabled={locked}
        busy={constraintsBusy}
        error={constraintsError}
        onToggle={(id, checked) => void toggleConstraint(id, checked)}
      />

      <QuoteBlock
        {quotes}
        canIssue={!locked}
        busy={quoteBusy}
        error={quoteError}
        onIssue={() => void issue()}
        onAccept={(quoteId) => void accept(quoteId)}
      />
    {/if}
  {/if}
</div>
