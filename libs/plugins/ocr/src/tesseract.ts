import { execFile } from 'node:child_process';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { ocrConfig, type Candidate } from './ocr.config.js';
import { meanConfidence, parseTsv, textOf, type Word } from './tsv.js';

const RUN_TIMEOUT_MS = 60_000;
const MAX_OUTPUT = 20 * 1024 * 1024;

// Runs `tesseract` once on a PNG, for the `-l` value: its words. A run that
// times out or fails has none; the binary missing (ENOENT) throws.
export type Run = (png: Buffer, languages: string) => Promise<Word[]>;

// Which of the candidates reads a picture, and what it reads.
//
// Every candidate's `detect` pass is run, and the one with the highest mean
// confidence wins (the earlier on a tie); if it has a `read` that differs,
// that is run and its words are used. Tesseract's own script detection told
// the script wrong on 3 of 37 samples, and one pass with `srp+srp_latn+eng`
// turns Latin lookalikes into Cyrillic (ENIAC becomes ЕМАС), while separate
// passes compared by confidence told the script right on all of them.
// `srp+eng` as the final read then keeps Latin terms on Cyrillic pages.
export async function recognise(
  candidates: readonly Candidate[],
  run: Run,
  png: Buffer,
) {
  let best: { candidate: Candidate; words: Word[]; mean: number } | undefined;
  for (const candidate of candidates) {
    const words = await run(png, candidate.detect);
    const mean = meanConfidence(words);
    if (!best || mean > best.mean) best = { candidate, words, mean };
  }
  const { candidate, words } = best!;
  return textOf(
    candidate.read === candidate.detect
      ? words
      : await run(png, candidate.read),
  );
}

@Injectable()
export class Tesseract {
  private readonly logger = new Logger(Tesseract.name);

  constructor(
    @Inject(ocrConfig.KEY)
    private readonly config: ConfigType<typeof ocrConfig>,
  ) {}

  read(png: Buffer) {
    return recognise(this.config.languages, (p, l) => this.run(p, l), png);
  }

  private run(png: Buffer, languages: string) {
    return new Promise<Word[]>((resolve, reject) => {
      // no shell, and nothing on disk: the picture goes in on stdin
      const child = execFile(
        'tesseract',
        ['stdin', 'stdout', '-l', languages, 'tsv'],
        {
          timeout: RUN_TIMEOUT_MS,
          killSignal: 'SIGKILL',
          maxBuffer: MAX_OUTPUT,
          // one thread a run: the processor's limit is what bounds the cores
          env: { ...process.env, OMP_THREAD_LIMIT: '1' },
        },
        (error, stdout) => {
          if (!error) return resolve(parseTsv(stdout));
          if ((error as NodeJS.ErrnoException).code === 'ENOENT')
            return reject(error);
          this.logger.warn(
            `tesseract (${languages}) gave no words: ${error.message}`,
          );
          resolve([]);
        },
      );
      // it can quit before reading it all; the exit says why
      child.stdin!.on('error', () => undefined);
      child.stdin!.end(png);
    });
  }
}
