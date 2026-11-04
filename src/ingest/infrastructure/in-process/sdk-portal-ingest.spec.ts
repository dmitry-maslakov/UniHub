import { InvalidRecordError, UnknownReferenceError } from '@app/plugin-sdk';
import { InvalidError, PortalId } from '@app/kernel';
import * as catalog from '../../../catalog/contracts.js';
import type { IngestService } from '../../application/ingest.service.js';
import { Connection } from '../../domain/connection.js';
import { MalformedRecordError } from '../../domain/errors.js';
import { SdkPortalIngest } from './sdk-portal-ingest.js';

const portal = PortalId.parse('canvas');
const ref = { portal, externalId: 'x' };

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
});
