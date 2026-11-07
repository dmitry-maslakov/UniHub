import { Stack, Tabs } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { getRouteApi } from '@tanstack/react-router';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useCourse } from '@/entities/course';
import { SelectionBar, useSelection } from '@/features/download-selection';
import {
  AnchorLink,
  ListSkeleton,
  NotFoundState,
  PageTitle,
  QueryState,
} from '@/shared/ui';
import { courseFilesQuery } from '../api/course-files';
import { defaultTab } from '../lib/default-tab';
import { targetOf } from '../lib/target-of';
import type { FilesView } from '../model/search';
import { CourseSearch } from './course-search';
import { FilesTree } from './files-tree';
import { PostsList } from './posts-list';
import { SourcesStrip } from './sources-strip';

const route = getRouteApi('/_app/courses/$slug/');

// A course: where it comes from, a search of it, and its files and posts
// in tabs. Its name and sources come from the list, which also says
// whether the user may read it at all.
export function CoursePage() {
  const { t } = useTranslation('courses');
  const { slug } = route.useParams();
  const search = route.useSearch();
  const navigate = route.useNavigate();
  const { query, course } = useCourse(slug);
  // the same query the Files tab reads: one request
  const files = useQuery(courseFilesQuery(slug));
  const targets = useMemo(
    () => (files.data?.files ?? []).flatMap((file) => targetOf(file) ?? []),
    [files.data],
  );
  // what is ticked in the files tree, kept while the tab is away
  const selection = useSelection(targets);
  const tab = search.tab ?? defaultTab(files.data?.files.length);
  const view: FilesView = search.view ?? 'folders';

  return (
    <QueryState
      query={query}
      loading={<ListSkeleton rows={3} label={t('list.loading')} />}
      isEmpty={() => !course}
      empty={
        <NotFoundState
          title={t('course.notFound.title')}
          description={t('course.notFound.description')}
          back={<AnchorLink to="/">{t('course.notFound.back')}</AnchorLink>}
        />
      }
    >
      {() =>
        course && (
          <>
            <PageTitle>{course.name}</PageTitle>
            <Stack gap="lg">
              <SourcesStrip portalCourses={course.portalCourses} />
              <CourseSearch slug={slug} />
              <Tabs
                value={tab}
                onChange={(value) =>
                  void navigate({
                    search: (prev) => ({
                      ...prev,
                      tab: value === 'posts' ? 'posts' : 'files',
                    }),
                    replace: true,
                  })
                }
                keepMounted={false}
              >
                <Tabs.List>
                  <Tabs.Tab value="files">
                    {files.data && !files.data.capped
                      ? t('course.tabs.filesCount', {
                          count: files.data.files.length,
                        })
                      : t('course.tabs.files')}
                  </Tabs.Tab>
                  <Tabs.Tab value="posts">{t('course.tabs.posts')}</Tabs.Tab>
                </Tabs.List>
                <Tabs.Panel value="files" pt="lg">
                  <Stack gap="md">
                    <FilesTree
                      slug={slug}
                      selection={selection}
                      view={view}
                      onViewChange={(next) =>
                        void navigate({
                          search: (prev) => ({
                            ...prev,
                            view: next === 'newest' ? 'newest' : undefined,
                          }),
                          replace: true,
                        })
                      }
                    />
                    <SelectionBar selection={selection} />
                  </Stack>
                </Tabs.Panel>
                <Tabs.Panel value="posts" pt="lg">
                  <PostsList slug={slug} />
                </Tabs.Panel>
              </Tabs>
            </Stack>
          </>
        )
      }
    </QueryState>
  );
}
