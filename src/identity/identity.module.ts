import { Module } from '@nestjs/common';
import { ConfigModule, type ConfigType } from '@nestjs/config';
import { AuthModule } from '@thallesp/nestjs-better-auth';
import { PrismaService } from '../platform/database/prisma.service.js';
import { GrantCourseAccessHandler } from './application/commands/grant-course-access.handler.js';
import { RevokeCourseAccessHandler } from './application/commands/revoke-course-access.handler.js';
import { ApiKeyUserHandler } from './application/queries/api-key-user.handler.js';
import { ReadableCoursesHandler } from './application/queries/readable-courses.handler.js';
import { ApiKeys } from './domain/api-keys.js';
import { CourseAccessRepository } from './domain/course-access.js';
import { Mailer } from './domain/mailer.js';
import { UserRepository } from './domain/user.js';
import { identityConfig } from './identity.config.js';
import { createAuth } from './infrastructure/better-auth.js';
import { BetterAuthApiKeys } from './infrastructure/better-auth-api-keys.js';
import { MailModule } from './infrastructure/mail.module.js';
import { PrismaCourseAccessRepository } from './infrastructure/prisma-course-access.repository.js';
import { PrismaUserRepository } from './infrastructure/prisma-user.repository.js';

// Users, sign-in and who may read what. Better Auth serves /api/auth/* and
// guards every HTTP route; a route that needs no user says @AllowAnonymous()
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
  providers: [
    GrantCourseAccessHandler,
    RevokeCourseAccessHandler,
    ReadableCoursesHandler,
    ApiKeyUserHandler,
    { provide: ApiKeys, useClass: BetterAuthApiKeys },
    { provide: UserRepository, useClass: PrismaUserRepository },
    { provide: CourseAccessRepository, useClass: PrismaCourseAccessRepository },
  ],
})
export class IdentityModule {}
