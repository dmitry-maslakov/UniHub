import type { TFunction } from 'i18next';
import { z } from 'zod';

// a new course: its name, and the address it is read at (/courses/<slug>)
export const createCourseSchema = (t: TFunction<'admin'>) =>
  z.object({
    name: z.string().trim().min(1, t('courses.new.name.required')).max(200),
    slug: z
      .string()
      .min(1, t('courses.new.slug.invalid'))
      .max(60, t('courses.new.slug.invalid'))
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, t('courses.new.slug.invalid')),
  });
