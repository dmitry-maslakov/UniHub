import type { TFunction } from 'i18next';
import { z } from 'zod';

export const profileSchema = (t: TFunction<'account'>) =>
  z.object({
    name: z
      .string()
      .trim()
      .min(1, t('profile.name.required'))
      .max(100, t('profile.name.tooLong')),
  });

// Better Auth's own limits for a password: 8 to 128 characters
export const passwordSchema = (t: TFunction<['account', 'auth']>) =>
  z
    .object({
      current: z.string().min(1, t('account:password.current.required')),
      next: z
        .string()
        .min(8, t('auth:signUp.password.tooShort'))
        .max(128, t('auth:signUp.password.tooLong')),
      confirm: z.string(),
    })
    .refine((v) => v.next === v.confirm, {
      path: ['confirm'],
      message: t('auth:newPassword.mismatch'),
    });
