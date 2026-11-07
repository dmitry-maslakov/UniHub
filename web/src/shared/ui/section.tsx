import { Stack, Text, Title } from '@mantine/core';
import { type ReactNode, useId } from 'react';

// A page's part: a heading, a line on what it is, then its content
export function Section({
  title,
  description,
  children,
  id,
}: {
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  id?: string;
}) {
  const generated = useId();
  const headingId = id ?? generated;
  return (
    <Stack component="section" gap="sm" aria-labelledby={headingId}>
      <Title order={2} id={headingId}>
        {title}
      </Title>
      {description && (
        <Text size="sm" c="dimmed" maw="60ch">
          {description}
        </Text>
      )}
      {children}
    </Stack>
  );
}
