import { defineConfig } from 'vitest/config';
import { testEnv } from './test/env.js';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    // the files share one database
    fileParallelism: false,
    env: testEnv,
    globalSetup: './test/global-setup.ts',
  },
});
