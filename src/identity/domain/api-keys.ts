// keys users make for MCP clients; Better Auth keeps them
export abstract class ApiKeys {
  // null for a key that doesn't exist, expired or was turned off
  abstract verify(
    key: string,
  ): Promise<{ keyId: string; userId: string } | null>;
}
