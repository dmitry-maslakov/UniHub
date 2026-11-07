import { PassThrough, type Readable } from 'node:stream';
import { buffer } from 'node:stream/consumers';
import { InvalidRecordError, UnknownReferenceError } from '@app/plugin-sdk';
import { InvalidError, NO_INSTANCE, PortalId } from '@app/kernel';
import * as catalog from '../../../catalog/contracts.js';
import type { IngestService } from '../../application/ingest.service.js';
import { Connection } from '../../domain/connection.js';
import { MalformedRecordError } from '../../domain/errors.js';
import { SdkPortalIngest } from './sdk-portal-ingest.js';

const portal = PortalId.parse('canvas');
const ref = { portal, instance: NO_INSTANCE, externalId: 'x' };

// what storage refuses past its limit
class TooLargeError extends InvalidError {
  readonly reason = 'CONTENT_TOO_LARGE';
}

// what a plugin gets when IngestService refuses its record with `error`
const refusedWith = (error: unknown) => {
  const ingest = { file: () => Promise.reject(error) };
  return new SdkPortalIngest(
    ingest as unknown as IngestService,
    Connection.shared(portal),
    new AbortController().signal,
  ).file({ externalId: 'f1', name: 'a.pdf' });
};

describe('SdkPortalIngest', () => {
  it('hands plugins the errors the sdk promises, with the reason', async () => {
    await expect(
      refusedWith(new MalformedRecordError(['name: required'])),
    ).rejects.toEqual(new InvalidRecordError(['name: required']));
    await expect(
      refusedWith(new catalog.MisplacedFileError(ref, ref)),
    ).rejects.toMatchObject({
      constructor: InvalidRecordError,
      reason: 'FILE_COURSE_MISMATCH',
    });
    await expect(
      refusedWith(new TooLargeError('too large')),
    ).rejects.toMatchObject({
      constructor: InvalidRecordError,
      issues: ['too large'],
      reason: 'CONTENT_TOO_LARGE',
    });
    await expect(
      refusedWith(new catalog.UnknownReferenceError(portal, 'c1')),
    ).rejects.toEqual(new UnknownReferenceError('c1'));
  });

  it('leaves the rest as it is: an outage, a bug', async () => {
    const outage = new Error('Connection is closed.');
    await expect(refusedWith(outage)).rejects.toBe(outage);
  });

  it("refuses a run's calls once the hub has let go of it", async () => {
    const saveState = vi.fn(async () => {});
    const run = new AbortController();
    const ingest = new SdkPortalIngest(
      { saveState } as unknown as IngestService,
      Connection.shared(portal),
      run.signal,
    );

    run.abort('past its time');

    await expect(ingest.saveState({ cursor: 2 })).rejects.toBe('past its time');
    expect(saveState).not.toHaveBeenCalled();
  });

  it('cuts an upload still going when its run is let go of', async () => {
    const run = new AbortController();
    const ingest = new SdkPortalIngest(
      {
        content: (_c: Connection, _id: string, content: Readable) =>
          buffer(content),
      } as unknown as IngestService,
      Connection.shared(portal),
      run.signal,
    );
    const upload = new PassThrough();

    const sent = ingest.content('f1', upload);
    upload.write('half of it');
    run.abort();

    await expect(sent).rejects.toMatchObject({ name: 'AbortError' });
  });
});
