import { posix } from 'node:path';

// How the hub names a container's members, whatever the container says. A
// member's path is never a filesystem path (blobs are stored by hash), so
// these keep paths readable and unambiguous rather than the disk safe.

const MAX_PATH = 1024;
const CONTROL = /\p{Cc}/u;
const DRIVE = /^[a-z]:/i;
// Folders of tools, libraries and builds rather than the course's: npm's
// packages, a Mac's resource forks, Visual Studio's output, and whatever's
// named with a dot (git's, an editor's, a virtualenv, .DS_Store, .env)
const NOISE = new Set(['node_modules', '__MACOSX', 'bin', 'obj']);

// A member's path within its container's (null for the root's): '/' between
// folders (a Windows backslash too), letters composed (NFC), no '.' or empty
// steps; null for one that can't be made safe: absolute, on a drive, with a
// '..' or a control character, a folder, or past 1024 characters in all.
export function memberPath(within: string | null, raw: string) {
  const slashed = raw.replaceAll('\\', '/');
  if (
    CONTROL.test(slashed) ||
    slashed.startsWith('/') ||
    DRIVE.test(slashed) ||
    slashed.split('/').includes('..')
  )
    return null;
  const path = posix.normalize(slashed).normalize('NFC');
  if (path === '.' || path.endsWith('/')) return null;
  const full = within === null ? path : `${within}/${path}`;
  return full.length > MAX_PATH ? null : full;
}

// a member the hub leaves out unlisted, by a folder or name in its path
export const isNoise = (path: string) =>
  path.split('/').some((step) => step.startsWith('.') || NOISE.has(step));
