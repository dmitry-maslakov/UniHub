import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { bootApp } from './app.js';

// The web's API types are generated from web/openapi.json (npm run
// api:generate in web/), so a route or a schema changed here and not there
// fails. To take a change: npm run test:e2e -- -u test/openapi.e2e-spec.ts,
// then regenerate the types.

describe('the OpenAPI document', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await bootApp();
  });

  afterAll(() => app.close());

  it("is the one the web's API types come from", async () => {
    const { body } = await request(app.getHttpServer())
      .get('/api/docs-json')
      .expect(200);
    await expect(`${JSON.stringify(body, null, 2)}\n`).toMatchFileSnapshot(
      '../web/openapi.json',
    );
  });
});
