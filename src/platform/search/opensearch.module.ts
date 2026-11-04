import { Inject, Module, type OnApplicationShutdown } from '@nestjs/common';
import { ConfigModule, type ConfigType } from '@nestjs/config';
import { Client } from '@opensearch-project/opensearch';
import { opensearchConfig } from './opensearch.config.js';

export const OPENSEARCH = Symbol('OPENSEARCH');

// The OpenSearch client, for the modules that import it (only when search is
// on, so not global).
@Module({
  imports: [ConfigModule.forFeature(opensearchConfig)],
  providers: [
    {
      provide: OPENSEARCH,
      inject: [opensearchConfig.KEY],
      useFactory: ({ url }: ConfigType<typeof opensearchConfig>) =>
        // No retries of its own, after a timeout either: with one node it
        // would wait on the same stuck one again. The queue retries jobs.
        new Client({ node: url, maxRetries: 0 }),
    },
  ],
  exports: [OPENSEARCH],
})
export class OpenSearchModule implements OnApplicationShutdown {
  constructor(@Inject(OPENSEARCH) private readonly client: Client) {}

  onApplicationShutdown() {
    return this.client.close();
  }
}
