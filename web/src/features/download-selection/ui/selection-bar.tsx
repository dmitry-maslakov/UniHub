import { Button, Group, Paper, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useTranslation } from 'react-i18next';
import { errorCode, errorKind } from '@/shared/api';
import { useFormat } from '@/shared/i18n';
import { leaveTo } from '@/shared/lib';
import { useCreateDownload } from '../api/create-download';
import { MAX_ITEMS, type Selection } from '../model/selection';
import classes from './selection.module.css';

// What is ticked, and the way to download it as one zip: shown while
// something is. The browser downloads what the hub answers with; the page
// stays where it is.
export function SelectionBar({ selection }: { selection: Selection }) {
  const { t } = useTranslation(['files', 'common']);
  const { size } = useFormat();
  const create = useCreateDownload();
  const { items } = selection;
  if (!items.length) return null;

  const refuse = (message: string) =>
    notifications.show({ color: 'red', message });
  const download = () => {
    if (items.length > MAX_ITEMS) return refuse(t('selection.tooMany'));
    create.mutate(
      { body: { items } },
      {
        onSuccess: ({ url }) => leaveTo(url),
        onError: (error) =>
          refuse(
            errorCode(error) === 'DOWNLOAD_TOO_LARGE'
              ? t('selection.tooLarge')
              : t(`common:error.${errorKind(error)}`),
          ),
      },
    );
  };

  return (
    <Paper withBorder radius="md" p="sm" pos="sticky" bottom={16}>
      <Group justify="space-between" gap="xs">
        <Text size="sm" className={classes.count}>
          {t('selection.count', {
            count: items.length,
            size: size(selection.size),
          })}
        </Text>
        <Group gap="xs" wrap="nowrap">
          <Button variant="subtle" onClick={selection.clear}>
            {t('selection.clear')}
          </Button>
          <Button loading={create.isPending} onClick={download}>
            {t('selection.download')}
          </Button>
        </Group>
      </Group>
    </Paper>
  );
}
