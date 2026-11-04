import { linked, readEach } from './module-links.js';

describe('module links', () => {
  it('name what the modules link to of one type once', () => {
    const items = [
      { type: 'Page', page_url: 'syllabus' },
      { type: 'File', content_id: 1 },
      { type: 'Page', page_url: 'syllabus' },
      { type: 'Page', page_url: 'lab-1' },
    ];
    expect([...linked(items, 'Page', 'page_url')]).toEqual([
      'syllabus',
      'lab-1',
    ]);
  });

  it('read every one, and give no ids once one was refused', async () => {
    const asked: string[] = [];
    const read = async (name: string) => {
      asked.push(name);
      return name === 'b' ? null : `page:${name}`;
    };

    expect(await readEach(['a', 'c'], read)).toEqual(['page:a', 'page:c']);
    expect(await readEach(['a', 'b', 'c'], read)).toBeUndefined();
    expect(asked).toEqual(['a', 'c', 'a', 'b', 'c']);
  });
});
