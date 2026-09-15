import type { Prisma } from '../generated/prisma/client';

/**
 * Client de transaction Prisma, tel que le passe `$transaction`. Les méthodes de repository
 * qui doivent partager la transaction d'un autre module le prennent en paramètre plutôt que
 * d'en ouvrir une à elles.
 */
export type PrismaTransaction = Prisma.TransactionClient;
