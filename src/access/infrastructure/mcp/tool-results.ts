// What the tools share: their annotations, and how they answer.

// tools that only read the hub
export const readOnly = { readOnlyHint: true, openWorldHint: false };

// what a tool hands back: JSON a model reads as text
export const json = (value: unknown) => ({
  content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }],
});
