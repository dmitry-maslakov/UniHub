// The only file other modules import from accounts. Not the module itself:
// its controller takes access's limits, and access imports this file, so
// the module here would make the two barrels load each other. AppModule
// imports it from its own file.
export {
  PortalLinksQuery,
  UserPortalsQuery,
  ViewingAccountsQuery,
  WantedCoursesQuery,
} from './application/queries.js';
export {
  HideCoursesCommand,
  ShowCoursesCommand,
} from './application/commands.js';
export type { PortalView, Viewing } from './application/portal-accounts.js';
// how a name is matched against words, as the catalog does, for lists that
// search names
export { nameHas } from './domain/catalog-page.js';
