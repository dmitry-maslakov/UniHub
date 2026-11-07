import { Anchor, Group, Text } from '@mantine/core';
import { SourceBadge } from '@/entities/source';
import type { Schemas } from '@/shared/api';
import { webAddress } from '@/shared/lib';
import { viaText } from '../lib/via';
import classes from './course.module.css';

// Where a course's posts and files come from: each of its portal courses,
// by its source, how the user reads it, and a link to it on its portal
export function SourcesStrip({
  portalCourses,
}: {
  portalCourses: Schemas['PortalCourseResponse'][];
}) {
  if (!portalCourses.length) return null;
  return (
    <ul className={classes.sources} aria-label="Sources">
      {portalCourses.map((part) => {
        const address = webAddress(part.url);
        const name = `${part.name}${part.year ? ` (${part.year})` : ''}`;
        return (
          <li key={`${part.portal}~${part.externalId}`}>
            <Group gap="xs" wrap="nowrap" align="baseline" miw={0}>
              <SourceBadge portal={part.portal} />
              <Text size="sm" className={classes.sourceName}>
                {address ? (
                  <Anchor
                    href={address}
                    target="_blank"
                    rel="noreferrer"
                    inherit
                  >
                    {name}
                  </Anchor>
                ) : (
                  name
                )}
                <Text span size="sm" c="dimmed">
                  {' · '}
                  {viaText(part.via)}
                </Text>
              </Text>
            </Group>
          </li>
        );
      })}
    </ul>
  );
}
