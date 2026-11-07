// The address an AI app is given: this hub's MCP endpoint, which the app
// finds the sign-in of by itself
export const mcpUrl = (origin = window.location.origin) =>
  new URL('/api/mcp', origin).href;

// Claude Code's way of adding it
export const claudeCodeCommand = (url: string) =>
  `claude mcp add --transport http unihub ${url}`;
