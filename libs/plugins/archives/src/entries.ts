import { posix } from 'node:path';
import yauzl from 'yauzl';

// Which entries of an archive the expander yields, and by what path.

export interface Limits {
  // bytes of a zip, which is read whole (its directory is at its end): past
  // them it has no entries
  zip: number;
  // entries looked at: past them the rest of the archive is left out
  entries: number;
  // bytes a tar unpacks to, entries and all: past them it fails
  unpacked: number;
  // a zip entry unpacked to more than this many times its packed size
  ratio: number;
}

export const LIMITS: Limits = {
  zip: 100 * 1024 * 1024,
  entries: 10_000,
  unpacked: 1024 * 1024 * 1024,
  // text packs to a tenth of itself or so, a zip bomb to a thousandth
  ratio: 100,
};

// Folders of tools, libraries and builds rather than the course's: npm's
// packages, a Mac's resource forks, Visual Studio's build output, besides
// those whose names start with a dot (git's, an editor's, a virtualenv).
const LEFT_OUT = new Set(['node_modules', '__MACOSX', 'bin', 'obj']);
// a library's minified code (jquery.min.js) would turn up in every course
// whose projects have it
const MINIFIED = /\.min\.(m?js|css)$/i;
// longer than any file system takes
const MAX_PATH = 4096;

// The path an entry goes by, its letters composed (NFC) as the processors'
// texts are; null to leave it out: a name outside the archive (absolute, or
// with a .. in it), a folder, one in the folders above, minified code.
export function named(name: string) {
  if (yauzl.validateFileName(name) !== null || name.endsWith('/')) return null;
  const path = posix.normalize(name).normalize('NFC');
  if (MINIFIED.test(path) || path.length > MAX_PATH) return null;
  const folders = path.split('/');
  if (folders.some((dir) => dir.startsWith('.') || LEFT_OUT.has(dir)))
    return null;
  return path;
}

// The entries taken, in turn: those named() keeps, but a zip entry packed
// past limits.ratio (a zip bomb); past limits.entries the rest is left out.
export class Selection {
  private readonly limits: Limits;
  private seen = 0;

  constructor(limits: Limits) {
    this.limits = limits;
  }

  // false once past limits.entries
  more() {
    return ++this.seen <= this.limits.entries;
  }

  // the path to yield an entry by, null to leave it out
  take(name: string, size: number, packed = size) {
    return size > packed * this.limits.ratio ? null : named(name);
  }
}
