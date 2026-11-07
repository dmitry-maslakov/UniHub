import { hostedByInstructure } from './instructure.js';

// a made-up DNS: each name's CNAME, if it has one
const dns = (cnames: Record<string, string>) => async (host: string) => {
  const to = cnames[host];
  if (to === undefined)
    throw Object.assign(new Error(`no cname for ${host}`), { code: 'ENODATA' });
  return [to];
};

describe('hostedByInstructure', () => {
  it('finds a host under instructure.com, by its name or its CNAMEs', async () => {
    const none = dns({});
    expect(
      await hostedByInstructure('https://school.instructure.com', none),
    ).toBe(true);
    expect(await hostedByInstructure('https://instructure.com', none)).toBe(
      true,
    );
    const chain = dns({
      'canvas.example.edu': 'lms.example.edu',
      'lms.example.edu': 'School.Instructure.com.',
    });
    expect(await hostedByInstructure('https://canvas.example.edu', chain)).toBe(
      true,
    );
  });

  it("takes a school's own Canvas, and a name only like Instructure's, for not hosted", async () => {
    const chain = dns({ 'canvas.example.edu': 'web.example.edu' });
    expect(await hostedByInstructure('https://canvas.example.edu', chain)).toBe(
      false,
    );
    expect(
      await hostedByInstructure('https://notinstructure.com', dns({})),
    ).toBe(false);
    expect(
      await hostedByInstructure(
        'https://canvas.example.edu',
        dns({ 'canvas.example.edu': 'canvas.example.edu' }),
      ),
    ).toBe(false);
  });

  it('fails as the lookup does for another reason than a chain that ends', async () => {
    const failing = async () => {
      throw Object.assign(new Error('timeout'), { code: 'ETIMEOUT' });
    };
    await expect(
      hostedByInstructure('https://canvas.example.edu', failing),
    ).rejects.toThrow('timeout');
  });
});
