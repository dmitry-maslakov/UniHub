// The line under a text a machine made, by the processor that made it: read
// off the picture (`ocr`, `reader`) or described (`vision`). None for the rest.
export const machineNote = (processor: string) =>
  processor === 'ocr' || processor === 'reader'
    ? 'text.recognized'
    : processor === 'vision'
      ? 'text.described'
      : null;
