// The address to type on a phone without a camera: the page's host and
// path, without the scheme
export const typedAddress = (verificationUri: string) => {
  const { host, pathname } = new URL(verificationUri);
  return `${host}${pathname}`;
};
