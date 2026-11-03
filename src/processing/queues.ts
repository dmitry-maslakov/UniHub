import type { Message } from '@app/plugin-sdk';

// one job per (message, plugin), so a failing plugin only retries itself
export const PLUGINS_QUEUE = 'plugins';

export interface PluginJob {
  plugin: string;
  message: Message;
}
