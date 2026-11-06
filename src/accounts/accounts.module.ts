import { Module } from '@nestjs/common';
import { ConfigModule, type ConfigType } from '@nestjs/config';
import { PluginsModule } from '../plugins/contracts.js';
import { accountsConfig } from './accounts.config.js';
import {
  AccountCredentialHandler,
  AccountRejectedHandler,
  PortalReadersHandler,
} from './application/plugin-ports.handlers.js';
import { PortalAccounts } from './application/portal-accounts.js';
import { UserDeletedHandler } from './application/user-deleted.handler.js';
import { ViewingAccountsHandler } from './application/viewing-accounts.handler.js';
import { CredentialVault } from './domain/credential-vault.js';
import { PortalAccountRepository } from './domain/portal-account.js';
import { PortalLinks } from './domain/portal-links.js';
import { AesGcmVault } from './infrastructure/aes-gcm.vault.js';
import { PortalAccountsController } from './infrastructure/http/portal-accounts.controller.js';
import { PrismaPortalAccountRepository } from './infrastructure/prisma-portal-account.repository.js';

// Users' own accounts of portals (README, Portal accounts): how each
// portal's are linked (PORTAL_LINKS), the token a user sets, sealed apart
// from the account, and who that is on the portal, as its connector says
// (plugins), and which of them a user reads through (ViewingAccountsQuery,
// for access); every portal is shared unless PORTAL_LINKS says otherwise.
// Answers plugins which accounts a portal's runs are for, with their
// credentials, and tells it as they're linked and go. Asks identity
// whether a user is an admin, and drops a deleted user's accounts when it
// says so.
@Module({
  imports: [ConfigModule.forFeature(accountsConfig), PluginsModule],
  controllers: [PortalAccountsController],
  providers: [
    {
      provide: PortalLinks,
      inject: [accountsConfig.KEY],
      useFactory: ({ links }: ConfigType<typeof accountsConfig>) =>
        new PortalLinks(links),
    },
    { provide: CredentialVault, useClass: AesGcmVault },
    {
      provide: PortalAccountRepository,
      useClass: PrismaPortalAccountRepository,
    },
    PortalAccounts,
    UserDeletedHandler,
    ViewingAccountsHandler,
    PortalReadersHandler,
    AccountCredentialHandler,
    AccountRejectedHandler,
  ],
})
export class AccountsModule {}
