import type { TFunction } from 'i18next';
import { z } from 'zod';

// Better Auth's own limits for a password: 8 to 128 characters
export const signUpSchema = (t: TFunction<'auth'>) =>
  z.object({
    name: z.string().trim().min(1, t('signUp.name.required')),
    email: z.email(t('signUp.email.invalid')),
    password: z
      .string()
      .min(8, t('signUp.password.tooShort'))
      .max(128, t('signUp.password.tooLong')),
  });
