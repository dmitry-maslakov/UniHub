import { PortalId } from '@app/kernel';
import { catalogOf, poll } from '../../../test/discovered-plugins.js';
import { Connection } from '../../ingest/contracts.js';
import { NoPollConnectorError } from '../domain/errors.js';
import type { ConnectorSchedules } from './connector-schedules.js';
import { SyncConnectionCommand } from './sync-connection.command.js';
import { SyncConnectionHandler } from './sync-connection.handler.js';

const sync = (portal: string) => {
  const pollNow = vi.fn(async () => {});
  const handler = new SyncConnectionHandler(
    catalogOf({ polls: [poll('moodle')] }),
    { pollNow } as unknown as ConnectorSchedules,
  );
  const connection = Connection.shared(PortalId.parse(portal));
  return {
    run: handler.execute(new SyncConnectionCommand(connection)),
    pollNow,
  };
};

describe('SyncConnectionHandler', () => {
  it('polls the connection now', async () => {
    const { run, pollNow } = sync('moodle');
    await run;
    expect(pollNow).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'moodle__shared' }),
    );
  });

  it('refuses a portal no connector here polls', async () => {
    const { run, pollNow } = sync('canvas');
    await expect(run).rejects.toThrow(NoPollConnectorError);
    expect(pollNow).not.toHaveBeenCalled();
  });
});
