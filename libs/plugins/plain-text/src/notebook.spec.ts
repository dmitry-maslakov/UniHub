import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { notebookMarkdown } from './notebook.js';

const code = (source: string | string[], outputs: object[] = []) => ({
  cell_type: 'code',
  source,
  outputs,
});
const notebook = (...cells: object[]) =>
  JSON.stringify({ metadata: { kernelspec: { language: 'python' } }, cells });

describe('notebookMarkdown', () => {
  it('has the markdown cells, the code in the kernel language and its text outputs', () => {
    const lab = readFileSync(
      join(import.meta.dirname, 'fixtures', 'lab.ipynb'),
      'utf8',
    );

    expect(notebookMarkdown(lab)).toBe(
      [
        '# Lab 3: sorting\n\nSort a list.',
        '```python\nprint(sorted([3, 1, 2]))\nplt.plot([1, 2, 3])\n```',
        '```\n[1, 2, 3]\n```',
        // a figure's picture left out
        '```\n<Figure size 640x480 with 1 Axes>\n```',
        '## Errors',
        '```python\n1 / 0\n```',
        // the traceback's colours left out
        '```\nZeroDivisionError: division by zero\n```',
      ].join('\n\n'),
    );
  });

  it('fences code with backticks in it longer', () => {
    expect(notebookMarkdown(notebook(code('s = """```"""')))).toBe(
      '````python\ns = """```"""\n````',
    );
  });

  it('takes the language from language_info, a cell without outputs too', () => {
    const cell = { cell_type: 'code', source: ['x = 1\n', 'x'] };
    const r = JSON.stringify({
      metadata: { language_info: { name: 'r' } },
      cells: [cell],
    });
    expect(notebookMarkdown(r)).toBe('```r\nx = 1\nx\n```');
  });

  it('is null for what is not a notebook', () => {
    expect(notebookMarkdown('{"cells": 1}')).toBeNull();
    expect(notebookMarkdown('{ not json')).toBeNull();
  });
});
