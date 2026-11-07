// Canvas is a site per school: its account is linked with the school's
// address, and its tokens are made on the school's own Canvas. Known by
// name for now, until the hub says which sources take an address (their
// connectors' manifests, to come); the hub asks for one it isn't given
// (URL_NEEDED, token-error.ts).
export const isSitePortal = (portal: string) => portal === 'canvas';

// what the address field shows before anything is typed: an address is a
// value, not a text to translate
export const SITE_PLACEHOLDER = 'https://canvas.example.edu';

// The school's site from what was typed, as the hub takes it: an https
// address of a DNS name, any page of it, the scheme left out too; its
// origin, or null when it can't be one
export function siteOf(address: string): string | null {
  const typed = address.trim();
  if (!typed) return null;
  const withScheme = /^[a-z][a-z\d+.-]*:/i.test(typed)
    ? typed
    : `https://${typed}`;
  if (!URL.canParse(withScheme)) return null;
  const url = new URL(withScheme);
  const domain = /^([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(
    url.hostname,
  );
  return url.protocol === 'https:' &&
    domain &&
    !url.port &&
    !url.username &&
    !url.password
    ? url.origin
    : null;
}

// where a Canvas user makes a token of their own: Account, Settings
export const tokenPageOf = (site: string) => `${site}/profile/settings`;

// the site's name as people read it
export const hostOf = (site: string) => new URL(site).host;
