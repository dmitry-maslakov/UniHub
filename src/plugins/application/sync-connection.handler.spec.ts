import { PortalId } from '@app/kernel';
import { Connection } from '../../ingest/contracts.js';
import { NoPollConnectorError } from '../domain/errors.js';
import type { ConnectorSchedules } from './connector-schedules.js';
import { catalogOf, poll } from './plugins.fakes.js';
import { SyncConnectionCommand } from './sync-connection.command.js';
import { SyncConnectionHandler } from './sync-connection.handler.js';

const sync = (portal: string) => {
  const pollNow = vi.fn(async () => {});
  const handler = new SyncConnectionHandler(
    catalogOf({ polls: [poll('acs')] }),
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
    const { run, pollNow } = sync('acs');
    await run;
    expect(pollNow).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'acs__shared' }),
    );
  });

  it('refuses a portal no connector here polls', async () => {
    const { run, pollNow } = sync('canvas');
    await expect(run).rejects.toThrow(NoPollConnectorError);
    expect(pollNow).not.toHaveBeenCalled();
  });
});
