import type { INestApplication, NestApplicationOptions } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { mcp } from './access/contracts.js';
import { appConfig } from './app.config.js';

// How the HTTP app is set up, shared by main.ts and the e2e apps so they
// can't drift apart.

// Better Auth reads raw request bodies; the auth module parses the rest
export const appOptions: NestApplicationOptions = { bodyParser: false };

// Connect other microservices (gRPC) first: this starts them all, as it must
// before the app listens.
export async function configureApp(app: INestApplication) {
  const { trustProxy } = app.get<ConfigType<typeof appConfig>>(appConfig.KEY);
  // behind caddy, the client's address comes from X-Forwarded-For
  (app as NestExpressApplication).set('trust proxy', trustProxy);
  app.use(helmet());
  // The auth module has already put /api/auth on the prefix's exclude list.
  // Options here would replace that list: leave them out, or include it.
  app.setGlobalPrefix('api');
  // OpenAPI at /api/docs; sign in under /api/auth (Better Auth)
  SwaggerModule.setup('api/docs', app, () =>
    SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('UniHub')
        // a session token from /api/auth; the browser's cookie works too
        .addBearerAuth()
        .build(),
    ),
  );
  // MCP runs as a microservice strategy on the same HTTP server; its route is
  // a guarded controller in access (/api/mcp)
  mcp.setHttpAdapter(app.getHttpAdapter());
  app.connectMicroservice({ strategy: mcp });
  await app.startAllMicroservices();
}
