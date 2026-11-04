import { z } from 'zod';
import { settings } from './settings.js';

describe('settings', () => {
  it('stops the app on a bad setting, naming it', () => {
    const config = settings('probe', z.object({ PROBE_URL: z.url() }));
    process.env.PROBE_URL = 'not a url';
    try {
      expect(() => config()).toThrow(/invalid probe settings[\s\S]*PROBE_URL/);
    } finally {
      delete process.env.PROBE_URL;
    }
  });
});
