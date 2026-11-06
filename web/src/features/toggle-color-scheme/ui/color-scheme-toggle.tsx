import {
  ActionIcon,
  useComputedColorScheme,
  useMantineColorScheme,
} from '@mantine/core';
import { IconMoon, IconSun } from '@tabler/icons-react';

// Light or dark, remembered on this device; until then, the system's
export function ColorSchemeToggle() {
  const { setColorScheme } = useMantineColorScheme();
  const scheme = useComputedColorScheme('light', {
    getInitialValueInEffect: true,
  });
  const other = scheme === 'dark' ? 'light' : 'dark';
  const Icon = scheme === 'dark' ? IconSun : IconMoon;
  return (
    <ActionIcon
      variant="subtle"
      color="gray"
      size="lg"
      aria-label={`Switch to ${other} mode`}
      title={`Switch to ${other} mode`}
      onClick={() => setColorScheme(other)}
    >
      <Icon size={20} stroke={1.75} />
    </ActionIcon>
  );
}
