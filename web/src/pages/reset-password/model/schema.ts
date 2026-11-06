import { z } from 'zod';

export const requestResetSchema = z.object({
  email: z.email('Enter the email you signed up with'),
});

export const newPasswordSchema = z
  .object({
    password: z
      .string()
      .min(8, 'Use at least 8 characters')
      .max(128, 'Use at most 128 characters'),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, {
    path: ['confirm'],
    message: "The passwords don't match",
  });
