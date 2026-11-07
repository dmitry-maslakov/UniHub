// how long a ban may last, by the key of its text; null for good
export const BAN_DURATIONS = [
  { key: 'day', seconds: 86_400 },
  { key: 'week', seconds: 604_800 },
  { key: 'month', seconds: 2_592_000 },
  { key: 'forever', seconds: null },
] as const;
