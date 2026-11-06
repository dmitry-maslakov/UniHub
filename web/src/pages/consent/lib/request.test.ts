import { describe, expect, it } from 'vitest';
import { isLoopback, readConsentRequest } from './request';

const signed = {
  client_id: 'https://claude.example/oauth/client.json',
  redirect_uri: 'https://claude.example/api/callback',
  sig: 'abc',
};

describe('the consent request', () => {
  it('names the requester by the host of its client_id', () => {
    expect(readConsentRequest(signed)).toMatchObject({
      requester: 'claude.example',
      returnTo: 'claude.example',
      loopback: false,
    });
  });

  it('keeps the port of a host, so a lookalike on another one shows', () => {
    expect(
      readConsentRequest({
        ...signed,
        client_id: 'https://claude.example:8443/c.json',
      })?.requester,
    ).toBe('claude.example:8443');
  });

  it('warns about a way back to this computer, however it is written', () => {
    for (const uri of [
      'http://127.0.0.1:53682/callback',
      'http://localhost:9000/cb',
      'http://[::1]:9000/cb',
      'http://app.localhost/cb',
    ])
      expect(
        readConsentRequest({ ...signed, redirect_uri: uri })?.loopback,
      ).toBe(true);
    expect(isLoopback('0.0.0.0')).toBe(true);
    expect(isLoopback('127.0.0.1.example')).toBe(false);
    expect(isLoopback('notlocalhost')).toBe(false);
  });

  it('flags a plain http return that is not this computer', () => {
    const read = (redirect_uri: string) =>
      readConsentRequest({ ...signed, redirect_uri })?.insecure;
    expect(read('http://app.example/cb')).toBe(true);
    expect(read('https://app.example/cb')).toBe(false);
    expect(read('http://127.0.0.1:1/cb')).toBe(false);
  });

  it('looks the client up by the client_id as it came', () => {
    expect(
      readConsentRequest({ ...signed, client_id: 'https://claude.example' })
        ?.clientId,
    ).toBe('https://claude.example');
  });

  it('shows the scheme of an app’s own address', () => {
    expect(
      readConsentRequest({ ...signed, redirect_uri: 'myapp://done' })?.returnTo,
    ).toBe('myapp://');
  });

  it('refuses a query missing what it needs', () => {
    expect(readConsentRequest({})).toBeUndefined();
    expect(readConsentRequest({ ...signed, sig: undefined })).toBeUndefined();
    expect(
      readConsentRequest({ ...signed, client_id: 'not a url' }),
    ).toBeUndefined();
    expect(
      readConsentRequest({ ...signed, client_id: 'javascript:alert(1)' }),
    ).toBeUndefined();
    expect(
      readConsentRequest({ ...signed, redirect_uri: undefined }),
    ).toBeUndefined();
  });
});
