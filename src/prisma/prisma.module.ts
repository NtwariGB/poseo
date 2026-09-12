import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

/** Global : tout module métier injecte `PrismaService` sans le réimporter. */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
