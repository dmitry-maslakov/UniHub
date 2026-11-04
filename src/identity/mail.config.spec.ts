import { mailSettings } from './mail.config.js';

describe('mail settings', () => {
  it('need real mail in production', () => {
    const result = mailSettings.safeParse({ NODE_ENV: 'production' });
    expect(result.error?.issues.map((i) => i.path[0])).toEqual(['SMTP_URL']);
    expect(
      mailSettings.safeParse({
        NODE_ENV: 'production',
        SMTP_URL: 'smtp://u:p@mail.uni.test:587',
      }).data,
    ).toEqual({
      smtpUrl: 'smtp://u:p@mail.uni.test:587',
      from: 'UniHub <no-reply@localhost>',
    });
  });

  it('only log mails elsewhere', () => {
    expect(mailSettings.parse({}).smtpUrl).toBeNull();
  });
});
