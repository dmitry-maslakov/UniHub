import { format, inspect } from 'node:util';
import { Logger } from '@nestjs/common';
import { Secret } from './secret.js';

const VALUE = '1~the-real-token';

describe('Secret', () => {
  it('shows as [secret] however it is printed, logged or serialized', () => {
    const secret = new Secret(VALUE);
    const shown = [
      String(secret),
      JSON.stringify({ token: secret }),
      inspect({ token: secret }, { depth: Infinity, showHidden: true }),
      format('%s %o %O %j', secret, secret, secret, secret),
      // an error that holds one, as a logger prints it
      inspect(Object.assign(new Error('failed'), { token: secret })),
    ];
    for (const text of shown) {
      expect(text).toContain('[secret]');
      expect(text).not.toContain(VALUE);
    }
    expect(Object.keys(secret)).toEqual([]);
    expect(structuredClone(secret)).not.toHaveProperty('reveal');
  });

  it("goes through Nest's logger as [secret]", () => {
    const out = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);
    try {
      new Logger('Probe').log({ token: new Secret(VALUE) });
      const written = out.mock.calls.map(([chunk]) => String(chunk)).join('');
      expect(written).toContain('[secret]');
      expect(written).not.toContain(VALUE);
    } finally {
      out.mockRestore();
    }
  });

  it('gives its value only to reveal()', () => {
    expect(new Secret(VALUE).reveal()).toBe(VALUE);
  });
});
