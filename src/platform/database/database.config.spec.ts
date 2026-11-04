import { databaseSettings } from './database.config.js';

describe('database settings', () => {
  it('need the database, by url', () => {
    expect(
      databaseSettings.parse({ DATABASE_URL: 'postgresql://u:p@db:5432/hub' }),
    ).toEqual({ url: 'postgresql://u:p@db:5432/hub' });
    for (const bad of [{}, { DATABASE_URL: 'db' }])
      expect(databaseSettings.safeParse(bad).success).toBe(false);
  });
});
