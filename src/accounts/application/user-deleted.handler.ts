import { EventsHandler, type IEventHandler } from '@nestjs/cqrs';
import { UserDeletedEvent } from '../../identity/contracts.js';
import { PortalAccountRepository } from '../domain/portal-account.js';

// A deleted user's accounts go with them, credentials and all. The bus logs
// a failure; nothing reads a deleted user's accounts meanwhile, no session
// being theirs.
@EventsHandler(UserDeletedEvent)
export class UserDeletedHandler implements IEventHandler<UserDeletedEvent> {
  constructor(private readonly accounts: PortalAccountRepository) {}

  handle({ userId }: UserDeletedEvent) {
    return this.accounts.removeAllOf(userId);
  }
}
