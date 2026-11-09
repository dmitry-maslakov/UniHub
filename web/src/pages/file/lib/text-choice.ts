import type { Schemas } from '@/shared/api';

// The text the address asks for, if the file has it. Otherwise none is
// named, and the hub answers with the page's longest: a student never
// chooses between engines.
export const chosenText = (
  texts: readonly Schemas['TextInfoResponse'][],
  processor?: string,
) => texts.find((t) => t.processor === processor)?.processor;
