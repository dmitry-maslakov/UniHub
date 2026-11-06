import { z } from 'zod';
import { PluginName } from '@app/kernel';
import { list, settings } from '../platform/config/settings.js';

// a length of time, in the unit its name says
const duration = z.coerce.number().positive();
// whole minutes, from `min` to a day
const minutes = (min: number) => z.coerce.number().int().min(min).max(1440);

export const pluginsSettings = z
  .object({
    // built-in plugins to turn on, by name: "office-text, moodle"
    PLUGINS: list.pipe(z.array(PluginName)),
    // this process starts push connectors, if it runs the background work
    // (APP_ROLE): of several workers, one should
    RUN_CONNECTORS: z.stringbool().default(true),
    // a poll running longer is taken for hung: aborted, and the next one
    // goes on from the state it saved
    CONNECTOR_POLL_TIMEOUT_MINUTES: duration.default(60),
    // how long shutdown waits for a push connector to stop
    CONNECTOR_STOP_SECONDS: duration.default(10),
    // a push connector that ended or failed runs again after a second, then
    // twice as long each time it ends soon again, up to this; one that ran
    // longer than this starts over at a second
    CONNECTOR_RESTART_MAX_SECONDS: duration.default(60),
    // polls run at once by one worker process, so a small portal isn't
    // asked too much at a time: each run asks one thing at a time
    CONNECTOR_CONCURRENCY: z.coerce.number().int().min(1).max(64).default(4),
    // Users' own accounts (README, Portal accounts): each passes every
    // VIEW_MINUTES on a grid of its own, what a pass finds shows
    // PUBLISH_DELAY_MINUTES after its slot (or at a later slot, should it
    // end past that), and content HOLD_MINUTES after that
    VIEW_MINUTES: minutes(5).default(60),
    PUBLISH_DELAY_MINUTES: minutes(0).default(10),
    HOLD_MINUTES: minutes(0).default(15),
  })
  .refine((env) => env.PUBLISH_DELAY_MINUTES < env.VIEW_MINUTES, {
    path: ['PUBLISH_DELAY_MINUTES'],
    message: 'shorter than VIEW_MINUTES, so a pass shows before the next',
  })
  .transform((env) => ({
    enabled: env.PLUGINS,
    runConnectors: env.RUN_CONNECTORS,
    pollTimeoutMs: env.CONNECTOR_POLL_TIMEOUT_MINUTES * 60_000,
    stopTimeoutMs: env.CONNECTOR_STOP_SECONDS * 1_000,
    restartMaxMs: env.CONNECTOR_RESTART_MAX_SECONDS * 1_000,
    concurrency: env.CONNECTOR_CONCURRENCY,
    publishing: {
      slotMs: env.VIEW_MINUTES * 60_000,
      delayMs: env.PUBLISH_DELAY_MINUTES * 60_000,
      holdMs: env.HOLD_MINUTES * 60_000,
    },
  }));

export const pluginsConfig = settings('plugins', pluginsSettings);
