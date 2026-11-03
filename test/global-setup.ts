import { execSync } from 'node:child_process';
import { rm } from 'node:fs/promises';
import { Redis } from 'ioredis';
import { Client } from 'pg';
import { testEnv } from './env.js';

// a clean test database, redis db and storage folder for every run
export default async function setup() {
  const admin = new URL(testEnv.DATABASE_URL);
  admin.pathname = '/postgres';
  const pg = new Client({ connectionString: admin.toString() });
  await pg.connect();
  await pg.query('DROP DATABASE IF EXISTS unihub_test WITH (FORCE)');
  await pg.query('CREATE DATABASE unihub_test');
  await pg.end();

  execSync('npx prisma migrate deploy', {
    stdio: 'ignore',
    env: { ...process.env, ...testEnv },
  });

  const redis = new Redis(testEnv.REDIS_URL);
  await redis.flushdb();
  await redis.quit();

  await rm(testEnv.STORAGE_PATH, { recursive: true, force: true });
}
