import { NavLink, type NavLinkProps } from '@mantine/core';
import { IconFolder } from '@tabler/icons-react';
import { createLink } from '@tanstack/react-router';
import { forwardRef } from 'react';
import { useTranslation } from 'react-i18next';
import { FileTypeIcon, fileType, type FolderNode } from '@/entities/file';
import type { Schemas } from '@/shared/api';
import { useFormat } from '@/shared/i18n';
import classes from './course.module.css';

type File = Schemas['FileResponse'];

// Mantine's NavLink as a typed router link (the router's Custom Link guide)
const FileLink = createLink(
  forwardRef<HTMLAnchorElement, Omit<NavLinkProps, 'href'>>((props, ref) => (
    <NavLink ref={ref} component="a" {...props} />
  )),
);

// The folders of a course's files, each opening onto its own, then the
// files that are directly in it; a course with many files starts closed
export function FolderNodeView({
  node,
  slug,
  open,
}: {
  node: FolderNode<File>;
  slug: string;
  open: boolean;
}) {
  const { t } = useTranslation(['courses', 'common']);
  const { size } = useFormat();
  return (
    <>
      {node.folders.map((folder) => (
        <NavLink
          component="button"
          key={folder.path}
          classNames={{ root: classes.node, label: classes.nodeLabel }}
          label={folder.name}
          description={t('courses:files.folderCount', { count: folder.count })}
          leftSection={<IconFolder size={16} stroke={1.75} aria-hidden />}
          childrenOffset={20}
          defaultOpened={open}
        >
          <FolderNodeView node={folder} slug={slug} open={open} />
        </NavLink>
      ))}
      {node.files.map((file) => (
        <FileLink
          key={file.id}
          to="/courses/$slug/files/$fileId"
          params={{ slug, fileId: file.id }}
          classNames={{ root: classes.node, label: classes.nodeLabel }}
          label={file.name}
          description={[
            size(file.size),
            !file.hasContent && t('common:state.notAvailableYet'),
          ]
            .filter(Boolean)
            .join(' · ')}
          leftSection={<FileTypeIcon type={fileType(file.mime, file.name)} />}
        />
      ))}
    </>
  );
}
