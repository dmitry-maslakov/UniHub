import type { TFunction } from 'i18next';
import { z } from 'zod';

export const signInSchema = (t: TFunction<'auth'>) =>
  z.object({
    email: z.email(t('signIn.email.invalid')),
    password: z.string().min(1, t('signIn.password.required')),
  });
