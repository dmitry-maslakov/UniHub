import { InvalidValueError, NotFoundError } from './errors.js';
import {
  AccountLink,
  ContentHash,
  Instance,
  LinkMode,
  MediaType,
  PluginName,
  PortalId,
} from './values.js';

const sha = 'ab'.repeat(32);

describe('ContentHash', () => {
  it('is sha256 in lower-case hex', () => {
    expect(ContentHash.parse(sha)).toBe(sha);
    expect(ContentHash.parse(sha.toUpperCase())).toBe(sha);
  });

  it('refuses anything else, a path above all', () => {
    for (const bad of ['', sha.slice(1), `${sha}0`, '../../etc/passwd'])
      expect(ContentHash.safeParse(bad).success).toBe(false);
  });
});

describe('MediaType', () => {
  it("keeps a type's essence", () => {
    expect(MediaType.parse('Application/PDF; charset=binary')).toBe(
      'application/pdf',
    );
    expect(MediaType.parse('text/plain;')).toBe('text/plain');
  });

  it('refuses what is no media type', () => {
    for (const bad of ['pdf', '', null])
      expect(MediaType.safeParse(bad).data).toBeUndefined();
  });
});

describe('portal ids and plugin names', () => {
  it('are lower-case letters, digits and dashes', () => {
    expect(PortalId.parse('ms-teams')).toBe('ms-teams');
    expect(PluginName.safeParse('office-text').success).toBe(true);
    for (const bad of ['', 'Canvas', 'a__b', 'a:b', 'a b'])
      expect(PortalId.safeParse(bad).success).toBe(false);
  });
});

describe('link modes', () => {
  it("link a user account by token alone: shared and public read the portal's one", () => {
    expect(LinkMode.options).toEqual(['shared', 'token', 'public']);
    expect(AccountLink.options).toEqual(['token']);
  });
});

describe('Instance', () => {
  it("is a site's https origin, from the address of any page of it", () => {
    for (const address of [
      'https://canvas.example.edu',
      'HTTPS://Canvas.Example.EDU/',
      'https://canvas.example.edu:443/courses/1?x=1#y',
      ' canvas.example.edu/login ',
    ])
      expect(Instance.parse(address)).toBe('https://canvas.example.edu');
  });

  it('refuses another scheme, a port, a user, an IP or a name that is no domain', () => {
    for (const bad of [
      '',
      'http://canvas.example.edu',
      'ftp://canvas.example.edu',
      'https://canvas.example.edu:8443',
      'canvas.example.edu:8443',
      'https://me:secret@canvas.example.edu',
      'https://me@canvas.example.edu',
      'https://10.0.0.1',
      'https://0x7f000001',
      'https://[::1]',
      'https://localhost',
      'https://opensearch',
      'https://canvas.example.edu.',
      'not an address',
    ])
      expect(Instance.safeParse(bad).success, bad).toBe(false);
  });
});

describe('domain errors', () => {
  it('carry their kind, their reason and their own name', () => {
    class GoneError extends NotFoundError {
      readonly reason = 'GONE';
    }
    const error = new GoneError('gone');
    expect(error.kind).toBe('not-found');
    expect(error.reason).toBe('GONE');
    expect(error.name).toBe('GoneError');
    expect(new InvalidValueError('x', 'y'.repeat(200)).message.length).toBe(
      'invalid x: '.length + 82,
    );
  });
});
