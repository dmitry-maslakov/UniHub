import { z } from 'zod';

export const signInSchema = z.object({
  email: z.email('Enter the email you signed up with'),
  password: z.string().min(1, 'Enter your password'),
});
