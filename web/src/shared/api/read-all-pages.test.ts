import { describe, expect, it, vi } from 'vitest';
import { readAllPages } from './read-all-pages';

const pages = (total: number) =>
  vi.fn(async (offset: number, limit: number) =>
    Array.from(
      { length: Math.max(0, Math.min(limit, total - offset)) },
      (_, i) => offset + i,
    ),
  );

describe('readAllPages', () => {
  it('reads 200 at a time until a short page', async () => {
    const page = pages(450);
    const { items, capped } = await readAllPages(page);

    expect(items).toHaveLength(450);
    expect(capped).toBe(false);
    expect(page.mock.calls).toEqual([
      [0, 200],
      [200, 200],
      [400, 200],
    ]);
  });

  it('asks once more when the last page is full', async () => {
    const page = pages(400);

    expect((await readAllPages(page)).items).toHaveLength(400);
    expect(page).toHaveBeenCalledTimes(3);
  });

  it('stops at 2,000 and says there may be more', async () => {
    const page = pages(5000);
    const { items, capped } = await readAllPages(page);

    expect(items).toHaveLength(2000);
    expect(capped).toBe(true);
    expect(page).toHaveBeenCalledTimes(10);
  });
});
