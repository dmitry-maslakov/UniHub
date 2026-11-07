import { describe, expect, it } from 'vitest';
import { deviceName } from './device-name';

describe('deviceName', () => {
  it('names a browser and its system from a user agent', () => {
    expect(
      deviceName(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
      ),
    ).toEqual({ browser: 'Chrome', os: 'macOS' });
    expect(
      deviceName(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1',
      ),
    ).toEqual({ browser: 'Safari', os: 'iOS' });
    expect(
      deviceName(
        'Mozilla/5.0 (X11; Linux x86_64; rv:132.0) Gecko/20100101 Firefox/132.0',
      ),
    ).toEqual({ browser: 'Firefox', os: 'Linux' });
    expect(deviceName('')).toEqual({});
    expect(deviceName(null)).toEqual({});
  });
});
