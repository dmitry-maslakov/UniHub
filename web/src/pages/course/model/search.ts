import { z } from 'zod';

// how the Files tab lists them: by folder, or one list newest first
export type FilesView = 'folders' | 'newest';

// the tab a course shows and how its files are listed, kept in the
// address; none asks for the default (the tab by defaultTab, by folder)
export const courseSearch = z.object({
  tab: z.enum(['files', 'posts']).optional().catch(undefined),
  view: z.enum(['newest']).optional().catch(undefined),
});
