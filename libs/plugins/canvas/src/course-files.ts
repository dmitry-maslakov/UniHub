import type { FileRecord } from '@app/plugin-sdk';
import type { CanvasFile, Folder } from './canvas.types.js';
import { fileRecord, folderPath } from './records.js';

export interface FoundFile {
  record: FileRecord;
  // the url to download it from, '' while it is locked for the token's user
  download: string;
}

// A course's files as a walk comes on them: listed, linked from a module,
// attached to an announcement, one file often in more than one of these.
export class CourseFiles {
  private readonly found = new Map<
    number,
    { file: CanvasFile; item?: string }
  >();
  // folder id → path, of the folders this account may list
  private readonly paths = new Map<number, string>();

  // its id; an attachment stays one when it's listed or linked as well
  add(file: CanvasFile, item?: string) {
    this.found.set(file.id, {
      file,
      item: item ?? this.found.get(file.id)?.item,
    });
    return String(file.id);
  }

  get(id: number) {
    return this.found.get(id)?.file;
  }

  folder(folder: Folder) {
    this.paths.set(folder.id, folderPath(folder.full_name));
  }

  records(base: string, course: string): FoundFile[] {
    return [...this.found.values()].map(({ file, item }) => ({
      record: fileRecord(base, course, file, {
        item,
        path: this.paths.get(file.folder_id),
      }),
      download: file.url,
    }));
  }
}
