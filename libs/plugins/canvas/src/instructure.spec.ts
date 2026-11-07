import { hostedByInstructure, type ResolveCname } from './instructure.js';

// a made-up DNS: each name's CNAME, if it has one
const dns =
  (cnames: Record<string, string>): ResolveCname =>
  async (host) => {
    const to = cnames[host];
    if (to === undefined)
      throw Object.assign(new Error(`no cname for ${host}`), {
        code: 'ENODATA',
      });
    return [to];
  };

const going = new AbortController().signal;
const hosted = (instance: string, resolve: ResolveCname) =>
  hostedByInstructure(instance, going, resolve);

describe('hostedByInstructure', () => {
  it('finds a host under instructure.com, by its name or its CNAMEs', async () => {
    const none = dns({});
    expect(await hosted('https://school.instructure.com', none)).toBe(true);
    expect(await hosted('https://instructure.com', none)).toBe(true);
    const chain = dns({
      'canvas.example.edu': 'lms.example.edu',
      'lms.example.edu': 'School.Instructure.com.',
    });
    expect(await hosted('https://canvas.example.edu', chain)).toBe(true);
  });

  it("takes a school's own Canvas, and a name only like Instructure's, for not hosted", async () => {
    const chain = dns({ 'canvas.example.edu': 'web.example.edu' });
    expect(await hosted('https://canvas.example.edu', chain)).toBe(false);
    expect(await hosted('https://notinstructure.com', dns({}))).toBe(false);
    expect(
      await hosted(
        'https://canvas.example.edu',
        dns({ 'canvas.example.edu': 'canvas.example.edu' }),
      ),
    ).toBe(false);
  });

  it('fails as the lookup does for another reason than a chain that ends', async () => {
    const failing = async () => {
      throw Object.assign(new Error('timeout'), { code: 'ETIMEOUT' });
    };
    await expect(hosted('https://canvas.example.edu', failing)).rejects.toThrow(
      'timeout',
    );
  });

  it('stops where the signal stops it, a lookup going too', async () => {
    const stop = new AbortController();
    const asked: string[] = [];
    // the first name answers, the second's lookup hangs until cancelled,
    // as the time for it runs out
    const hanging: ResolveCname = (host, signal) => {
      asked.push(host);
      if (host === 'canvas.example.edu')
        return Promise.resolve(['lms.example.edu']);
      const cancelled = new Promise<string[]>((_, reject) =>
        signal.addEventListener('abort', () =>
          reject(Object.assign(new Error('cancelled'), { code: 'ECANCELLED' })),
        ),
      );
      stop.abort(new Error('no answer in time'));
      return cancelled;
    };
    await expect(
      hostedByInstructure('https://canvas.example.edu', stop.signal, hanging),
    ).rejects.toThrow('no answer in time');
    expect(asked).toEqual(['canvas.example.edu', 'lms.example.edu']);

    await expect(
      hostedByInstructure('https://canvas.example.edu', stop.signal, hanging),
    ).rejects.toThrow('no answer in time');
    expect(asked).toHaveLength(2);
  });
});
