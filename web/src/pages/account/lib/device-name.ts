import Bowser from 'bowser';

// The browser and system a session was made from, as its user agent says;
// either may be unknown
export function deviceName(userAgent: string | null | undefined): {
  browser?: string;
  os?: string;
} {
  // Bowser refuses an empty one
  if (!userAgent) return {};
  const { browser, os } = Bowser.parse(userAgent);
  return { browser: browser.name, os: os.name };
}
