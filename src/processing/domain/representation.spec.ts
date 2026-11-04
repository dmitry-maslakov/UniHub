import { PluginName } from '@app/kernel';
import { sha256 } from '../../../test/sha256.js';
import { representation } from './representation.js';

const key = {
  hash: sha256('%PDF lecture'),
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
