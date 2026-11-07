import type { TFunction } from 'i18next';

const KINDS = [
  'announcement',
  'assignment',
  'page',
  'module',
  'discussion',
] as const;

const isKnown = (kind: string): kind is (typeof KINDS)[number] =>
  (KINDS as readonly string[]).includes(kind);

// A post's kind in words; a kind a portal made up shows as it sent it
export const kindLabel = (t: TFunction<'common'>, kind: string) =>
  isKnown(kind) ? t(`kind.${kind}`) : kind;
