import { EventsHandler, type IEventHandler } from '@nestjs/cqrs';
import { UserDeletedEvent } from '../../identity/contracts.js';
import { PortalAccounts } from './portal-accounts.js';

// A deleted user's accounts go with them, credentials and all, and what
// they saw. The bus logs a failure; nothing reads a deleted user's
// accounts meanwhile, no session being theirs.
@EventsHandler(UserDeletedEvent)
export class UserDeletedHandler implements IEventHandler<UserDeletedEvent> {
  constructor(private readonly accounts: PortalAccounts) {}

  handle({ userId }: UserDeletedEvent) {
    return this.accounts.removeAllOf(userId);
  }
}
