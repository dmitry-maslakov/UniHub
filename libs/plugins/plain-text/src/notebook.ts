import { stripVTControlCharacters } from 'node:util';
import { z } from 'zod';

// A Jupyter notebook (nbformat 4) as the parts of it a reader wants.

// a notebook's text comes whole or as its lines
const text = z.union([
  z.string(),
  z.array(z.string()).transform((lines) => lines.join('')),
]);

// A stream's text, a result's plain text, an error's traceback (colours
// left out); pictures and html aren't kept.
const output = z
  .object({
    text: text.optional(),
    data: z.object({ 'text/plain': text.optional() }).optional(),
    traceback: z.array(z.string()).optional(),
  })
  .transform((out) =>
    stripVTControlCharacters(
      out.text ?? out.data?.['text/plain'] ?? out.traceback?.join('\n') ?? '',
    ),
  );

const notebook = z.object({
  metadata: z
    .object({
      kernelspec: z.object({ language: z.string().optional() }).optional(),
      language_info: z.object({ name: z.string().optional() }).optional(),
    })
    .optional(),
  cells: z.array(
    z.object({
      cell_type: z.string(),
      source: text,
      outputs: z.array(output).default([]),
    }),
  ),
});

// A notebook as markdown: its markdown cells as they are, its code fenced in
// the kernel's language, followed by its text outputs. Null for what isn't
// a notebook.
export function notebookMarkdown(json: string): string | null {
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    return null;
  }
  const parsed = notebook.safeParse(value);
  if (!parsed.success) return null;
  const { metadata, cells } = parsed.data;
  const language =
    metadata?.language_info?.name ?? metadata?.kernelspec?.language ?? '';
  return cells
    .map(({ cell_type, source, outputs }) =>
      cell_type === 'code'
        ? [
            fenced(source, language),
            ...outputs.filter(Boolean).map((out) => fenced(out, '')),
          ].join('\n\n')
        : source,
    )
    .join('\n\n');
}

// in a fence longer than any run of backticks in the code, which so can't
// end it
function fenced(code: string, language: string) {
  const longest = (code.match(/`+/g) ?? []).reduce(
    (most, run) => Math.max(most, run.length),
    0,
  );
  const fence = '`'.repeat(Math.max(3, longest + 1));
  return `${fence}${language}\n${code.replace(/\n?$/, '\n')}${fence}`;
}
