import { describe, expect, it } from 'vitest';
import { portalLabel } from './portal-label';

describe('portalLabel', () => {
  it('names a portal by its label, or by its id when it has none', () => {
    const portals = [
      { portal: 'canvas', label: 'Canvas' },
      { portal: 'acs', label: null },
    ];
    expect(portalLabel('canvas', portals)).toBe('Canvas');
    expect(portalLabel('acs', portals)).toBe('acs');
    expect(portalLabel('other', portals)).toBe('other');
    expect(portalLabel('canvas')).toBe('canvas');
  });
});
