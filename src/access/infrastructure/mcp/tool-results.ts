// What the tools share: their annotations, and how they answer.

// tools that only read the hub
export const readOnly = { readOnlyHint: true, openWorldHint: false };

// what a tool hands back: JSON a model reads as text
export const json = (value: unknown) => ({
  content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }],
});

// JSON, and a word for the model to relay after it
export const jsonWithNote = (value: unknown, note: string) => ({
  content: [...json(value).content, { type: 'text' as const, text: note }],
});
