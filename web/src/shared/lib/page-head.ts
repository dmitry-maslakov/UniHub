// a route's document title
export const pageHead = (title: string) => () => ({
  meta: [{ title: `${title} · UniHub` }],
});
