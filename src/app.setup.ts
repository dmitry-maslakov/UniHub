import type { INestApplication, NestApplicationOptions } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

// How the HTTP app is set up, shared by main.ts and the e2e apps so they
// can't drift apart.

// Better Auth reads raw request bodies; the auth module parses the rest
export const appOptions: NestApplicationOptions = { bodyParser: false };

export function configureApp(app: INestApplication) {
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
}
