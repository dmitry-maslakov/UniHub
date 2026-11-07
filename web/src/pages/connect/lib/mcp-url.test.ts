import { describe, expect, it } from 'vitest';
import { claudeCodeCommand, mcpUrl } from './mcp-url';

describe('the MCP address', () => {
  it("gives this hub's MCP address and the Claude Code command for it", () => {
    expect(mcpUrl('https://uni.test')).toBe('https://uni.test/api/mcp');
    expect(mcpUrl('http://localhost:3000/some/page?x=1')).toBe(
      'http://localhost:3000/api/mcp',
    );
    expect(claudeCodeCommand('https://uni.test/api/mcp')).toBe(
      'claude mcp add --transport http unihub https://uni.test/api/mcp',
    );
  });
});
