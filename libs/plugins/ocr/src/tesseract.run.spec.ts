import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Logger } from '@nestjs/common';
import { ocrSettings } from './ocr.config.js';
import { Tesseract } from './tesseract.js';

// A stand-in `tesseract` script first on PATH, to see what the real run does
// with a binary that fails, hangs or isn't there.
const TSV =
  'level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext\n' +
  '5\t1\t1\t1\t1\t1\t0\t0\t10\t10\t90\thello\n';

describe('Tesseract (a fake binary)', () => {
  const path = process.env.PATH;
  let dir: string;
  let warn: ReturnType<typeof vi.spyOn>;
  const script = (body: string) => {
    const file = join(dir, 'tesseract');
    writeFileSync(file, `#!/bin/sh\n${body}\n`);
    chmodSync(file, 0o755);
  };
  const tesseract = (languages = 'eng') =>
    new Tesseract(ocrSettings.parse({ OCR_LANGUAGES: languages }));

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'fake-tesseract-'));
    process.env.PATH = `${dir}:${path}`;
    warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    process.env.PATH = path;
    rmSync(dir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  describe('read', () => {
    it('gives the words of a run that succeeds', async () => {
      script(
        `cat >/dev/null; printf '${TSV.replace(/\n/g, '\\n').replace(/\t/g, '\\t')}'`,
      );

      expect(await tesseract().read(Buffer.from('png'))).toBe('hello');
    });

    it('counts a non-zero exit as no words', async () => {
      script('cat >/dev/null; echo broken >&2; exit 1');

      expect(await tesseract().read(Buffer.from('png'))).toBe('');
      expect(warn).toHaveBeenCalled();
    });

    it('counts a run killed by our timeout as no words', async () => {
      script('exec sleep 30');
      const slow = tesseract();
      slow.timeoutMs = 200;

      expect(await slow.read(Buffer.from('png'))).toBe('');
    });

    it('fails when the binary is missing', async () => {
      process.env.PATH = dir; // empty of tesseract

      await expect(tesseract().read(Buffer.from('png'))).rejects.toMatchObject({
        code: 'ENOENT',
      });
    });

    it('fails when something else killed it', async () => {
      script('kill -9 $$');

      await expect(tesseract().read(Buffer.from('png'))).rejects.toMatchObject({
        killed: false,
        signal: 'SIGKILL',
      });
    });
  });

  describe('ready', () => {
    const listing = (langs: string[]) =>
      script(
        `echo 'List of available languages in "/x" (${langs.length}):'; ${langs
          .map((l) => `echo ${l};`)
          .join(' ')}`,
      );

    it('passes when every language named is listed', async () => {
      listing(['eng', 'osd', 'srp', 'srp_latn']);

      await expect(
        tesseract('srp_latn+eng,srp=srp+eng').ready(),
      ).resolves.toBeUndefined();
    });

    it('names a language that is missing', async () => {
      listing(['eng', 'srp']);

      await expect(
        tesseract('srp_latn+eng,srp=srp+eng').ready(),
      ).rejects.toThrow('srp_latn');
    });

    it('fails when the binary is missing', async () => {
      process.env.PATH = dir;

      await expect(tesseract().ready()).rejects.toMatchObject({
        code: 'ENOENT',
      });
    });

    it('checks once, but a failure is tried again', async () => {
      const checked = tesseract();
      listing(['osd']);
      await expect(checked.ready()).rejects.toThrow('eng');

      listing(['eng']);
      await checked.ready();
      script('exit 1'); // not run again
      await expect(checked.ready()).resolves.toBeUndefined();
    });
  });
});
