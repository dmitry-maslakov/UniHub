import { z } from 'zod';

// Values an admin types in, checked once where they come in (zod brands,
// like the kernel's): a command that takes a Slug can't be handed any string.

// what people type and folder names: lower case, digits, single dashes
export const Slug = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'lower case, digits and dashes')
  .brand<'Slug'>();
export type Slug = z.output<typeof Slug>;

// a course's name as people read it, never blank
export const CourseName = z.string().trim().min(1).brand<'CourseName'>();
export type CourseName = z.output<typeof CourseName>;

// the year an academic year starts in: 2026 is 2026/27
export const AcademicYear = z
  .number()
  .int()
  .min(1901)
  .max(2999)
  .brand<'AcademicYear'>();
export type AcademicYear = z.output<typeof AcademicYear>;
