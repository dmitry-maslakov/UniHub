import { McpStrategy, StreamableHttpTransport } from '@rekog/mcp-nest';

// One transport, shared with McpHttpController so the route is a real Nest
// controller behind guards (the transport then doesn't mount itself). Module
// level because McpHttpControllerFor needs it when the class is defined; so
// one app per process: the strategy builds its tools once.
export const mcpTransport = new StreamableHttpTransport();

export const mcp = new McpStrategy({
  name: 'unihub',
  version: '1.0.0',
  transports: [mcpTransport],
});
