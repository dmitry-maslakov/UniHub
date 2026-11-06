import { PluginName } from '@app/kernel';
import { sha256 } from '../../../test/sha256.js';
import {
  contentTexts,
  headed,
  locate,
  pageIn,
  type Member,
} from './content-texts.js';

const labs = sha256('labs.zip');
const main = sha256('main.c');
const slides = sha256('slides.pdf');
const office = PluginName.parse('office-text');
const plain = PluginName.parse('plain-text');

const members: Member[] = [
  { path: null, hash: labs },
  { path: 'lab/main.c', hash: main },
  { path: 'slides.pdf', hash: slides },
  { path: 'copy/main.c', hash: main },
];

const texts = contentTexts(members, [
  { hash: slides, processor: office, version: 2, pages: 3 },
  { hash: main, processor: plain, version: 1, pages: 2 },
]);

describe('contentTexts', () => {
  it("is each processor's text of the members in turn, by name", () => {
    expect(
      texts.map(({ processor, version, pages }) => [processor, version, pages]),
    ).toEqual([
      [office, 2, 3],
      [plain, 1, 4],
    ]);
    expect(texts[1].parts.map(({ member }) => member.path)).toEqual([
      'lab/main.c',
      'copy/main.c',
    ]);
  });

  it("is a content's own text when it has no entries", () => {
    expect(
      contentTexts(
        [{ path: null, hash: main }],
        [{ hash: main, processor: plain, version: 1, pages: 2 }],
      ),
    ).toEqual([
      {
        processor: plain,
        version: 1,
        pages: 2,
        parts: [{ member: { path: null, hash: main }, version: 1, pages: 2 }],
      },
    ]);
  });

  it('is the newest version of its parts', () => {
    const [text] = contentTexts(members.slice(1, 2), [
      { hash: main, processor: plain, version: 3, pages: 1 },
    ]);
    expect(text.version).toBe(3);
  });
});

describe('locate', () => {
  it('finds a page in its part, past the ones before it', () => {
    const at = locate(texts[1], 3);
    expect([at?.part.member.path, at?.page]).toEqual(['copy/main.c', 1]);
    expect(locate(texts[1], 5)).toBeNull();
  });
});

describe('pageIn', () => {
  it("numbers a content's page as one of the text, by its first part", () => {
    const at = pageIn(texts[1], main, 2);
    expect([at?.part.member.path, at?.page]).toEqual(['lab/main.c', 2]);
    expect(pageIn(texts[1], slides, 1)).toBeNull();
  });
});

describe('headed', () => {
  it("heads an entry's page with its path, not the content's own", () => {
    expect(headed(members[1], 'int main;')).toBe('lab/main.c\n\nint main;');
    expect(headed(members[0], 'int main;')).toBe('int main;');
  });
});
