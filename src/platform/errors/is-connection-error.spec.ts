import { Prisma } from '../../generated/prisma/client.js';
import { isConnectionError } from './is-connection-error.js';

const prismaError = (code: string) =>
  new Prisma.PrismaClientKnownRequestError('failed', {
    code,
    clientVersion: Prisma.prismaVersion.client,
  });

describe('isConnectionError', () => {
  it('knows postgres and redis being down', () => {
    expect(isConnectionError(prismaError('P1001'))).toBe(true);
    expect(
      isConnectionError(
        Object.assign(new Error('x'), { code: 'ECONNREFUSED' }),
      ),
    ).toBe(true);
    expect(isConnectionError(new Error('Connection is closed.'))).toBe(true);
  });

  it("knows a server fetch couldn't reach, or that hung up", () => {
    for (const code of ['UND_ERR_SOCKET', 'UND_ERR_CONNECT_TIMEOUT'])
      expect(isConnectionError(Object.assign(new Error('x'), { code }))).toBe(
        true,
      );
  });

  it("doesn't take a bug for an outage", () => {
    expect(isConnectionError(prismaError('P2002'))).toBe(false);
    expect(isConnectionError(new TypeError('x is undefined'))).toBe(false);
  });
});
