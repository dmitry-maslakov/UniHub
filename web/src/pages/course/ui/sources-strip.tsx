import { Anchor, Group, Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { SourceBadge } from '@/entities/source';
import type { Schemas } from '@/shared/api';
import { webAddress } from '@/shared/lib';
import classes from './course.module.css';

// Where a course's posts and files come from: each of its portal courses,
// by its source, how the user reads it, and a link to it on its portal
export function SourcesStrip({
  portalCourses,
}: {
  portalCourses: Schemas['PortalCourseResponse'][];
}) {
  const { t } = useTranslation('courses');
  if (!portalCourses.length) return null;
  return (
    <ul className={classes.sources} aria-label={t('sources.aria')}>
      {portalCourses.map((part) => {
        const address = webAddress(part.url);
        const name = part.year
          ? t('sources.withYear', { name: part.name, year: part.year })
          : part.name;
        return (
          <li key={`${part.portal}~${part.externalId}`}>
            <Group gap="xs" wrap="nowrap" align="baseline" miw={0}>
              <SourceBadge portal={part.portal} />
              <Text size="sm" className={classes.sourceName}>
                {address ? (
                  <Anchor
                    href={address}
                    target="_blank"
                    rel="noopener noreferrer"
                    inherit
                  >
                    {name}
                  </Anchor>
                ) : (
                  name
                )}
                <Text span size="sm" c="dimmed">
                  {' · '}
                  {t(`sources.via.${part.via}`)}
                </Text>
              </Text>
            </Group>
          </li>
        );
      })}
    </ul>
  );
}
