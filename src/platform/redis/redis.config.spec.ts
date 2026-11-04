import { redisSettings } from './redis.config.js';

describe('redis settings', () => {
  it('find redis where docker compose runs it, unless set', () => {
    expect(redisSettings.parse({})).toEqual({ url: 'redis://localhost:6379' });
    expect(redisSettings.safeParse({ REDIS_URL: 'not a url' }).success).toBe(
      false,
    );
  });
});
