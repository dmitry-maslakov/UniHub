import { describe, expect, it } from 'vitest';
import { filesIn } from './folder-files';
import { folderTree } from './folder-tree';

const file = (name: string, path = '') => ({ name, path });

describe('filesIn', () => {
  it('lists the files of a folder and of the folders below it', () => {
    const tree = folderTree([
      file('top.pdf'),
      file('a.pdf', 'Predavanja'),
      file('b.pdf', 'Predavanja/2026'),
      file('c.pdf', 'Vežbe'),
    ]);
    const [lectures] = tree.folders;

    expect(filesIn(tree).map((f) => f.name)).toEqual([
      'b.pdf',
      'a.pdf',
      'c.pdf',
      'top.pdf',
    ]);
    expect(filesIn(lectures!).map((f) => f.name)).toEqual(['b.pdf', 'a.pdf']);
  });

  it('lists none for an empty folder', () => {
    expect(filesIn(folderTree([]))).toEqual([]);
  });
});
