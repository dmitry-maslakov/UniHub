// How often what a first read finds is asked for while it goes on
export const FIRST_SYNC_POLL_MS = 30_000;

type Source = { label: string; firstSync: boolean };

// The source whose account the user just linked and the hub is reading for
// the first time, if any
export const firstSyncOf = <T extends Source>(sources?: readonly T[]) =>
  sources?.find((source) => source.firstSync);

// a query's refetchInterval: every 30 s while a first read goes on, then
// not at all
export const whileFirstSync = (sources?: readonly Source[]) =>
  firstSyncOf(sources) ? FIRST_SYNC_POLL_MS : false;
