import { PluginName } from '@app/kernel';
import { catalogOf, processor } from '../../../test/discovered-plugins.js';
import { isHeavy } from './heavy-job.js';
import { sha256 } from '../../../test/sha256.js';
import type { PluginJob } from './plugin-job.js';

const process = (name: string): PluginJob => ({
  kind: 'process',
  key: { hash: sha256('a'), processor: PluginName.parse(name), version: 1 },
});

describe('isHeavy', () => {
  const plugins = catalogOf({
    processors: [
      processor('pdf', ['.pdf']),
      processor('ocr', ['.png'], undefined, 1, { timeoutMinutes: 20 }),
    ],
  });

  it("is true for a heavy processor's job only", () => {
    expect(isHeavy(process('ocr'), plugins)).toBe(true);
    expect(isHeavy(process('pdf'), plugins)).toBe(false);
  });

  it('is false for the other kinds of job and for a processor that is off', () => {
    expect(isHeavy(process('gone'), plugins)).toBe(false);
    const unpack: PluginJob = {
      kind: 'unpack',
      key: { hash: sha256('a'), unpacker: PluginName.parse('ocr'), version: 1 },
      policy: 1,
    };
    expect(isHeavy(unpack, plugins)).toBe(false);
  });
});
