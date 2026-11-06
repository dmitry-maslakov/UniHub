export interface ConsentRequest {
  // the host of the app's client_id URL: who is asking
  requester: string;
  clientId: string;
  // where the user goes back to, by its host (scheme alone for an app's own)
  returnTo: string;
  // the return address is on this computer
  loopback: boolean;
}

const web = (url: URL) => url.protocol === 'https:' || url.protocol === 'http:';

const parse = (value: string | undefined) => {
  try {
    return value ? new URL(value) : undefined;
  } catch {
    return undefined;
  }
};

// 127.0.0.0/8, ::1 and localhost: a program on this computer listens there
export function isLoopback(hostname: string) {
  return (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname === '[::1]' ||
    /^127(\.\d{1,3}){3}$/.test(hostname)
  );
}

// The request as the page shows it, or undefined when the signed query lacks
// what a consent needs: no signature, no client URL (CIMD), no way back
export function readConsentRequest(search: {
  client_id?: string;
  redirect_uri?: string;
  sig?: string;
}): ConsentRequest | undefined {
  const client = parse(search.client_id);
  const redirect = parse(search.redirect_uri);
  if (!search.sig || !client || !web(client) || !redirect) return undefined;
  return {
    requester: client.host,
    clientId: client.href,
    returnTo: web(redirect) ? redirect.host : `${redirect.protocol}//`,
    loopback: web(redirect) && isLoopback(redirect.hostname),
  };
}
