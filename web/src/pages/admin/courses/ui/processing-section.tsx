import { Table } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ListSkeleton, QueryState, Section } from '@/shared/ui';
import { queuesQuery } from '../api/queues';

// How the background reading stands: the queues of the plugins (texts), the
// models (pictures) and the search index
export function ProcessingSection() {
  const { t } = useTranslation('admin');
  const { t: common } = useTranslation('common');
  const queues = useQuery(queuesQuery());
  return (
    <Section
      title={t('processing.title')}
      description={t('processing.description')}
    >
      <QueryState
        query={queues}
        loading={<ListSkeleton rows={3} label={common('state.loading')} />}
      >
        {(data) => (
          <Table aria-label={t('processing.aria')}>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t('processing.queue')}</Table.Th>
                <Table.Th>{t('processing.waiting')}</Table.Th>
                <Table.Th>{t('processing.active')}</Table.Th>
                <Table.Th>{t('processing.failed')}</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {data.map((queue) => (
                <Table.Tr key={queue.name}>
                  <Table.Th scope="row">{queue.name}</Table.Th>
                  <Table.Td>{queue.waiting}</Table.Td>
                  <Table.Td>{queue.active}</Table.Td>
                  <Table.Td>{queue.failed}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )}
      </QueryState>
    </Section>
  );
}
