import { createHash } from 'node:crypto';
import { z } from 'zod';
import { StoredText, type PortalId } from '@app/kernel';

// Values an admin types in, checked once where they come in (zod brands,
// like the kernel's): a command that takes a Slug can't be handed any string.

// what people type and folder names: lower case, digits, single dashes
export const Slug = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'lower case, digits and dashes')
  .brand<'Slug'>();
export type Slug = z.output<typeof Slug>;

// A portal course no course links is read as a course of its own (README,
// Portal accounts), by its portal's id and its own: canvas~101. An id of
// other characters than URL-safe ones goes by a hash of it, canvas~~ and
// 22 of base64url: two portal courses never share one, and no admin's slug
// is one (they have no ~)
const SAFE = /^[A-Za-z0-9._-]+$/;
export const portalCourseSlug = (portal: PortalId, externalId: string) =>
  SAFE.test(externalId)
    ? `${portal}~${externalId}`
    : `${portal}~~${createHash('sha256').update(externalId).digest('base64url').slice(0, 22)}`;

// what a reader names a course by: an admin's course's slug, or a portal
// course's of its own
export const CourseSlug = z
  .string()
  .regex(
    /^(?:[a-z0-9]+(?:-[a-z0-9]+)*|[a-z0-9-]+~(?:~[A-Za-z0-9_-]{22}|[A-Za-z0-9._-]+))$/,
    "a course's slug",
  )
  .brand<'CourseSlug'>();
export type CourseSlug = z.output<typeof CourseSlug>;

// a course's name as people read it, never blank
export const CourseName = StoredText.trim().min(1).brand<'CourseName'>();
export type CourseName = z.output<typeof CourseName>;

// the year an academic year starts in: 2026 is 2026/27
export const AcademicYear = z
  .number()
  .int()
  .min(1901)
  .max(2999)
  .brand<'AcademicYear'>();
export type AcademicYear = z.output<typeof AcademicYear>;
