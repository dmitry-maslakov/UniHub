import { Button, Group, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { useNavigate } from '@tanstack/react-router';

// The words to look for; searching puts them in the address
export function SearchForm({ q }: { q: string }) {
  const navigate = useNavigate();
  const form = useForm({
    mode: 'uncontrolled',
    initialValues: { q },
    validate: {
      q: (v) =>
        v.trim().length >= 2 ? null : 'Type at least 2 characters to search',
    },
  });
  return (
    <search>
      <form
        noValidate
        onSubmit={form.onSubmit(({ q: words }) =>
          navigate({ to: '/search', search: { q: words.trim() } }),
        )}
      >
        <Group align="flex-start" gap="sm" wrap="wrap">
          <TextInput
            aria-label="Search your courses"
            placeholder="A word, a phrase or a function name"
            maxLength={500}
            style={{ flex: '1 1 16rem' }}
            key={form.key('q')}
            {...form.getInputProps('q')}
          />
          <Button type="submit">Search</Button>
        </Group>
      </form>
    </search>
  );
}
