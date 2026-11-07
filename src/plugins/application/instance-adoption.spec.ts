import { Logger } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { Test } from '@nestjs/testing';
import { ClsModule } from 'nestjs-cls';
import {
  ClsPluginTransactional,
  NoOpTransactionalAdapter,
} from '@nestjs-cls/transactional';
import { Instance, PortalId } from '@app/kernel';
import { catalogOf, poll } from '../../../test/discovered-plugins.js';
import { FakeBus } from '../../../test/fake-bus.js';
import { AdoptRecordsCommand } from '../../catalog/contracts.js';
import { AdoptAccountsCommand } from './accounts.js';
import { InstanceAdoption } from './instance-adoption.js';
import { PluginCatalog } from './plugin-catalog.js';

const SITE = Instance.parse('https://canvas.example.edu');
const canvas = PortalId.parse('canvas');

// the portals' connectors: canvas a site per school whose settings name
// one, lms one that names none, moodle one site
const sited = (url: Instance | null) =>
  ({
    poll: async () => {},
    identify: async () => ({ id: '1', expiresAt: null }),
    configuredInstance: () => url,
  }) as never;

// @Transactional() runs, without a database
async function adoption(commands: FakeBus) {
  const module = await Test.createTestingModule({
    imports: [
      ClsModule.forRoot({
        plugins: [
          new ClsPluginTransactional({
            adapter: new NoOpTransactionalAdapter({
              tx: {},
              disableWarning: true,
            }),
          }),
        ],
      }),
    ],
    providers: [
      InstanceAdoption,
      {
        provide: PluginCatalog,
        useValue: catalogOf({
          polls: [
            poll('canvas', sited(SITE), ['token'], true),
            poll('lms', sited(null), ['token'], true),
            poll('moodle'),
          ],
        }),
      },
      { provide: CommandBus, useValue: commands.commands },
    ],
  }).compile();
  return module.get(InstanceAdoption);
}

describe('InstanceAdoption', () => {
  it('gives the records and accounts of a portal whose settings name its site that site, once a process', async () => {
    const commands = new FakeBus([
      [AdoptRecordsCommand, () => 3],
      [AdoptAccountsCommand, () => 1],
    ]);
    const adopting = await adoption(commands);

    await Promise.all([adopting.done(), adopting.done()]);
    await adopting.done();
    expect(commands.sent).toEqual([
      new AdoptRecordsCommand(canvas, SITE),
      new AdoptAccountsCommand(canvas, SITE),
    ]);
  });

  it('tries again on the next ask once it failed, and logs a failure at start', async () => {
    let failing = true;
    const commands = new FakeBus([
      [
        AdoptRecordsCommand,
        () => {
          if (failing) throw new Error('database away');
          return 0;
        },
      ],
      [AdoptAccountsCommand, () => 0],
    ]);
    const adopting = await adoption(commands);
    const logged = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => {});

    await adopting.atStart();
    expect(logged).toHaveBeenCalledOnce();
    await expect(adopting.done()).rejects.toThrow('database away');
    failing = false;
    await adopting.done();
    expect(commands.sent.at(-1)).toEqual(
      new AdoptAccountsCommand(canvas, SITE),
    );
    logged.mockRestore();
  });
});
