import { describe, expect, it } from 'vitest';
import type { Schemas } from '@/shared/api';
import { orderSources } from './order';

const portal = (
  id: string,
  label: string,
  mode: Schemas['PortalResponse']['mode'],
): Schemas['PortalResponse'] => ({
  portal: id,
  label,
  mode,
  linked: false,
  instance: null,
  status: null,
  expiresAt: null,
  picked: null,
});

describe('orderSources', () => {
  it('puts sources to link first, then shared ones, then catalogs, each by name', () => {
    const portals = [
      portal('catalog', 'Course catalog', 'public'),
      portal('b', 'Beta', 'shared'),
      portal('canvas', 'Canvas', 'token'),
      portal('a', 'Alpha', 'shared'),
      portal('acs', 'Another catalog', 'public'),
      portal('moodle', 'Moodle', 'token'),
    ];
    expect(orderSources(portals).map((p) => p.label)).toEqual([
      'Canvas',
      'Moodle',
      'Alpha',
      'Beta',
      'Another catalog',
      'Course catalog',
    ]);
    expect(portals[0]!.label).toBe('Course catalog');
  });
});
