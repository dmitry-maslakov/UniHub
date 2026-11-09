import { z } from 'zod';
import { settings } from '@app/plugin-sdk';

// a Tesseract `-l` value: 'eng', 'srp_latn+eng'
const LANGUAGES = /^[a-z_]+(\+[a-z_]+)*$/;
const languages = z.string().regex(LANGUAGES, 'not a Tesseract -l value');

// `detect` or `detect=read`: the languages a picture is first read with to
// tell its script, and the ones it's read with after that if they differ
const candidate = z
  .string()
  .transform((entry) => entry.split('='))
  .pipe(z.tuple([languages], languages))
  .refine((parts) => parts.length <= 2, 'only detect=read')
  .transform(([detect, read]) => ({ detect, read: read ?? detect }));

export type Candidate = z.output<typeof candidate>;

export const ocrSettings = z
  .object({
    // Candidates, comma-separated, each `detect` or `detect=read`, as the
    // README (OCR) says. One language needs only its name.
    OCR_LANGUAGES: z
      .string()
      .default('eng')
      .transform((list) => list.split(',').map((entry) => entry.trim()))
      .pipe(z.array(candidate).min(1)),
  })
  .transform((env) => ({ languages: env.OCR_LANGUAGES }));

// read once the plugin is on
export const ocrConfig = settings('ocr', ocrSettings);
