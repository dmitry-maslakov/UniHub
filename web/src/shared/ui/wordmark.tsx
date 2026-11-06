import { Text } from '@mantine/core';

// The name, set in the app's own face: there is no logo
export function Wordmark() {
  return (
    <Text component="span" fw={650} fz="lg" lts="-0.02em">
      UniHub
    </Text>
  );
}
