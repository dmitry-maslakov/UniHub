import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { bootApp } from './app.js';

// what the HTTP app answers anyone, without signing in
describe('the HTTP app', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await bootApp();
  });

  afterAll(() => app.close());

  it('says it is healthy, with what it checked', async () => {
    const res = await http().get('/api/health').expect(200);
    expect(res.body).toMatchObject({
      status: 'ok',
      info: { database: { status: 'up' }, redis: { status: 'up' } },
    });
    // helmet's headers
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['content-security-policy']).toContain(
      "default-src 'self'",
    );
  });

  it('describes its routes in OpenAPI, by their schemas', async () => {
    const doc = (await http().get('/api/docs-json').expect(200)).body;
    expect(Object.keys(doc.paths)).toEqual(
      expect.arrayContaining([
        '/api/courses',
        '/api/courses/{slug}/items',
        '/api/files/{id}/text',
        '/api/files/{id}/content',
        '/api/files/{id}/members',
        '/api/search',
        '/api/users/{userId}/courses/{courseId}',
        '/api/portal-courses/{portal}/{externalId}/course',
      ]),
    );
    expect(doc.paths['/api/courses/{slug}/items'].get.parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'limit',
          in: 'query',
          required: false,
          schema: expect.objectContaining({ maximum: 200, default: 50 }),
        }),
      ]),
    );
    expect(
      doc.paths['/api/courses'].post.requestBody.content['application/json']
        .schema,
    ).toMatchObject({ properties: { slug: {}, name: {} } });
  });
});
