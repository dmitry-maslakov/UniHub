import { Box, Button } from '@mantine/core';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { Selection } from '@/features/download-selection';
import type { Schemas } from '@/shared/api';
import { Section } from '@/shared/ui';
import { isNew } from '../lib/is-new';
import { newestFirst } from '../lib/newest-first';
import { FileRow } from './file-row';

// how many new files show above the folders; the rest are in Newest first
const SHOWN = 10;

// What the course's portals added or changed in the last 14 days, newest
// first, each with its folder; nothing when there's none
export function NewFiles({
  files,
  slug,
  selection,
  onShowAll,
}: {
  files: readonly Schemas['FileResponse'][];
  slug: string;
  selection: Selection;
  onShowAll: () => void;
}) {
  const { t } = useTranslation('courses');
  const fresh = useMemo(() => {
    const now = new Date();
    return newestFirst(files).filter((file) => isNew(file, now));
  }, [files]);
  if (!fresh.length) return null;
  return (
    <Box mb="lg">
      <Section
        title={t('files.new.title')}
        description={t('files.new.description')}
      >
        <div>
          {fresh.slice(0, SHOWN).map((file) => (
            <FileRow
              key={file.id}
              file={file}
              slug={slug}
              selection={selection}
              folder
            />
          ))}
        </div>
        {fresh.length > SHOWN && (
          <Button
            variant="default"
            size="sm"
            w="fit-content"
            onClick={onShowAll}
          >
            {t('files.new.action', { count: fresh.length })}
          </Button>
        )}
      </Section>
    </Box>
  );
}
