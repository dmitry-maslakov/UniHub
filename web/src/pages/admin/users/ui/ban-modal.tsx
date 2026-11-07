import {
  Button,
  Group,
  Modal,
  Select,
  Stack,
  Text,
  TextInput,
} from '@mantine/core';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BAN_DURATIONS } from '../lib/ban-durations';

// Asks how long a ban lasts and why. `seconds` is null for good; the reason
// only admins see.
export function BanModal({
  name,
  opened,
  pending,
  onClose,
  onBan,
}: {
  name: string;
  opened: boolean;
  pending: boolean;
  onClose: () => void;
  onBan: (ban: { seconds: number | null; reason: string }) => void;
}) {
  const { t } = useTranslation('admin');
  const { t: common } = useTranslation('common');
  const [duration, setDuration] = useState<string>('forever');
  const [reason, setReason] = useState('');
  const close = () => {
    setDuration('forever');
    setReason('');
    onClose();
  };
  const seconds =
    BAN_DURATIONS.find(({ key }) => key === duration)?.seconds ?? null;
  return (
    <Modal
      opened={opened}
      onClose={close}
      closeButtonProps={{ 'aria-label': common('action.close') }}
      title={t('users.ban.title', { name })}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onBan({ seconds, reason: reason.trim() });
        }}
      >
        <Stack gap="md">
          <Text size="sm">{t('users.ban.body')}</Text>
          <Select
            label={t('users.ban.duration.label')}
            data={BAN_DURATIONS.map(({ key }) => ({
              value: key,
              label: t(`users.ban.duration.${key}`),
            }))}
            value={duration}
            onChange={(value) => value && setDuration(value)}
            allowDeselect={false}
            comboboxProps={{ withinPortal: false }}
          />
          <TextInput
            label={t('users.ban.reason.label')}
            description={t('users.ban.reason.help')}
            maxLength={200}
            value={reason}
            onChange={(event) => setReason(event.currentTarget.value)}
          />
          <Group justify="flex-end" gap="sm">
            <Button variant="default" onClick={close}>
              {common('action.cancel')}
            </Button>
            <Button type="submit" color="red" loading={pending}>
              {t('users.ban.action')}
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
