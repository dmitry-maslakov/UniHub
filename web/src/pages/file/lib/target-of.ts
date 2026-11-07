import type { Target } from '@/features/download-selection';
import type { Schemas } from '@/shared/api';

// what of an archive's members can be ticked: none for one left out
export const targetOf = (
  fileId: string,
  member: Schemas['MemberResponse'],
): Target | null =>
  member.leftOut
    ? null
    : { file: fileId, member: member.path, size: member.size };
