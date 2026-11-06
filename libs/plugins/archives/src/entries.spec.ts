import { LIMITS, named, Selection } from './entries.js';

describe('named', () => {
  it('keeps an entry by its path, made plain', () => {
    expect(named('lab/Main.C')).toBe('lab/Main.C');
    expect(named('./README.md')).toBe('README.md');
    expect(named('lab//slides.pdf')).toBe('lab/slides.pdf');
    expect(named('Makefile')).toBe('Makefile');
  });

  it("composes the path's letters, as a Mac's archive leaves them apart", () => {
    expect(named('lab/Pokazivac\u030Ci.md')).toBe('lab/Pokazivači.md');
  });

  it.each([
    ['a folder', 'lab.c/'],
    ['a path out of it', 'lab/../../escape.c'],
    ['an absolute path', '/etc/passwd'],
    ['a drive', 'C:/boot.ini'],
    ['minified code', 'static/jquery.min.js'],
    ["an editor's folder", '.idea/workspace.xml'],
    ['a hidden file', 'lab/.env'],
    ["npm's packages", 'node_modules/left-pad/index.js'],
    ["a Mac's resource fork", '__MACOSX/lab/._main.c'],
    ['build output', 'Lab1/obj/Debug/Lab1.csproj.FileListAbsolute.txt'],
  ])('leaves out %s: %s', (_, name) => {
    expect(named(name)).toBeNull();
  });
});

describe('Selection', () => {
  it('leaves out what named() does', () => {
    const selection = new Selection(LIMITS);
    expect(selection.take('lab/main.c', 10)).toBe('lab/main.c');
    expect(selection.take('../main.c', 10)).toBeNull();
  });

  it('leaves out an entry packed past the ratio, a zip bomb', () => {
    const selection = new Selection(LIMITS);
    expect(selection.take('zeros.txt', 1001, 10)).toBeNull();
    expect(selection.take('notes.txt', 1000, 10)).toBe('notes.txt');
  });

  it('looks at as many entries as its limit', () => {
    const selection = new Selection({ ...LIMITS, entries: 2 });
    expect([selection.more(), selection.more(), selection.more()]).toEqual([
      true,
      true,
      false,
    ]);
  });
});
