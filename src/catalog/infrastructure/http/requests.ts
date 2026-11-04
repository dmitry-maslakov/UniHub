import { z } from 'zod';
import { StoredText } from '@app/kernel';
import { AcademicYear, CourseName, Slug } from '../../domain/values.js';

// What the admin routes take, each value checked against its own rules
// (ValidationModule): a bad one is a 400, never a command.

// a portal course's id as its portal has it; text postgres can't keep would
// fail the lookup with a 500
export const ExternalId = StoredText.min(1);

export const newCourse = z.object({ slug: Slug, name: CourseName });

export const courseLink = z.object({
  course: Slug,
  // none for a portal course that spans years
  year: AcademicYear.nullable().default(null),
});
