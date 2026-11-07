import type { TFunction } from 'i18next';
import { z } from 'zod';

export const requestResetSchema = (t: TFunction<'auth'>) =>
  z.object({
    email: z.email(t('reset.email.invalid')),
  });

export const newPasswordSchema = (t: TFunction<'auth'>) =>
  z
    .object({
      password: z
        .string()
        .min(8, t('signUp.password.tooShort'))
        .max(128, t('signUp.password.tooLong')),
      confirm: z.string(),
    })
    .refine((v) => v.password === v.confirm, {
      path: ['confirm'],
      message: t('newPassword.mismatch'),
    });
