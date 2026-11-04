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
