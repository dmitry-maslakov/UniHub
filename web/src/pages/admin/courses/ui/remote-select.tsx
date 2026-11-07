import { Loader, Select } from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

export interface Option {
  value: string;
  label: string;
}

// A searchable select whose options the hub finds: the words typed are
// handed up (`onQuery`) once they rest, and `items` are what the hub found,
// shown as they are (the hub filters). The chosen one stays among the
// options when a new search doesn't find it, and its own label is no search.
export function RemoteSelect<T extends Option>({
  label,
  placeholder,
  nothing,
  items,
  fetching,
  failed,
  chosen,
  onChoose,
  onQuery,
}: {
  label: string;
  placeholder: string;
  nothing: string;
  items: readonly T[];
  fetching: boolean;
  failed: boolean;
  chosen: T | null;
  onChoose: (item: T | null) => void;
  onQuery: (q: string) => void;
}) {
  const { t } = useTranslation('admin');
  const [search, setSearch] = useState('');
  const [resting] = useDebouncedValue(search.trim(), 300);
  const q = chosen && search === chosen.label ? '' : resting;
  useEffect(() => onQuery(q), [q, onQuery]);
  useEffect(() => {
    if (failed)
      notifications.show({ color: 'red', message: t('course.failed') });
  }, [failed, t]);
  const data =
    chosen && !items.some((item) => item.value === chosen.value)
      ? [chosen, ...items]
      : [...items];
  return (
    <Select
      searchable
      label={label}
      placeholder={placeholder}
      data={data}
      value={chosen?.value ?? null}
      onChange={(value) =>
        onChoose(data.find((item) => item.value === value) ?? null)
      }
      searchValue={search}
      onSearchChange={setSearch}
      filter={({ options }) => options}
      nothingFoundMessage={nothing}
      rightSection={fetching ? <Loader size="xs" /> : undefined}
      style={{ flex: '1 1 18rem' }}
    />
  );
}
