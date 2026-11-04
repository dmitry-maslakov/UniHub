import { Injectable } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import type { ContentHash } from '@app/kernel';
import {
  GetFileQuery,
  ListFilesOfContentQuery,
  ListFilesWithContentQuery,
  type FileDto,
} from '../../catalog/contracts.js';
import { FileFacts } from '../application/ports.js';

const PAGE = 500;

const factOf = ({ name, mime }: FileDto) => ({ name, mime });

@Injectable()
export class CatalogFileFacts extends FileFacts {
  constructor(private readonly queries: QueryBus) {
    super();
  }

  async file(id: string) {
    const file = await this.queries.execute(new GetFileQuery(id));
    // catalog keeps a removed file, marked so
    if (!file || file.removed) return null;
    return { ...factOf(file), hash: file.contentHash };
  }

  async holding(hash: ContentHash) {
    const files = await this.queries.execute(new ListFilesOfContentQuery(hash));
    return files.map(factOf);
  }

  async *withContent() {
    let after: string | null = null;
    for (;;) {
      const files: FileDto[] = await this.queries.execute(
        new ListFilesWithContentQuery(after, PAGE),
      );
      for (const file of files)
        if (file.contentHash) yield { ...factOf(file), hash: file.contentHash };
      if (files.length < PAGE) return;
      after = files[files.length - 1].id;
    }
  }
}
