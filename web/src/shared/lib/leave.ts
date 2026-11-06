// Goes to another page (maybe another site) as a whole, not a route of this
// app. A script's address can't be one.
export function leaveTo(url: string) {
  const { protocol } = new URL(url, window.location.href);
  if (protocol === 'javascript:' || protocol === 'data:')
    throw new Error('Not an address to go to');
  window.location.assign(url);
}
