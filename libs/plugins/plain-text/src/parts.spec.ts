import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { toParts } from './parts.js';

const fixture = (name: string) =>
  readFileSync(join(import.meta.dirname, 'fixtures', name));

describe('toParts', () => {
  it('ends lines with LF and composes letters', () => {
    const decomposed = Buffer.from('čvor\r\nmreža\rkraj');
    expect(toParts(decomposed, 'lines')).toEqual(['čvor\nmreža\nkraj']);
  });

  it('makes no parts of binary content or blank text', () => {
    expect(toParts(fixture('noise.png'), 'lines')).toEqual([]);
    expect(toParts(Buffer.from(' \n\n'), 'markdown')).toEqual([]);
  });

  it('splits markdown by heading, other text by lines', () => {
    const text = Buffer.from('intro\n# A\n# B\n');
    expect(toParts(text, 'markdown')).toEqual(['intro\n', '# A\n', '# B\n']);
    expect(toParts(text, 'lines')).toEqual(['intro\n# A\n# B\n']);
  });

  it('splits a notebook by the headings of its markdown', () => {
    const parts = toParts(fixture('lab.ipynb'), 'notebook');
    expect(parts.map((part) => part.split('\n')[0])).toEqual([
      '# Lab 3: sorting',
      '## Errors',
    ]);
  });

  it('reads a notebook that is not one as the text it is', () => {
    const broken = Buffer.from('{ "cells": [\n# A\n# B\n');
    expect(toParts(broken, 'notebook')).toEqual(['{ "cells": [\n# A\n# B\n']);
  });
});
