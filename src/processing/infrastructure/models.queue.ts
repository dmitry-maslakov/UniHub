// The jobs of heavy processors (ContentProcessorOptions.heavy) wait here
// until a process with APP_ROLE=models drains them: no other role reads it.
// Same job shape as PLUGINS_QUEUE's.
export const MODELS_QUEUE = 'models';
