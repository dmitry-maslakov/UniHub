import { Module } from '@nestjs/common';
import { ConfigModule, type ConfigType } from '@nestjs/config';
import { PluginsModule } from '../plugins/contracts.js';
import { accountsConfig } from './accounts.config.js';
import {
  AccountCredentialHandler,
  AccountRejectedHandler,
  AdoptAccountsHandler,
  PortalReadersHandler,
} from './application/plugin-ports.handlers.js';
import { HiddenCourses } from './application/hidden-courses.js';
import {
  HideCoursesHandler,
  ShowCoursesHandler,
} from './application/hidden-courses.handlers.js';
import { PortalAccounts } from './application/portal-accounts.js';
import { PortalPicks } from './application/portal-picks.js';
import { PortalLinksHandler } from './application/portal-links.handler.js';
import { UserDeletedHandler } from './application/user-deleted.handler.js';
import { UserPortalsHandler } from './application/user-portals.handler.js';
import { ViewingAccountsHandler } from './application/viewing-accounts.handler.js';
import { WantedCoursesHandler } from './application/wanted-courses.handler.js';
import { HiddenCourseRepository } from './domain/hidden-courses.js';
import { CredentialVault } from './domain/credential-vault.js';
import { PickRepository } from './domain/picks.js';
import { PortalAccountRepository } from './domain/portal-account.js';
import { PortalLinks } from './domain/portal-links.js';
import { AesGcmVault } from './infrastructure/aes-gcm.vault.js';
import { PicksController } from './infrastructure/http/picks.controller.js';
import { PortalAccountsController } from './infrastructure/http/portal-accounts.controller.js';
import { PortalCatalogController } from './infrastructure/http/portal-catalog.controller.js';
import { PrismaHiddenCourseRepository } from './infrastructure/prisma-hidden-course.repository.js';
import { PrismaPickRepository } from './infrastructure/prisma-pick.repository.js';
import { PrismaPortalAccountRepository } from './infrastructure/prisma-portal-account.repository.js';

// Users' own accounts of portals (README, Portal accounts): how each
// portal's are linked (PORTAL_LINKS), the token a user sets, sealed apart
// from the account, and who that is on the portal, as its connector says
// (plugins), and which of them a user reads through (ViewingAccountsQuery,
// for access) and how each stands (UserPortalsQuery, catalog saying whether
// its first pass showed yet); every portal is shared unless PORTAL_LINKS
// says otherwise.
// Of a public portal, read whole by everyone through its one account, the
// courses each user picks of its catalog (from catalog) to show among
// their own, and those its connector is asked to sync, all of them
// (WantedCoursesQuery, for ingest). Answers plugins which accounts
// a portal's runs are for, with their credentials, and tells it as they're
// linked and go. Asks identity whether a user is an admin, and drops a
// deleted user's accounts when it says so. Asks access which course of the
// user's own a pick goes with, and which it may (OwnPortalCourseQuery,
// PickMatchesQuery).
// Of all a user reads, the portal courses they hide (HiddenCourses), which
// access hides and shows (HideCoursesCommand, ShowCoursesCommand) and
// reads with the rest.
@Module({
  imports: [ConfigModule.forFeature(accountsConfig), PluginsModule],
  controllers: [
    PortalAccountsController,
    PortalCatalogController,
    PicksController,
  ],
  providers: [
    {
      provide: PortalLinks,
      inject: [accountsConfig.KEY],
      useFactory: ({ links, labels }: ConfigType<typeof accountsConfig>) =>
        new PortalLinks(links, labels),
    },
    { provide: CredentialVault, useClass: AesGcmVault },
    {
      provide: PortalAccountRepository,
      useClass: PrismaPortalAccountRepository,
    },
    { provide: PickRepository, useClass: PrismaPickRepository },
    { provide: HiddenCourseRepository, useClass: PrismaHiddenCourseRepository },
    PortalAccounts,
    PortalPicks,
    HiddenCourses,
    HideCoursesHandler,
    ShowCoursesHandler,
    UserDeletedHandler,
    ViewingAccountsHandler,
    UserPortalsHandler,
    PortalLinksHandler,
    WantedCoursesHandler,
    PortalReadersHandler,
    AccountCredentialHandler,
    AccountRejectedHandler,
    AdoptAccountsHandler,
  ],
})
export class AccountsModule {}
