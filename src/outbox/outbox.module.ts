import { Module } from '@nestjs/common';
import { OutboxWriter } from './outbox.writer';

/** Les modules métier écrivent leurs événements par ce seul fournisseur (FR-206). */
@Module({
  providers: [OutboxWriter],
  exports: [OutboxWriter],
})
export class OutboxModule {}
