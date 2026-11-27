import { pmwikiSettings } from './pmwiki.config.js';

const parse = (env: Record<string, string>) => pmwikiSettings.safeParse(env);

describe('pmwikiSettings', () => {
  it('takes the wikis comma or space apart, each ending in a slash, and the defaults', () => {
    expect(
      parse({
        PMWIKI_WIKIS:
          'https://faculty.example.edu/ana, https://faculty.example.edu/dept/\nhttps://wiki.example.org',
      }).data,
    ).toEqual({
      wikis: [
        'https://faculty.example.edu/ana/',
        'https://faculty.example.edu/dept/',
        'https://wiki.example.org/',
      ],
      userAgent: 'course-sync',
      delayMs: 1000,
      maxRequests: 900,
      revisitDays: 7,
    });
  });

  it('takes the numbers set, and the defaults for those set empty', () => {
    expect(
      parse({
        PMWIKI_WIKIS: 'https://faculty.example.edu/ana/',
        PMWIKI_DELAY_MS: '0',
        PMWIKI_MAX_REQUESTS: '',
        PMWIKI_REVISIT_DAYS: '1',
      }).data,
    ).toMatchObject({ delayMs: 0, maxRequests: 900, revisitDays: 1 });
  });

  it('refuses no wiki, one twice, and an address that is no https one of a DNS name alone', () => {
    for (const PMWIKI_WIKIS of [
      '',
      'https://faculty.example.edu/ana/, https://faculty.example.edu/ana',
      'http://faculty.example.edu/ana/',
      'https://faculty.example.edu:8443/ana/',
      'https://user@faculty.example.edu/ana/',
      'https://faculty.example.edu/ana/?n=Main.Teaching',
      'https://10.0.0.7/ana/',
      'faculty.example.edu/ana/',
    ])
      expect(parse({ PMWIKI_WIKIS }).success, PMWIKI_WIKIS).toBe(false);
  });

  it('refuses a delay below 0 and a budget or revisit below 1', () => {
    const wiki = { PMWIKI_WIKIS: 'https://faculty.example.edu/ana/' };
    expect(parse({ ...wiki, PMWIKI_DELAY_MS: '-1' }).success).toBe(false);
    expect(parse({ ...wiki, PMWIKI_MAX_REQUESTS: '0' }).success).toBe(false);
    expect(parse({ ...wiki, PMWIKI_REVISIT_DAYS: '0' }).success).toBe(false);
  });
});
