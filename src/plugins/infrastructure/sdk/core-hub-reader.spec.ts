import type { QueryBus } from '@nestjs/cqrs';
import type { ContentHash } from '@app/kernel';
import type { BlobStore } from '../../../storage/contracts.js';
import { CoreHubReader } from './core-hub-reader.js';

describe('CoreHubReader', () => {
  it('rejects what the store refuses rather than throwing', () => {
    // the store checks a hash again before it makes a path of it
    const blobs = {
      get: () => {
        throw new Error('not a sha256 in hex');
      },
    } as unknown as BlobStore;
    const reader = new CoreHubReader({} as QueryBus, blobs);

    // a plugin's .catch() or allSettled() has to see it
    const read = reader.content('not a hash' as ContentHash);
    return expect(read).rejects.toThrow('not a sha256 in hex');
  });
});
