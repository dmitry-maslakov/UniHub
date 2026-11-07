import { Menu, useMantineColorScheme } from '@mantine/core';
import {
  IconCheck,
  IconDeviceDesktop,
  IconMoon,
  IconSun,
} from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';

const SCHEMES = [
  { value: 'light', label: 'userMenu.light', Icon: IconSun },
  { value: 'dark', label: 'userMenu.dark', Icon: IconMoon },
  { value: 'auto', label: 'userMenu.system', Icon: IconDeviceDesktop },
] as const;

// Light, dark or the system's, as items of a menu, the current one checked
export function ColorSchemeMenuItems() {
  const { t } = useTranslation('shell');
  const { colorScheme, setColorScheme } = useMantineColorScheme();
  return SCHEMES.map(({ value, label, Icon }) => (
    <Menu.Item
      key={value}
      aria-current={colorScheme === value ? 'true' : undefined}
      leftSection={<Icon size={16} stroke={1.75} />}
      rightSection={
        colorScheme === value ? <IconCheck size={16} stroke={1.75} /> : null
      }
      onClick={() => setColorScheme(value)}
    >
      {t(label)}
    </Menu.Item>
  ));
}
