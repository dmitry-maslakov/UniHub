import { Instance, NO_INSTANCE, PortalId } from '@app/kernel';
import { catalogOf, poll } from '../../../test/discovered-plugins.js';
import { ConfiguredInstanceQuery } from '../../catalog/contracts.js';
import { ConfiguredInstanceHandler } from './configured-instance.handler.js';
import type { InstanceAdoption } from './instance-adoption.js';

const SITE = Instance.parse('https://canvas.example.edu');

describe('ConfiguredInstanceHandler', () => {
  it("names the site of a portal of sites once the rows from before are its, and waits for nothing on another portal's", async () => {
    let adopted = () => {};
    const done = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          adopted = resolve;
        }),
    );
    const handler = new ConfiguredInstanceHandler(
      catalogOf({
        polls: [
          poll(
            'canvas',
            {
              poll: async () => {},
              identify: async () => ({ id: '1', expiresAt: null }),
              configuredInstance: () => SITE,
            } as never,
            ['token'],
            true,
          ),
          poll('moodle'),
        ],
      }),
      { done } as unknown as InstanceAdoption,
    );
    const site = (portal: string) =>
      handler.execute(new ConfiguredInstanceQuery(PortalId.parse(portal)));

    expect(await site('moodle')).toBe(NO_INSTANCE);
    expect(done).not.toHaveBeenCalled();

    let named = false;
    const canvas = site('canvas').then((found) => {
      named = true;
      return found;
    });
    await new Promise(setImmediate);
    expect(named).toBe(false);
    adopted();
    expect(await canvas).toBe(SITE);
  });
});
