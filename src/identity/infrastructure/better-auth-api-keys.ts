import { Injectable } from '@nestjs/common';
import { AuthService } from '@thallesp/nestjs-better-auth';
import type { Auth } from './better-auth.js';
import { ApiKeys } from '../domain/api-keys.js';

@Injectable()
export class BetterAuthApiKeys extends ApiKeys {
  constructor(private readonly auth: AuthService<Auth>) {
    super();
  }

  async verify(key: string) {
    const { valid, key: found } = await this.auth.api.verifyApiKey({
      body: { key },
    });
    return valid && found
      ? { keyId: found.id, userId: found.referenceId }
      : null;
  }
}
