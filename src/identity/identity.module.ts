import { Module } from '@nestjs/common';
import { ConfigModule, type ConfigType } from '@nestjs/config';
import { EventBus } from '@nestjs/cqrs';
import { AuthModule } from '@thallesp/nestjs-better-auth';
import { PrismaService } from '../platform/database/prisma.service.js';
import { AuthenticateApiKey } from './application/authenticate-api-key.js';
import {
  GrantCourseAccessHandler,
  RevokeCourseAccessHandler,
} from './application/course-access.handlers.js';
import { IsAdminHandler } from './application/is-admin.handler.js';
import { ReadScopeHandler } from './application/read-scope.handler.js';
import { ApiKeys } from './domain/api-keys.js';
import { CourseAccessRepository } from './domain/course-access.js';
import { UserDeletedEvent } from './domain/events.js';
import { Mailer } from './domain/mailer.js';
import { ReaderRepository } from './domain/reader.js';
import { identityConfig } from './identity.config.js';
import { createAuth } from './infrastructure/better-auth.js';
import { BetterAuthApiKeys } from './infrastructure/better-auth-api-keys.js';
import { MailModule } from './infrastructure/mail.module.js';
import { PrismaCourseAccessRepository } from './infrastructure/prisma-course-access.repository.js';
import { PrismaReaderRepository } from './infrastructure/prisma-reader.repository.js';
import { SignInMethodsController } from './infrastructure/http/sign-in-methods.controller.js';

// Users, sign-in and who may read what. Better Auth serves /api/auth/* and
// guards every HTTP route; a route that needs no user says @AllowAnonymous().
// Uses no other module: courses are catalog's, known here by id only (access
// checks a course exists before it grants it), and a user's delete goes out
// as an event to whichever keeps something of them (accounts).
@Module({
  imports: [
    // for the sign-in methods route
    ConfigModule.forFeature(identityConfig),
    AuthModule.forRootAsync({
      imports: [MailModule, ConfigModule.forFeature(identityConfig)],
      inject: [PrismaService, identityConfig.KEY, Mailer, EventBus],
      useFactory: (
        prisma: PrismaService,
        config: ConfigType<typeof identityConfig>,
        mailer: Mailer,
        events: EventBus,
      ) => ({
        auth: createAuth({
          prisma,
          mailer,
          secret: config.secret,
          baseURL: config.baseURL,
          trustedOrigins: config.trustedOrigins,
          google: config.google,
          onUserDeleted: (userId) =>
            events.publish(new UserDeletedEvent(userId)),
        }),
        // the hub's own routes take JSON only, which no form on another
        // site can send with the user's cookie (Better Auth checks Origin)
        bodyParser: { urlencoded: { enabled: false } },
      }),
    }),
  ],
  controllers: [SignInMethodsController],
  providers: [
    GrantCourseAccessHandler,
    RevokeCourseAccessHandler,
    ReadScopeHandler,
    IsAdminHandler,
    AuthenticateApiKey,
    { provide: ApiKeys, useClass: BetterAuthApiKeys },
    { provide: ReaderRepository, useClass: PrismaReaderRepository },
    { provide: CourseAccessRepository, useClass: PrismaCourseAccessRepository },
  ],
  // for ApiKeyGuard, wherever a route says @ApiKeyAuth()
  exports: [AuthenticateApiKey],
})
export class IdentityModule {}
