import { TextInput } from '@mantine/core';
import { IconSearch } from '@tabler/icons-react';
import { useNavigate } from '@tanstack/react-router';
import { type SubmitEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';

// Search inside one course: Enter opens the search page scoped to it
export function CourseSearch({ slug }: { slug: string }) {
  const { t } = useTranslation('courses');
  const navigate = useNavigate();
  const [words, setWords] = useState('');

  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const q = words.trim();
    if (q) void navigate({ to: '/search', search: { q, course: slug } });
  };

  return (
    <search>
      <form onSubmit={submit}>
        <TextInput
          type="search"
          name="q"
          maw="32rem"
          maxLength={500}
          value={words}
          onChange={(event) => setWords(event.currentTarget.value)}
          aria-label={t('course.search.label')}
          placeholder={t('course.search.placeholder')}
          leftSection={<IconSearch size={16} stroke={1.75} aria-hidden />}
        />
      </form>
    </search>
  );
}
