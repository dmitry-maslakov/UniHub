import type { Message } from '@app/plugin-sdk';
import type { PluginName } from '@app/kernel';

// one job per (message, plugin), so a failing plugin only retries itself
export const PLUGINS_QUEUE = 'plugins';

export interface PluginJob {
  plugin: PluginName;
  message: Message;
}
