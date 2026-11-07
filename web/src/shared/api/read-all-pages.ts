// a list read 200 a page, up to 10 pages
const PAGE = 200;
const CAP = 2000;

// Every item of a list that pages by offset and limit, page by page until a
// short one or the cap; `capped` when there may be more than it read
export async function readAllPages<T>(
  page: (offset: number, limit: number) => Promise<T[]>,
): Promise<{ items: T[]; capped: boolean }> {
  const items: T[] = [];
  for (let offset = 0; offset < CAP; offset += PAGE) {
    const batch = await page(offset, PAGE);
    items.push(...batch);
    if (batch.length < PAGE) return { items, capped: false };
  }
  return { items, capped: true };
}
