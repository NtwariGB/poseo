<script lang="ts">
  import type { ApiError, Quote } from './api';
  import ErrorBanner from './ErrorBanner.svelte';
  import {
    date,
    dateTime,
    duration,
    euros,
    percent,
    quoteStatus,
  } from './format';

  /**
   * UI-306 et UI-307 : le devis le plus récent en détail, puis l'historique. Tous les
   * montants viennent de FR-208 ; la page ne fait que passer les centimes en euros.
   */
  let {
    quotes,
    canIssue,
    busy,
    error,
    onIssue,
    onAccept,
  }: {
    quotes: Quote[];
    canIssue: boolean;
    busy: boolean;
    error: ApiError | null;
    onIssue: () => void;
    onAccept: (quoteId: string) => void;
  } = $props();

  // L'API renvoie l'historique du plus récent au plus ancien : le premier est le devis
  // courant, les suivants l'historique. Aucun tri ni choix de statut côté page.
  const current = $derived(quotes.at(0) ?? null);
  const history = $derived(quotes.slice(1));
</script>

<section class="block">
  <h2>Devis</h2>

  <div class="block-body">
    <div class="actions">
      <button type="button" onclick={onIssue} disabled={!canIssue || busy}>
        Émettre le devis
      </button>
      {#if busy}<span class="busy">Échange avec l'API…</span>{/if}
    </div>
  </div>

  {#if current}
    <div class="computed quote" class:accepted={current.status === 'ACCEPTED'}>
      <div class="quote-head">
        <div>
          <div class="quote-number tabular">{current.number}</div>
          <div class="origin-note">
            {current.productTypeLabel}, zone {current.zoneCode}
          </div>
        </div>
        <div class="quote-meta">
          <div class="quote-status">{quoteStatus(current.status)}</div>
          <div>Émis le {dateTime(current.issuedAt)}</div>
          <div>Valable jusqu'au {date(current.validUntil)}</div>
          {#if current.acceptedAt}
            <div>Accepté le {dateTime(current.acceptedAt)}</div>
          {/if}
        </div>
      </div>

      <table class="lines">
        <thead>
          <tr>
            <th scope="col">Ligne</th>
            <th scope="col" class="num">Durée</th>
            <th scope="col" class="num">Montant</th>
          </tr>
        </thead>
        <tbody>
          {#each current.lines as line (line.position)}
            <tr class:surcharge={line.kind === 'SURCHARGE'}>
              <td>{line.label}</td>
              <td class="num tabular">
                {line.durationMinutes === null
                  ? '—'
                  : duration(line.durationMinutes)}
              </td>
              <td class="num tabular">{euros(line.amountCents)}</td>
            </tr>
          {/each}
        </tbody>
      </table>

      <dl class="totals tabular">
        <dt>Main d'œuvre ({euros(current.hourlyRateCents)} / h)</dt>
        <dd>{euros(current.laborCents)}</dd>
        <dt>Majorations</dt>
        <dd>{euros(current.surchargeCents)}</dd>
        <dt>Total HT</dt>
        <dd>{euros(current.subtotalCents)}</dd>
        <dt>TVA {percent(current.vatRateBp)}</dt>
        <dd>{euros(current.vatCents)}</dd>
        <dt class="grand">Total TTC</dt>
        <dd class="grand">{euros(current.totalCents)}</dd>
      </dl>

      {#if current.status === 'ISSUED'}
        <div class="actions">
          <button type="button" onclick={() => onAccept(current.id)} disabled={busy}>
            Accepter
          </button>
        </div>
      {/if}
    </div>
  {:else}
    <div class="computed">
      <p class="empty">Aucun devis émis pour cette prestation.</p>
    </div>
  {/if}

  {#if history.length > 0}
    <div class="block-body">
      <div class="computed-head">
        <h3>Devis précédents</h3>
      </div>
      <ul class="history">
        {#each history as quote (quote.id)}
          <li
            class:spent={quote.status === 'SUPERSEDED' ||
              quote.status === 'EXPIRED'}
          >
            <span class="tabular">{quote.number}</span>
            <span>{quoteStatus(quote.status)}</span>
            <span class="when tabular">{dateTime(quote.issuedAt)}</span>
            <span class="when tabular">{euros(quote.totalCents)}</span>
          </li>
        {/each}
      </ul>
    </div>
  {/if}

  <ErrorBanner {error} />
</section>
