import { isNoise, memberPath } from './member-path.js';

describe('memberPath', () => {
  it("names a member within its container's path", () => {
    expect(memberPath(null, 'src/main.c')).toBe('src/main.c');
    expect(memberPath('team1/lab.zip', 'src/main.c')).toBe(
      'team1/lab.zip/src/main.c',
    );
  });

  it("puts '/' between folders, composes letters, drops empty and '.' steps", () => {
    expect(memberPath(null, 'src\\util\\io.c')).toBe('src/util/io.c');
    expect(memberPath(null, 'docs/re\u0301sume\u0301.md')).toBe(
      'docs/r\u00e9sum\u00e9.md',
    );
    expect(memberPath(null, './src//./main.c')).toBe('src/main.c');
  });

  it.each([
    ['absolute', '/etc/passwd'],
    ['absolute on Windows', '\\Windows\\win.ini'],
    ['on a drive', 'C:\\boot.ini'],
    ['up a folder', '../outside.c'],
    ['up a folder on Windows', 'src\\..\\..\\outside.c'],
    ['up a folder, back in', 'src/../main.c'],
    ['with a control character', 'main\u0000.c'],
    ['with an escape', 'main\u001b[2J.c'],
    ['turning text around', 'notes\u202Etxt.exe'],
    ['a folder', 'src/'],
    ['no name', './'],
  ])('leaves out a path %s', (_, raw) => {
    expect(memberPath(null, raw)).toBeNull();
  });

  it('leaves out a path past 1024 characters in all', () => {
    const within = 'a'.repeat(1000);

    expect(memberPath(within, 'b'.repeat(23))).toHaveLength(1024);
    expect(memberPath(within, 'b'.repeat(24))).toBeNull();
  });
});

describe('isNoise', () => {
  it.each([
    '.git/config',
    'src/.DS_Store',
    '.venv/lib/site.py',
    'web/node_modules/react/index.js',
    '__MACOSX/src/._main.c',
    'Lab1/bin/Debug/Lab1.dll',
    'Lab1/obj/project.assets.json',
  ])('is true of %s', (path) => {
    expect(isNoise(path)).toBe(true);
  });

  it.each(['src/main.c', 'binary/tree.c', 'lab.bin', 'objects.py'])(
    'is false of %s',
    (path) => {
      expect(isNoise(path)).toBe(false);
    },
  );
});
