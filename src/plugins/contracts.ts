// the only file other modules import from plugins
export { PluginsModule } from './plugins.module.js';
export { PluginCatalog } from './application/plugin-catalog.js';
export { InstanceAdoption } from './application/instance-adoption.js';
export { SyncConnectionCommand } from './application/sync-connection.command.js';
export {
  AccountCredentialQuery,
  AccountRejectedCommand,
  AdoptAccountsCommand,
  AccountsChangedCommand,
  PortalReadersQuery,
  type AccountCredential,
  type PortalReaders,
} from './application/accounts.js';
