import { PortalId } from '@app/kernel';
import { UserDeletedEvent } from '../../identity/contracts.js';
import { PortalAccount } from '../domain/portal-account.js';
import { InMemoryAccounts } from './accounts.fakes.js';
import { UserDeletedHandler } from './user-deleted.handler.js';

describe('UserDeletedHandler', () => {
  it("takes the user's accounts and credentials away, nobody else's", async () => {
    const store = new InMemoryAccounts();
    for (const [userId, portal] of [
      ['ana', 'canvas'],
      ['ana', 'moodle'],
      ['bo', 'canvas'],
    ])
      await store.save(
        PortalAccount.link(
          null,
          { userId, portal: PortalId.parse(portal), mode: 'token' },
          { id: '4242', expiresAt: null },
        ),
        'sealed',
      );

    await new UserDeletedHandler(store).handle(new UserDeletedEvent('ana'));
    expect([...store.rows.keys()]).toEqual(['bo:canvas']);
  });
});
