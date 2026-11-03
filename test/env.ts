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
  // db 15: far from the 0 a developer normally uses, it gets flushed
  REDIS_URL: withPath(process.env.REDIS_URL ?? 'redis://localhost:6379', '/15'),
  STORAGE_PATH: join(tmpdir(), 'unihub-e2e'),
  // real plugins are tested on their own; e2e use the fakes
  PLUGINS: '',
  CONNECTOR_TOKENS: 'grpc-test=good-test-token-0001',
};
