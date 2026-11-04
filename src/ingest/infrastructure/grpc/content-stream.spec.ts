import { createHash } from 'node:crypto';
import { text } from 'node:stream/consumers';
import { GrpcDataLossException } from '@nestjs/microservices';
import { MalformedRecordError } from '../../domain/errors.js';
import { verifiedContent } from './content-stream.js';
import type { ContentChunk__Output } from './generated/unihub/ingest/v1/ContentChunk.js';

const sha256 = (data: string) =>
  createHash('sha256').update(data).digest('hex');
const data = (piece: string) => ({ data: Buffer.from(piece) });

// the messages of one Content call, then the bytes it hands on
async function read(...messages: ContentChunk__Output[]) {
  async function* call() {
    yield* messages;
  }
  const { externalId, content } = await verifiedContent(call());
  return { externalId, content: await text(content) };
}

describe('verifiedContent', () => {
  it("hands on a file's bytes that match their sha256", async () => {
    expect(
      await read({ externalId: 'f1' }, data('slides '), data('v1'), {
        sha256: sha256('slides v1').toUpperCase(),
      }),
    ).toEqual({ externalId: 'f1', content: 'slides v1' });
    expect(await read({ externalId: 'empty' }, { sha256: sha256('') })).toEqual(
      { externalId: 'empty', content: '' },
    );
  });

  it("fails the bytes that don't match, so none of them are kept", async () => {
    await expect(
      read({ externalId: 'f1' }, data('bytes'), { sha256: sha256('other') }),
    ).rejects.toBeInstanceOf(GrpcDataLossException);
  });

  it('refuses a stream out of order', async () => {
    for (const messages of [
      [],
      [data('no id')],
      [{ externalId: 'f1' }, data('no hash')],
      [{ externalId: 'f1' }, { externalId: 'again' }],
      [{ externalId: 'f1' }, { sha256: sha256('') }, data('late')],
    ])
      await expect(read(...messages)).rejects.toBeInstanceOf(
        MalformedRecordError,
      );
  });
});
