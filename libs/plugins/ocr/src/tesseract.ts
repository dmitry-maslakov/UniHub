import { execFile, type ExecFileException } from 'node:child_process';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { ocrConfig, type Candidate } from './ocr.config.js';
import { meanConfidence, parseTsv, textOf, type Word } from './tsv.js';

const RUN_TIMEOUT_MS = 60_000;
const MAX_OUTPUT = 20 * 1024 * 1024;

// Runs `tesseract` once on a PNG, for the `-l` value: its words. A run that
// times out or exits with a status has none; the binary missing (ENOENT),
// no resources, or a kill that isn't ours throw.
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

// A run that gave no words by itself: killed by our timeout (or the output
// limit), or exited with a status. Anything else is not the picture's.
const noWords = (error: ExecFileException) =>
  !['ENOENT', 'EAGAIN', 'EMFILE', 'ENOMEM'].includes(String(error.code)) &&
  (error.killed === true || typeof error.code === 'number');

@Injectable()
export class Tesseract {
  private readonly logger = new Logger(Tesseract.name);

  // what one run gets, a field so that a spec can shorten it
  timeoutMs = RUN_TIMEOUT_MS;
  private checked?: Promise<void>;

  constructor(
    @Inject(ocrConfig.KEY)
    private readonly config: ConfigType<typeof ocrConfig>,
  ) {}

  // Once per process: the binary is there and has every language that
  // OCR_LANGUAGES names. Throws if not, so that jobs fail visibly and store
  // nothing, and tries again at the next job (a failure isn't kept).
  ready() {
    this.checked ??= this.check().catch((error: unknown) => {
      this.checked = undefined;
      throw error;
    });
    return this.checked;
  }

  private check() {
    const wanted = new Set(
      this.config.languages.flatMap(({ detect, read }) =>
        `${detect}+${read}`.split('+'),
      ),
    );
    return new Promise<void>((resolve, reject) => {
      execFile(
        'tesseract',
        ['--list-langs'],
        { timeout: RUN_TIMEOUT_MS, killSignal: 'SIGKILL' },
        (error, stdout, stderr) => {
          if (error) return reject(error);
          // older versions list on stderr
          const listed = new Set(
            `${stdout}\n${stderr}`
              .split('\n')
              .map((line) => line.trim())
              .filter((line) => line && !line.startsWith('List of')),
          );
          const missing = [...wanted].filter(
            (language) => !listed.has(language),
          );
          if (missing.length > 0)
            return reject(
              new Error(
                `tesseract has no data for ${missing.join(', ')} (OCR_LANGUAGES); install the tesseract-ocr-* package`,
              ),
            );
          resolve();
        },
      );
    });
  }

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
          timeout: this.timeoutMs,
          killSignal: 'SIGKILL',
          maxBuffer: MAX_OUTPUT,
          // one thread a run: the processor's limit is what bounds the cores
          env: { ...process.env, OMP_THREAD_LIMIT: '1' },
        },
        (error, stdout) => {
          if (!error) return resolve(parseTsv(stdout));
          // ours to fix (no binary, no processes or memory left), or killed
          // by something that isn't us (the OOM killer): the job fails
          if (!noWords(error)) return reject(error);
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
