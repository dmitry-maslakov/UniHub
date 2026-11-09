import type { INestApplication } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { PluginName } from '@app/kernel';
import { PrismaService } from '../src/platform/database/prisma.service.js';
import {
  GetPageTextsQuery,
  GetTextPageQuery,
  ListMembersQuery,
  ListTextsQuery,
} from '../src/processing/contracts.js';
import { UnpackingRepository } from '../src/processing/domain/unpacking.js';
import { bootApp } from './app.js';
import { processorsOn } from './fake-plugins.js';
import { sha256 } from './sha256.js';

// The processing module's texts as the database answers them: the newest
// version of each processor on, a version with no parts left out, the
// longest text first.

describe('texts read from the database', { timeout: 20_000 }, () => {
  let app: INestApplication;
  let queries: QueryBus;
  const hash = sha256('texts: a scanned lecture');
  const split = sha256('texts: a document split differently');
  const picture = sha256('texts: a picture');
  const blank = sha256('texts: a blank picture');
  const processor = (name: string) => PluginName.parse(name);

  beforeAll(async () => {
    app = await bootApp({
      imports: [processorsOn('office-text', 'ocr', 'zz-empty')],
    });
    queries = app.get(QueryBus);
    const prisma = app.get(PrismaService);
    const representation = (
      content: string,
      name: string,
      version: number,
      parts: string[],
    ) =>
      prisma.representation.create({
        data: { hash: content, processor: name, version, parts },
      });
    // office-text: its newest version is the shorter one, and the one that
    // counts; ocr: the longest text; zz-empty: its newest version found
    // nothing, so its older one is not a text either; aa-off is off
    await representation(hash, 'office-text', 1, ['an old, longer first page']);
    await representation(hash, 'office-text', 2, ['slide', 'second slide']);
    await representation(hash, 'ocr', 1, [
      '',
      'text read off the second slide',
    ]);
    await representation(hash, 'zz-empty', 1, ['old text']);
    await representation(hash, 'zz-empty', 2, []);
    await representation(hash, 'aa-off', 1, [
      'text of a processor that is off',
    ]);
    // one document, split into 3 by one processor and into 2 by another
    await representation(split, 'office-text', 1, ['a', 'b', 'c']);
    await representation(split, 'ocr', 1, [
      'much longer first',
      'much longer second',
    ]);
    // a picture in an archive, one read and one that held no text
    await representation(picture, 'ocr', 1, ['Računarske mreže']);
    await representation(blank, 'ocr', 1, []);
    await app.get(UnpackingRepository).save({
      hash: sha256('texts: an archive'),
      unpacker: processor('archives'),
      version: 1,
      policy: 1,
      members: [
        { path: 'a.png', hash: picture, size: 1, mime: null, leftOut: null },
        { path: 'b.png', hash: blank, size: 1, mime: null, leftOut: null },
      ],
      cutShort: null,
    });
  });

  afterAll(() => app.close());

  it("lists each processor's newest text, the largest first, none that has no parts", async () => {
    expect(await queries.execute(new ListTextsQuery(hash))).toEqual([
      { processor: 'ocr', version: 1, pages: 2 },
      { processor: 'office-text', version: 2, pages: 2 },
    ]);
  });

  it("reads a page's longest text when no processor is named", async () => {
    expect(await queries.execute(new GetTextPageQuery(hash, 2))).toEqual({
      processor: 'ocr',
      version: 1,
      pages: 2,
      page: 2,
      text: 'text read off the second slide',
    });
    // ocr found nothing on page 1
    expect(await queries.execute(new GetTextPageQuery(hash, 1))).toMatchObject({
      processor: 'office-text',
      text: 'slide',
    });
  });

  it('reads the page of the processor named, as it did', async () => {
    expect(
      await queries.execute(
        new GetTextPageQuery(hash, 2, processor('office-text')),
      ),
    ).toMatchObject({
      processor: 'office-text',
      version: 2,
      text: 'second slide',
    });
    for (const [page, name] of [
      [3, 'office-text'],
      [0, 'office-text'],
      [1.5, 'office-text'],
      [1, 'aa-off'],
      [1, 'zz-empty'],
    ] as const)
      expect(
        await queries.execute(
          new GetTextPageQuery(hash, page, processor(name)),
        ),
      ).toBeNull();
    expect(await queries.execute(new GetTextPageQuery(hash, 3))).toBeNull();
  });

  it('answers from the processor that splits the most when they differ', async () => {
    // ocr's page 2 is longer, but it is another split of the document
    expect(await queries.execute(new GetTextPageQuery(split, 2))).toMatchObject(
      { processor: 'office-text', pages: 3, text: 'b' },
    );
    expect(await queries.execute(new GetTextPageQuery(split, 3))).toMatchObject(
      { processor: 'office-text', text: 'c' },
    );
    expect(await queries.execute(new GetTextPageQuery(split, 4))).toBeNull();
    // named, each has its own
    expect(
      await queries.execute(new GetTextPageQuery(split, 2, processor('ocr'))),
    ).toMatchObject({ text: 'much longer second' });
    // every row that has the page is still every row
    expect(
      (await queries.execute(new GetPageTextsQuery(split, 2))).map(
        (t) => t.processor,
      ),
    ).toEqual(['ocr', 'office-text']);
  });

  it('reads every text of a page, the longest first', async () => {
    expect(await queries.execute(new GetPageTextsQuery(hash, 2))).toEqual([
      expect.objectContaining({ processor: 'ocr', text: expect.any(String) }),
      expect.objectContaining({
        processor: 'office-text',
        text: 'second slide',
      }),
    ]);
    // a page whose text is empty is a row, last
    expect(
      (await queries.execute(new GetPageTextsQuery(hash, 1))).map((t) => [
        t.processor,
        t.text,
      ]),
    ).toEqual([
      ['office-text', 'slide'],
      ['ocr', ''],
    ]);
    expect(await queries.execute(new GetPageTextsQuery(hash, 3))).toEqual([]);
    expect(await queries.execute(new GetPageTextsQuery(hash, 0))).toEqual([]);
  });

  it("lists a member's texts only if it has parts", async () => {
    const members = await queries.execute(
      new ListMembersQuery(sha256('texts: an archive'), 0, 10),
    );

    expect(members.map(({ path, texts }) => [path, texts])).toEqual([
      ['a.png', [{ processor: 'ocr', version: 1, pages: 1 }]],
      ['b.png', []],
    ]);
  });
});
