import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MAX_PART } from '@app/plugin-sdk';
import { toParts } from './parts.js';

const fixture = (name: string) =>
  readFileSync(join(import.meta.dirname, 'fixtures', name));

describe('toParts', () => {
  it('ends lines with LF and composes letters', () => {
    const decomposed = Buffer.from('čvor\r\nmreža\rkraj');
    expect(toParts(decomposed, 'lines', MAX_PART)).toEqual([
      'čvor\nmreža\nkraj',
    ]);
  });

  it('makes no parts of binary content or blank text', () => {
    expect(toParts(fixture('noise.png'), 'lines', MAX_PART)).toEqual([]);
    expect(toParts(Buffer.from(' \n\n'), 'markdown', MAX_PART)).toEqual([]);
  });

  it('splits markdown by heading, other text by lines', () => {
    const text = Buffer.from('intro\n# A\n# B\n');
    expect(toParts(text, 'markdown', MAX_PART)).toEqual([
      'intro\n',
      '# A\n',
      '# B\n',
    ]);
    expect(toParts(text, 'lines', MAX_PART)).toEqual(['intro\n# A\n# B\n']);
  });

  it('splits a notebook by the headings of its markdown', () => {
    const parts = toParts(fixture('lab.ipynb'), 'notebook', MAX_PART);
    expect(parts.map((part) => part.split('\n')[0])).toEqual([
      '# Lab 3: sorting',
      '## Errors',
    ]);
  });

  it('reads a notebook that is not one as the text it is', () => {
    const broken = Buffer.from('{ "cells": [\n# A\n# B\n');
    expect(toParts(broken, 'notebook', MAX_PART)).toEqual([
      '{ "cells": [\n# A\n# B\n',
    ]);
  });
});
