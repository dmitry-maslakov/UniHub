import { randomUUID } from 'node:crypto';
import type { ContentHash, MediaType } from '@app/kernel';
import { CatalogAggregate } from '../aggregate.js';
import { differs } from '../changes.js';
import { FILE_CONTENT_CHANGED, FILE_REMOVED } from '../events.js';
import type { PortalRef } from '../portal-ref.js';
import type { Placement } from './placement.js';

// what the portal says about a file
export interface FileProps {
  name: string;
  // folder inside the portal, '' for the root
  path: string;
  url: string | null;
  // as the portal reports it, may be rounded
  size: number | null;
  mime: MediaType | null;
  sourceUpdatedAt: Date | null;
}

export interface FileState {
  id: string;
  ref: PortalRef;
  props: FileProps;
  placement: Placement;
  // the content storage has, once it has it
  content: ContentHash | null;
  // the portal changed the file since its content was stored
  stale: boolean;
  // the portal said it's gone; sending it again clears this
  removedAt: Date | null;
}

// a rename or a move doesn't make the connector download the file again
const contentMayDiffer = (a: FileProps, b: FileProps) =>
  a.size !== b.size ||
  a.sourceUpdatedAt?.getTime() !== b.sourceUpdatedAt?.getTime();

// A file as a portal has it; the content itself is in storage. Not `File`,
// which would shadow Node's global one.
export class PortalFile extends CatalogAggregate {
  private constructor(private readonly state: FileState) {
    super();
  }

  static create(ref: PortalRef, props: FileProps, placement: Placement) {
    const file = new PortalFile({
      id: randomUUID(),
      ref,
      props,
      placement,
      content: null,
      stale: false,
      removedAt: null,
    });
    file.touch();
    return file;
  }

  static restore(state: FileState) {
    return new PortalFile(state);
  }

  get id() {
    return this.state.id;
  }

  get ref() {
    return this.state.ref;
  }

  get snapshot(): Readonly<FileState> {
    return { ...this.state };
  }

  // no content yet, or the portal changed the file since it was stored
  get needsContent() {
    return this.state.content === null || this.state.stale;
  }

  // false when the portal sent what we already have; a removed file it
  // sends again is back
  sync(props: FileProps, placement: Placement) {
    const s = this.state;
    const cameBack = s.removedAt !== null;
    if (
      !cameBack &&
      !differs({ ...s.props, ...s.placement }, { ...props, ...placement })
    )
      return false;
    // stays stale until new content arrives, even if this run fails to send it
    if (s.content && contentMayDiffer(s.props, props)) s.stale = true;
    s.props = props;
    s.placement = placement;
    s.removedAt = null;
    this.touch();
    // plugins dropped what they had on file.removed: give it to them again
    if (cameBack && s.content) this.contentChanged(s.content);
    return true;
  }

  // false if the file already had this content; the same content still
  // means it is no longer stale
  storeContent(hash: ContentHash) {
    const s = this.state;
    const isNew = hash !== s.content;
    if (!isNew && !s.stale) return false;
    s.content = hash;
    s.stale = false;
    this.touch();
    if (isNew) this.contentChanged(hash);
    return isNew;
  }

  // false if it was removed already: one removal, one event
  remove(at = new Date()) {
    if (this.state.removedAt) return false;
    this.state.removedAt = at;
    this.touch();
    this.apply({
      topic: FILE_REMOVED,
      payload: { portal: this.ref.portal, fileId: this.id },
    });
    return true;
  }

  private contentChanged(hash: ContentHash) {
    this.apply({
      topic: FILE_CONTENT_CHANGED,
      payload: { portal: this.ref.portal, fileId: this.id, hash },
    });
  }
}
