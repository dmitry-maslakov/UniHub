import {
  Button,
  Loader,
  Pagination,
  Stack,
  Text,
  TextInput,
} from '@mantine/core';
import { useDebouncedCallback } from '@mantine/hooks';
import { IconSearch } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { getRouteApi } from '@tanstack/react-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { EmptyState, ListSkeleton, QueryState, RowList } from '@/shared/ui';
import { AdminHeader } from '@/widgets/admin-header';
import { adminUsersQuery, USERS_PAGE } from '../api/admin-users';
import { UserRow } from './user-row';

const route = getRouteApi('/_app/admin/users');

// Every user, newest first: searched by email or name, and given a role or
// a ban
export function UsersPage() {
  const { t } = useTranslation('admin');
  const { t: common } = useTranslation('common');
  const { q, page } = route.useSearch();
  const navigate = route.useNavigate();
  const [typed, setTyped] = useState(q ?? '');
  // the box follows the address when something else changes it, not while
  // the words are still being typed
  const [seen, setSeen] = useState(q);
  if (q !== seen) {
    setSeen(q);
    if (typed.trim() !== (q ?? '')) setTyped(q ?? '');
  }
  // the address follows the words once they stop changing; new words start
  // at the first page
  const search = useDebouncedCallback(
    (words: string) =>
      void navigate({ search: { q: words || undefined }, replace: true }),
    300,
  );
  const users = useQuery(adminUsersQuery({ q, page }));

  return (
    <>
      <AdminHeader current="users" />
      <Stack gap="lg">
        <TextInput
          type="search"
          leftSection={<IconSearch size={16} stroke={1.75} />}
          rightSection={users.isFetching ? <Loader size="xs" /> : null}
          aria-label={t('users.search.aria')}
          placeholder={t('users.search.placeholder')}
          value={typed}
          onChange={(event) => {
            setTyped(event.currentTarget.value);
            search(event.currentTarget.value.trim());
          }}
        />
        <QueryState
          query={users}
          loading={<ListSkeleton rows={6} label={common('state.loading')} />}
          isEmpty={(data) => !data.users.length}
          empty={
            q ? (
              <EmptyState title={t('users.empty.title', { q })}>
                {t('users.empty.body')}
              </EmptyState>
            ) : (
              <EmptyState title={t('users.empty.page.title')}>
                <Button
                  variant="default"
                  onClick={() =>
                    void navigate({
                      search: (s) => ({ ...s, page: undefined }),
                    })
                  }
                >
                  {t('users.empty.page.action')}
                </Button>
              </EmptyState>
            )
          }
        >
          {(data) => (
            <Stack gap="sm">
              <Text size="sm" c="dimmed">
                {t('users.count', { count: data.total })}
              </Text>
              <RowList label={t('users.aria')}>
                {data.users.map((user) => (
                  <UserRow key={user.id} user={user} />
                ))}
              </RowList>
              {data.total > USERS_PAGE && (
                <Pagination
                  size="sm"
                  total={Math.ceil(data.total / USERS_PAGE)}
                  value={page ?? 1}
                  siblings={0}
                  boundaries={1}
                  onChange={(p) =>
                    void navigate({ search: (s) => ({ ...s, page: p }) })
                  }
                  getControlProps={(control) => ({
                    'aria-label': common(
                      control === 'previous'
                        ? 'pagination.previous'
                        : 'pagination.next',
                    ),
                  })}
                  getItemProps={(n) => ({
                    'aria-label': common('pagination.page', { n }),
                  })}
                />
              )}
            </Stack>
          )}
        </QueryState>
      </Stack>
    </>
  );
}
