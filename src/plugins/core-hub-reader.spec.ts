import type { QueryBus } from '@nestjs/cqrs';
import type { BlobStore } from '../storage/contracts.js';
import { CoreHubReader } from './core-hub-reader.js';

describe('CoreHubReader', () => {
  it('rejects a malformed hash rather than throwing', () => {
    const reader = new CoreHubReader({} as QueryBus, {} as BlobStore);

    // a plugin's .catch() or allSettled() has to see it
    const read = reader.content('not a hash');
    return expect(read).rejects.toThrow('not a sha256 in hex');
  });
});
