import { Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { displayCode } from '../lib/user-code';
import classes from './device-code.module.css';

// A screen's sign-in code, large, to compare at a glance with the phone's
export function DeviceCode({ code }: { code: string }) {
  const { t } = useTranslation('device');
  return (
    <Text
      className={classes.code}
      ff="monospace"
      fz="2.25rem"
      fw={600}
      lh={1.2}
      py="md"
      aria-label={t('codeAria', { spelled: code.split('').join(' ') })}
    >
      {displayCode(code)}
    </Text>
  );
}
