import { Command } from '@nestjs/cqrs';
import type { Connection } from '../../ingest/contracts.js';

// Polls the connection now, unless a poll of it is waiting or running; what
// "sync now" from a client will send. NoPollConnectorError when no connector
// here polls its portal.
export class SyncConnectionCommand extends Command<void> {
  constructor(readonly connection: Connection) {
    super();
  }
}
