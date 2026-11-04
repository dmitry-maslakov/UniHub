import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { GrpcDataLossException } from '@nestjs/microservices';
import { MalformedRecordError } from '../../domain/errors.js';
import type { ContentChunk__Output } from './generated/unihub/ingest/v1/ContentChunk.js';

const malformed = (issue: string) => new MalformedRecordError([issue]);

// The Content stream: the file's id, its bytes, then their sha256. The bytes
// are passed on as they come, read only as fast as they are taken, so gRPC
// flow control holds the connector back instead of the hub buffering the
// file. They fail unless the stream ends with a matching sha256, so an
// upload cut off halfway never passes for the whole file.
export async function verifiedContent(
  chunks: AsyncIterable<ContentChunk__Output>,
) {
  const messages = chunks[Symbol.asyncIterator]();
  const first = await messages.next();
  if (first.done || !first.value.externalId)
    throw malformed('the first message names the file');
  const rest = { [Symbol.asyncIterator]: () => messages };
  return {
    externalId: first.value.externalId,
    content: Readable.from(verified(rest)),
  };
}

async function* verified(messages: AsyncIterable<ContentChunk__Output>) {
  const hash = createHash('sha256');
  let sha256: string | undefined;
  for await (const { data, sha256: sent } of messages) {
    if (sha256 !== undefined) throw malformed('sha256 is the last message');
    if (data) {
      hash.update(data);
      yield data;
      continue;
    }
    if (sent === undefined)
      throw malformed('after the file id: data, then sha256');
    sha256 = sent;
  }
  if (sha256 === undefined) throw malformed('the content ends with its sha256');
  if (sha256.toLowerCase() !== hash.digest('hex'))
    throw new GrpcDataLossException('content does not match sha256');
}
