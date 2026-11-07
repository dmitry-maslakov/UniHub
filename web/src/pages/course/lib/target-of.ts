import type { Target } from '@/features/download-selection';
import type { Schemas } from '@/shared/api';

// what of a course's file can be ticked: none for one without content yet
export const targetOf = (file: Schemas['FileResponse']): Target | null =>
  file.hasContent ? { file: file.id, size: file.size } : null;
