import 'dotenv/config';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const withPath = (url: string, path: string) => {
  const u = new URL(url);
  u.pathname = path;
  return u.toString();
};

// e2e tests get their own database, redis db and storage folder,
// so they never touch the developer's data
export const testEnv = {
  DATABASE_URL: withPath(process.env.DATABASE_URL!, '/unihub_test'),
  REDIS_URL: withPath(process.env.REDIS_URL ?? 'redis://localhost:6379', '/1'),
  STORAGE_PATH: join(tmpdir(), 'unihub-e2e'),
};
