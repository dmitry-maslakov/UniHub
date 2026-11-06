import type { Schemas } from '@/shared/api';

// A hit's identity: a post, a file, or a member of an archive file
export const resultKey = (
  result: Schemas['FileResultResponse'] | Schemas['PostResultResponse'],
) =>
  result.type === 'post'
    ? `post:${result.itemId}`
    : `${result.type}:${result.fileId}:${result.member ?? ''}`;
