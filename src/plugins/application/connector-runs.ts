// How a connector's run came out: a poll succeeded or failed; a push run,
// meant to keep its connection until it's stopped, ended or failed (and runs
// again). A push run stopped at shutdown isn't counted.
export type RunOutcome = 'succeeded' | 'failed' | 'ended';

// The connectors' runs, for monitoring (README, Metrics): by portal, never
// by account, which may name a user.
export abstract class ConnectorRuns {
  abstract ended(portal: string, outcome: RunOutcome): void;
}
