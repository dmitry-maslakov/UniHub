import { createHash } from 'node:crypto';
import { ContentHash } from '@app/kernel';

// the hash the hub keeps content under, of real content: a made-up one would
// pass where the real one wouldn't
export const sha256 = (content: string | Buffer) =>
  ContentHash.parse(createHash('sha256').update(content).digest('hex'));
