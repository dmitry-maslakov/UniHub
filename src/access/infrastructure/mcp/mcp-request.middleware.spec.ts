import {
  BadRequestException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { TrustedOrigins } from '../../../identity/contracts.js';
import { McpRequestMiddleware } from './mcp-request.middleware.js';

// a request as express hands it on: is() says whether the body is JSON,
// null when there is no body at all
const request = (
  method: string,
  json: boolean | null,
  body?: unknown,
  origin?: string,
) =>
  ({
    method,
    is: () => json,
    body,
    header: (name: string) => (name === 'origin' ? origin : undefined),
  }) as unknown as Request;

function use(req: Request) {
  const next = vi.fn();
  const res = { status: vi.fn(), json: vi.fn() };
  res.status.mockReturnValue(res);
  new McpRequestMiddleware(new TrustedOrigins(['hub.example'])).use(
    req,
    res as unknown as Response,
    next,
  );
  return { next, res };
}

describe('McpRequestMiddleware', () => {
  const message = { jsonrpc: '2.0', id: 1, method: 'tools/list' };

  it('passes one JSON-RPC message on, and what has no body', () => {
    for (const req of [
      request('POST', true, message),
      request('POST', null),
      request('GET', false),
    ])
      expect(use(req).next).toHaveBeenCalledOnce();
  });

  it('turns away a body that is not JSON', () => {
    expect(() => use(request('POST', false, 'x'.repeat(10)))).toThrow(
      UnsupportedMediaTypeException,
    );
  });

  it('turns away a batch, which would count as one call', () => {
    expect(() =>
      use(request('POST', true, [message, { ...message, id: 2 }])),
    ).toThrow(BadRequestException);
  });

  it("passes the hub's own pages and clients that send no Origin", () => {
    for (const origin of [undefined, 'https://hub.example'])
      expect(
        use(request('POST', true, message, origin)).next,
      ).toHaveBeenCalledOnce();
  });

  it("turns away another site's page with a JSON-RPC error", () => {
    for (const origin of ['https://evil.example', 'null']) {
      const { next, res } = use(request('POST', true, message, origin));
      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        jsonrpc: '2.0',
        error: { code: -32000, message: expect.any(String) },
        id: null,
      });
    }
  });
});
