import { Box, Text, Title } from '@mantine/core';
import { AnchorLink } from '@/shared/ui';

export function NotFoundPage() {
  return (
    <Box component="main" maw="25rem" mx="auto" px="md" py="xxl">
      <Title order={1} mb="xs">
        Page not found
      </Title>
      <Text c="dimmed" mb="md">
        The link may be old, or mistyped.
      </Text>
      <AnchorLink to="/">Go to your courses</AnchorLink>
    </Box>
  );
}
