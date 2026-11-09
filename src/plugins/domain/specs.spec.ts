import { InvalidValueError, MediaType } from '@app/kernel';
import {
  aggregatorSpec,
  pollSpec,
  ProcessorSpec,
  pushSpec,
  UnpackerSpec,
} from './specs.js';

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

  it('refuses an extension of two, as a file has its last only', () => {
    expect(() =>
      ProcessorSpec.of({ name: 'tgz', version: 1, accepts: ['.tar.gz'] }),
    ).toThrow(new InvalidValueError('accepts entry', '.tar.gz'));
  });
});

describe('a heavy ProcessorSpec', () => {
  const of = (heavy?: { timeoutMinutes: number }) =>
    ProcessorSpec.of({ name: 'ocr', version: 1, accepts: ['.png'], heavy });

  it('is heavy with a time limit in milliseconds, or else neither', () => {
    expect([of().heavy, of().timeLimitMs]).toEqual([false, null]);
    expect([
      of({ timeoutMinutes: 20 }).heavy,
      of({ timeoutMinutes: 20 }).timeLimitMs,
    ]).toEqual([true, 20 * 60_000]);
  });

  it('refuses a limit that is not a whole number of minutes', () => {
    for (const timeoutMinutes of [0, -5, 1.5, Number.NaN])
      expect(() => of({ timeoutMinutes })).toThrow(
        new InvalidValueError('heavy timeout', String(timeoutMinutes)),
      );
  });
});

describe('UnpackerSpec', () => {
  it("matches as a processor's does, taking its entries as files are matched", () => {
    const spec = UnpackerSpec.of({
      name: 'archives',
      version: 1,
      accepts: ['.ZIP', 'Application/Zip'],
    });

    expect(spec.match({ name: 'labs.zip', mime: null })).toBe('.ZIP');
    expect(spec.takes).toEqual(['.zip', 'application/zip']);
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

  it('take a poll schedule BullMQ can read, with seconds or an alias too', () => {
    for (const good of ['0 * * * *', '*/30 * * * * *', '@hourly'])
      expect(pollSpec({ portal: 'moodle', schedule: good }).schedule).toBe(
        good,
      );
  });

  it('take the links a connector names, once each, and no other', () => {
    expect(
      pushSpec({ portal: 'moodle', links: ['token', 'token'] }).links,
    ).toEqual(['token']);
    expect(pollSpec({ portal: 'moodle', schedule: '@hourly' }).links).toEqual(
      [],
    );
    // shared isn't a link: every connector serves it
    for (const bad of ['shared', 'oauth', 'TOKEN'])
      expect(() => pushSpec({ portal: 'moodle', links: [bad] })).toThrow(
        new InvalidValueError('connector link', bad),
      );
  });

  it('say whether the portal is a site per school, and none unless told', () => {
    expect(pushSpec({ portal: 'canvas', instances: true }).instances).toBe(
      true,
    );
    expect(pollSpec({ portal: 'moodle', schedule: '@hourly' }).instances).toBe(
      false,
    );
  });

  it('refuse one it would refuse once the schedules are set', () => {
    for (const bad of ['61 * * * *', '0 25 * * *', 'every hour', ''])
      expect(() => pollSpec({ portal: 'moodle', schedule: bad })).toThrow(
        new InvalidValueError('poll schedule', bad),
      );
  });
});
