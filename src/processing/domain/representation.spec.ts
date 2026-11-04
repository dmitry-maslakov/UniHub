import { ContentHash, PluginName } from '@app/kernel';
import { representation } from './representation.js';

const key = {
  hash: ContentHash.parse('ab'.repeat(32)),
  processor: PluginName.parse('office-text'),
  version: 2,
};

describe('representation', () => {
  it('keeps the parts as postgres can keep them', () => {
    expect(representation(key, ['a\u0000b', 'c\ud800d', '😀'])).toEqual({
      ...key,
      parts: ['ab', 'c�d', '😀'],
    });
  });
});
