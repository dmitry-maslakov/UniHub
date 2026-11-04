import { Module } from '@nestjs/common';
import { ConfigModule, type ConfigType } from '@nestjs/config';
import { AuthModule } from '@thallesp/nestjs-better-auth';
import { PrismaService } from '../platform/database/prisma.service.js';
import { AuthenticateApiKey } from './application/authenticate-api-key.js';
import {
  GrantCourseAccessHandler,
  RevokeCourseAccessHandler,
} from './application/course-access.handlers.js';
import { ReadScopeHandler } from './application/read-scope.handler.js';
import { ApiKeys } from './domain/api-keys.js';
import { CourseAccessRepository } from './domain/course-access.js';
import { Mailer } from './domain/mailer.js';
import { ReaderRepository } from './domain/reader.js';
import { identityConfig } from './identity.config.js';
import { createAuth } from './infrastructure/better-auth.js';
import { BetterAuthApiKeys } from './infrastructure/better-auth-api-keys.js';
import { CourseAccessController } from './infrastructure/http/course-access.controller.js';
import { MailModule } from './infrastructure/mail.module.js';
import { PrismaCourseAccessRepository } from './infrastructure/prisma-course-access.repository.js';
import { PrismaReaderRepository } from './infrastructure/prisma-reader.repository.js';

// Users, sign-in and who may read what. Better Auth serves /api/auth/* and
// guards every HTTP route; a route that needs no user says @AllowAnonymous().
// Uses no other module: courses are catalog's, known here by id only.
@Module({
  imports: [
    AuthModule.forRootAsync({
      imports: [MailModule, ConfigModule.forFeature(identityConfig)],
      inject: [PrismaService, identityConfig.KEY, Mailer],
      useFactory: (
        prisma: PrismaService,
        config: ConfigType<typeof identityConfig>,
        mailer: Mailer,
      ) => ({
        auth: createAuth({
          prisma,
          mailer,
          secret: config.secret,
          baseURL: config.baseURL,
          trustedOrigins: config.trustedOrigins,
          google: config.google,
        }),
      }),
    }),
  ],
  controllers: [CourseAccessController],
  providers: [
    GrantCourseAccessHandler,
    RevokeCourseAccessHandler,
    ReadScopeHandler,
    AuthenticateApiKey,
    { provide: ApiKeys, useClass: BetterAuthApiKeys },
    { provide: ReaderRepository, useClass: PrismaReaderRepository },
    { provide: CourseAccessRepository, useClass: PrismaCourseAccessRepository },
  ],
  // for ApiKeyGuard, wherever a route says @ApiKeyAuth()
  exports: [AuthenticateApiKey],
})
export class IdentityModule {}
