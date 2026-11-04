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
  // small, so a test can go past it; the largest upload in the tests is 1 MB
  STORAGE_MAX_FILE_MB: '2',
  // real plugins are tested on their own; e2e use the fakes
  PLUGINS: '',
  CONNECTOR_TOKENS: 'grpc-test=good-test-token-0001',
  // gRPC starts with the app, as in production, away from a developer's own
  GRPC_URL: '127.0.0.1:50999',
  BETTER_AUTH_SECRET: 'e2e-secret-e2e-secret-e2e-secret-e2e',
  // mails are only logged; tests read them from the mailer
  SMTP_URL: '',
};
