// This device first, then the others by when they were last active
export const orderSessions = <
  T extends { id: string; updatedAt: Date | string },
>(
  sessions: T[],
  currentId: string,
) =>
  sessions.toSorted(
    (a, b) =>
      Number(b.id === currentId) - Number(a.id === currentId) ||
      +new Date(b.updatedAt) - +new Date(a.updatedAt),
  );
