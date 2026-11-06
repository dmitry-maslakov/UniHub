import { basename } from 'node:path';
import { Injectable } from '@nestjs/common';
import type { ContentHash } from '@app/kernel';
import { UnpackingRepository } from '../domain/unpacking.js';
import { FileFacts, type FileFact } from './ports.js';

// What processors take a content by: the files that hold it and aren't
// removed, and the members that hold it in the trees of containers such a
// file holds, each by its file name (the last step of its path).
@Injectable()
export class Holders {
  constructor(
    private readonly files: FileFacts,
    private readonly unpackings: UnpackingRepository,
  ) {}

  async of(hash: ContentHash): Promise<FileFact[]> {
    const files = (await this.files.holding(hash)).map(({ name, mime }) => ({
      name,
      mime,
    }));
    const members: FileFact[] = [];
    // a content common to many trees (an empty __init__.py) is often in
    // one container more than once
    const live = new Map<ContentHash, boolean>();
    for (const { container, path, mime } of await this.unpackings.holding(
      hash,
    )) {
      if (!live.has(container))
        live.set(container, (await this.files.holding(container)).length > 0);
      if (live.get(container)) members.push({ name: basename(path), mime });
    }
    return [...files, ...members];
  }
}
