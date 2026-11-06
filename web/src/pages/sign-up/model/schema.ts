import { z } from 'zod';

// Better Auth's own limits for a password: 8 to 128 characters
export const signUpSchema = z.object({
  name: z.string().trim().min(1, 'Enter your name'),
  email: z.email('Enter an email you can open now'),
  password: z
    .string()
    .min(8, 'Use at least 8 characters')
    .max(128, 'Use at most 128 characters'),
});
