import { storageSettings } from './storage.config.js';

describe('STORAGE_MAX_FILE_MB', () => {
  it('is a limit in MiB, 1 GiB unless set', () => {
    expect(storageSettings.parse({}).maxBytes).toBe(1024 ** 3);
    expect(storageSettings.parse({ STORAGE_MAX_FILE_MB: '2' }).maxBytes).toBe(
      2 * 1024 ** 2,
    );
  });

  it('refuses anything but a whole number of MiB above zero', () => {
    for (const bad of ['', '0', '-1', '1.5', 'lots'])
      expect(
        storageSettings.safeParse({ STORAGE_MAX_FILE_MB: bad }).success,
      ).toBe(false);
  });
});
