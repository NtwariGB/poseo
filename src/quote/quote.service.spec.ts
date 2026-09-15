import { CatalogRepository } from '../catalog/catalog.repository';
import { OutboxEventInput, OutboxWriter } from '../outbox/outbox.writer';
import type { PrismaTransaction } from '../prisma/prisma-transaction';
import { CompositionRepository } from '../service/composition.repository';
import {
  CompositionService,
  ResolvedComposition,
} from '../service/composition.service';
import { TenantRepository } from '../tenant/tenant.repository';
import { QuoteRecord } from './quote.record';
import { QuoteRepository } from './quote.repository';
import { QuoteService } from './quote.service';

/**
 * S4.3 : la ligne outbox et le changement métier sont dans la même transaction. Le
 * repository est moqué en échec ; la transaction simulée annule ce qui a été écrit dedans,
 * comme le ferait Postgres, et on vérifie qu'il ne reste aucune ligne outbox.
 */
describe('QuoteService : événements et transaction (S4.3)', () => {
  const TENANT_ID = '018f0000-0000-7000-8000-000000000001';
  const COMPOSITION_ID = '018f0000-0000-7000-8000-000000000002';

  // Lignes outbox « commitées » : ce qui subsiste après la transaction.
  let outboxRows: OutboxEventInput[];
  let pendingRows: OutboxEventInput[];

  let compositions: jest.Mocked<Pick<CompositionService, 'resolveForQuote'>>;
  let compositionRepository: jest.Mocked<Pick<CompositionRepository, 'setStatus'>>;
  let catalog: jest.Mocked<
    Pick<
      CatalogRepository,
      'findZoneByPostalCode' | 'findApplicableLaborRate' | 'findSurchargeRules'
    >
  >;
  let tenants: jest.Mocked<Pick<TenantRepository, 'findSettings'>>;
  let quotes: jest.Mocked<
    Pick<QuoteRepository, 'transaction' | 'supersedeIssued' | 'nextNumber' | 'insert'>
  >;
  let outbox: jest.Mocked<Pick<OutboxWriter, 'append'>>;
  let service: QuoteService;

  const resolved = (): ResolvedComposition => ({
    record: {
      id: COMPOSITION_ID,
      status: 'DRAFT',
      productTypeId: 'product-type-1',
      productType: { id: 'product-type-1', code: 'DW', label: 'Lave-vaisselle' },
      productRef: 'DW-1',
      addressLine: '12 rue de Lille',
      postalCode: '59000',
      city: 'Lille',
      constraints: [],
      operations: [],
    },
    operations: [
      {
        operationId: 'operation-1',
        code: 'INSTALL',
        label: 'Pose',
        referenceDurationMinutes: 60,
        origin: 'MANDATORY',
        selected: true,
      },
    ],
  });

  const issuedQuote = (): QuoteRecord => ({
    id: '018f0000-0000-7000-8000-000000000003',
    tenantId: TENANT_ID,
    compositionId: COMPOSITION_ID,
    number: 'Q-2026-000001',
    status: 'ISSUED',
    issuedAt: new Date('2026-09-15T10:00:00.000Z'),
    validUntil: new Date('2026-10-15T10:00:00.000Z'),
    acceptedAt: null,
    zoneCode: 'NORD',
    hourlyRateCents: 4500,
    productTypeLabel: 'Lave-vaisselle',
    laborCents: 4500,
    surchargeCents: 0,
    subtotalCents: 4500,
    vatRateBp: 2000,
    vatCents: 900,
    totalCents: 5400,
    lines: [],
  });

  beforeEach(() => {
    outboxRows = [];
    pendingRows = [];

    compositions = { resolveForQuote: jest.fn().mockResolvedValue(resolved()) };
    compositionRepository = { setStatus: jest.fn().mockResolvedValue(true) };
    catalog = {
      findZoneByPostalCode: jest
        .fn()
        .mockResolvedValue({ id: 'zone-1', code: 'NORD', label: 'Nord' }),
      findApplicableLaborRate: jest.fn().mockResolvedValue(4500),
      findSurchargeRules: jest.fn().mockResolvedValue([]),
    };
    tenants = {
      findSettings: jest
        .fn()
        .mockResolvedValue({ vatRateBp: 2000, quoteValidityDays: 30 }),
    };

    outbox = {
      append: jest.fn(async (_tx: PrismaTransaction, event: OutboxEventInput) => {
        pendingRows.push(event);
      }),
    };

    quotes = {
      // Transaction simulée : ce qui a été écrit dedans n'est conservé qu'au commit.
      transaction: jest.fn(async (run: (tx: PrismaTransaction) => Promise<unknown>) => {
        pendingRows = [];
        try {
          const result = await run({} as PrismaTransaction);
          outboxRows = [...outboxRows, ...pendingRows];
          return result;
        } finally {
          pendingRows = [];
        }
      }),
      supersedeIssued: jest.fn().mockResolvedValue(null),
      nextNumber: jest.fn().mockResolvedValue('Q-2026-000001'),
      insert: jest.fn().mockResolvedValue(issuedQuote()),
    } as unknown as jest.Mocked<
      Pick<QuoteRepository, 'transaction' | 'supersedeIssued' | 'nextNumber' | 'insert'>
    >;

    service = new QuoteService(
      compositions as unknown as CompositionService,
      compositionRepository as unknown as CompositionRepository,
      catalog as unknown as CatalogRepository,
      tenants as unknown as TenantRepository,
      quotes as unknown as QuoteRepository,
      outbox as unknown as OutboxWriter,
    );
  });

  it('écrit la ligne quote.issued quand le devis est persisté', async () => {
    const view = await service.issue(TENANT_ID, COMPOSITION_ID);

    expect(view.number).toBe('Q-2026-000001');
    expect(outboxRows.map((row) => row.type)).toEqual(['quote.issued']);
    expect(outboxRows[0]).toEqual(
      expect.objectContaining({
        aggregateType: 'quote',
        aggregateId: issuedQuote().id,
      }),
    );
  });

  it('ne laisse aucune ligne outbox si l écriture du devis échoue', async () => {
    quotes.insert.mockRejectedValue(new Error('insertion refusée'));

    await expect(service.issue(TENANT_ID, COMPOSITION_ID)).rejects.toThrow(
      'insertion refusée',
    );

    expect(outboxRows).toEqual([]);
  });

  it('ne laisse aucune ligne outbox si la supersession a déjà écrit son événement', async () => {
    // L'ancien devis est passé SUPERSEDED et son événement écrit, puis l'insertion échoue :
    // la transaction emporte les deux.
    quotes.supersedeIssued.mockResolvedValue({
      ...issuedQuote(),
      id: '018f0000-0000-7000-8000-000000000004',
      status: 'SUPERSEDED',
    });
    quotes.insert.mockRejectedValue(new Error('insertion refusée'));

    await expect(service.issue(TENANT_ID, COMPOSITION_ID)).rejects.toThrow(
      'insertion refusée',
    );

    expect(outbox.append).toHaveBeenCalledTimes(1);
    expect(outboxRows).toEqual([]);
  });

  it('ne laisse aucune ligne outbox si le statut de la prestation ne peut pas être écrit', async () => {
    compositionRepository.setStatus.mockResolvedValue(false);

    await expect(service.issue(TENANT_ID, COMPOSITION_ID)).rejects.toThrow(
      expect.objectContaining({ code: 'COMPOSITION_NOT_FOUND' }) as Error,
    );

    expect(outboxRows).toEqual([]);
  });
});
