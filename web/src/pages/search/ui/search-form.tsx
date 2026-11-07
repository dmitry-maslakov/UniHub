import { Button, Group, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

// The words to look for; searching puts them in the address
export function SearchForm({ q }: { q: string }) {
  const { t } = useTranslation('search');
  const navigate = useNavigate();
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
        onSubmit={form.onSubmit(({ q: words }) =>
          navigate({ to: '/search', search: { q: words.trim() } }),
        )}
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
