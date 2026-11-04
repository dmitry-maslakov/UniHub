import { ContentHash, MediaType, PortalId } from '@app/kernel';
import { FILE_CONTENT_CHANGED, FILE_REMOVED } from '../events.js';
import type { Placement } from './placement.js';
import { PortalFile, type FileProps } from './portal-file.js';

const portal = PortalId.parse('canvas');
const ref = { portal, externalId: 'f1' };
const hash = (c: string) => ContentHash.parse(c.repeat(64));
const props: FileProps = {
  name: 'lecture-5.pdf',
  path: 'Lectures',
  url: null,
  size: 3_124_756,
  mime: MediaType.parse('application/pdf'),
  sourceUpdatedAt: new Date('2026-10-29T14:12:00Z'),
};
const inCourse: Placement = { portalCourseId: 'pc1', itemId: null };

// a file as the repository loads it: nothing to write, no events
const stored = (content: ContentHash | null = null) =>
  PortalFile.restore({
    id: 'id-1',
    ref,
    props,
    placement: inCourse,
    content,
    stale: false,
    removedAt: null,
  });
const topics = (file: PortalFile) =>
  file.getUncommittedEvents().map((e) => e.topic);

describe('PortalFile', () => {
  it('is new, without content and without news for plugins', () => {
    const file = PortalFile.create(ref, props, inCourse);

    expect(file.dirty).toBe(true);
    expect(file.needsContent).toBe(true);
    expect(topics(file)).toEqual([]);
  });

  it('takes what the portal sent again as no change', () => {
    const file = stored(hash('a'));

    expect(file.sync({ ...props }, { ...inCourse })).toBe(false);
    expect(file.dirty).toBe(false);
    expect(file.needsContent).toBe(false);
  });

  it('keeps its content through a rename or a move', () => {
    const file = stored(hash('a'));

    expect(
      file.sync(
        { ...props, name: 'l5.pdf', path: 'Old' },
        { portalCourseId: 'pc2', itemId: null },
      ),
    ).toBe(true);
    expect(file.dirty).toBe(true);
    expect(file.needsContent).toBe(false);
    expect(topics(file)).toEqual([]);
  });

  it('asks for content again when its size or time changes', () => {
    for (const changed of [
      { ...props, size: 3_200_000 },
      { ...props, sourceUpdatedAt: new Date('2026-11-01T00:00:00Z') },
    ]) {
      const file = stored(hash('a'));
      expect(file.sync(changed, inCourse)).toBe(true);
      expect(file.needsContent).toBe(true);
    }
  });

  it('keeps asking until new content arrives', () => {
    const file = stored(hash('a'));
    file.sync({ ...props, size: 1 }, inCourse);
    // the download failed, the next sync sends the same metadata
    expect(file.sync({ ...props, size: 1 }, inCourse)).toBe(false);
    expect(file.needsContent).toBe(true);
  });

  it('announces new content, and only new content', () => {
    const file = stored();

    expect(file.storeContent(hash('a'))).toBe(true);
    expect(file.storeContent(hash('a'))).toBe(false);
    expect(file.getUncommittedEvents()).toEqual([
      {
        topic: FILE_CONTENT_CHANGED,
        payload: { portal, fileId: 'id-1', hash: hash('a') },
      },
    ]);
  });

  it('is no longer stale when the same content comes again', () => {
    const file = stored(hash('a'));
    file.sync({ ...props, size: 1 }, inCourse);

    expect(file.storeContent(hash('a'))).toBe(false);
    expect(file.needsContent).toBe(false);
    expect(file.dirty).toBe(true);
    expect(topics(file)).toEqual([]);
  });

  it('is removed once, however often the portal says so', () => {
    const file = stored();

    expect(file.remove()).toBe(true);
    expect(file.remove()).toBe(false);
    expect(file.getUncommittedEvents()).toEqual([
      { topic: FILE_REMOVED, payload: { portal, fileId: 'id-1' } },
    ]);
  });

  it('comes back when sent again, its content announced anew', () => {
    const file = stored(hash('a'));
    file.remove();
    file.uncommit();

    expect(file.sync(props, inCourse)).toBe(true);
    expect(file.getUncommittedEvents()).toEqual([
      {
        topic: FILE_CONTENT_CHANGED,
        payload: { portal, fileId: 'id-1', hash: hash('a') },
      },
    ]);
  });

  it('comes back without news when it has no content', () => {
    const file = stored();
    file.remove();
    file.uncommit();

    expect(file.sync(props, inCourse)).toBe(true);
    expect(topics(file)).toEqual([]);
    expect(file.needsContent).toBe(true);
  });
});
