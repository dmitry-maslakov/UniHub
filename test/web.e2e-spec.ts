import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { bootApp } from './app.js';
import { testEnv } from './env.js';

// The web app as the hub serves it, from a build of the spec's own: its
// pages and their headers, the API's left as they were. Which header says
// what is page-headers.spec's.

describe('web', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());
  const root = testEnv.WEB_PATH;

  beforeAll(async () => {
    await rm(root, { recursive: true, force: true });
    await mkdir(join(root, 'assets'), { recursive: true });
    await writeFile(
      join(root, 'index.html'),
      '<!doctype html><title>app</title>',
    );
    await writeFile(join(root, 'assets', 'index-a1b2.js'), 'export {};');
    app = await bootApp();
  });

  afterAll(async () => {
    await app.close();
    await rm(root, { recursive: true, force: true });
  });

  it("answers the app's paths with index.html, never cached", async () => {
    for (const path of [
      '/',
      '/device?user_code=ABCD2345',
      '/settings/api-keys',
    ]) {
      const res = await http().get(path).expect(200);
      expect(res.text).toContain('<title>app</title>');
      expect(res.headers['cache-control']).toBe('no-store');
      expect(res.headers['content-security-policy']).toContain(
        "form-action 'none'",
      );
      expect(res.headers['referrer-policy']).toBe('no-referrer');
    }
  });

  it('keeps hashed assets for good, and a missing one is a 404', async () => {
    const res = await http().get('/assets/index-a1b2.js').expect(200);
    expect(res.headers['cache-control']).toContain('immutable');
    await http().get('/assets/index-gone.js').expect(404);
  });

  it('leaves the API, its docs and /.well-known to the hub', async () => {
    const api = await http().get('/api/no-such-route').expect(404);
    expect(api.type).toBe('application/json');
    await http().get('/.well-known/no-such-document').expect(404);
    const docs = await http().get('/api/docs').expect(200);
    expect(docs.headers['content-security-policy']).not.toContain(
      "form-action 'none'",
    );
  });
});
