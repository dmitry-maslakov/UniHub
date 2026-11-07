import { describe, expect, it } from 'vitest';
import { folderTree } from './folder-tree';

const file = (name: string, path = '') => ({ name, path });

describe('folderTree', () => {
  it('puts files in their folders, folders first, by name', () => {
    const tree = folderTree([
      file('b.pdf', 'Vežbe'),
      file('a.pdf', 'Predavanja'),
      file('c.pdf', 'Predavanja'),
    ]);

    expect(tree.folders.map((f) => f.name)).toEqual(['Predavanja', 'Vežbe']);
    expect(tree.folders[0]!.files.map((f) => f.name)).toEqual([
      'a.pdf',
      'c.pdf',
    ]);
  });

  it("nests a path's folders", () => {
    const tree = folderTree([file('x.pdf', 'Predavanja/2026')]);

    const [lectures] = tree.folders;
    expect(lectures).toMatchObject({ name: 'Predavanja', path: 'Predavanja' });
    expect(lectures!.files).toEqual([]);
    expect(lectures!.folders[0]).toMatchObject({
      name: '2026',
      path: 'Predavanja/2026',
      files: [file('x.pdf', 'Predavanja/2026')],
    });
  });

  it('keeps files without a folder at the top, in the order given', () => {
    const tree = folderTree([file('z.pdf'), file('a.pdf'), file('m.pdf', 'F')]);

    expect(tree.files.map((f) => f.name)).toEqual(['z.pdf', 'a.pdf']);
    expect(tree.folders).toHaveLength(1);
    expect(tree).toMatchObject({ name: '', path: '' });
  });

  it('counts the files under each folder', () => {
    const tree = folderTree([
      file('a', 'A'),
      file('b', 'A/B'),
      file('c', 'A/B'),
      file('d'),
    ]);

    expect(tree.count).toBe(4);
    expect(tree.folders[0]!.count).toBe(3);
    expect(tree.folders[0]!.folders[0]!.count).toBe(2);
  });

  it('orders folder names with numbers as people do', () => {
    const tree = folderTree([
      file('a', 'l10'),
      file('b', 'l2'),
      file('c', 'l1'),
    ]);

    expect(tree.folders.map((f) => f.name)).toEqual(['l1', 'l2', 'l10']);
  });

  it('treats stray slashes as no folder', () => {
    const tree = folderTree([file('a', '/A//B/')]);

    expect(tree.folders[0]!.path).toBe('A');
    expect(tree.folders[0]!.folders[0]!.path).toBe('A/B');
  });
});
