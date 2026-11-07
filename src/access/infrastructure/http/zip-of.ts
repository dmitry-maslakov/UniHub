import type { Readable } from 'node:stream';
import yazl from 'yazl';

export interface ZipEntry {
  name: string;
  open: () => Promise<Readable>;
}

// The zip of the entries, stored as they are (PDFs, slides and archives
// don't shrink, and the server's CPU is shared), each opened only when the
// one before it is done, so one file is open at a time. yazl counts the
// bytes itself: a portal's size may be rounded. An entry that can't be
// opened or fails midway destroys the stream with its error, which aborts
// the response rather than ending it as if it were whole; one the client
// leaves behind by aborting is closed with it.
export function zipOf(entries: readonly ZipEntry[]): Readable {
  const zip = new yazl.ZipFile();
  // yazl types it as a stream to read from; it is a Node one
  const output = zip.outputStream as Readable;
  zip.on('error', (error) => output.destroy(error));
  let current: Readable | undefined;
  output.once('close', () => current?.destroy());
  for (const { name, open } of entries)
    zip.addReadStreamLazy(name, { compress: false }, (done) =>
      open().then(
        (stream) => {
          current = stream;
          stream.once('error', (error) => output.destroy(error));
          stream.once('end', () => (current = undefined));
          // output may be gone already
          if (output.destroyed) stream.destroy();
          done(null, stream);
        },
        // its types ask for a stream beside an error, which it never reads
        (error) => done(error, null as never),
      ),
    );
  zip.end();
  return output;
}
