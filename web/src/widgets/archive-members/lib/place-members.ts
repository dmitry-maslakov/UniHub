import { folderTree } from '@/entities/file';
import type { Schemas } from '@/shared/api';
import { memberFolder } from './member-name';

export type Member = Schemas['MemberResponse'];

// a member in its folder of the archive's tree
export interface Placed {
  member: Member;
  path: string;
}

// An archive's members as the folders their paths make
export const placeMembers = (members: readonly Member[]) =>
  folderTree(
    members.map((member) => ({ member, path: memberFolder(member.path) })),
  );
