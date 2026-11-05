import { readFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { Readable } from 'node:stream';
import { buffer } from 'node:stream/consumers';
import { gzipSync } from 'node:zlib';
import tar from 'tar-stream';
import yazl from 'yazl';
import { ContentHash, type ProcessorInput } from '@app/plugin-sdk';
import {
  ArchiveTextProcessor,
  MAX_ARCHIVE_BYTES,
} from './archive-text.processor.js';

// as the hub hands it over: matched by its extension
const input = (name: string, content: () => Readable): ProcessorInput => ({
  name,
  mime: null,
  matched: extname(name),
  hash: ContentHash.parse('0'.repeat(64)),
  content: async () => content(),
});

async function zipOf(files: Record<string, string | Buffer>) {
  const zip = new yazl.ZipFile();
  for (const [name, content] of Object.entries(files))
    zip.addBuffer(Buffer.from(content), name);
  zip.end();
  return buffer(zip.outputStream);
}

describe('ArchiveTextProcessor', () => {
  const processor = new ArchiveTextProcessor();

  it('makes parts of the code and text in an archive, each naming its file', async () => {
    const zip = await zipOf({
      // written on Windows, in its code page
      'lab/nzd.c': readFileSync(
        join(import.meta.dirname, 'fixtures', 'nzd-cp1250.c'),
      ),
      'lab/run.py': 'print("zdravo")\n',
      'README.md': '# Lab 1\n\nUvod.\n\n# Lab 2\n\nPokazivači.\n',
      'lab/build.o': Buffer.from([0x7f, 0x45, 0x4c, 0x46, 0, 0]),
    });

    const { parts } = await processor.process(
      input('labs.zip', () => Readable.from([zip])),
    );

    expect(parts.map((part) => part.split('\n')[0])).toEqual([
      'lab/nzd.c',
      'lab/run.py',
      'README.md',
      'README.md',
    ]);
    expect(parts[0]).toContain('Računa najveći zajednički delilac');
    expect(parts.slice(1)).toEqual([
      'lab/run.py\n\nprint("zdravo")\n',
      'README.md\n\n# Lab 1\n\nUvod.\n\n',
      'README.md\n\n# Lab 2\n\nPokazivači.\n',
    ]);
  });

  it('reads a tar in a gzip as well', async () => {
    const pack = tar.pack();
    pack.entry({ name: 'lab/main.c' }, 'int main;\n');
    pack.finalize();
    const tgz = gzipSync(await buffer(pack));

    expect(
      await processor.process(input('labs.tar.gz', () => Readable.from([tgz]))),
    ).toEqual({ parts: ['lab/main.c\n\nint main;\n'] });
  });

  it('skips an archive too large, before reading all of it', async () => {
    const mib = Buffer.alloc(1024 * 1024);
    let read = 0;
    const endless = function* () {
      for (;;) {
        read += mib.length;
        yield mib;
      }
    };

    expect(
      await processor.process(
        input('huge.zip', () => Readable.from(endless())),
      ),
    ).toEqual({ parts: [] });
    expect(read).toBeLessThanOrEqual(MAX_ARCHIVE_BYTES + 2 * mib.length);
  });

  it('fails on an archive that is none', async () => {
    await expect(
      processor.process(
        input('labs.zip', () => Readable.from([Buffer.from('nope')])),
      ),
    ).rejects.toThrow();
  });
});
