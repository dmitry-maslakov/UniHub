import {
  ActionIcon,
  useComputedColorScheme,
  useMantineColorScheme,
} from '@mantine/core';
import { IconMoon, IconSun } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';

// Light or dark, remembered on this device; until then, the system's
export function ColorSchemeToggle() {
  const { t } = useTranslation('shell');
  const { setColorScheme } = useMantineColorScheme();
  const scheme = useComputedColorScheme('light', {
    getInitialValueInEffect: true,
  });
  const other = scheme === 'dark' ? 'light' : 'dark';
  const label = t(
    scheme === 'dark' ? 'colorScheme.toLight' : 'colorScheme.toDark',
  );
  const Icon = scheme === 'dark' ? IconSun : IconMoon;
  return (
    <ActionIcon
      variant="subtle"
      color="gray"
      size="lg"
      aria-label={label}
      title={label}
      onClick={() => setColorScheme(other)}
    >
      <Icon size={20} stroke={1.75} />
    </ActionIcon>
  );
}
