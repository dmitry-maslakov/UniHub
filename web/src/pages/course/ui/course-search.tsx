import { TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconSearch } from '@tabler/icons-react';
import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

// Search inside one course: Enter opens the search page scoped to it
export function CourseSearch({ slug }: { slug: string }) {
  const { t } = useTranslation(['courses', 'search']);
  const navigate = useNavigate();
  const form = useForm({
    mode: 'uncontrolled',
    initialValues: { q: '' },
    validate: {
      q: (v) => (v.trim().length >= 2 ? null : t('search:field.tooShort')),
    },
  });

  return (
    <search>
      <form
        noValidate
        onSubmit={form.onSubmit(({ q }) =>
          navigate({ to: '/search', search: { q: q.trim(), course: slug } }),
        )}
      >
        <TextInput
          type="search"
          maw="32rem"
          maxLength={500}
          aria-label={t('courses:course.search.label')}
          placeholder={t('courses:course.search.placeholder')}
          leftSection={<IconSearch size={16} stroke={1.75} aria-hidden />}
          key={form.key('q')}
          {...form.getInputProps('q')}
        />
      </form>
    </search>
  );
}
