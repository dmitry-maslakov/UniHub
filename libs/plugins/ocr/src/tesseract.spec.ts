import type { Candidate } from './ocr.config.js';
import { recognise, type Run } from './tesseract.js';
import type { Word } from './tsv.js';

const word = (text: string, conf: number): Word => ({
  block: 1,
  paragraph: 1,
  line: 1,
  conf,
  text,
});

const png = Buffer.from('picture');
const candidate = (detect: string, read = detect): Candidate => ({
  detect,
  read,
});

// a runner that answers per language value, and records them
function runner(answers: Record<string, Word[] | Error>) {
  const runs: string[] = [];
  const run: Run = async (_, languages) => {
    runs.push(languages);
    const answer = answers[languages];
    if (answer instanceof Error) return [];
    return answer ?? [];
  };
  return { run, runs };
}

describe('recognise', () => {
  it('runs a lone candidate once', async () => {
    const { run, runs } = runner({ eng: [word('hello', 90)] });

    expect(await recognise([candidate('eng')], run, png)).toBe('hello');
    expect(runs).toEqual(['eng']);
  });

  it('reads with the candidate of the higher mean confidence', async () => {
    const { run, runs } = runner({
      latin: [word('ЕМАС', 50)],
      cyrillic: [word('ENIAC', 90)],
    });

    const text = await recognise(
      [candidate('latin'), candidate('cyrillic')],
      run,
      png,
    );

    expect(text).toBe('ENIAC');
    expect(runs).toEqual(['latin', 'cyrillic']);
  });

  it('gives a tie to the earlier candidate', async () => {
    const { run } = runner({
      a: [word('first', 80)],
      b: [word('second', 80)],
    });

    expect(await recognise([candidate('a'), candidate('b')], run, png)).toBe(
      'first',
    );
  });

  it('runs the read pass only when it differs from the detect pass, and uses its words', async () => {
    const { run, runs } = runner({
      srp: [word('Рачунарске', 90)],
      'srp+eng': [word('Рачунарске', 90), word('TCP', 80)],
      srp_latn: [word('Racunarske', 60)],
    });

    const text = await recognise(
      [candidate('srp_latn'), candidate('srp', 'srp+eng')],
      run,
      png,
    );

    expect(text).toBe('Рачунарске TCP');
    expect(runs).toEqual(['srp_latn', 'srp', 'srp+eng']);
  });

  it('counts a run that fails as no words,', async () => {
    const { run } = runner({
      a: new Error('timed out'),
      b: [word('fine', 80)],
    });

    expect(await recognise([candidate('a'), candidate('b')], run, png)).toBe(
      'fine',
    );
    expect(await recognise([candidate('a')], run, png)).toBe('');
  });
});
