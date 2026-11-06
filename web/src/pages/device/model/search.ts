import { z } from 'zod';

// the screen's QR code links here with its code
export const deviceSearch = z.object({
  user_code: z.string().optional().catch(undefined),
});
