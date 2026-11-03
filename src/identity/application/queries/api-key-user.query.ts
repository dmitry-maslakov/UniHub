import { Query } from '@nestjs/cqrs';

// whose key this is; null for a bad key or a banned user
export class ApiKeyUserQuery extends Query<{
  userId: string;
  keyId: string;
} | null> {
  constructor(public readonly key: string) {
    super();
  }
}
