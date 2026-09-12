import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentTenantContext } from './current-tenant';

@Injectable()
export class TenantRepository {
  constructor(private readonly prisma: PrismaService) {}

  findById(id: string): Promise<CurrentTenantContext | null> {
    return this.prisma.tenant.findUnique({
      where: { id },
      select: { id: true, code: true },
    });
  }
}
