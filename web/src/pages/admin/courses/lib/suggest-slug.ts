// An address from a course's name, to edit if wanted: Latin letters and
// digits, the rest dashes (đ as dj, the way Serbian is written without it)
export const suggestSlug = (name: string) =>
  name
    .toLowerCase()
    .replace(/đ/g, 'dj')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/, '');
