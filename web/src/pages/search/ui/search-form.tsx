import { Button, Group, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { useNavigate } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { coursesQuery } from '@/entities/course';
import { scopeOf } from '../lib/course-initials';

// The words to look for; searching puts them in the address, the course
// the search is limited to kept, and the kind. With no course yet, a word
// that is one course's initials names it instead (course-initials.ts), and
// the words as typed go in `from`, to put back.
export function SearchForm({
  q,
  course,
  type,
}: {
  q: string;
  course?: string;
  type?: 'files' | 'posts';
}) {
  const { t } = useTranslation('search');
  const navigate = useNavigate();
  const courses = useQuery(coursesQuery()).data ?? [];
  const form = useForm({
    mode: 'uncontrolled',
    initialValues: { q },
    validate: {
      q: (v) => (v.trim().length >= 2 ? null : t('field.tooShort')),
    },
  });
  return (
    <search>
      <form
        noValidate
        onSubmit={form.onSubmit(({ q: typed }) => {
          const words = typed.trim();
          const scoped = course ? null : scopeOf(words, courses);
          return navigate({
            to: '/search',
            search: scoped
              ? { q: scoped.q, course: scoped.course.slug, type, from: words }
              : { q: words, course, type },
          });
        })}
      >
        <Group align="flex-start" gap="sm" wrap="wrap">
          <TextInput
            aria-label={t('field.aria')}
            placeholder={t('field.placeholder')}
            maxLength={500}
            style={{ flex: '1 1 16rem' }}
            key={form.key('q')}
            {...form.getInputProps('q')}
          />
          <Button type="submit">{t('action')}</Button>
        </Group>
      </form>
    </search>
  );
}
