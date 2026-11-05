import type { INestApplication, Type } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module.js';
import { appOptions, configureApp } from '../src/app.setup.js';
import { Mailer, type Mail } from '../src/identity/domain/mailer.js';
import {
  Embedder,
  QueryEmbedder,
} from '../src/processing/application/ports.js';
import { testVectors } from './env.js';
import { FakeEmbedder } from './fake-models.js';

// The app as main.ts sets it up, gRPC included, without listening: supertest
// binds the HTTP server itself, and fakes stand in for the embedding model.
// `mails` gets what the Mailer would send, `imports` adds the spec's own
// plugins.
export async function bootApp({
  mails,
  imports = [],
}: { mails?: Mail[]; imports?: Type[] } = {}): Promise<INestApplication> {
  const builder = Test.createTestingModule({
    imports: [AppModule, ...imports],
  })
    .overrideProvider(Embedder)
    .useValue(new FakeEmbedder(testVectors.dimensions))
    .overrideProvider(QueryEmbedder)
    .useValue(new FakeEmbedder(testVectors.dimensions));
  if (mails)
    builder
      .overrideProvider(Mailer)
      .useValue({ send: async (mail: Mail) => void mails.push(mail) });
  const app = (await builder.compile()).createNestApplication(appOptions);
  await configureApp(app);
  await app.init();
  return app;
}
