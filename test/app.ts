import type {
  INestApplication,
  INestApplicationContext,
  Type,
} from '@nestjs/common';
import { AbstractLoader, ExpressLoader } from '@nestjs/serve-static';
import { Test } from '@nestjs/testing';
import type { ClientMetadataResourceFetch } from '@better-auth/oauth-provider';
import { AppModule } from '../src/app.module.js';
import { appOptions, configureApp } from '../src/app.setup.js';
import { Mailer, type Mail } from '../src/identity/domain/mailer.js';
import { CLIENT_METADATA_FETCH } from '../src/identity/infrastructure/client-metadata.module.js';
import { roleConfig, roleSettings } from '../src/platform/role/role.config.js';
import {
  Embedder,
  QueryEmbedder,
  Reranker,
} from '../src/processing/application/ports.js';
import { testVectors } from './env.js';
import { FakeEmbedder, FakeReranker } from './fake-models.js';

type Role = 'all' | 'api' | 'worker' | 'models';

// The app's modules in `role`, with the spec's own plugins and fakes for the
// models. The reranker is busy, so a search answers in the index's order,
// which the specs check; one that wants it reordered gives it scores.
function testApp(imports: Type[], role: Role) {
  return Test.createTestingModule({ imports: [AppModule, ...imports] })
    .overrideProvider(roleConfig.KEY)
    .useValue(roleSettings.parse({ APP_ROLE: role }))
    .overrideProvider(Embedder)
    .useValue(new FakeEmbedder(testVectors.dimensions))
    .overrideProvider(QueryEmbedder)
    .useValue(new FakeEmbedder(testVectors.dimensions))
    .overrideProvider(Reranker)
    .useValue(new FakeReranker({ busy: true }));
}

// The app as main.ts sets it up, gRPC included, without listening: supertest
// binds the HTTP server itself. `mails` gets what the Mailer would send,
// `clientMetadata` fetches OAuth clients' metadata documents (CIMD) in place
// of the network, `imports` adds the spec's own plugins, `role` is all of it
// unless told.
export async function bootApp({
  mails,
  clientMetadata,
  imports = [],
  role = 'all',
}: {
  mails?: Mail[];
  clientMetadata?: ClientMetadataResourceFetch;
  imports?: Type[];
  role?: Exclude<Role, 'worker' | 'models'>;
} = {}): Promise<INestApplication> {
  // serve-static picks its loader by the HTTP adapter, which a testing
  // module only gets after compiling: the one main.ts's app gets
  const builder = testApp(imports, role)
    .overrideProvider(AbstractLoader)
    .useClass(ExpressLoader);
  if (mails)
    builder
      .overrideProvider(Mailer)
      .useValue({ send: async (mail: Mail) => void mails.push(mail) });
  if (clientMetadata)
    builder.overrideProvider(CLIENT_METADATA_FETCH).useValue(clientMetadata);
  const app = (await builder.compile()).createNestApplication(appOptions);
  await configureApp(app);
  await app.init();
  return app;
}

// A worker as main.ts starts it: the app's modules alone, with no server.
export async function bootWorker({
  imports = [],
}: { imports?: Type[] } = {}): Promise<INestApplicationContext> {
  return (await testApp(imports, 'worker').compile()).init();
}

// The batch run of APP_ROLE=models as main.ts starts it: no server either.
export async function bootModels({
  imports = [],
}: { imports?: Type[] } = {}): Promise<INestApplicationContext> {
  return (await testApp(imports, 'models').compile()).init();
}
