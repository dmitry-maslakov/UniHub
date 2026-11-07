import { Button, Group } from '@mantine/core';
import { IconDownload, IconExternalLink } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { contentUrl, opensInline } from '@/entities/file';
import type { Schemas } from '@/shared/api';
import { AnchorLink } from '@/shared/ui';

// What to do with the file itself: open it where a browser can show it,
// else download it; inside an archive's member, a way back to the archive
export function FileActions({
  file,
  slug,
  member,
}: {
  file: Schemas['FileDetailsResponse'];
  slug: string;
  member?: string;
}) {
  const { t } = useTranslation('file');
  // a member's media type isn't known here: it is always saved
  const inline = !member && opensInline(file.mime);
  return (
    <Group gap="sm">
      {file.hasContent &&
        (inline ? (
          <Button
            component="a"
            variant="default"
            href={contentUrl(file.id, { member, inline })}
            target="_blank"
            rel="noopener noreferrer"
            rightSection={<IconExternalLink size={16} stroke={1.75} />}
          >
            {t('open')}
          </Button>
        ) : (
          <Button
            component="a"
            variant="default"
            href={contentUrl(file.id, { member })}
            leftSection={<IconDownload size={16} stroke={1.75} />}
          >
            {t('download')}
          </Button>
        ))}
      {member && (
        <AnchorLink
          to="/courses/$slug/files/$fileId"
          params={{ slug, fileId: file.id }}
          search={{}}
        >
          {t('backToArchive', { archive: file.name })}
        </AnchorLink>
      )}
    </Group>
  );
}
