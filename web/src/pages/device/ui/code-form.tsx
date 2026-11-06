import { Button, Stack, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { useNavigate } from '@tanstack/react-router';
import { normalizeCode } from '../lib/user-code';

// The code typed in, for a screen whose QR code can't be scanned
export function CodeForm({ initial = '' }: { initial?: string }) {
  const navigate = useNavigate();
  const form = useForm({
    mode: 'uncontrolled',
    initialValues: { code: initial },
    validate: {
      code: (value) =>
        /^[A-Z0-9]{4,}$/.test(normalizeCode(value))
          ? null
          : 'Enter the code the screen shows',
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
          label="Code on the screen"
          placeholder="ABCD-EFGH"
          autoComplete="off"
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
        <Button type="submit">Continue</Button>
      </Stack>
    </form>
  );
}
