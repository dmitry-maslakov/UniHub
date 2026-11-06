import { PluginName } from '@app/kernel';
import { sha256 } from '../../../test/sha256.js';
import { ContentMembers } from './content-members.js';
import {
  InMemoryExpansions,
  InMemoryRepresentations,
  InMemoryTextReads,
} from './processing.fakes.js';
import { GetTextPageQuery, ListTextsQuery } from './queries.js';
import { GetTextPage, ListTexts } from './texts.js';

const labs = sha256('labs.zip');
const main = sha256('main.c');
const slides = sha256('slides.pdf');
const office = PluginName.parse('office-text');
const plain = PluginName.parse('plain-text');

// labs.zip holds lab/main.c and slides.pdf; plain-text read main.c, at
// version 1 and then 2, and office-text slides.pdf
async function texts() {
  const expansions = new InMemoryExpansions();
  await expansions.save({
    hash: labs,
    expander: PluginName.parse('archives'),
    version: 1,
    entries: [
      { path: 'lab/main.c', hash: main, size: 10 },
      { path: 'slides.pdf', hash: slides, size: 100 },
    ],
  });
  const representations = new InMemoryRepresentations();
  for (const saved of [
    { hash: main, processor: plain, version: 1, parts: ['old'] },
    { hash: main, processor: plain, version: 2, parts: ['int main;', '}'] },
    { hash: slides, processor: office, version: 2, parts: ['one', 'two'] },
  ])
    await representations.save(saved);
  const members = new ContentMembers(expansions);
  const reads = new InMemoryTextReads(representations);
  return {
    list: new ListTexts(members, reads),
    page: new GetTextPage(members, reads),
  };
}

describe('ListTexts', () => {
  it("lists a content's newest texts, an archive's of its entries", async () => {
    const { list } = await texts();

    expect(await list.execute(new ListTextsQuery(main))).toEqual([
      { processor: plain, version: 2, pages: 2 },
    ]);
    expect(await list.execute(new ListTextsQuery(labs))).toEqual([
      { processor: office, version: 2, pages: 2 },
      { processor: plain, version: 2, pages: 2 },
    ]);
  });
});

describe('GetTextPage', () => {
  it("reads a content's page as it is", async () => {
    const { page } = await texts();

    expect(await page.execute(new GetTextPageQuery(main, 2))).toEqual({
      processor: plain,
      version: 2,
      pages: 2,
      page: 2,
      text: '}',
    });
  });

  it("reads an archive's page under its entry's path, the first processor's unless one is named", async () => {
    const { page } = await texts();

    expect(await page.execute(new GetTextPageQuery(labs, 2))).toMatchObject({
      processor: office,
      text: 'slides.pdf\n\ntwo',
    });
    expect(
      await page.execute(new GetTextPageQuery(labs, 1, plain)),
    ).toMatchObject({
      processor: plain,
      pages: 2,
      text: 'lab/main.c\n\nint main;',
    });
  });

  it.each([0, 1.5, 3])('has no page %s', async (number) => {
    const { page } = await texts();
    expect(await page.execute(new GetTextPageQuery(labs, number))).toBeNull();
  });

  it('has no page of a processor that made none', async () => {
    const { page } = await texts();
    expect(
      await page.execute(
        new GetTextPageQuery(main, 1, PluginName.parse('nobody')),
      ),
    ).toBeNull();
  });
});
