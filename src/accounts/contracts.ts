// The only file other modules import from accounts. Not the module itself:
// its controller takes access's limits, and access imports this file, so
// the module here would make the two barrels load each other. AppModule
// imports it from its own file.
export { ViewingAccountsQuery } from './application/queries.js';
export type { Viewing } from './application/portal-accounts.js';
