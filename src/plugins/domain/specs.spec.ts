import { InvalidValueError, MediaType } from '@app/kernel';
import { aggregatorSpec, pollSpec, ProcessorSpec } from './specs.js';

const pdf = MediaType.parse('application/pdf');

describe('ProcessorSpec', () => {
  const spec = ProcessorSpec.of({
    name: 'pdf',
    version: 1,
    accepts: ['.PDF', 'Application/PDF', '.pptx'],
  });

  it('matches a file by extension or media type, in any case', () => {
    expect(spec.match({ name: 'a.pdf', mime: null })).toBe('.PDF');
    expect(spec.match({ name: 'a', mime: pdf })).toBe('Application/PDF');
    expect(spec.match({ name: 'a.txt', mime: null })).toBeNull();
  });

  it('goes by the extension first, the media type being only a hint', () => {
    expect(spec.match({ name: 'slides.PPTX', mime: pdf })).toBe('.pptx');
  });

  it('refuses an entry that is neither an extension nor a media type', () => {
    expect(() =>
      ProcessorSpec.of({ name: 'pdf', version: 1, accepts: ['pdf'] }),
    ).toThrow(new InvalidValueError('accepts entry', 'pdf'));
  });
});

describe('plugin specs', () => {
  it("refuse names and portals keys and job ids can't take", () => {
    for (const bad of ['PDF', 'pdf:v2', 'a__b', ''])
      expect(() => aggregatorSpec({ name: bad, topics: [] })).toThrow(
        InvalidValueError,
      );
    expect(() => pollSpec({ portal: 'A CS', schedule: '* * * * *' })).toThrow(
      'invalid connector portal: "A CS"',
    );
  });
});
