import {
  FILE_CONTENT_STORED,
  FILE_REMOVED,
  ITEM_INGESTED,
  ITEM_REMOVED,
} from '@app/plugin-sdk';
import { PortalId } from '@app/kernel';
import * as catalog from '../../catalog/contracts.js';
import { sha } from './processing.fakes.js';
import { toSdkMessage } from './to-sdk-message.js';

const portal = PortalId.parse('canvas');
const hash = sha('content');

describe('toSdkMessage', () => {
  it("turns each of catalog's events into its sdk message", () => {
    expect(
      [
        [catalog.ITEM_CHANGED, { portal, itemId: 'i1' }],
        [catalog.ITEM_REMOVED, { portal, itemId: 'i1' }],
        [catalog.FILE_CONTENT_CHANGED, { portal, fileId: 'f1', hash }],
        [catalog.FILE_REMOVED, { portal, fileId: 'f1' }],
      ].map(([topic, payload]) => toSdkMessage(topic as string, payload)),
    ).toEqual([
      { topic: ITEM_INGESTED, payload: { portal, itemId: 'i1' } },
      { topic: ITEM_REMOVED, payload: { portal, itemId: 'i1' } },
      { topic: FILE_CONTENT_STORED, payload: { portal, fileId: 'f1', hash } },
      { topic: FILE_REMOVED, payload: { portal, fileId: 'f1' } },
    ]);
  });

  it('passes on only what the sdk message has', () => {
    const payload = { portal, itemId: 'i1', internal: true };
    expect(toSdkMessage(catalog.ITEM_CHANGED, payload)?.payload).toEqual({
      portal,
      itemId: 'i1',
    });
  });

  it('has no message for a topic it does not know', () => {
    expect(toSdkMessage('catalog.course-renamed', {})).toBeNull();
  });
});
