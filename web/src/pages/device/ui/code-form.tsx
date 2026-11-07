import { Button, Stack, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { normalizeCode } from '@/entities/device';

// The code typed in, for a screen whose QR code can't be scanned
export function CodeForm({ initial = '' }: { initial?: string }) {
  const { t } = useTranslation('device');
  const navigate = useNavigate();
  const form = useForm({
    mode: 'uncontrolled',
    initialValues: { code: initial },
    validate: {
      code: (value) =>
        /^[A-Z0-9]{4,}$/.test(normalizeCode(value)) ? null : t('form.invalid'),
    },
  });
  return (
    <form
      noValidate
      onSubmit={form.onSubmit(({ code }) =>
        navigate({ to: '/device', search: { user_code: normalizeCode(code) } }),
      )}
    >
      <Stack gap="md" align="stretch">
        <TextInput
          size="lg"
          label={t('form.label')}
          placeholder="ABCD-EFGH"
          autoComplete="off"
          // the page's one field, and the reason someone is here
          // oxlint-disable-next-line jsx-a11y/no-autofocus
          autoFocus
          autoCapitalize="characters"
          spellCheck={false}
          styles={{
            input: {
              fontFamily: 'var(--mantine-font-family-monospace)',
              letterSpacing: '0.08em',
            },
          }}
          key={form.key('code')}
          {...form.getInputProps('code')}
        />
        <Button type="submit" fullWidth>
          {t('form.action')}
        </Button>
      </Stack>
    </form>
  );
}
