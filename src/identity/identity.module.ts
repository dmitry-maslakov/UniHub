import type { ClientMetadataResourceFetch } from '@better-auth/oauth-provider';
import { Module } from '@nestjs/common';
import { ConfigModule, type ConfigType } from '@nestjs/config';
import { EventBus } from '@nestjs/cqrs';
import { AuthModule } from '@thallesp/nestjs-better-auth';
import { PrismaService } from '../platform/database/prisma.service.js';
import { AuthenticateAgent } from './application/authenticate-agent.js';
import {
  GrantCourseAccessHandler,
  RevokeCourseAccessHandler,
} from './application/course-access.handlers.js';
import { IsAdminHandler } from './application/is-admin.handler.js';
import { ReadScopeHandler } from './application/read-scope.handler.js';
import { AccessTokens } from './domain/access-tokens.js';
import { ApiKeys } from './domain/api-keys.js';
import { CourseAccessRepository } from './domain/course-access.js';
import { UserDeletedEvent } from './domain/events.js';
import { Mailer } from './domain/mailer.js';
import { ReaderRepository } from './domain/reader.js';
import { identityConfig } from './identity.config.js';
import { createAuth } from './infrastructure/better-auth.js';
import { BetterAuthAccessTokens } from './infrastructure/better-auth-access-tokens.js';
import { BetterAuthApiKeys } from './infrastructure/better-auth-api-keys.js';
import {
  CLIENT_METADATA_FETCH,
  ClientMetadataModule,
} from './infrastructure/client-metadata.module.js';
import { WellKnownController } from './infrastructure/http/well-known.controller.js';
import { MailModule } from './infrastructure/mail.module.js';
import {
  McpResource,
  mcpSettings,
  TrustedOrigins,
} from './infrastructure/mcp-settings.js';
import { PrismaCourseAccessRepository } from './infrastructure/prisma-course-access.repository.js';
import { PrismaReaderRepository } from './infrastructure/prisma-reader.repository.js';
import { SignInMethodsController } from './infrastructure/http/sign-in-methods.controller.js';

// Users, sign-in and who may read what. Better Auth serves /api/auth/* and
// guards every HTTP route; a route that needs no user says @AllowAnonymous().
// It is the OAuth authorization server for MCP clients too, its discovery
// documents under /.well-known.
// Uses no other module: courses are catalog's, known here by id only (access
// checks a course exists before it grants it), and a user's delete goes out
// as an event to whichever keeps something of them (accounts).
@Module({
  imports: [
    AuthModule.forRootAsync({
      imports: [
        MailModule,
        ClientMetadataModule,
        ConfigModule.forFeature(identityConfig),
      ],
      inject: [
        PrismaService,
        identityConfig.KEY,
        Mailer,
        CLIENT_METADATA_FETCH,
        EventBus,
      ],
      useFactory: (
        prisma: PrismaService,
        config: ConfigType<typeof identityConfig>,
        mailer: Mailer,
        fetchClientMetadata: ClientMetadataResourceFetch,
        events: EventBus,
      ) => ({
        auth: createAuth({
          prisma,
          mailer,
          secret: config.secret,
          baseURL: config.baseURL,
          trustedOrigins: config.trustedOrigins,
          google: config.google,
          fetchClientMetadata,
          onUserDeleted: (userId) =>
            events.publish(new UserDeletedEvent(userId)),
        }),
        // the hub's own routes take JSON only, which no form on another
        // site can send with the user's cookie (Better Auth checks Origin)
        bodyParser: { urlencoded: { enabled: false } },
      }),
    }),
    ConfigModule.forFeature(identityConfig),
  ],
  controllers: [SignInMethodsController, WellKnownController],
  providers: [
    GrantCourseAccessHandler,
    RevokeCourseAccessHandler,
    ReadScopeHandler,
    IsAdminHandler,
    AuthenticateAgent,
    ...mcpSettings,
    { provide: ApiKeys, useClass: BetterAuthApiKeys },
    { provide: AccessTokens, useClass: BetterAuthAccessTokens },
    { provide: ReaderRepository, useClass: PrismaReaderRepository },
    { provide: CourseAccessRepository, useClass: PrismaCourseAccessRepository },
  ],
  // for AgentGuard and AgentChallengeFilter, wherever a route says
  // @McpAuth(), and for MCP's Origin check
  exports: [AuthenticateAgent, McpResource, TrustedOrigins],
})
export class IdentityModule {}
