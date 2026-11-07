// An address a portal gave, to link to only if it's a web one: never
// javascript:, data: or another app's scheme
export const webAddress = (url: string | null) =>
  url && /^https?:\/\//i.test(url) ? url : undefined;
