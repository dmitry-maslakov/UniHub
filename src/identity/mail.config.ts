import { z } from 'zod';
import { settings } from '../platform/config/settings.js';

// what the mailer needs, and nothing of identity's secrets
export const mailSettings = z
  .object({
    NODE_ENV: z.string().default('development'),
    // smtp://user:pass@host:587; without it mails are only logged
    SMTP_URL: z.string().default(''),
    MAIL_FROM: z.string().default('UniHub <no-reply@localhost>'),
  })
  // mails carry sign-in links: in production they must really be sent
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === 'production' && !env.SMTP_URL)
      ctx.addIssue({
        code: 'custom',
        path: ['SMTP_URL'],
        message: 'required in production',
      });
  })
  .transform((env) => ({ smtpUrl: env.SMTP_URL || null, from: env.MAIL_FROM }));

export const mailConfig = settings('mail', mailSettings);
