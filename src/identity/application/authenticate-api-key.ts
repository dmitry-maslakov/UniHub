import { Injectable } from '@nestjs/common';
import { ApiKeys } from '../domain/api-keys.js';
import { ReaderRepository } from '../domain/reader.js';

// Whose an API key is: null for a key that doesn't verify, and for a banned
// user's, since a ban ends sessions but not keys.
@Injectable()
export class AuthenticateApiKey {
  constructor(
    private readonly keys: ApiKeys,
    private readonly readers: ReaderRepository,
  ) {}

  async run(key: string) {
    const found = await this.keys.verify(key);
    if (!found) return null;
    const reader = await this.readers.findById(found.userId);
    return reader && !reader.bannedAt() ? found : null;
  }
}
