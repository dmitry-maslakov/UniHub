import { InvalidValueError, NotFoundError } from './errors.js';
import { ContentHash, MediaType, PluginName, PortalId } from './values.js';

const sha = 'ab'.repeat(32);

describe('ContentHash', () => {
  it('is sha256 in lower-case hex', () => {
    expect(ContentHash.parse(sha)).toBe(sha);
    expect(ContentHash.parse(sha.toUpperCase())).toBe(sha);
  });

  it('refuses anything else, a path above all', () => {
    for (const bad of ['', sha.slice(1), `${sha}0`, '../../etc/passwd'])
      expect(() => ContentHash.parse(bad)).toThrow(InvalidValueError);
  });
});

describe('MediaType', () => {
  it("keeps a type's essence", () => {
    expect(MediaType.parse('Application/PDF; charset=binary')).toBe(
      'application/pdf',
    );
    expect(MediaType.parse('text/plain;')).toBe('text/plain');
  });

  it('is null for what is no media type', () => {
    expect(MediaType.parse('pdf')).toBeNull();
    expect(MediaType.parse('')).toBeNull();
  });
});

describe('portal ids and plugin names', () => {
  it('are lower-case letters, digits and dashes', () => {
    expect(PortalId.parse('ms-teams')).toBe('ms-teams');
    expect(PluginName.isValid('office-text')).toBe(true);
    for (const bad of ['', 'Canvas', 'a__b', 'a:b', 'a b'])
      expect(PortalId.isValid(bad)).toBe(false);
    expect(() => PluginName.parse('a:b')).toThrow(/invalid plugin name/);
  });
});

describe('domain errors', () => {
  it('carry their kind and their own name', () => {
    class GoneError extends NotFoundError {}
    const error = new GoneError('gone');
    expect(error.kind).toBe('not-found');
    expect(error.name).toBe('GoneError');
    expect(new InvalidValueError('x', 'y'.repeat(200)).message.length).toBe(
      'invalid x: '.length + 82,
    );
  });
});
