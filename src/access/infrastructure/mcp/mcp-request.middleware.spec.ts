import {
  BadRequestException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { McpRequestMiddleware } from './mcp-request.middleware.js';

// a request as express hands it on: is() says whether the body is JSON,
// null when there is no body at all
const request = (method: string, json: boolean | null, body?: unknown) =>
  ({ method, is: () => json, body }) as unknown as Request;

function use(req: Request) {
  const next = vi.fn();
  new McpRequestMiddleware().use(req, {} as Response, next);
  return next;
}

describe('McpRequestMiddleware', () => {
  it('passes one JSON-RPC message on, and what has no body', () => {
    for (const req of [
      request('POST', true, { jsonrpc: '2.0', id: 1, method: 'tools/list' }),
      request('POST', null),
      request('GET', false),
    ])
      expect(use(req)).toHaveBeenCalledOnce();
  });

  it('turns away a body that is not JSON', () => {
    expect(() => use(request('POST', false, 'x'.repeat(10)))).toThrow(
      UnsupportedMediaTypeException,
    );
  });

  it('turns away a batch, which would count as one call', () => {
    const message = { jsonrpc: '2.0', method: 'tools/list' };
    expect(() =>
      use(request('POST', true, [message, { ...message, id: 2 }])),
    ).toThrow(BadRequestException);
  });
});
