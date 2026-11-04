import { PluginName, PortalId } from '@app/kernel';
import { PortalHasTwoWritersError, UsedTwiceError } from './errors.js';
import { PluginSet } from './plugin-set.js';

const named = (name: string) => ({ spec: { name: PluginName.parse(name) } });
const of = (portal: string) => ({ spec: { portal: PortalId.parse(portal) } });
const none = { polls: [], pushes: [], processors: [], aggregators: [] };

describe('PluginSet', () => {
  it('takes plugins that keep the rules', () => {
    const found = {
      polls: [of('moodle')],
      pushes: [of('teams')],
      processors: [named('office-text')],
      aggregators: [named('feed')],
    };
    expect(PluginSet.of(found, [PortalId.parse('canvas')]).plugins).toBe(found);
  });

  it('refuses two plugins with one name, whatever their kinds', () => {
    const found = {
      ...none,
      processors: [named('text')],
      aggregators: [named('text')],
    };
    expect(() => PluginSet.of(found, [])).toThrow(
      new UsedTwiceError('plugin name', 'text'),
    );
  });

  it('refuses two connectors of one portal', () => {
    const found = { ...none, polls: [of('moodle')], pushes: [of('moodle')] };
    expect(() => PluginSet.of(found, [])).toThrow(
      'connector portal "moodle" is used twice',
    );
  });

  it('refuses a portal that also has a connector over gRPC', () => {
    const found = { ...none, pushes: [of('moodle')] };
    expect(() => PluginSet.of(found, [PortalId.parse('moodle')])).toThrow(
      PortalHasTwoWritersError,
    );
  });
});
