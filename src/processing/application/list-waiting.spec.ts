import { PluginName } from '@app/kernel';
import { catalogOf, processor } from '../../../test/discovered-plugins.js';
import { sha256 } from '../../../test/sha256.js';
import { ListWaiting } from './list-waiting.js';
import { InMemoryRepresentations } from './processing.fakes.js';
import { ListWaitingQuery } from './queries.js';

const hash = sha256('slides');
const pdf = { hash, name: 'a.pdf', mime: null };

function waiting(
  processors: ReturnType<typeof processor>[],
  made: { processor: string; version: number }[] = [],
) {
  const representations = new InMemoryRepresentations();
  representations.saved.push(
    ...made.map((m) => ({
      ...m,
      processor: PluginName.parse(m.processor),
      hash,
      parts: [],
    })),
  );
  return new ListWaiting(catalogOf({ processors }), representations);
}
const ask = (list: ListWaiting, ...files: (typeof pdf)[]) =>
  list.execute(new ListWaitingQuery(files));

describe('ListWaiting', () => {
  it('has a content wait for a processor that is on, takes the file and made nothing yet', async () => {
    expect(await ask(waiting([processor('text', ['.pdf'])]), pdf)).toEqual([
      { hash, text: true, pictures: false },
    ]);
  });

  it('has nothing wait once the processor made its current version', async () => {
    const list = waiting(
      [processor('text', ['.pdf'])],
      [{ processor: 'text', version: 1 }],
    );
    expect(await ask(list, pdf)).toEqual([]);
  });

  it('has a content wait again for a new version of the processor', async () => {
    const list = waiting(
      [processor('text', ['.pdf'], undefined, 2)],
      [{ processor: 'text', version: 1 }],
    );
    expect(await ask(list, pdf)).toHaveLength(1);
  });

  it('has nothing wait for a processor that is off or does not take the file', async () => {
    expect(await ask(waiting([]), pdf)).toEqual([]);
    expect(await ask(waiting([processor('slides', ['.pptx'])]), pdf)).toEqual(
      [],
    );
  });

  it('tells heavy processors from the others', async () => {
    const list = waiting(
      [
        processor('text', ['.pdf']),
        processor('vision', ['.pdf'], undefined, 1, { timeoutMinutes: 30 }),
      ],
      [{ processor: 'text', version: 1 }],
    );
    expect(await ask(list, pdf)).toEqual([
      { hash, text: false, pictures: true },
    ]);
  });

  it('counts a content once, waiting if it does for any file of it', async () => {
    const list = waiting([processor('text', ['.pdf'])]);
    const found = await ask(
      list,
      pdf,
      { ...pdf, name: 'b.pdf' },
      {
        hash,
        name: 'c.txt',
        mime: null,
      },
    );
    expect(found).toHaveLength(1);
  });
});
