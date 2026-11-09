import { websiteSettings } from './website.config.js';

const section = { id: 'courses', name: 'Courses', sitemap: '/sitemap.xml' };
const env = (sections: unknown = [section], rest = {}) => ({
  WEBSITE_URL: 'https://faculty.example.edu',
  WEBSITE_SECTIONS:
    typeof sections === 'string' ? sections : JSON.stringify(sections),
  ...rest,
});
const refused = (e: Record<string, string>) =>
  websiteSettings.safeParse(e).success;

describe('website settings', () => {
  it('take the site as its origin, and give the sections their defaults', () => {
    const settings = websiteSettings.parse(
      env([section], { WEBSITE_URL: 'Faculty.example.edu/news' }),
    );
    expect(settings).toMatchObject({
      url: 'https://faculty.example.edu',
      userAgent: 'course-sync',
      delayMs: 1000,
      maxRequests: 900,
    });
    expect(settings.sections).toEqual([
      { ...section, content: 'main', kind: 'page', files: false },
    ]);
  });

  it('read every option of a section, the patterns as regular expressions', () => {
    const [read] = websiteSettings.parse(
      env(
        [
          {
            ...section,
            include: '^/courses/',
            exclude: 'old',
            content: 'article.body',
            kind: 'notice',
            files: true,
            skipFiles: 'exam',
            revisitDays: 7,
          },
        ],
        {
          WEBSITE_USER_AGENT: 'reader',
          WEBSITE_DELAY_MS: '0',
          WEBSITE_MAX_REQUESTS: '5',
        },
      ),
    ).sections;
    expect(read.include?.test('/courses/a')).toBe(true);
    expect(read.exclude?.test('/old')).toBe(true);
    expect(read.skipFiles?.test('EXAM.pdf')).toBe(true);
    expect(read).toMatchObject({ content: 'article.body', revisitDays: 7 });
  });

  it('take delay and request settings left empty as their defaults', () => {
    expect(
      websiteSettings.parse(
        env([section], { WEBSITE_DELAY_MS: '', WEBSITE_MAX_REQUESTS: '' }),
      ),
    ).toMatchObject({ delayMs: 1000, maxRequests: 900 });
  });

  it('refuse a missing or non-https site', () => {
    expect(refused({ WEBSITE_SECTIONS: '[]' })).toBe(false);
    for (const url of [
      '',
      'http://faculty.example.edu',
      'https://faculty.example.edu:8443',
    ])
      expect(refused(env([section], { WEBSITE_URL: url }))).toBe(false);
  });

  it('refuse sections that are missing, not JSON or no array', () => {
    for (const sections of [undefined, '', '{', '[]', '{"id":"a"}'])
      expect(
        websiteSettings.safeParse({
          WEBSITE_URL: 'https://faculty.example.edu',
          ...(sections !== undefined && { WEBSITE_SECTIONS: sections }),
        }).success,
      ).toBe(false);
  });

  it('refuse a bad id, name, sitemap or option, and unknown keys', () => {
    for (const bad of [
      { id: 'Courses' },
      { id: 'a b' },
      { id: '' },
      { name: '' },
      { sitemap: 'sitemap.xml' },
      { revisitDays: 0 },
      { revisitDays: 1.5 },
      { files: 'yes' },
      { kind: '' },
      { colour: 'red' },
    ])
      expect(refused(env([{ ...section, ...bad }])), JSON.stringify(bad)).toBe(
        false,
      );
  });

  it('refuse a pattern that is no regular expression', () => {
    for (const key of ['include', 'exclude', 'skipFiles'])
      expect(refused(env([{ ...section, [key]: '(' }])), key).toBe(false);
  });

  it('refuse a content that is no selector', () => {
    for (const content of ['', 'div[', ':::'])
      expect(refused(env([{ ...section, content }])), content).toBe(false);
  });

  it('refuse repeated ids', () => {
    expect(refused(env([section, { ...section, name: 'Again' }]))).toBe(false);
    expect(refused(env([section, { ...section, id: 'other' }]))).toBe(true);
  });

  it('refuse a delay or a budget that is not a number in range', () => {
    for (const rest of [
      { WEBSITE_DELAY_MS: '-1' },
      { WEBSITE_DELAY_MS: 'slow' },
      { WEBSITE_MAX_REQUESTS: '0' },
      { WEBSITE_USER_AGENT: '' },
    ])
      expect(refused(env([section], rest)), JSON.stringify(rest)).toBe(false);
  });
});
