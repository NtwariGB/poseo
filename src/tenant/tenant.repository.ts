import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentTenantContext } from './current-tenant';

/** Paramètres de l'enseigne qui entrent dans un devis (FR-201). */
export interface TenantSettings {
  vatRateBp: number;
  quoteValidityDays: number;
}

@Injectable()
export class TenantRepository {
  constructor(private readonly prisma: PrismaService) {}

  findById(id: string): Promise<CurrentTenantContext | null> {
    return this.prisma.tenant.findUnique({
      where: { id },
      select: { id: true, code: true },
    });
  }

  /** Taux de TVA et durée de validité, figés sur le devis à l'émission. */
  findSettings(id: string): Promise<TenantSettings | null> {
    return this.prisma.tenant.findUnique({
      where: { id },
      select: { vatRateBp: true, quoteValidityDays: true },
    });
  }
}
