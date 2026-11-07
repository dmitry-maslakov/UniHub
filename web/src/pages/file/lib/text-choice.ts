import type { Schemas } from '@/shared/api';

// the text to read: the one asked for, else the first
export const pickText = (
  texts: readonly Schemas['TextInfoResponse'][],
  processor?: string,
) => texts.find((t) => t.processor === processor) ?? texts[0];
