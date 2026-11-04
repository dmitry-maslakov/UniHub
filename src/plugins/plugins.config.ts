import { z } from 'zod';
import { PluginName } from '@app/kernel';
import { list, settings } from '../platform/config/settings.js';

// a length of time, in the unit its name says
const duration = z.coerce.number().positive();

export const pluginsSettings = z
  .object({
    // built-in plugins to turn on, by name: "office-text, acs"
    PLUGINS: list.pipe(z.array(PluginName)),
    // this instance starts push connectors (one instance should)
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
  })
  .transform((env) => ({
    enabled: env.PLUGINS,
    runConnectors: env.RUN_CONNECTORS,
    pollTimeoutMs: env.CONNECTOR_POLL_TIMEOUT_MINUTES * 60_000,
    stopTimeoutMs: env.CONNECTOR_STOP_SECONDS * 1_000,
    restartMaxMs: env.CONNECTOR_RESTART_MAX_SECONDS * 1_000,
  }));

export const pluginsConfig = settings('plugins', pluginsSettings);
