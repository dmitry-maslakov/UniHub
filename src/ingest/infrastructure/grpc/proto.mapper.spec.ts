import { MalformedRecordError } from '../../domain/errors.js';
import {
  courseOf,
  fileOf,
  itemOf,
  stateOf,
  toStateMessage,
} from './proto.mapper.js';

describe('proto mapping', () => {
  it('reads json text and Timestamps, and passes the rest on by name', () => {
    expect(
      itemOf({
        externalId: 'p1',
        kind: 'post',
        publishedAt: { seconds: 1_793_000_000, nanos: 500_000_000 },
        rawJson: '{"guid":"p1"}',
      }),
    ).toEqual({
      externalId: 'p1',
      kind: 'post',
      publishedAt: new Date(1_793_000_000_500),
      raw: { guid: 'p1' },
    });
    // proto3 leaves zeros out
    expect(fileOf({ externalId: 'f1', updatedAt: {} })).toEqual({
      externalId: 'f1',
      updatedAt: new Date(0),
    });
    expect(courseOf({ externalId: 'c1', name: 'OS' })).toEqual({
      externalId: 'c1',
      name: 'OS',
      meta: undefined,
    });
  });

  it('names a json field that is no json', () => {
    expect(() => itemOf({ externalId: 'p1', rawJson: 'not json' })).toThrow(
      new MalformedRecordError(['rawJson: not valid json']),
    );
  });

  it('takes a state as json text, null too, but not none at all', () => {
    expect(stateOf({ json: 'null' })).toBeNull();
    expect(stateOf({ json: '{"cursor":7}' })).toEqual({ cursor: 7 });
    expect(() => stateOf({})).toThrow(MalformedRecordError);
    expect(toStateMessage(null)).toEqual({});
    expect(toStateMessage({ cursor: 7 })).toEqual({ json: '{"cursor":7}' });
  });
});
